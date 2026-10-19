// Fonctions IA (facultatives) avec l'API Claude : lecture d'un ticket en photo et assistant en lecture seule.
// Actives seulement si ANTHROPIC_API_KEY est défini. La clé reste sur le serveur, jamais envoyée au client.
const { z } = require('zod');
const { db } = require('./db');
const { localToday } = require('./dates');
const { isoDate } = require('./lib');

const isoDateString = (s) => isoDate('').safeParse(s).success;

const DAILY_QUESTIONS = 20;
// modèles qui acceptent la reprise automatique côté serveur après un refus (fallbacks: "default")
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
const model = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

let client = null;
/** Client Anthropic (créé à la première utilisation) ; les tests injectent un faux client. */
function getClient() {
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new (Anthropic.default || Anthropic)();
  }
  return client;
}
const setClient = (c) => { client = c; };

/** Appel au modèle configuré, avec la reprise serveur en cas de refus quand le modèle la permet. */
function createMessage(params) {
  const m = model();
  const fallback = FALLBACK_MODELS.has(m) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
  return getClient().beta.messages.create({ model: m, ...fallback, ...params });
}

/** Erreur à montrer telle quelle à l'utilisateur (message en français, code HTTP). */
class AiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const textOf = (response) => response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

function checkStop(response) {
  if (response.stop_reason === 'refusal') throw new AiError(422, 'Le modèle a refusé de répondre à cette demande.');
  if (response.stop_reason === 'max_tokens') throw new AiError(502, 'Réponse trop longue, interrompue : reformule plus simplement.');
}

// ---------- ticket en photo ----------
const RECEIPT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    amount: { type: 'number', description: 'Total payé en euros (TTC), 0 si illisible' },
    date: { type: 'string', description: 'Date du ticket AAAA-MM-JJ, vide si illisible' },
    merchant: { type: 'string', description: 'Nom du commerçant, court, vide si illisible' },
    category_id: { type: 'integer', description: "id de la catégorie la plus proche dans la liste fournie, 0 si aucune" },
  },
  required: ['amount', 'date', 'merchant', 'category_id'],
  additionalProperties: false,
};
// la réponse du modèle est revalidée : un JSON mal formé ou hors schéma n'atteint jamais le formulaire
const receiptSchema = z.object({
  amount: z.number().finite().min(0),
  date: z.string(),
  merchant: z.string(),
  category_id: z.number().int(),
}).strict();

/**
 * Lit un ticket : renvoie { amount, date, merchant, category_id } (champs null si illisibles).
 * L'image n'est ni stockée ni journalisée.
 */
async function readReceipt(userId, image, mediaType) {
  const categories = db.prepare("SELECT id, name FROM categories WHERE user_id = ? AND kind = 'expense' ORDER BY name").all(userId);
  const response = await createMessage({
    max_tokens: 8000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RECEIPT_JSON_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        {
          type: 'text',
          text: `Voici la photo d'un ticket de caisse ou d'une facture. Extrais le total payé, la date, le commerçant, et choisis la catégorie la plus proche parmi :\n${categories.map((c) => `${c.id} = ${c.name}`).join('\n')}\nNous sommes le ${localToday()}.`,
        },
      ],
    }],
  });
  checkStop(response);
  let parsed;
  try {
    parsed = receiptSchema.parse(JSON.parse(textOf(response)));
  } catch {
    throw new AiError(502, 'Le ticket n’a pas pu être lu : réessaie avec une photo plus nette et bien cadrée.');
  }
  const merchant = parsed.merchant.trim().slice(0, 120);
  return {
    amount: parsed.amount > 0 ? Math.round(parsed.amount * 100) / 100 : null,
    date: isoDateString(parsed.date) ? parsed.date : null,
    merchant: merchant || null,
    // seule une catégorie de l'utilisateur peut être proposée
    category_id: categories.some((c) => c.id === parsed.category_id) ? parsed.category_id : null,
  };
}

// ---------- assistant ----------
/** Questions restantes aujourd'hui. */
function remainingQuestions(userId) {
  const row = db.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND day = ?').get(userId, localToday());
  return Math.max(0, DAILY_QUESTIONS - (row?.count ?? 0));
}

/** Compte une question ; false si la limite du jour est atteinte. */
function takeQuestion(userId) {
  if (remainingQuestions(userId) <= 0) return false;
  db.prepare(`INSERT INTO ai_usage (user_id, day, count) VALUES (?,?,1)
    ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`).run(userId, localToday());
  return true;
}

const month = z.string().regex(/^\d{4}-\d{2}$/, 'Mois au format AAAA-MM');
const day = z.string().refine(isoDateString, 'Date au format AAAA-MM-JJ');

/**
 * Outils en lecture seule. Chacun reçoit l'utilisateur de la session (jamais choisi par le modèle) et réutilise
 * les fonctions des routes de l'API : les chiffres sont exactement ceux que l'application affiche.
 */
function buildTools(views) {
  return {
    get_stats: {
      description: "Revenus, dépenses (hors virements), solde des liquidités, dépenses par catégorie et tendance des 6 mois jusqu'au mois demandé.",
      input: z.object({ month }).strict(),
      schema: { type: 'object', properties: { month: { type: 'string', description: 'AAAA-MM' } }, required: ['month'], additionalProperties: false },
      run: (uid, i) => views.monthStats(uid, { month: i.month }),
    },
    search_transactions: {
      description: 'Cherche des opérations (montants signés en euros : dépense < 0). Filtres facultatifs : texte du libellé, période, catégorie, tag. Renvoie au plus 200 opérations et leur somme.',
      input: z.object({
        query: z.string().max(80).optional(), from: day.optional(), to: day.optional(),
        category_id: z.number().int().optional(), tag: z.string().max(40).optional(),
      }).strict(),
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'texte contenu dans le libellé' },
          from: { type: 'string', description: 'AAAA-MM-JJ inclus' },
          to: { type: 'string', description: 'AAAA-MM-JJ inclus' },
          category_id: { type: 'integer' },
          tag: { type: 'string' },
        },
        additionalProperties: false,
      },
      run: (uid, i) => {
        const rows = views.listTransactions(uid, {
          q: i.query, from: i.from, to: i.to, category_id: i.category_id, tag: i.tag, limit: 200,
        }).filter((t) => !t.transfer_id);
        return {
          count: rows.length,
          total: Math.round(rows.reduce((s, t) => s + t.amount, 0) * 100) / 100,
          transactions: rows.map((t) => ({ date: t.date, label: t.label, amount: t.amount, category: t.category_name, account: t.account_name })),
        };
      },
    },
    get_budgets: {
      description: 'Budgets mensuels par catégorie : plafond et dépensé du mois.',
      input: z.object({ month }).strict(),
      schema: { type: 'object', properties: { month: { type: 'string', description: 'AAAA-MM' } }, required: ['month'], additionalProperties: false },
      run: (uid, i) => views.budgetsOf(uid, { month: i.month }),
    },
    get_forecast: {
      description: 'Prévision du mois en cours : reste à dépenser, par jour, fin de mois estimée, récurrences à venir, épargne prévue.',
      input: z.object({}).strict(),
      schema: { type: 'object', properties: {}, additionalProperties: false },
      run: (uid) => views.forecastOf(uid, {}),
    },
    get_networth: {
      description: 'Patrimoine net (liquidités + placements − dettes) à chaque fin de mois, et variations sur 1 et 12 mois.',
      input: z.object({ months: z.number().int().min(1).max(60).optional() }).strict(),
      schema: { type: 'object', properties: { months: { type: 'integer', description: 'nombre de mois (12 par défaut)' } }, additionalProperties: false },
      run: (uid, i) => views.networthOf(uid, { months: i.months ?? 12 }),
    },
    get_subscriptions: {
      description: 'Abonnements détectés automatiquement : montant, fréquence, coût annuel, hausses de prix.',
      input: z.object({}).strict(),
      schema: { type: 'object', properties: {}, additionalProperties: false },
      run: (uid) => views.subscriptionsView(uid, {}),
    },
  };
}

/** Exécute un outil pour l'utilisateur de la session ; une entrée invalide devient une erreur d'outil, pas un plantage. */
function runTool(tools, userId, name, input) {
  const tool = tools[name];
  if (!tool) return { content: `Outil inconnu : ${name}`, is_error: true };
  const parsed = tool.input.safeParse(input ?? {});
  if (!parsed.success) return { content: `Paramètres invalides : ${parsed.error.issues[0]?.message}`, is_error: true };
  try {
    return { content: JSON.stringify(tool.run(userId, parsed.data)) };
  } catch (e) {
    return { content: `Erreur : ${e.message}`, is_error: true };
  }
}

const MAX_TURNS = 8;

/** Répond à une question sur les finances de l'utilisateur ; renvoie { answer, tools: [noms des outils utilisés] }. */
async function ask(userId, question, views) {
  const tools = buildTools(views);
  const categories = db.prepare('SELECT id, name, kind FROM categories WHERE user_id = ? ORDER BY kind, name').all(userId);
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  const system = [
    `Tu es l'assistant de Pécule, une application de budget personnel. Tu réponds en français, en tutoyant ${user.name}, en phrases courtes.`,
    "Tu ne connais les finances de l'utilisateur qu'à travers les outils, tous en lecture seule : appelle-les pour obtenir les chiffres, n'invente jamais un montant.",
    'Cite les chiffres utilisés et leur période (ex. « 312 € en Restaurants du 1er janvier au 19 octobre »). Si une information manque, dis-le.',
    "Pour une question « puis-je me permettre… », appuie-toi sur la prévision, l'épargne et les dépenses habituelles, et donne un avis prudent.",
    "Les virements entre comptes ne sont ni des revenus ni des dépenses. L'API parle en euros ; une dépense est un montant négatif.",
    `Catégories (id = nom) : ${categories.map((c) => `${c.id} = ${c.name} (${c.kind === 'expense' ? 'dépense' : 'revenu'})`).join(', ')}.`,
    `Nous sommes le ${localToday()}.`,
  ].join('\n');
  const toolDefs = Object.entries(tools).map(([name, t]) => ({ name, description: t.description, input_schema: t.schema }));
  const messages = [{ role: 'user', content: question }];
  const used = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await createMessage({ max_tokens: 16000, output_config: { effort: 'medium' }, system, tools: toolDefs, messages });
    checkStop(response);
    if (response.stop_reason !== 'tool_use') {
      const answer = textOf(response);
      if (!answer) throw new AiError(502, 'L’assistant n’a pas su répondre : reformule ta question.');
      return { answer, tools: [...new Set(used)] };
    }
    messages.push({ role: 'assistant', content: response.content });
    const results = response.content.filter((b) => b.type === 'tool_use').map((b) => {
      used.push(b.name);
      return { type: 'tool_result', tool_use_id: b.id, ...runTool(tools, userId, b.name, b.input) };
    });
    // tous les résultats d'un tour dans un seul message
    messages.push({ role: 'user', content: results });
  }
  throw new AiError(502, 'La question demande trop d’étapes : découpe-la en questions plus simples.');
}

module.exports = {
  aiEnabled, model, getClient, setClient, readReceipt, ask, remainingQuestions, takeQuestion, buildTools, runTool,
  AiError, DAILY_QUESTIONS,
};

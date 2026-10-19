// Fonctions IA : état, consentement, ticket en photo, assistant. Sans ANTHROPIC_API_KEY, tout répond « désactivé ».
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { auth, HttpError } = require('../lib');
const ai = require('../ai');
const { monthStats } = require('./stats');
const { listTransactions } = require('./transactions');
const { budgetsOf } = require('./budgets');
const { forecastOf } = require('./forecast');
const { networthOf } = require('./wealth');
const { subscriptionsView } = require('./subscriptions');

const router = express.Router();
const views = { monthStats, listTransactions, budgetsOf, forecastOf, networthOf, subscriptionsView };

/** Erreurs du SDK → message clair (classes typées, du plus précis au plus général). */
function apiErrorMessage(e) {
  const A = require('@anthropic-ai/sdk');
  const Sdk = A.APIError ? A : A.default;
  if (e instanceof Sdk.RateLimitError) return [503, 'L’assistant est très demandé : réessaie dans une minute.'];
  if (e instanceof Sdk.AuthenticationError) return [503, 'Fonctions IA mal configurées sur le serveur (clé API refusée).'];
  if (e instanceof Sdk.BadRequestError) return [502, 'Demande refusée par l’API Claude : réessaie avec une autre photo ou question.'];
  if (e instanceof Sdk.APIError) return [502, 'L’API Claude ne répond pas pour le moment : réessaie plus tard.'];
  return null;
}

const wrapAsync = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e instanceof ai.AiError || e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Données invalides' });
    const mapped = ai.aiEnabled() && apiErrorMessage(e);
    if (mapped) return res.status(mapped[0]).json({ error: mapped[1] });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/** Fonctions IA disponibles et acceptées par l'utilisateur, sinon erreur. */
function requireAi(req) {
  if (!ai.aiEnabled()) throw new HttpError(404, 'Fonctions IA désactivées sur ce serveur');
  const { ai_consent_at } = db.prepare('SELECT ai_consent_at FROM users WHERE id = ?').get(req.userId);
  if (!ai_consent_at) throw new HttpError(403, 'Accepte d’abord l’envoi de tes données à Anthropic pour utiliser les fonctions IA');
}

router.get('/api/ai/status', auth, wrapAsync((req, res) => {
  if (!ai.aiEnabled()) return res.json({ enabled: false });
  const { ai_consent_at } = db.prepare('SELECT ai_consent_at FROM users WHERE id = ?').get(req.userId);
  res.json({ enabled: true, consented: !!ai_consent_at, remaining: ai.remainingQuestions(req.userId), daily_limit: ai.DAILY_QUESTIONS });
}));

router.post('/api/ai/consent', auth, wrapAsync((req, res) => {
  if (!ai.aiEnabled()) throw new HttpError(404, 'Fonctions IA désactivées sur ce serveur');
  const { accepted } = z.object({ accepted: z.boolean({ error: 'Indique accepted : true ou false' }) }).parse(req.body);
  db.prepare('UPDATE users SET ai_consent_at = ? WHERE id = ?').run(accepted ? new Date().toISOString() : null, req.userId);
  res.json({ consented: accepted });
}));

const receiptSchema = z.object({
  image: z.string({ error: 'Photo manquante' }).min(100, 'Photo manquante ou vide').max(2_500_000, 'Photo trop lourde : 1600 px maximum')
    .regex(/^[A-Za-z0-9+/=]+$/, 'Photo mal encodée (base64 attendu)'),
  media_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif'], { error: 'Format de photo : JPEG, PNG, WebP ou GIF' }),
});

// l'image n'est ni stockée ni journalisée : elle va au modèle, puis seul le résultat est renvoyé
router.post('/api/ai/receipt', auth, wrapAsync(async (req, res) => {
  requireAi(req);
  const { image, media_type } = receiptSchema.parse(req.body);
  res.json(await ai.readReceipt(req.userId, image, media_type));
}));

router.post('/api/ai/ask', auth, wrapAsync(async (req, res) => {
  requireAi(req);
  const { question } = z.object({
    question: z.string({ error: 'Pose ta question' }).trim().min(3, 'Pose ta question en quelques mots').max(500, 'Question trop longue (500 caractères max)'),
  }).parse(req.body);
  if (!ai.takeQuestion(req.userId)) return res.status(429).json({ error: `Tu as posé tes ${ai.DAILY_QUESTIONS} questions du jour : à demain !` });
  const result = await ai.ask(req.userId, question, views);
  res.json({ ...result, remaining: ai.remainingQuestions(req.userId) });
}));

module.exports = router;

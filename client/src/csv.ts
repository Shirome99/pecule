// Import CSV bancaire : décodage, détection du séparateur, lecture des dates / montants, doublons, catégorisation.
// Fonctions pures, testées dans e2e/csv.spec.ts.

export type Separator = ';' | ',';
export type Encoding = 'UTF-8' | 'Windows-1252';

/** Décode le fichier en UTF-8, ou en Windows-1252 (exports Excel / banques françaises) si l'UTF-8 est invalide. */
export function decodeBytes(buf: ArrayBuffer): { text: string; encoding: Encoding } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return { text: text.replace(/^﻿/, ''), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'Windows-1252' };
  }
}

/** Compte les séparateurs hors guillemets sur les premières lignes et garde le plus fréquent. */
export function detectSeparator(text: string): Separator {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10).join('\n');
  let semi = 0;
  let comma = 0;
  let quoted = false;
  for (const ch of sample) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ';') semi++;
    else if (!quoted && ch === ',') comma++;
  }
  return semi >= comma ? ';' : ',';
}

/** Lecture CSV (guillemets doublés, retours à la ligne dans les champs). Les lignes vides sont ignorées. */
export function parseCsv(text: string, sep: Separator): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

const validDate = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const pad = (n: number) => String(n).padStart(2, '0');

/** JJ/MM/AAAA (ou JJ-MM-AAAA, JJ.MM.AA) et AAAA-MM-JJ → AAAA-MM-JJ, sinon null. */
export function parseDate(s: string): string | null {
  const v = s.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
}

/** « 1 234,56 », « -1234.56 », « 1.234,56 € », « +12 », « (12,50) » → nombre, sinon null. */
export function parseAmount(s: string): number | null {
  let v = s.trim().replace(/[\s  €$£]|EUR/gi, '');
  if (!v) return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) { negative = true; v = v.slice(1, -1); }
  if (v.endsWith('-')) { negative = true; v = v.slice(0, -1); }
  if (v.startsWith('-')) { negative = !negative; v = v.slice(1); }
  else if (v.startsWith('+')) v = v.slice(1);
  if (!/^[\d.,]+$/.test(v)) return null;
  const lastComma = v.lastIndexOf(',');
  const lastDot = v.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // le dernier séparateur est le séparateur décimal, l'autre sert aux milliers
    const dec = lastComma > lastDot ? ',' : '.';
    v = v.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    v = (v.match(/,/g)!.length > 1 ? v.split(',').join('') : v.replace(',', '.'));
  } else if (lastDot >= 0 && v.match(/\./g)!.length > 1) {
    v = v.split('.').join('');
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round((negative ? -n : n) * 100) / 100;
}

export type Columns = { date: number; label: number; amount: number; debit: number; credit: number; category: number };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Devine les colonnes à partir des en-têtes (-1 si introuvable). */
export function guessColumns(header: string[]): Columns {
  const find = (re: RegExp) => header.findIndex((h) => re.test(norm(h)));
  return {
    date: find(/date/),
    label: find(/libel|label|description|intitul|nature|objet|detail/),
    amount: find(/montant|amount|somme|valeur/),
    debit: find(/debit/),
    credit: find(/credit/),
    category: find(/categ/),
  };
}

/** Sans en-tête : date = première colonne de dates, montant = première colonne de nombres, libellé = texte le plus long. */
export function guessColumnsFromData(rows: string[][]): Columns {
  const sample = rows.slice(0, 20);
  const width = Math.max(0, ...sample.map((r) => r.length));
  const share = (i: number, test: (c: string) => boolean) => sample.filter((r) => test(r[i] ?? '')).length / (sample.length || 1);
  const idx = [...Array(width).keys()];
  const date = idx.find((i) => share(i, (c) => !!parseDate(c)) > 0.8) ?? -1;
  const amount = idx.find((i) => i !== date && share(i, (c) => parseAmount(c) !== null) > 0.8) ?? -1;
  const avgLen = (i: number) => sample.reduce((s, r) => s + (r[i]?.length ?? 0), 0);
  const label = idx.filter((i) => i !== date && i !== amount).sort((a, b) => avgLen(b) - avgLen(a))[0] ?? -1;
  return { date, label, amount, debit: -1, credit: -1, category: -1 };
}

/** La première ligne est un en-tête si aucune de ses cellules n'est une date ni un montant. */
export const hasHeader = (rows: string[][]) =>
  rows.length > 0 && !rows[0].some((c) => parseDate(c) || (c && parseAmount(c) !== null));

// mots trop génériques pour reconnaître un commerçant (préfixes bancaires, mots outils)
const STOP = new Set([
  'cb', 'carte', 'prlv', 'prelevement', 'sepa', 'vir', 'virement', 'recu', 'emis', 'inst', 'paiement', 'achat', 'retrait',
  'dab', 'facture', 'fact', 'de', 'du', 'des', 'la', 'le', 'les', 'chez', 'par', 'pour', 'sur', 'et', 'en', 'au', 'aux',
  'avec', 'the', 'ref', 'echeance', 'mandat', 'web', 'www', 'com', 'paypal', 'sumup', 'sas', 'sarl', 'tpe',
]);

/** Premier mot significatif d'un libellé (« CB CARREFOUR 12/03 » → « carrefour »). */
export function significantWord(label: string): string | null {
  for (const w of norm(label).split(/[^a-z0-9]+/)) {
    if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) return w;
  }
  return null;
}

type Known = { label: string; amount: number; category_id: number | null };

/** Index « mot significatif → catégorie la plus fréquente » construit depuis les opérations déjà catégorisées. */
export function buildCategoryIndex(txs: Known[]) {
  const counts = new Map<string, Map<number, number>>();
  for (const t of txs) {
    const w = t.category_id ? significantWord(t.label) : null;
    if (!w || !t.category_id) continue;
    const m = counts.get(w) ?? new Map<number, number>();
    m.set(t.category_id, (m.get(t.category_id) ?? 0) + 1);
    counts.set(w, m);
  }
  const index = new Map<string, number>();
  for (const [w, m] of counts) index.set(w, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return index;
}

/** Clé de doublon : même date, même montant, même libellé (casse et espaces ignorés). Le compte est celui de l'import. */
export const dupKey = (date: string, amount: number, label: string) =>
  `${date}|${Math.round(amount * 100)}|${label.trim().replace(/\s+/g, ' ').toLowerCase()}`;

export type Status = 'new' | 'duplicate' | 'transfer' | 'invalid';
export type ImportRow = {
  line: number; date: string; label: string; amount: number; category_id: number | null; status: Status; error?: string;
};
type Cat = { id: number; name: string; kind: 'expense' | 'income' };

/** Transforme les lignes CSV en opérations à importer, avec statut (nouveau, doublon, virement, illisible). */
export function buildRows(
  rows: string[][],
  cols: Columns,
  opts: { mode: 'single' | 'split'; categories: Cat[]; index: Map<string, number>; existing: Set<string>; firstLine: number },
): ImportRow[] {
  const byName = new Map(opts.categories.map((c) => [norm(c.name), c]));
  const byId = new Map(opts.categories.map((c) => [c.id, c]));
  return rows.map((r, i) => {
    const line = opts.firstLine + i;
    const date = parseDate(r[cols.date] ?? '');
    const label = (r[cols.label] ?? '').trim();
    let amount: number | null;
    if (opts.mode === 'split') {
      const debit = parseAmount(r[cols.debit] ?? '');
      const credit = parseAmount(r[cols.credit] ?? '');
      amount = debit === null && credit === null ? null : Math.round((Math.abs(credit ?? 0) - Math.abs(debit ?? 0)) * 100) / 100;
    } else amount = parseAmount(r[cols.amount] ?? '');

    const base = { line, date: date ?? '', label, amount: amount ?? 0, category_id: null as number | null };
    if (!date) return { ...base, status: 'invalid', error: 'Date illisible' };
    if (!label) return { ...base, status: 'invalid', error: 'Libellé vide' };
    if (!amount) return { ...base, status: 'invalid', error: amount === 0 ? 'Montant nul' : 'Montant illisible' };

    // catégorie : colonne du fichier si elle correspond à une catégorie existante, sinon proposition par libellé
    const catCell = cols.category >= 0 ? norm(r[cols.category] ?? '') : '';
    const named = catCell ? byName.get(catCell) : undefined;
    if (!named && catCell === 'virement') return { ...base, status: 'transfer' };
    let category_id = named?.id ?? null;
    if (!category_id) {
      const w = significantWord(label);
      const guess = w ? byId.get(opts.index.get(w) ?? -1) : undefined;
      if (guess && guess.kind === (amount < 0 ? 'expense' : 'income')) category_id = guess.id;
    }
    const status: Status = opts.existing.has(dupKey(date, amount, label)) ? 'duplicate' : 'new';
    return { ...base, category_id, status };
  });
}

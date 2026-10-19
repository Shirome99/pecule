// Règles de catégorisation : « libellé contenant X → catégorie Y ».
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, auth, owns } = require('../lib');
const { normalizeLabel } = require('../rules');
const { applyRules } = require('../categorize');

const router = express.Router();

const ruleSchema = z.object({
  pattern: z.string({ error: 'Saisis le texte à reconnaître' }).trim().min(1, 'Saisis le texte à reconnaître dans le libellé'),
  category_id: z.coerce.number({ error: 'Choisis une catégorie' }).int(),
  priority: z.coerce.number({ error: 'Priorité invalide' }).int('Priorité : un nombre entier').min(0, 'Priorité : de 0 à 100').max(100, 'Priorité : de 0 à 100').default(0),
});

/** Valide et normalise une règle ; renvoie { error } ou { rule }. */
function checkRule(body, userId) {
  const r = ruleSchema.parse(body);
  if (!owns('categories', r.category_id, userId)) return { error: 'Catégorie invalide' };
  const pattern = normalizeLabel(r.pattern);
  if (!pattern) return { error: 'Le motif doit contenir au moins un mot sans chiffre (ex. BASIC FIT)' };
  return { rule: { ...r, pattern } };
}

router.get('/api/rules', auth, wrap((req, res) => {
  res.json(db.prepare(`
    SELECT r.id, r.pattern, r.category_id, r.priority, c.name AS category_name, c.icon AS category_icon, c.color AS category_color, c.kind AS category_kind
    FROM rules r JOIN categories c ON c.id = r.category_id
    WHERE r.user_id = ? ORDER BY r.priority DESC, length(r.pattern) DESC, r.id`).all(req.userId));
}));

router.post('/api/rules', auth, wrap((req, res) => {
  const { error, rule } = checkRule(req.body, req.userId);
  if (error) return res.status(400).json({ error });
  const { lastInsertRowid: id } = db.prepare('INSERT INTO rules (user_id, pattern, category_id, priority) VALUES (?,?,?,?)')
    .run(req.userId, rule.pattern, rule.category_id, rule.priority);
  res.status(201).json({ id, pattern: rule.pattern });
}));

router.put('/api/rules/:id', auth, wrap((req, res) => {
  if (!owns('rules', req.params.id, req.userId)) return res.status(404).json({ error: 'Règle introuvable' });
  const { error, rule } = checkRule(req.body, req.userId);
  if (error) return res.status(400).json({ error });
  db.prepare('UPDATE rules SET pattern = ?, category_id = ?, priority = ? WHERE id = ?')
    .run(rule.pattern, rule.category_id, rule.priority, req.params.id);
  res.json({ ok: true, pattern: rule.pattern });
}));

router.delete('/api/rules/:id', auth, wrap((req, res) => {
  if (!owns('rules', req.params.id, req.userId)) return res.status(404).json({ error: 'Règle introuvable' });
  db.prepare('DELETE FROM rules WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// « Appliquer aux opérations sans catégorie » : une catégorie choisie à la main n'est jamais remplacée
router.post('/api/rules/apply', auth, wrap((req, res) => {
  res.json({ classified: applyRules(req.userId) });
}));

module.exports = router;

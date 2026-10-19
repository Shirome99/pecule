// Annulation d'une suppression récente (jeton renvoyé par la route DELETE).
const express = require('express');
const { z } = require('zod');
const { wrap, auth } = require('../lib');
const { restore } = require('../undo');

const router = express.Router();

router.post('/api/undo', auth, wrap((req, res) => {
  const { token } = z.object({ token: z.string().min(1, 'Jeton d’annulation manquant') }).parse(req.body);
  if (!restore(req.userId, token)) return res.status(410).json({ error: 'Trop tard pour annuler : la suppression est définitive' });
  res.json({ ok: true });
}));

module.exports = router;

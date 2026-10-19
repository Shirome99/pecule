// Virements entre comptes.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, isoDate, auth } = require('../lib');
const { getTransferLines, saveTransfer } = require('../transfers');

const router = express.Router();

const transferSchema = z.object({
  from_account_id: z.coerce.number({ error: 'Choisis le compte de départ' }).int(),
  to_account_id: z.coerce.number({ error: "Choisis le compte d'arrivée" }).int(),
  amount: z.coerce.number().positive('Le montant doit être positif'),
  date: isoDate('Date invalide'),
  label: z.string().trim().optional(),
});

router.post('/api/transfers', auth, wrap((req, res) => {
  const result = saveTransfer(req.userId, transferSchema.parse(req.body));
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result);
}));

router.put('/api/transfers/:transferId', auth, wrap((req, res) => {
  if (getTransferLines(req.params.transferId, req.userId).length === 0)
    return res.status(404).json({ error: 'Virement introuvable' });
  const result = saveTransfer(req.userId, transferSchema.parse(req.body), req.params.transferId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
}));

router.delete('/api/transfers/:transferId', auth, wrap((req, res) => {
  const { changes } = db.prepare('DELETE FROM transactions WHERE transfer_id = ? AND user_id = ?')
    .run(req.params.transferId, req.userId);
  if (!changes) return res.status(404).json({ error: 'Virement introuvable' });
  res.json({ ok: true });
}));

module.exports = router;

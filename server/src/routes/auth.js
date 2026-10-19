// Inscription, connexion et profil.
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db, seedUser } = require('../db');
const { wrap, sign, publicUser, auth } = require('../lib');
const { generateRecurring } = require('../recurring');

const router = express.Router();

/** Profil renvoyé au client : `onboarding` = afficher le parcours de premier lancement (compte neuf, sans opération). */
const profile = (u) => ({
  ...publicUser(u),
  onboarding: !u.onboarded_at && !db.prepare('SELECT 1 FROM transactions WHERE user_id = ? LIMIT 1').get(u.id),
});

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis'),
  email: z.string().trim().toLowerCase().email('Email invalide'),
  password: z.string().min(6, 'Mot de passe : 6 caractères minimum'),
});

router.post('/api/auth/register', wrap((req, res) => {
  const { name, email, password } = registerSchema.parse(req.body);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'Cet email est déjà utilisé' });
  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid: id } = db
    .prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)')
    .run(email, name, hash);
  seedUser(id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json({ token: sign(user), user: profile(user) });
}));

router.post('/api/auth/login', wrap((req, res) => {
  const { email, password } = z.object({
    email: z.string().trim().toLowerCase(),
    password: z.string(),
  }).parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  generateRecurring(user.id);
  res.json({ token: sign(user), user: profile(user) });
}));

router.get('/api/me', auth, wrap((req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  res.json(profile(user));
}));

router.put('/api/me', auth, wrap((req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1, 'Ton prénom ne peut pas être vide').max(60, 'Prénom trop long (60 caractères max)') })
    .parse(req.body);
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.userId);
  res.json(profile(db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)));
}));

router.put('/api/me/password', auth, wrap((req, res) => {
  const { current_password, new_password } = z.object({
    current_password: z.string({ error: 'Saisis ton mot de passe actuel' }),
    new_password: z.string({ error: 'Saisis un nouveau mot de passe' }).min(6, 'Nouveau mot de passe : 6 caractères minimum'),
  }).parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!bcrypt.compareSync(current_password, user.password_hash))
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.userId);
  res.json({ ok: true });
}));

// parcours de premier lancement terminé (ou passé) : il ne revient plus
router.post('/api/me/onboarding', auth, wrap((req, res) => {
  db.prepare("UPDATE users SET onboarded_at = COALESCE(onboarded_at, datetime('now')) WHERE id = ?").run(req.userId);
  res.json(profile(db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)));
}));

module.exports = router;

// Inscription, connexion et profil.
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db, seedUser } = require('../db');
const { wrap, sign, publicUser, auth } = require('../lib');
const { generateRecurring } = require('../recurring');

const router = express.Router();

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
  res.status(201).json({ token: sign(user), user: publicUser(user) });
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
  res.json({ token: sign(user), user: publicUser(user) });
}));

router.get('/api/me', auth, wrap((req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  res.json(publicUser(user));
}));

module.exports = router;

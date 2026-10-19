const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { configErrors, rateLimit, corsOptions } = require('./security');

// en production, on refuse de démarrer avec une configuration dangereuse
const problems = configErrors(process.env);
if (problems.length) {
  for (const p of problems) console.error(`Configuration invalide : ${p}`);
  process.exit(1);
}

const PORT = process.env.PORT || 4000;

const app = express();
// derrière un reverse proxy (nginx, Traefik…), TRUST_PROXY=1 pour lire la vraie IP du client
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'connect-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      'upgrade-insecure-requests': null, // le HTTPS est géré par le reverse proxy
    },
  },
}));
app.use(cors(corsOptions(process.env)));
app.use(express.json({ limit: '2mb' })); // import CSV : jusqu'à 2000 lignes
app.use('/api/auth', rateLimit({
  windowMs: 60_000,
  max: Number(process.env.AUTH_RATE_LIMIT) || 5,
  message: 'Trop de tentatives : réessaie dans une minute.',
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// un routeur par domaine ; chaque routeur déclare ses chemins complets (/api/...)
for (const name of ['auth', 'accounts', 'wealth', 'categories', 'transactions', 'transfers', 'recurring',
  'forecast', 'subscriptions', 'goals', 'budgets', 'stats']) {
  app.use(require(`./routes/${name}`));
}

// ---------- front buildé (prod) ----------
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next());
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`API sur http://localhost:${PORT}`));
}
module.exports = app;

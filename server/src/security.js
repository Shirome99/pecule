// Réglages de sécurité pour la production : configuration obligatoire, limitation de débit, CORS.

const DEFAULT_JWT_SECRET = 'dev-secret-change-me';

/** Liste des problèmes de configuration qui empêchent de démarrer en production (vide si tout va bien). */
function configErrors(env) {
  if (env.NODE_ENV !== 'production') return [];
  const errors = [];
  if (!env.JWT_SECRET || env.JWT_SECRET === DEFAULT_JWT_SECRET)
    errors.push('JWT_SECRET est absent ou vaut la valeur par défaut : définis une longue clé secrète (ex. `openssl rand -hex 32`).');
  else if (env.JWT_SECRET.length < 32)
    errors.push('JWT_SECRET est trop court : 32 caractères minimum.');
  return errors;
}

/**
 * Limiteur en mémoire à fenêtre fixe, par IP : `max` requêtes par `windowMs`.
 * Suffisant pour une instance unique (pas besoin de Redis ni d'une dépendance).
 */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, reset }
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10_000) for (const [ip, h] of hits) if (h.reset <= now) hits.delete(ip);
    const key = req.ip;
    let h = hits.get(key);
    if (!h || h.reset <= now) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
    h.count++;
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - h.count));
    if (h.count > max) {
      res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

/** Options CORS : ouvert en développement, limité à CORS_ORIGIN (liste séparée par des virgules) en production. */
function corsOptions(env) {
  if (env.NODE_ENV !== 'production') return {};
  const allowed = (env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  // sans CORS_ORIGIN : aucune origine tierce (le front est servi par le même serveur)
  return { origin: allowed.length ? allowed : false };
}

module.exports = { configErrors, rateLimit, corsOptions, DEFAULT_JWT_SECRET };

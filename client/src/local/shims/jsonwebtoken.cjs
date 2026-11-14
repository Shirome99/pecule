// Substitut de jsonwebtoken pour l'app : la « session » reste sur l'appareil, aucun secret à protéger d'un tiers.
// Le jeton porte seulement l'identifiant du profil local ; verify() lève une erreur s'il est illisible.
const PREFIX = 'local.';

function sign(payload) {
  return PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function verify(token) {
  if (typeof token !== 'string' || !token.startsWith(PREFIX)) throw new Error('Jeton invalide');
  const payload = JSON.parse(decodeURIComponent(escape(atob(token.slice(PREFIX.length)))));
  if (!payload || typeof payload.id !== 'number') throw new Error('Jeton invalide');
  return payload;
}

module.exports = { sign, verify, default: { sign, verify } };

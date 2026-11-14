// Substitut de « path » : la base de l'app n'a pas de fichier, seuls des chemins inoffensifs sont construits.
const join = (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/');
module.exports = { join, resolve: join, dirname: (p) => p.split('/').slice(0, -1).join('/') || '/', basename: (p) => p.split('/').pop(), sep: '/' };

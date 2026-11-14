// zod en version ESM : importé par require() côté serveur, esbuild prendrait la version CommonJS, non élaguée.
export { z } from 'zod';

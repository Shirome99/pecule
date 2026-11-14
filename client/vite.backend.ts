// Plugin Vite : construit le « serveur embarqué » de l'app mobile (module virtuel `virtual:pecule-backend`).
// esbuild empaquette les routeurs de server/src (CommonJS) avec des substituts navigateur (src/local/shims) :
// le code métier du serveur est réutilisé tel quel, sans copie, et reste couvert par ses tests.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin as EsbuildPlugin } from 'esbuild';
import type { Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const shims = path.join(here, 'src', 'local', 'shims');
const VIRTUAL_ID = 'virtual:pecule-backend';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

const SHIMS: Record<string, string> = {
  'better-sqlite3': 'better-sqlite3.cjs',
  express: 'express.cjs',
  jsonwebtoken: 'jsonwebtoken.cjs',
  path: 'path.cjs',
  '@anthropic-ai/sdk': 'anthropic.mjs',
  zod: 'zod.mjs',
  crypto: 'empty.cjs',
};

/** Redirige les modules Node du serveur vers leurs substituts (sauf le SDK importé par son propre substitut). */
const shimPlugin: EsbuildPlugin = {
  name: 'pecule-shims',
  setup(b) {
    const filter = new RegExp(`^(${Object.keys(SHIMS).map((k) => k.replace(/[/.-]/g, '\\$&')).join('|')})$`);
    b.onResolve({ filter }, (args) => {
      const target = path.join(shims, SHIMS[args.path]);
      if (path.resolve(args.importer) === target) return undefined;
      return { path: target };
    });
  },
};

export async function bundleBackend(minify: boolean) {
  const result = await build({
    entryPoints: [path.join(here, 'src', 'local', 'backend-entry.cjs')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    minify,
    metafile: true,
    legalComments: 'none',
    logLevel: 'silent',
    // zod, bcryptjs et le SDK Anthropic sont des dépendances du serveur
    nodePaths: [path.join(here, '..', 'server', 'node_modules')],
    define: {
      'process.env': 'globalThis.__peculeEnv',
      __dirname: '"/"',
      global: 'globalThis',
    },
    plugins: [shimPlugin],
  });
  return { code: result.outputFiles[0].text, inputs: Object.keys(result.metafile.inputs) };
}

export function peculeBackend(): Plugin {
  let minify = false;
  return {
    name: 'pecule-backend',
    configResolved(config) { minify = config.command === 'build'; },
    resolveId(id) { return id === VIRTUAL_ID ? RESOLVED_ID : null; },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const { code, inputs } = await bundleBackend(minify);
      // en développement, une modification du serveur reconstruit le module
      for (const input of inputs) if (!input.includes('node_modules')) this.addWatchFile(path.resolve(input));
      return code;
    },
  };
}

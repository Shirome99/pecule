// Vérifie après `vite build` que le JS chargé au démarrage (script d'entrée + modulepreload) reste sous 250 kB gzip
// et ne contient pas Recharts (réservé aux pages qui ont un graphique).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const LIMIT = 250 * 1024;
const dist = join(import.meta.dirname, '..', 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="\/([^"]+\.js)"/g)].map((m) => m[1]);

let total = 0;
for (const f of files) {
  const code = readFileSync(join(dist, f));
  const size = gzipSync(code).length;
  total += size;
  console.log(`  ${f.padEnd(40)} ${(size / 1024).toFixed(1)} kB gzip`);
  if (code.includes('recharts-wrapper')) {
    console.error(`✗ Recharts est dans le JS initial (${f}) : charge-le avec React.lazy`);
    process.exit(1);
  }
}
console.log(`JS initial : ${(total / 1024).toFixed(1)} kB gzip (limite ${LIMIT / 1024} kB)`);
if (!files.length || total > LIMIT) {
  console.error(files.length ? '✗ JS initial trop lourd' : '✗ aucun script trouvé dans dist/index.html');
  process.exit(1);
}

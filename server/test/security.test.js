import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import security from '../src/security.js';

const { configErrors, corsOptions, rateLimit } = security;
const serverDir = fileURLToPath(new URL('..', import.meta.url));
const GOOD_SECRET = 'a'.repeat(48);

/** Lance le serveur dans un processus séparé ; résout avec le code de sortie ou 'started'. */
function start(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['src/index.js'], {
      cwd: serverDir,
      env: { ...process.env, DB_PATH: ':memory:', PORT: '0', ...env },
    });
    let output = '';
    const timer = setTimeout(() => { child.kill(); resolve({ result: 'timeout', output }); }, 10_000);
    const onData = (d) => {
      output += d;
      if (output.includes('API sur')) { clearTimeout(timer); child.kill(); resolve({ result: 'started', output }); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ result: code, output }); });
  });
}

describe('configuration de production', () => {
  it('exige un JWT_SECRET fort en production uniquement', () => {
    expect(configErrors({ NODE_ENV: 'development' })).toEqual([]);
    expect(configErrors({ NODE_ENV: 'production' })[0]).toMatch(/JWT_SECRET est absent/);
    expect(configErrors({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret-change-me' })[0]).toMatch(/valeur par défaut/);
    expect(configErrors({ NODE_ENV: 'production', JWT_SECRET: 'court' })[0]).toMatch(/trop court/);
    expect(configErrors({ NODE_ENV: 'production', JWT_SECRET: GOOD_SECRET })).toEqual([]);
  });

  it('refuse de démarrer sans JWT_SECRET ou avec la valeur par défaut', async () => {
    const missing = await start({ NODE_ENV: 'production', JWT_SECRET: '' });
    expect(missing.result).toBe(1);
    expect(missing.output).toMatch(/Configuration invalide : JWT_SECRET/);
    const def = await start({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret-change-me' });
    expect(def.result).toBe(1);
  });

  it('démarre avec un secret correct', async () => {
    expect((await start({ NODE_ENV: 'production', JWT_SECRET: GOOD_SECRET })).result).toBe('started');
  });

  it('restreint CORS en production', () => {
    expect(corsOptions({ NODE_ENV: 'development' })).toEqual({});
    expect(corsOptions({ NODE_ENV: 'production' })).toEqual({ origin: false });
    expect(corsOptions({ NODE_ENV: 'production', CORS_ORIGIN: 'https://pecule.fr, https://www.pecule.fr' }))
      .toEqual({ origin: ['https://pecule.fr', 'https://www.pecule.fr'] });
  });
});

describe('protections HTTP', () => {
  it('limite /api/auth à 5 essais par minute et par IP', async () => {
    process.env.AUTH_RATE_LIMIT = '5';
    const { default: app } = await import('../src/index.js');
    const tries = [];
    for (let i = 0; i < 6; i++) tries.push(await request(app).post('/api/auth/login').send({ email: 'x@test.fr', password: 'mauvais' }));
    expect(tries.slice(0, 5).map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    expect(tries[5].status).toBe(429);
    expect(tries[5].body.error).toBe('Trop de tentatives : réessaie dans une minute.');
    expect(Number(tries[5].headers['retry-after'])).toBeGreaterThan(0);
    // les autres routes ne sont pas concernées
    expect((await request(app).get('/api/health')).status).toBe(200);

    // en-têtes de sécurité (helmet)
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('remet le compteur à zéro après la fenêtre', async () => {
    let now = 0;
    const realNow = Date.now;
    Date.now = () => now;
    try {
      const mw = rateLimit({ windowMs: 1000, max: 1, message: 'stop' });
      const run = () => {
        let status = 200;
        const res = { setHeader() {}, status(s) { status = s; return { json() {} }; } };
        mw({ ip: '1.2.3.4' }, res, () => {});
        return status;
      };
      expect(run()).toBe(200);
      expect(run()).toBe(429);
      now = 1001;
      expect(run()).toBe(200);
    } finally {
      Date.now = realNow;
    }
  });
});

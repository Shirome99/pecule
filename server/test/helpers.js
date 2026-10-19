// Utilitaires communs aux tests d'API : chaque fichier de test a sa propre base en mémoire.
import request from 'supertest';
import app from '../src/index.js';

let n = 0;

/** Crée un utilisateur et renvoie un client authentifié + ses comptes/catégories. */
export async function newUser(name = 'Test') {
  const email = `user${++n}-${Date.now()}@test.fr`;
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'secret12' });
  if (res.status !== 201) throw new Error(`register: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body.token;
  const as = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
  const client = {
    token, email, user: res.body.user,
    get: (url) => as('get', url),
    post: (url, body) => as('post', url).send(body),
    put: (url, body) => as('put', url).send(body),
    del: (url) => as('delete', url),
  };
  client.accounts = (await client.get('/api/accounts')).body;
  client.categories = (await client.get('/api/categories')).body;
  client.cat = (name) => client.categories.find((c) => c.name === name).id;
  return client;
}

export { app, request };

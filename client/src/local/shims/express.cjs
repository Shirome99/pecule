// Substitut minimal d'Express pour exécuter les routeurs du serveur dans l'app, sans HTTP.
// Les routeurs (server/src/routes/*.js) déclarent leurs chemins complets : on les enregistre tels quels
// et `handle()` joue le rôle du serveur en renvoyant { status, headers, body }.

function compile(path) {
  const keys = [];
  const pattern = path
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) { keys.push(part.slice(1)); return '([^/]+)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${pattern}/?$`), keys };
}

function Router() {
  const routes = [];
  const router = { routes };
  for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
    router[method] = (path, ...handlers) => {
      routes.push({ method: method.toUpperCase(), path, ...compile(path), handlers: handlers.flat() });
      return router;
    };
  }
  router.use = () => router; // aucun middleware de routeur n'est utilisé par le serveur
  return router;
}

/** Comme le serveur réel : la réponse traverse JSON (dates en texte, undefined retirés). */
const throughJson = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function parseQuery(search) {
  const query = {};
  for (const [k, v] of new URLSearchParams(search)) {
    if (k in query) query[k] = [].concat(query[k], v);
    else query[k] = v;
  }
  return query;
}

/** Application : une liste de routeurs, et `handle()` qui exécute la première route correspondante. */
function createApp(routers) {
  const routes = routers.flatMap((r) => r.routes);

  return {
    routes,
    handle({ method, url, headers = {}, body }) {
      const [pathname, search = ''] = url.split('?');
      const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
      const upper = method.toUpperCase();

      let match = null;
      let params = {};
      for (const route of routes) {
        if (route.method !== upper) continue;
        const m = route.regex.exec(pathname);
        if (!m) continue;
        match = route;
        params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        break;
      }

      return new Promise((resolve) => {
        const res = {
          statusCode: 200,
          headers: {},
          headersSent: false,
          status(code) { this.statusCode = code; return this; },
          setHeader(name, value) { this.headers[name.toLowerCase()] = String(value); return this; },
          set(name, value) { return this.setHeader(name, value); },
          getHeader(name) { return this.headers[name.toLowerCase()]; },
          type(t) { return this.setHeader('Content-Type', t); },
          json(data) { this.setHeader('Content-Type', 'application/json'); return this._finish(throughJson(data)); },
          send(data) { return this._finish(data); },
          sendStatus(code) { this.statusCode = code; return this._finish(undefined); },
          end(data) { return this._finish(data); },
          _finish(data) {
            if (this.headersSent) return this;
            this.headersSent = true;
            resolve({ status: this.statusCode, headers: this.headers, body: data });
            return this;
          },
        };

        if (!match) {
          res.status(404).json({ error: 'Introuvable' });
          return;
        }

        const req = {
          method: upper,
          url,
          originalUrl: url,
          path: pathname,
          params,
          query: parseQuery(search),
          body: body === undefined ? {} : throughJson(body),
          headers: lowerHeaders,
          ip: '127.0.0.1',
          get(name) { return lowerHeaders[name.toLowerCase()]; },
          header(name) { return lowerHeaders[name.toLowerCase()]; },
        };

        const fail = (e) => {
          console.error(e);
          if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
        };

        let i = 0;
        const next = (err) => {
          if (err) return fail(err);
          const handler = match.handlers[i++];
          if (!handler) { if (!res.headersSent) res.status(404).json({ error: 'Introuvable' }); return; }
          try {
            const out = handler(req, res, next);
            if (out && typeof out.then === 'function') out.catch(fail);
          } catch (e) { fail(e); }
        };
        next();
      });
    },
  };
}

function express() { throw new Error('express() n’est pas disponible dans l’app : utilise createApp(routeurs)'); }
express.Router = Router;
express.json = () => (req, res, next) => next();
express.static = () => (req, res, next) => next();

module.exports = express;
module.exports.Router = Router;
module.exports.createApp = createApp;

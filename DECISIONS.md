# Journal des décisions

Format : date — contexte → choix (alternative écartée).

## 2026-10-19 — Installation de better-sqlite3 sous Windows
**Contexte** : `npm install` lance `node-gyp rebuild` et échoue faute de Visual Studio C++, alors que le paquet
better-sqlite3 13 embarque déjà ses binaires précompilés (`prebuilds/`, `gypfile: false`).
**Choix** : `server/.npmrc` avec `ignore-scripts=true` ; le binaire précompilé est chargé directement.
**Écarté** : installer les Build Tools Visual Studio (hors du dossier projet), ou rétrograder better-sqlite3.

## 2026-10-19 — Serveurs pour les tests e2e
**Contexte** : le scénario Playwright modifie les données du compte démo.
**Choix** : Playwright démarre son propre API (port 4100, `DB_PATH=e2e.db` réinitialisée par `npm run seed`) et un Vite
(port 5180) dont le proxy est configurable via `API_PROXY`. Ajout d'une route publique `GET /api/health`.
Les tests tournent en série (1 worker) car ils partagent le même compte.
**Écarté** : réutiliser la base de dev (`money.db`), qui serait polluée par les tests.

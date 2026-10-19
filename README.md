# Pécule — gestion de budget perso

App web de money management : comptes, opérations, virements, opérations récurrentes, prévision de fin de mois
(« reste à dépenser par jour »), détection des abonnements, patrimoine net (placements et crédits), import CSV bancaire,
budgets mensuels, objectifs d'épargne et tableau de bord. Responsive (sidebar sur desktop, barre d'onglets + bouton « + »
sur mobile) et installable comme une app (PWA).

## Stack

- **client/** — React 19 + TypeScript + Vite, React Router, Recharts, vite-plugin-pwa
- **server/** — Node.js + Express, SQLite (better-sqlite3), auth JWT + bcrypt, validation Zod, helmet

Les montants sont stockés en **centimes** (entiers) côté base pour éviter les erreurs d'arrondi ; l'API parle en euros décimaux.
Une dépense est un montant négatif, un revenu un montant positif. Un virement = deux lignes liées par un `transfer_id`,
exclues des revenus, dépenses, budgets et statistiques (mais comptées dans les soldes).

Les comptes sont groupés en trois familles : **liquidités** (courant, épargne, espèces, carte), **placements** (PEA,
assurance-vie, compte-titres, crypto, immobilier, autre — valorisés à la main) et **dettes** (crédit immo, crédit conso —
capital restant dû calculé par le tableau d'amortissement). Seules les liquidités comptent dans les revenus, dépenses,
budgets, prévisions et le « Solde total » de l'Aperçu.

## Lancer en développement

Prérequis : Node 22+ (testé avec Node 24).

```bash
# terminal 1 — API sur http://localhost:4000
cd server
npm install
npm run seed      # optionnel : compte démo demo@money.app / demo1234 avec 6 mois de données
npm run dev

# terminal 2 — front sur http://localhost:5173 (proxy /api → 4000)
cd client
npm install
npm run dev
```

> Windows : `server/.npmrc` désactive les scripts d'installation, car better-sqlite3 embarque ses binaires précompilés
> (pas besoin de Visual Studio). Voir `DECISIONS.md`.

## Tests

```bash
cd server && npm test                       # API : vitest + supertest, base en mémoire
cd client && npx tsc -b && npm run build    # typage + build
cd client && npx playwright install chromium   # une fois
cd client && npm run test:e2e               # build + taille du JS initial (< 250 kB gzip) + e2e 1366×900 et 390×844 (dont axe) + PWA
SCREENSHOTS=1 npx playwright test screenshots   # captures de tous les écrans dans docs/screenshots/
```

Les tests e2e démarrent leur propre API (port 4100, base `server/e2e.db` réinitialisée avec le compte démo) et leur propre
Vite (port 5180) : ta base de dev n'est jamais touchée.

## Production

### Avec Docker (non vérifié)

> Docker est hors périmètre de la feuille de route actuelle (« sera traité plus tard »). Le `Dockerfile` et le
> `docker-compose.yml` sont fournis mais n'ont jamais pu être construits sur la machine de développement.

```bash
cp .env.example .env          # puis renseigne JWT_SECRET (openssl rand -hex 32)
docker compose up -d --build  # app complète sur http://localhost:4000
docker compose exec pecule node server/src/seed-demo.js   # optionnel : compte démo
```

L'image est construite en plusieurs étapes (build du client, dépendances serveur, image Node finale qui sert l'API et le
front sur un seul port). La base SQLite vit dans le volume `pecule-data` (`/data/money.db`) : elle survit aux mises à jour
de l'image. Sauvegarde : `docker compose cp pecule:/data/money.db ./sauvegarde.db`.

Mets un reverse proxy HTTPS (Caddy, nginx, Traefik) devant le conteneur et passe `TRUST_PROXY=1`.

### Sans Docker

```bash
cd client && npm ci && npm run build      # génère client/dist
cd ../server && npm ci --omit=dev
NODE_ENV=production JWT_SECRET=$(openssl rand -hex 32) DB_PATH=/chemin/money.db npm start
```

Le serveur Express sert aussi le front buildé : une seule URL (http://localhost:4000).

### Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `NODE_ENV` | — | `production` active les contrôles de sécurité ci-dessous |
| `JWT_SECRET` | `dev-secret-change-me` | Clé des sessions. **En production, le serveur refuse de démarrer** si elle est absente, vaut la valeur par défaut ou fait moins de 32 caractères |
| `PORT` | `4000` | Port HTTP |
| `DB_PATH` | `server/money.db` | Fichier SQLite (`:memory:` pour les tests) |
| `CORS_ORIGIN` | vide | Production : origines autorisées, séparées par des virgules. Vide = aucune origine tierce (front servi par le même serveur). En dev, CORS est ouvert |
| `TRUST_PROXY` | vide | `1` derrière un reverse proxy, pour que la limitation de débit voie la vraie IP |
| `AUTH_RATE_LIMIT` | `5` | Essais par minute et par IP sur `/api/auth/*` |

### Sécurité

- `helmet` : en-têtes de sécurité et Content-Security-Policy (Google Fonts autorisé).
- Limitation de débit sur `/api/auth/*` : 5 essais/minute/IP, réponse 429 « Trop de tentatives : réessaie dans une minute. »
- Chaque ressource est vérifiée comme appartenant à l'utilisateur connecté.

## PWA

Manifest « Pécule » (couleur `#123b3a`), icônes 192/512/maskable et `apple-touch-icon` générées depuis
`client/public/favicon.svg` par `npm run icons`. Le service worker met en cache le shell : hors ligne, l'app s'ouvre avec
le bandeau « Hors ligne : tes données s'afficheront au retour du réseau ». Les données de l'API ne sont jamais mises en cache.

## API

Toutes les routes sauf `/api/health` et `/api/auth/*` demandent `Authorization: Bearer <token>`.
Les erreurs renvoient `{ error: "message en français" }`.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | Santé du serveur (Docker, supervision) |
| POST | `/api/auth/register` · `/api/auth/login` | Inscription / connexion → `{ token, user }` (le login génère les récurrences dues) |
| GET/PUT | `/api/me` | Utilisateur courant (`onboarding` : afficher le parcours de premier lancement) ; modifier son prénom `{ name }` |
| PUT | `/api/me/password` | `{ current_password, new_password }` |
| POST | `/api/me/onboarding` | Parcours de premier lancement terminé ou passé |
| POST | `/api/undo` | `{ token }` : annule une suppression d'opération, de budget ou de catégorie (jeton renvoyé par `DELETE`, valable 60 s) |
| GET/POST/PUT/DELETE | `/api/accounts` | Comptes ; `balance` = valeur actuelle selon la famille (`family`), + `invested`, `gain`, `gain_pct` pour un placement |
| GET/POST/DELETE | `/api/categories` | Catégories (11 créées à l'inscription) |
| GET/POST/PUT/DELETE | `/api/transactions` | Opérations ; filtres `month`, `from`, `to`, `account_id`, `category_id`, `tag`, `q`, `limit` (max 2000). `tags: ["vacances"]` à l'écriture ; sans catégorie, les règles en donnent une ; la réponse peut contenir une `suggestion` de règle. Modifier ou supprimer une ligne de virement agit sur les deux |
| POST | `/api/transactions/bulk` | Import : `{ account_id, rows: [{ date, label, amount, category_id? }] }`, montants signés, 2000 lignes max, tout ou rien |
| POST | `/api/transfers` | Virement `{ from_account_id, to_account_id, amount, date, label? }` |
| PUT/DELETE | `/api/transfers/:transfer_id` | Modifier / supprimer un virement (les deux lignes) |
| GET/POST | `/api/recurring` | Opérations récurrentes `{ account_id, category_id?, amount, type: expense\|income\|transfer, to_account_id? (virement), label, frequency: monthly\|weekly\|yearly, day?, start_date, end_date? }` |
| PUT | `/api/recurring/:id` | Pause / reprise `{ paused: true\|false }` |
| DELETE | `/api/recurring/:id` | Supprime la règle (les opérations passées restent) |
| GET/POST/PUT/DELETE | `/api/goals` | Objectifs d'épargne `{ name, target_amount, target_date?, account_id?, saved? }` + progression et `per_month` calculés |
| POST | `/api/goals/:id/contributions` | Versement (montant positif) ou retrait (négatif) sur un objectif sans compte lié |
| GET/POST/DELETE | `/api/budgets?month=YYYY-MM` | Plafonds mensuels + dépensé du mois (hors virements) |
| GET | `/api/stats?month=YYYY-MM` | Revenus, dépenses, solde des liquidités, répartition, tendance 6 mois, `upcoming` (récurrences à venir du mois) |
| GET | `/api/forecast?month=YYYY-MM` | Prévision du mois en cours : à venir, rythme des dépenses variables, `projected_end_balance`, `safe_to_spend`, `safe_per_day`, `overspend` ; mois passé → chiffres réels avec `is_past: true` ; mois futur → 400 |
| GET | `/api/insights?month=YYYY-MM` | Au plus 3 constats du mois (catégorie en hausse/baisse, dépense inhabituelle, budget en voie de dépassement, bonne nouvelle), triés par importance, avec un lien de filtre |
| GET | `/api/subscriptions` | Abonnements détectés (mensuels / annuels), coût annuel, prochaine date, `price_change` ; totaux mensuel et annuel |
| POST | `/api/subscriptions/ignore` · `/api/subscriptions/track` | `{ key }` : ignorer un abonnement, ou le suivre comme opération récurrente |
| GET/POST | `/api/accounts/:id/valuations` | Valorisations d'un placement `{ date, value }` (une par jour, la dernière fait foi) |
| DELETE | `/api/valuations/:id` | Supprimer une valorisation |
| GET/PUT | `/api/accounts/:id/loan` | Paramètres d'un crédit `{ principal, annual_rate, duration_months, first_payment_date, insurance_monthly? }` + mensualité, fin, coût |
| GET | `/api/loans/:id/schedule` | Tableau d'amortissement |
| GET | `/api/networth?months=24` | Fin de chaque mois : liquidités, placements, dettes, patrimoine net ; variations 1 et 12 mois |
| GET/POST/PUT/DELETE | `/api/rules` | Règles de catégorisation `{ pattern, category_id, priority? }` (motif normalisé comme les libellés) |
| POST | `/api/rules/apply` | Classe les opérations sans catégorie → `{ classified }` |
| GET | `/api/tags` · `/api/tags/:name` | Tags utilisés (autocomplétion) ; bilan d'un tag : total, période, répartition par catégorie |
| GET | `/api/export.csv` | Export de toutes les opérations (format Excel FR, virements marqués « Virement ») |

## Suivi

- `PROGRESS.md` : avancement de la feuille de route et prochaines évolutions.
- `DECISIONS.md` : choix techniques et alternatives écartées.

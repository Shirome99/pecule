# Pécule — gestion de budget perso

App web de money management : comptes, opérations, catégories, budgets mensuels, tableau de bord.
Interface déjà responsive (sidebar sur desktop, barre d'onglets + bouton « + » sur mobile).

## Stack

- **client/** — React 19 + TypeScript + Vite, React Router, Recharts
- **server/** — Node.js + Express, SQLite (better-sqlite3), auth JWT + bcrypt, validation Zod

Les montants sont stockés en **centimes** (entiers) côté base pour éviter les erreurs d'arrondi.
Une dépense est un montant négatif, un revenu un montant positif.

## Lancer en développement

Prérequis : Node 20+.

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

## Production

```bash
cd client && npm run build      # génère client/dist
cd ../server && JWT_SECRET=une-longue-cle-secrete npm start
```

Le serveur Express sert aussi le front buildé : une seule URL (http://localhost:4000).

Variables d'environnement : `PORT`, `JWT_SECRET` (**à changer impérativement**), `DB_PATH`.

## API

Toutes les routes sauf `/api/auth/*` demandent `Authorization: Bearer <token>`.

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` | Inscription / connexion → `{ token, user }` |
| GET | `/api/me` | Utilisateur courant |
| GET/POST/PUT/DELETE | `/api/accounts` | Comptes (le solde est calculé) |
| GET/POST/DELETE | `/api/categories` | Catégories (11 créées à l'inscription) |
| GET/POST/PUT/DELETE | `/api/transactions` | Opérations ; filtres `month`, `account_id`, `category_id`, `q` |
| GET/POST/DELETE | `/api/budgets?month=YYYY-MM` | Plafonds mensuels + dépensé du mois |
| GET | `/api/stats?month=YYYY-MM` | Revenus, dépenses, solde, répartition, tendance 6 mois |
| GET | `/api/export.csv` | Export de toutes les opérations (format Excel FR) |

## Pistes pour la suite

- **Virements entre comptes** (aujourd'hui, un virement compte comme dépense + revenu)
- **Opérations récurrentes** (loyer, salaire, abonnements générés automatiquement)
- **Import CSV/OFX** depuis l'export de ta banque
- **Mobile** : la passer en PWA (manifest + service worker, installable sur l'écran d'accueil),
  ou réutiliser l'API telle quelle avec une app React Native / Expo
- Passer à PostgreSQL si plusieurs utilisateurs en production

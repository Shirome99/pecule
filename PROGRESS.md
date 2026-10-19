# Avancement

## Feuille de route

- [x] **Tâche 0 — Socle : git + tests**
  Dépôt git + `.gitignore`. Serveur : vitest + supertest (`npm test`, base `:memory:`), 13 tests couvrant auth,
  refus sans token, CRUD opérations, isolation entre utilisateurs, soldes, stats, budgets, export CSV.
  Client : Playwright (`npm run test:e2e`) lance son propre serveur sur une base `e2e.db` réinitialisée, scénario dépense en 1366×900 et 390×844.
- [x] **Tâche 1 — Virements entre comptes**
  Colonne `transfer_id` (migration idempotente), `POST/PUT/DELETE /api/transfers`, et `PUT/DELETE /api/transactions/:id`
  répercutés sur les deux lignes. Virements exclus des revenus/dépenses/répartition/tendance/budgets, inclus dans les soldes.
  UI : onglet « Virement » (De / Vers), ligne « A → B » avec icône ⇄ et montant neutre. Seed : 300 € / mois vers le Livret A. 8 tests API + 1 e2e.
- [x] **Tâche 2 — Opérations récurrentes**
  Table `recurring` + colonne `transactions.recurring_id` avec index unique `(recurring_id, date)` ; génération idempotente
  (`src/recurring.js`) au login et sur `/api/stats`, `last_generated` évite de recréer une occurrence supprimée. Routes `/api/recurring` (liste, création, pause/reprise, suppression).
  UI : case « Répéter chaque mois », section « Opérations récurrentes » dans Comptes, ligne « À venir ce mois-ci » sur l'Aperçu. Seed démo converti en récurrences. 11 tests API + 1 e2e.
- [x] **Tâche 3 — Import CSV bancaire**
  Parsing côté client (`src/csv.ts`) : encodage UTF-8 / Windows-1252, séparateur `;` ou `,`, dates JJ/MM/AAAA et AAAA-MM-JJ,
  montants FR/intl, colonnes montant ou débit + crédit, doublons (même compte/date/montant/libellé) ignorés par défaut,
  catégorie par nom de colonne ou par premier mot significatif. Modale « Importer » dans Opérations, aperçu 20 lignes.
  Serveur : `POST /api/transactions/bulk` (2000 lignes max, une transaction SQL, erreur « Ligne N : … »). Tests : 6 API, 7 unitaires du parseur, 1 e2e export → réimport → mêmes totaux.
- [x] **Tâche 4 — PWA installable**
  `vite-plugin-pwa` : manifest « Pécule » (#123b3a, standalone, fr), icônes 192/512/maskable + apple-touch-icon générées depuis
  `favicon.svg` par `npm run icons` (Chromium de Playwright), service worker qui précache le shell. Meta iOS ajoutées.
  Hors ligne : bandeau, session conservée (dernier utilisateur en cache), rechargement auto au retour du réseau. Projet Playwright `pwa` sur le build de prod servi par Express.
- [x] **Tâche 5 — Objectifs d'épargne**
  Table `goals` ; progression = solde du compte lié, sinon `saved` (versements manuels via `POST /api/goals/:id/contributions`).
  Calcul du montant mensuel (`src/goals.js`, arrondi au centime supérieur, cas atteint / dépassé / sans date). CRUD `/api/goals`.
  UI : section « Objectifs d'épargne » dans Comptes, panneau sur l'Aperçu (barre + « X € par mois pour y arriver à temps »). Seed : 2 objectifs. 7 tests API/unitaires + 1 e2e.
- [ ] Tâche 6 — Prêt pour la production

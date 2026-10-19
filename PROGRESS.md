# Avancement

## Résumé de fin de mission (2026-10-19, 2e feuille de route)

**Ce qui marche** : les 10 tâches (0 à 9) sont faites. Nouveautés de cette version :
- **Prévision** : « Tu peux dépenser X €/jour jusqu'au N », fin de mois estimée, détail du calcul. Les virements récurrents
  ont été ajoutés pour l'épargne prévue.
- **Abonnements** : page dédiée, détectés depuis les libellés bancaires, alerte de hausse de prix, « suivre comme récurrence ».
- **Patrimoine net** : placements valorisés, crédits avec tableau d'amortissement, vue sur 24 mois. Placements et crédits
  sont exclus des stats, des budgets et des prévisions.

Dernière vérification : **76 tests API** (vitest), `tsc -b` et build OK, **32 tests Playwright** (1366×900, 390×844, PWA
sur le build de prod, tests du parseur CSV), tous verts. Captures de chaque écran (27) dans `docs/screenshots/`.

**Ce qui est bloqué** : rien dans le périmètre. Docker est hors périmètre (tâche 9) : le `Dockerfile` et le
`docker-compose.yml` de la version précédente sont conservés mais **jamais construits** (Docker absent de la machine).

**3 prochaines évolutions recommandées** :
1. **Mensualités de crédit ventilées** : générer chaque échéance comme une opération récurrente, avec une part intérêts
   (dépense) et une part capital (virement vers le compte de dette). Le budget et le patrimoine racontent alors la même histoire.
2. **Découpage du bundle** (~700 Ko) : charger Recharts, la page Patrimoine et la modale d'import à la demande
   (`React.lazy`). Le premier affichage sur mobile en profitera.
3. **Sauvegarde / restauration** : export JSON complet (comptes, valorisations, crédits, règles, objectifs) et
   sauvegarde planifiée de `money.db`. C'est indispensable avant d'y mettre de vraies données.

## Feuille de route

- [x] **Tâche 0 — Socle : git + tests**
  Dépôt git + `.gitignore`. Serveur : vitest + supertest (`npm test`, base `:memory:`), 13 tests couvrant auth,
  refus sans token, CRUD opérations, isolation entre utilisateurs, soldes, stats, budgets, export CSV.
  Client : Playwright (`npm run test:e2e`) lance son propre serveur sur une base `e2e.db` réinitialisée, scénario dépense en 1366×900 et 390×844.
  Découpage (3e feuille de route) : `index.js` ne garde que la config ; helpers dans `src/lib.js`, virements dans `src/transfers.js`,
  un routeur par domaine dans `src/routes/` (chemins identiques), mois glissants dans `dates.js`. Test `structure.test.js` : aucune route perdue.
- [x] **Tâche 1 — Virements entre comptes**
  Colonne `transfer_id` (migration idempotente), `POST/PUT/DELETE /api/transfers`, et `PUT/DELETE /api/transactions/:id`
  répercutés sur les deux lignes. Virements exclus des revenus/dépenses/répartition/tendance/budgets, inclus dans les soldes.
  UI : onglet « Virement » (De / Vers), ligne « A → B » avec icône ⇄ et montant neutre. Seed : 300 € / mois vers le Livret A. 8 tests API + 1 e2e.
- [x] **Tâche 2 — Opérations récurrentes**
  Table `recurring` + colonne `transactions.recurring_id` avec index unique `(recurring_id, date)` ; génération idempotente
  (`src/recurring.js`) au login et sur `/api/stats`, `last_generated` évite de recréer une occurrence supprimée. Routes `/api/recurring` (liste, création, pause/reprise, suppression).
  UI : case « Répéter chaque mois », section « Opérations récurrentes » dans Comptes, ligne « À venir ce mois-ci » sur l'Aperçu. Seed démo converti en récurrences. 11 tests API + 1 e2e.
- [x] **Tâche 3 — Prévision de fin de mois et « reste à dépenser par jour »**
  Module pur `src/forecast.js` (date `now` injectée) + `GET /api/forecast` : à venir, rythme variable (médiane des 3 derniers
  mois complets, sinon rythme du mois), fin de mois estimée, reste à dépenser et par jour, dépassement ; mois passé → chiffres réels.
  Virements récurrents ajoutés (`recurring.to_account_id`) pour l'épargne prévue ; le seed les utilise. Aperçu : « Tu peux dépenser X €/jour jusqu'au N »,
  « Fin de mois estimée », modale « Comment c'est calculé ? ». 7 tests unitaires + 2 API + 1 e2e.
- [x] **Tâche 4 — Détection automatique des abonnements**
  Module pur `src/subscriptions.js` : normalisation des libellés bancaires, détection mensuelle (≥ 3 mois sur 6, intervalle
  médian 25–35 j) et annuelle (2 occurrences à 350–380 j), montant stable, hausse de prix > 5 %. `GET /api/subscriptions`,
  `POST /api/subscriptions/ignore` (table `subscription_ignores`) et `/track` (crée la récurrence dès la prochaine échéance).
  UI : page « Abonnements » (depuis l'Aperçu et Comptes, pas de 5e onglet), carte sur l'Aperçu avec alerte de hausse. Seed : Spotify, Basic Fit, assurance annuelle. 6 tests unitaires + 2 API + 1 e2e.
- [x] **Tâche 5 — Patrimoine net**
  Nouveaux types (placements : PEA, assurance-vie, CTO, crypto, immobilier, autre ; dettes : crédit immo, conso) groupés en
  liquidités / placements / dettes (`src/accounts.js`). Tables `valuations` et `loans` ; module pur `src/amortization.js`
  (mensualité constante, tableau, capital restant dû) ; `src/wealth.js` (valeur d'un compte à une date, série mensuelle).
  Placements et crédits exclus des revenus, dépenses, budgets, prévisions, récurrences « à venir » et du « Solde total ».
  Routes : valorisations, `PUT /api/accounts/:id/loan`, `GET /api/loans/:id/schedule`, `GET /api/networth?months=24`.
  UI : Comptes en 3 sections, fiche placement (versé, plus-value, valorisations), fiche crédit (tableau repliable), vue « Patrimoine »
  (graphique 24 mois, variations 1 et 12 mois, répartition, tableau des données). Seed : PEA, assurance-vie, appartement + crédit 200 000 €. 8 tests API/unitaires + 1 e2e.
- [x] **Tâche 6 — Import CSV bancaire**
  Parsing côté client (`src/csv.ts`) : encodage UTF-8 / Windows-1252, séparateur `;` ou `,`, dates JJ/MM/AAAA et AAAA-MM-JJ,
  montants FR/intl, colonnes montant ou débit + crédit, doublons (même compte/date/montant/libellé) ignorés par défaut,
  catégorie par nom de colonne ou par premier mot significatif. Modale « Importer » dans Opérations, aperçu 20 lignes.
  Serveur : `POST /api/transactions/bulk` (2000 lignes max, une transaction SQL, erreur « Ligne N : … »). Tests : 6 API, 7 unitaires du parseur, 1 e2e export → réimport → mêmes totaux.
- [x] **Tâche 7 — PWA installable**
  `vite-plugin-pwa` : manifest « Pécule » (#123b3a, standalone, fr), icônes 192/512/maskable + apple-touch-icon générées depuis
  `favicon.svg` par `npm run icons` (Chromium de Playwright), service worker qui précache le shell. Meta iOS ajoutées.
  Hors ligne : bandeau, session conservée (dernier utilisateur en cache), rechargement auto au retour du réseau. Projet Playwright `pwa` sur le build de prod servi par Express.
- [x] **Tâche 8 — Objectifs d'épargne**
  Table `goals` ; progression = solde du compte lié, sinon `saved` (versements manuels via `POST /api/goals/:id/contributions`).
  Calcul du montant mensuel (`src/goals.js`, arrondi au centime supérieur, cas atteint / dépassé / sans date). CRUD `/api/goals`.
  UI : section « Objectifs d'épargne » dans Comptes, panneau sur l'Aperçu (barre + « X € par mois pour y arriver à temps »). Seed : 2 objectifs. 7 tests API/unitaires + 1 e2e.
- [x] **Tâche 9 — Sécurité avant mise en ligne**
  Le serveur refuse de démarrer en production sans `JWT_SECRET` fort (message clair, testé en lançant le processus) ;
  `helmet` + CSP ; 6e tentative de connexion en une minute → 429 (testé) ; CORS limité à `CORS_ORIGIN` en prod ; README à jour.
  Docker est hors périmètre dans cette feuille de route : le `Dockerfile` et le `docker-compose.yml` écrits lors de la version
  précédente sont conservés tels quels, **non vérifiés** (Docker absent de la machine).

## Phase 2 — Améliorations

- [x] **Tâche 10 — Finitions UX et performance**
  Pages en `React.lazy`, Recharts chargé seulement par le graphique de l'Aperçu et la page Patrimoine : JS initial 87 kB gzip,
  vérifié après chaque build (`scripts/check-bundle.mjs`). Toast réutilisable + « Annuler » (réinsertion à l'identique, `POST /api/undo`)
  pour opérations, budgets, catégories. Parcours de premier lancement en 3 écrans, écran Réglages (thème, prénom, mot de passe, export),
  raccourcis N, /, ← →. axe : 0 violation grave sur 7 pages en clair et en sombre (contrastes de `--ink-2` et `--in` corrigés). 7 tests API + 9 e2e.
- [x] **Tâche 11 — Règles de catégorisation et tags**
  Module pur `src/rules.js` (correspondance, priorité, suggestion) + `src/categorize.js` : règles appliquées à la saisie sans
  catégorie, à l'import, aux récurrences et via « Appliquer » (jamais sur une catégorie choisie). Toast « Toujours classer… ? ».
  Tags (`tags`, `transaction_tags`) : saisie avec autocomplétion, filtre dans Opérations, page de tag (total, période,
  répartition). Écran Réglages › Règles. Seed : règle BASIC FIT et tag #week-end-lyon. 13 tests API/unitaires + 2 e2e.
- [x] **Tâche 12 — Comparaisons automatiques (insights)**
  Module pur `src/insights.js` : catégorie en hausse/baisse (> 30 % et > 40 € vs moyenne des 3 mois précédents, à date
  équivalente pour le mois en cours), dépense inhabituelle (> 3 × médiane de la catégorie sur 6 mois), budget en voie de
  dépassement (date estimée), bonne nouvelle ; rien sous 2 mois d'historique ; 3 max triés en euros. `GET /api/insights`,
  carte « À retenir » sur l'Aperçu, liens filtrés vers Opérations (`?month&category&q`). 15 tests API/unitaires + 1 e2e.
- [x] **Tâche 13 — Calendrier et vue annuelle**
  Opérations : bascule Liste / Calendrier (choix gardé) ; grille du mois, intensité séquentielle tirée de `--out` (quartiles),
  total par jour sur desktop, détail du jour en dessous (desktop) ou en panneau bas (mobile). Module pur `src/yearly.js` +
  `GET /api/stats/year` ; page « Vue annuelle » (depuis l'Aperçu) : 4 chiffres clés, tableau catégories × mois à colonne
  fixe, top 5. Test : totaux annuels = somme des 12 `/api/stats` (y compris par catégorie). 3 tests API + 2 e2e.
- [x] **Tâche 14 — Récap mensuel imprimable**
  Page `/recap/:month` : chiffres clés (revenus, dépenses, épargne, taux, patrimoine net et variation), constats, top 5 des
  catégories vs mois précédent, budgets tenus/dépassés, nouveaux abonnements et hausses, objectifs. Feuille `@media print`
  (A4, toujours en clair, sans navigation ni bouton, blocs insécables) ; « Télécharger en PDF » = `window.print()`.
  Bannière du 1er au 5 du mois sur l'Aperçu, lien « Voir le récap » pour un mois passé. 2 e2e (`page.pdf()` ≤ 2 pages, clair et sombre).
- [x] **Tâche 15 — Dépenses partagées**
  Tables `groups`, `group_members` (noms libres, l'utilisateur = `is_me`), `group_expenses` + parts, `group_settlements`.
  Module pur `src/settle.js` : parts égales / % / montants au centime près (plus forts restes), soldes (somme nulle),
  remboursements (≤ membres − 1). Payé par moi : opération pour ma part seulement. UI : section dans Comptes, page du groupe
  (« Sarah doit 42 € à Yass », « Marquer comme remboursé »). Seed : coloc à trois. 8 tests API/unitaires + 1 e2e.
- [x] **Tâche 16 — Fonctions IA (facultatives, avec l'API Claude)**
  `@anthropic-ai/sdk`, actif seulement avec `ANTHROPIC_API_KEY` (modèle `ANTHROPIC_MODEL`, défaut `claude-sonnet-5-5`).
  Ticket en photo : redimensionné à 1600 px côté client, structured outputs + revalidation Zod, formulaire prérempli jamais
  enregistré, image non stockée. Assistant : boucle tool use avec 6 outils en lecture seule qui réutilisent les fonctions des
  routes (extraites en `view()`), utilisateur imposé par la session, 20 questions/jour, consentement mémorisé.
  7 tests API (SDK simulé : sans clé, Zod, isolation, limite, modèle) + 2 e2e (sans bouton IA ; ticket avec API simulée).

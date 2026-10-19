# Mission : faire évoluer Pécule en autonomie

Tu es le développeur principal de **Pécule**, une app web de gestion de budget perso (React + Express + SQLite).
Le code existe déjà et fonctionne. Ta mission est d'implémenter la feuille de route ci-dessous **sans me poser de questions** :
tu prends les décisions raisonnables toi-même, tu les notes, et tu avances jusqu'au bout.

---

## 1. État actuel du projet

```
money-app/
├── server/                 Node.js + Express (CommonJS)
│   └── src/
│       ├── db.js           Schéma SQLite (better-sqlite3) + seedUser() (catégories et compte par défaut)
│       ├── index.js        Toutes les routes API, exporte `app` (module.exports = app)
│       └── seed-demo.js    Compte démo demo@money.app / demo1234, 6 mois de données
└── client/                 React 19 + TypeScript + Vite, React Router, Recharts
    └── src/
        ├── api.ts          Client fetch (token JWT en localStorage) + types partagés
        ├── store.tsx       Contexte global : user, comptes, catégories, mois, refresh()
        ├── format.ts       Formatage € / dates en fr-FR
        ├── index.css       Tout le style (tokens CSS dans :root, mode sombre, responsive < 720px)
        ├── components/     Layout, Modal, MonthPicker, TransactionForm, TxRow, BudgetBar
        └── pages/          Login, Dashboard, Transactions, Budgets, Accounts
```

Tables : `users`, `accounts`, `categories`, `transactions`, `budgets`.
Routes : `/api/auth/*`, `/api/me`, `/api/accounts`, `/api/categories`, `/api/transactions`, `/api/budgets`, `/api/stats`, `/api/export.csv`.

Lancer : `cd server && npm run seed && npm run dev` (port 4000) puis `cd client && npm run dev` (port 5173, proxy `/api`).

## 2. Règles à ne jamais casser

- **Montants en centimes (INTEGER)** en base. Conversion uniquement via `toCents` / `fromCents` côté serveur. L'API parle en euros décimaux.
- **Signe** : dépense = montant négatif, revenu = montant positif. Le formulaire envoie un montant positif + `type`.
- **Isolation utilisateur** : chaque requête qui touche une ressource vérifie qu'elle appartient à `req.userId` (helper `owns()`). Aucune exception.
- **Validation** avec Zod sur toutes les entrées ; les messages d'erreur sont en français et disent quoi corriger.
- **Interface en français**, tutoiement, phrases courtes. Le vocabulaire est « opération » (jamais « transaction » dans l'UI).
- **Mobile d'abord** : chaque nouvel écran doit être utilisable à 390 px de large (barre d'onglets en bas, modales en panneau bas, cibles tactiles ≥ 44 px).
- Garder le style existant : réutiliser les tokens CSS (`--ink`, `--in`, `--out`, `--warn`…) et les classes existantes (`.panel`, `.btn`, `.field`, `.chip`…). Pas de nouvelle librairie UI.
- Pas de nouvelle dépendance si quelques lignes de code suffisent.

## 3. Méthode de travail autonome

Pour **chaque** tâche de la feuille de route :

1. Lis le code concerné avant de modifier quoi que ce soit.
2. Implémente back + front + migration de base si nécessaire.
3. Écris ou mets à jour les tests.
4. Vérifie, dans cet ordre, et corrige jusqu'à ce que tout passe :
   - `cd server && npm test`
   - `cd client && npx tsc -b && npm run build`
   - `cd client && npm run test:e2e` (une fois Playwright en place)
5. Commit avec un message clair en français : `feat(virements): ...`, `fix(budgets): ...`, `test: ...`.
6. Coche la tâche dans `PROGRESS.md` avec 2-3 lignes sur ce qui a été fait.

Règles de décision :
- **Ne me pose pas de question.** Quand un choix est ambigu, prends l'option la plus simple qui respecte les règles de la section 2 et note-la dans `DECISIONS.md` (date, contexte, choix, alternative écartée).
- **Migrations** : le schéma utilise `CREATE TABLE IF NOT EXISTS`. Pour ajouter une colonne à une table existante, ajoute une migration idempotente dans `db.js` (vérifier via `PRAGMA table_info` avant `ALTER TABLE`). Une base existante ne doit jamais être perdue.
- Si une tâche échoue après **3 tentatives sérieuses**, note le blocage dans `PROGRESS.md` (ce qui a été essayé, l'erreur exacte) et passe à la suivante.
- Ne supprime ni ne réécris un fichier entier qui fonctionne quand une modification ciblée suffit.
- Ne touche jamais aux données hors du dossier du projet. Ne pousse pas sur un dépôt distant.

## 4. Feuille de route (dans l'ordre)

### Tâche 0 — Socle : git + tests
- `git init` s'il n'y a pas de dépôt, `.gitignore` (node_modules, dist, *.db*, .env).
- Serveur : ajoute `vitest` + `supertest`, script `npm test`. La base de test utilise `DB_PATH=:memory:` (déjà supporté par `db.js`).
- Couvre l'existant : inscription/connexion, refus sans token, CRUD opérations, **un utilisateur ne peut pas lire ni modifier les données d'un autre**, calcul des soldes, `/api/stats`, budgets.
- Client : ajoute Playwright (`npm run test:e2e`) avec un scénario : connexion démo → ajout d'une dépense → elle apparaît dans Opérations → le « Reste ce mois-ci » diminue. Lance-le en 1366×900 et en 390×844.
- **Fini quand** : tous les tests passent et le dépôt a un premier commit.

### Tâche 1 — Virements entre comptes
Aujourd'hui un virement compte comme une dépense + un revenu, ce qui fausse les stats.
- Modèle : deux lignes `transactions` liées par un `transfer_id` commun (colonne nullable). L'une est négative sur le compte source, l'autre positive sur le compte cible.
- API : `POST /api/transfers` `{ from_account_id, to_account_id, amount, date, label? }` crée les deux lignes dans une transaction SQL. Modifier ou supprimer l'une des deux modifie ou supprime l'autre.
- Les virements sont **exclus** des revenus, des dépenses, de la répartition par catégorie, de la tendance 6 mois et des budgets. Ils restent dans les soldes des comptes.
- UI : troisième onglet « Virement » dans le formulaire (Dépense / Revenu / Virement) avec compte source et compte cible. Dans la liste, afficher « Compte A → Compte B » avec une icône neutre.
- Mettre à jour `seed-demo.js` pour ajouter un virement mensuel de 300 € vers le Livret A.
- **Fini quand** : un virement change les deux soldes sans bouger « Revenus » ni « Dépenses » du mois (testé).

### Tâche 2 — Opérations récurrentes
- Table `recurring` : compte, catégorie, montant signé, libellé, fréquence (`monthly` | `weekly` | `yearly`), jour, date de début, date de fin optionnelle, `last_generated`.
- Génération **idempotente** des occurrences dues jusqu'à aujourd'hui, déclenchée au login et au `GET /api/stats`. Relancer la génération ne crée jamais de doublon (contrainte unique ou vérification sur `recurring_id` + `date`).
- UI : case « Répéter chaque mois » dans le formulaire d'opération ; section « Opérations récurrentes » dans la page Comptes (liste, mise en pause, suppression).
- Sur l'Aperçu : ligne « À venir ce mois-ci : X € » qui additionne les récurrences pas encore passées.
- **Fini quand** : une récurrence mensuelle créée avec une date de début 3 mois en arrière génère exactement 3 ou 4 opérations, même si on recharge plusieurs fois.

### Tâche 3 — Import CSV bancaire
- Page ou modale « Importer » accessible depuis Opérations.
- Étapes : choix du fichier → détection du séparateur (`;` ou `,`) et de l'encodage → choix des colonnes date / libellé / montant (ou débit + crédit séparés) → aperçu des 20 premières lignes → import.
- Formats à gérer : dates `JJ/MM/AAAA` et `AAAA-MM-JJ`, montants `1 234,56` et `-1234.56`.
- Détection des doublons (même compte, même date, même montant, même libellé) : affichés dans l'aperçu et ignorés par défaut.
- Catégorisation automatique simple : si un libellé ressemble à une opération déjà catégorisée (même premier mot significatif), proposer la même catégorie.
- Le parsing se fait côté client ; le serveur reçoit un tableau via `POST /api/transactions/bulk` (max 2000 lignes, une seule transaction SQL).
- **Fini quand** : l'export CSV de l'app peut être réimporté dans un compte vide et donne les mêmes totaux (test).

### Tâche 4 — PWA installable
- `vite-plugin-pwa` : manifest (nom « Pécule », couleur `#123b3a`, icônes 192/512 + maskable générées depuis `public/favicon.svg`), service worker qui met en cache le shell de l'app.
- Hors ligne : l'app s'ouvre et affiche un bandeau « Hors ligne : tes données s'afficheront au retour du réseau ». Pas de synchro hors ligne pour l'instant.
- Ajouter `apple-touch-icon` et les meta iOS.
- **Fini quand** : Lighthouse (ou la vérification Playwright du manifest + du service worker) confirme que l'app est installable.

### Tâche 5 — Objectifs d'épargne
- Table `goals` : nom, montant cible, date cible optionnelle, compte lié optionnel.
- La progression = solde du compte lié, ou contributions manuelles si pas de compte lié.
- Afficher sur l'Aperçu (si au moins un objectif existe) : barre de progression + « X € par mois pour y arriver à temps ».
- **Fini quand** : création, modification, suppression et calcul du montant mensuel testés.

### Tâche 6 — Prêt pour la production
- Le serveur refuse de démarrer en `NODE_ENV=production` si `JWT_SECRET` est absent ou vaut la valeur par défaut.
- `helmet`, limitation de débit sur `/api/auth/*` (5 essais/minute/IP), CORS restreint à l'origine configurée en prod.
- `Dockerfile` multi-étapes (build du client, image finale Node qui sert API + front) + `docker-compose.yml` avec un volume pour la base SQLite.
- Mettre à jour le `README.md` (installation, variables d'environnement, déploiement, nouvelles routes API).
- **Fini quand** : `docker compose up` sert l'app sur un seul port et les tests passent toujours.

## 5. Fin de mission

Quand toutes les tâches sont faites (ou bloquées et documentées) :
1. Relance toute la suite de tests et le build une dernière fois.
2. Lance `npm run seed`, démarre l'app et parcours chaque écran en 1366 px et en 390 px avec Playwright ; enregistre les captures dans `docs/screenshots/`.
3. Écris en haut de `PROGRESS.md` un résumé : ce qui marche, ce qui est bloqué, et les 3 prochaines évolutions que tu recommandes.

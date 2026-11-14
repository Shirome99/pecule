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

**Reprise** : la mission est longue et peut s'étaler sur plusieurs sessions. Au début de chaque session, lis `PROGRESS.md` et `DECISIONS.md`, vérifie que les tests passent, puis reprends à la première tâche non cochée. Si `PROGRESS.md` n'existe pas, crée-le avec la liste des tâches 0 à 16 à cocher.

Règles de décision :
- **Ne me pose pas de question.** Quand un choix est ambigu, prends l'option la plus simple qui respecte les règles de la section 2 et note-la dans `DECISIONS.md` (date, contexte, choix, alternative écartée).
- **Migrations** : le schéma utilise `CREATE TABLE IF NOT EXISTS`. Pour ajouter une colonne à une table existante, ajoute une migration idempotente dans `db.js` (vérifier via `PRAGMA table_info` avant `ALTER TABLE`). Une base existante ne doit jamais être perdue.
- Si une tâche échoue après **3 tentatives sérieuses**, note le blocage dans `PROGRESS.md` (ce qui a été essayé, l'erreur exacte) et passe à la suivante.
- Ne supprime ni ne réécris un fichier entier qui fonctionne quand une modification ciblée suffit.
- Ne touche jamais aux données hors du dossier du projet. Ne pousse pas sur un dépôt distant.

## 4. Feuille de route (dans l'ordre)

### Tâche 0 — Socle : git, structure et tests
- `git init` s'il n'y a pas de dépôt, `.gitignore` (node_modules, dist, *.db*, .env).
- `server/src/index.js` va beaucoup grossir : découpe-le **avant** d'ajouter des fonctionnalités. Un fichier par domaine dans `server/src/routes/` (auth, accounts, categories, transactions, budgets, stats), les helpers partagés (`auth`, `owns`, `wrap`, `toCents`, `fromCents`) dans `server/src/lib.js`, et la logique de calcul dans des modules purs sans accès à la base. Les routes doivent rester identiques, sans changement de comportement.
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

### Tâche 3 — Prévision de fin de mois et « reste à dépenser par jour »
But : répondre en un coup d'œil à « combien je peux encore dépenser ce mois-ci sans finir dans le rouge ? ».
- Toute la logique de calcul va dans un module pur `server/src/forecast.js`, sans accès à la base, qui reçoit les données et une date `now`. Les tests fixent `now`, sans dépendre de la date réelle.
- Endpoint `GET /api/forecast?month=YYYY-MM`. Il ne fait une prévision que pour le mois en cours ; pour un mois passé, il renvoie les chiffres réels avec `is_past: true`.
- Calculs (virements exclus partout) :
  - `upcoming_income` / `upcoming_expenses` : occurrences récurrentes du mois dont la date est après aujourd'hui et pas encore générées.
  - `variable_daily_rate` : médiane, sur les 3 derniers mois complets, des dépenses **non récurrentes** divisées par le nombre de jours du mois. Avec moins d'un mois d'historique, utiliser le rythme du mois en cours.
  - `projected_end_balance` = solde actuel des comptes de type courant / espèces / carte + `upcoming_income` − `upcoming_expenses` − `variable_daily_rate` × jours restants.
  - `safe_to_spend` = revenus du mois (réalisés + à venir) − dépenses du mois (réalisées + récurrentes à venir) − épargne prévue (somme des virements récurrents vers les comptes épargne).
  - `safe_per_day` = `safe_to_spend` / jours restants, aujourd'hui inclus. Si c'est négatif, renvoyer le dépassement.
- UI Aperçu, mois en cours uniquement : sous le grand chiffre, une ligne « Tu peux dépenser **28 €/jour** jusqu'au 31 » (ou « Tu dépasses de 85 € ce mois-ci » en rouge), et « Fin de mois estimée : +420 € ». Un lien « Comment c'est calculé ? » ouvre une modale qui détaille chaque terme en euros.
- **Fini quand** : tests unitaires de `forecast.js` sur au moins 5 cas (début de mois, dernier jour, aucun historique, dépassement, avec récurrences et virements d'épargne) + test API.

### Tâche 4 — Détection automatique des abonnements
But : voir tous ses abonnements, ce qu'ils coûtent à l'année, et être prévenu quand un prix augmente.
- Module pur `server/src/subscriptions.js` qui reçoit une liste d'opérations et renvoie les abonnements détectés :
  - Normalisation du libellé : majuscules, suppression des accents, des chiffres, des dates, des références de carte (`CB`, `PRLV`, `SEPA`, numéros) et des espaces en trop.
  - Est un abonnement : une dépense (hors virements) dont le libellé normalisé apparaît dans **au moins 3 mois distincts sur les 6 derniers**, avec un intervalle de 25 à 35 jours (mensuel) ou 350 à 380 jours (annuel, 2 occurrences suffisent), et un montant stable (écart ≤ 15 % ou ≤ 2 € par rapport à la médiane).
  - Pour chaque abonnement : libellé affiché, catégorie la plus fréquente, montant actuel, fréquence, coût annuel, dernière date, prochaine date attendue, et `price_change` si le dernier montant diffère de plus de 5 % du précédent (ancien montant, nouveau montant, date).
- Endpoint `GET /api/subscriptions`. Exclure ce qui est déjà une opération récurrente (tâche 2) et ce que l'utilisateur a ignoré (table `subscription_ignores` : user_id + libellé normalisé).
- Actions : `POST /api/subscriptions/ignore` et « Suivre comme récurrence », qui crée une opération récurrente à partir de l'abonnement détecté.
- UI :
  - Page « Abonnements », accessible depuis l'Aperçu et la page Comptes (ne pas ajouter de 5e onglet sur mobile). Total mensuel et annuel en haut, liste triée par coût annuel, badge « Prix en hausse » en `--warn` avec « 9,99 € → 11,99 € depuis le 5 sept. ».
  - Sur l'Aperçu : une carte compacte « Abonnements : 64 €/mois, 768 €/an », plus une alerte si un prix a augmenté dans les 60 derniers jours.
- `seed-demo.js` : ajouter Spotify (10,99 € puis 12,99 € les 2 derniers mois), une salle de sport mensuelle et une assurance annuelle, sous des libellés bancaires réalistes (`PRLV SEPA SPOTIFY P1A2B3`, `CB BASIC FIT 12/09`).
- **Fini quand** : tests unitaires couvrant normalisation, détection mensuelle et annuelle, faux positifs (des courses fréquentes chez Carrefour à montant variable ne sont **pas** un abonnement), hausse de prix, et exclusion des ignorés.

### Tâche 5 — Patrimoine net
But : suivre tout ce que je possède moins ce que je dois, et son évolution dans le temps.
- Nouveaux types de compte, en gardant les existants :
  - Placements : `pea`, `assurance_vie`, `cto`, `crypto`, `immobilier`, `autre_placement`.
  - Dettes : `credit_immo`, `credit_conso`.
  - Grouper les types en trois familles : **liquidités** (courant, épargne, espèces, carte), **placements**, **dettes**.
- **Placements** : leur valeur ne vient pas des opérations mais de **valorisations** saisies à la main, dans une table `valuations` (account_id, date, valeur en centimes ; unique par compte et par date). La valeur à une date donnée est la dernière valorisation connue avant cette date. Les versements vers un placement passent par un virement (tâche 1) ; afficher pour chaque placement le total versé et la plus-value latente (valeur − total versé), en euros et en %.
- **Crédits** : table `loans` (account_id, capital emprunté, taux annuel, durée en mois, date de 1re échéance, assurance mensuelle optionnelle). Module pur `server/src/amortization.js` qui calcule le tableau d'amortissement (mensualité constante) et le capital restant dû à une date. La dette vaut le capital restant dû, compté en négatif.
- Les comptes de placement et de crédit sont **exclus** des revenus, dépenses, budgets, prévisions et du « Solde total » de l'Aperçu, qui reste celui des liquidités.
- Endpoint `GET /api/networth?months=24` : pour chaque fin de mois, liquidités (solde reconstitué à partir des opérations), placements (dernière valorisation), dettes (capital restant dû) et patrimoine net. Endpoint `GET /api/loans/:id/schedule` pour le tableau d'amortissement.
- UI :
  - Page Comptes réorganisée en trois sections, Liquidités / Placements / Dettes, chacune avec son total.
  - Fiche placement : historique des valorisations + bouton « Mettre à jour la valeur ».
  - Fiche crédit : capital restant dû, mensualité, date de fin, coût total des intérêts, et le tableau d'amortissement repliable.
  - Nouvelle vue « Patrimoine », accessible depuis l'Aperçu : patrimoine net actuel, variation sur 1 mois et sur 12 mois, courbe sur 24 mois (aire empilée liquidités + placements, dettes en dessous de zéro, ligne du patrimoine net), et répartition par famille.
- `seed-demo.js` : un PEA avec des versements mensuels et des valorisations mensuelles qui varient, une assurance-vie, et un crédit immo de 200 000 € sur 20 ans à 3,5 % commencé il y a 3 ans.
- **Fini quand** : `amortization.js` testé contre un cas connu (200 000 € sur 240 mois à 3,5 % donne une mensualité de 1 159,92 €, avec une tolérance de 0,01 €), dernière échéance qui ramène le capital à 0 ; test que des placements et des crédits ne modifient ni les stats mensuelles ni les budgets ; test de `/api/networth`.

### Tâche 6 — Import CSV bancaire
- Page ou modale « Importer » accessible depuis Opérations.
- Étapes : choix du fichier → détection du séparateur (`;` ou `,`) et de l'encodage → choix des colonnes date / libellé / montant (ou débit + crédit séparés) → aperçu des 20 premières lignes → import.
- Formats à gérer : dates `JJ/MM/AAAA` et `AAAA-MM-JJ`, montants `1 234,56` et `-1234.56`.
- Détection des doublons (même compte, même date, même montant, même libellé) : affichés dans l'aperçu et ignorés par défaut.
- Catégorisation automatique simple : si un libellé ressemble à une opération déjà catégorisée (même premier mot significatif), proposer la même catégorie.
- Le parsing se fait côté client ; le serveur reçoit un tableau via `POST /api/transactions/bulk` (max 2000 lignes, une seule transaction SQL).
- **Fini quand** : l'export CSV de l'app peut être réimporté dans un compte vide et donne les mêmes totaux (test).

### Tâche 7 — PWA installable
- `vite-plugin-pwa` : manifest (nom « Pécule », couleur `#123b3a`, icônes 192/512 + maskable générées depuis `public/favicon.svg`), service worker qui met en cache le shell de l'app.
- Hors ligne : l'app s'ouvre et affiche un bandeau « Hors ligne : tes données s'afficheront au retour du réseau ». Pas de synchro hors ligne pour l'instant.
- Ajouter `apple-touch-icon` et les meta iOS.
- **Fini quand** : Lighthouse (ou la vérification Playwright du manifest + du service worker) confirme que l'app est installable.

### Tâche 8 — Objectifs d'épargne
- Table `goals` : nom, montant cible, date cible optionnelle, compte lié optionnel.
- La progression = solde du compte lié, ou contributions manuelles si pas de compte lié.
- Afficher sur l'Aperçu (si au moins un objectif existe) : barre de progression + « X € par mois pour y arriver à temps ».
- **Fini quand** : création, modification, suppression et calcul du montant mensuel testés.

### Tâche 9 — Sécurité avant mise en ligne
- Le serveur refuse de démarrer en `NODE_ENV=production` si `JWT_SECRET` est absent ou vaut la valeur par défaut.
- `helmet`, limitation de débit sur `/api/auth/*` (5 essais/minute/IP), CORS restreint à l'origine configurée en prod.
- Mettre à jour le `README.md` (installation, variables d'environnement, nouvelles routes API).
- Pas de Docker ni de déploiement pour l'instant : ce sera traité plus tard.
- **Fini quand** : le démarrage en production sans `JWT_SECRET` échoue avec un message clair, la 6e tentative de connexion en une minute renvoie 429, et les tests passent toujours.

---

## Phase 2 — Améliorations (à commencer seulement quand les tâches 0 à 9 sont faites ou documentées comme bloquées)

### Tâche 10 — Finitions UX et performance
- **Code-splitting** : chaque page est chargée avec `React.lazy`, et Recharts n'est chargé que sur les pages qui ont un graphique. Objectif : moins de 250 kB gzip pour le JS initial, mesuré par le build (aujourd'hui environ 190 kB gzip dans un seul fichier de 644 kB).
- **Annuler** : après une suppression d'opération, de budget ou de catégorie, un toast « Opération supprimée. Annuler » reste 6 secondes. Implémentation : suppression côté serveur différée, ou réinsertion à l'identique. Choisis et note ton choix dans `DECISIONS.md`. Le composant Toast est réutilisable (succès, erreur, action).
- **Premier lancement** : pour un compte neuf sans opération, un parcours en 3 écrans remplace l'Aperçu vide : solde actuel du compte courant, salaire mensuel (qui crée une récurrence), un premier budget à choisir parmi les 3 catégories les plus courantes. Chaque écran a un bouton « Passer ».
- **Thème** : choix Clair / Sombre / Système dans un nouvel écran « Réglages » (accessible depuis Comptes sur mobile et depuis la sidebar sur desktop), avec le choix gardé dans `localStorage`. Le même écran permet de modifier son prénom, son mot de passe et de télécharger l'export CSV.
- **Raccourcis desktop** : `N` ouvre une nouvelle opération, `/` place le curseur dans la recherche, `←` / `→` changent de mois. Ils sont désactivés quand le curseur est dans un champ.
- **Accessibilité** : ajouter `@axe-core/playwright` aux tests e2e ; aucune violation `serious` ou `critical` sur les pages principales, en clair et en sombre.
- **Fini quand** : la taille du bundle respecte l'objectif, l'annulation est testée en e2e, le parcours de premier lancement est testé en e2e, et le contrôle axe passe.

### Tâche 11 — Règles de catégorisation et tags
- Table `rules` : user_id, motif (texte contenu dans le libellé normalisé, avec la même normalisation qu'à la tâche 4), catégorie, priorité. Les règles s'appliquent à la création d'une opération sans catégorie, à l'import CSV et aux récurrences.
- **Suggestion de règle** : quand l'utilisateur donne la même catégorie à 2 opérations dont le libellé normalisé commence pareil, afficher le toast « Toujours classer "BASIC FIT" en Loisirs ? » avec un bouton Créer la règle.
- Écran « Règles » dans Réglages : liste, modification, suppression, et bouton « Appliquer aux opérations sans catégorie » qui indique combien d'opérations ont été classées.
- **Tags** : table `tags` + table de liaison `transaction_tags`. Champ de saisie dans le formulaire d'opération (autocomplétion, `#` facultatif), filtre par tag dans Opérations, et page de tag qui affiche le total, la période couverte et la répartition par catégorie (exemple : « #vacances-maroc : 1 840 € du 2 au 16 août »).
- **Fini quand** : tests de priorité entre règles, de non-écrasement d'une catégorie choisie à la main, et de calcul du total par tag.

### Tâche 12 — Comparaisons automatiques (insights)
- Module pur `server/src/insights.js` qui renvoie au plus 3 constats pour un mois donné, triés par importance en euros :
  - Catégorie en hausse ou en baisse : écart de plus de 30 % **et** de plus de 40 € par rapport à la moyenne des 3 mois précédents.
  - Dépense inhabituelle : une opération supérieure à 3 fois la médiane de sa catégorie sur 6 mois.
  - Budget en voie de dépassement : au rythme actuel, le budget sera dépassé avant la fin du mois (indiquer la date estimée).
  - Bonne nouvelle : mois en cours le moins dépensier des 6 derniers mois, à date équivalente.
- Pas de constat quand l'historique est inférieur à 2 mois. Chaque constat est une phrase courte avec les chiffres, et un lien vers les opérations filtrées.
- Endpoint `GET /api/insights?month=` ; une carte sur l'Aperçu, masquée s'il n'y a rien à dire.
- **Fini quand** : tests unitaires pour chaque type de constat, plus un test de non-déclenchement sous les seuils.

### Tâche 13 — Calendrier et vue annuelle
- **Calendrier du mois** (dans Opérations, bascule Liste / Calendrier) : grille des jours, intensité de couleur selon les dépenses du jour (échelle séquentielle construite à partir de `--out`), total sous chaque jour, et un clic qui affiche les opérations du jour. Sur mobile, cases compactes sans total, et le détail s'ouvre dans un panneau en bas.
- **Vue annuelle** (nouvelle page accessible depuis l'Aperçu) : sélecteur d'année ; revenus, dépenses et épargne de l'année ; taux d'épargne ; tableau catégories × mois avec les totaux, défilant horizontalement sur mobile avec la colonne catégorie fixe ; et les 5 plus grosses dépenses de l'année.
- Endpoint `GET /api/stats/year?year=`.
- **Fini quand** : les totaux de la vue annuelle sont égaux à la somme des 12 `/api/stats` mensuels (test).

### Tâche 14 — Récap mensuel imprimable
- Page `/recap/:month` : patrimoine net et sa variation, revenus et dépenses, taux d'épargne, top 5 des catégories avec leur évolution, budgets tenus ou dépassés, nouveaux abonnements et hausses de prix, avancement des objectifs, et constats du mois (tâche 12).
- Feuille de style `@media print` propre (pas de navigation, pas de bouton, sauts de page maîtrisés) pour que « Imprimer → Enregistrer en PDF » donne un document A4 lisible. Bouton « Télécharger en PDF » qui appelle `window.print()`. Pas de dépendance PDF côté serveur.
- Sur l'Aperçu, du 1er au 5 du mois, une bannière « Ton récap de septembre est prêt ».
- **Fini quand** : test e2e qui génère le PDF avec `page.pdf()` de Playwright et vérifie qu'il fait au plus 2 pages.

### Tâche 15 — Dépenses partagées
- Groupes (coloc, couple, voyage) : table `groups` et table `group_members`. Les membres sont des **noms libres**, sans compte utilisateur : l'utilisateur est le seul à se connecter.
- Dépense de groupe : qui a payé, montant, répartition (parts égales, montants personnalisés ou pourcentages). Si c'est l'utilisateur qui a payé, une opération normale est aussi créée sur son compte pour **sa part seulement**, et le reste est une créance.
- Module pur `server/src/settle.js` : soldes de chaque membre et **liste minimale de remboursements** (« Sarah doit 42 € à Yass »). Bouton « Marquer comme remboursé » qui enregistre le remboursement.
- **Fini quand** : tests de `settle.js` (somme des soldes = 0 au centime près, répartition inégale, arrondis répartis sans perte de centime, nombre de remboursements ≤ nombre de membres − 1).

### Tâche 16 — Fonctions IA (facultatives, avec l'API Claude)
Ces fonctions ne s'activent que si `ANTHROPIC_API_KEY` est défini dans l'environnement du serveur. Sans clé, aucun bouton IA n'est affiché et rien ne plante. Le modèle se configure avec `ANTHROPIC_MODEL`, par défaut `claude-sonnet-5-5`. Utilise le SDK officiel `@anthropic-ai/sdk` ; la clé ne va **jamais** au client.
- **Ticket en photo** : dans le formulaire d'opération, bouton « Scanner un ticket » (sur mobile, il ouvre l'appareil photo avec `<input type="file" accept="image/*" capture="environment">`). L'image est redimensionnée côté client (1600 px max), envoyée à `POST /api/ai/receipt`, et le modèle renvoie du JSON validé par Zod : montant, date, marchand, catégorie suggérée parmi celles de l'utilisateur. Le formulaire est **prérempli, jamais enregistré automatiquement**. L'image n'est pas stockée.
- **Assistant** : panneau « Poser une question » (« combien j'ai dépensé en resto depuis janvier ? », « je peux me permettre 1 200 € de vacances en décembre ? »). Utilise le *tool use* : le modèle n'écrit jamais de SQL et n'accède qu'à des outils en **lecture seule**, déjà limités à `req.userId` (`get_stats`, `search_transactions`, `get_budgets`, `get_forecast`, `get_networth`, `get_subscriptions`), qui réutilisent les modules existants. Les réponses citent les chiffres utilisés. Limite : 20 questions par jour et par utilisateur.
- Avant la première utilisation, une mention claire : « Tes données financières concernées sont envoyées à Anthropic pour générer la réponse. » L'utilisateur doit l'accepter, et ce choix est mémorisé.
- Tests : mocker le SDK ; vérifier la validation Zod d'une réponse mal formée, l'isolation utilisateur des outils, et l'absence des fonctions IA sans clé.
- **Fini quand** : tous les tests ci-dessus passent sans clé API réelle.

### Pas maintenant
Ne pas faire, même s'il reste du temps : Docker et déploiement, synchronisation bancaire automatique (DSP2), multi-devises, application native.

## 5. Fin de mission

Quand toutes les tâches sont faites (ou bloquées et documentées), ou si tu dois t'arrêter avant, fais toujours ceci pour que le travail puisse reprendre proprement :
1. Relance toute la suite de tests et le build une dernière fois.
2. Lance `npm run seed`, démarre l'app et parcours chaque écran en 1366 px et en 390 px avec Playwright ; enregistre les captures dans `docs/screenshots/`.
3. Écris en haut de `PROGRESS.md` un résumé : ce qui marche, ce qui est bloqué, et les 3 prochaines évolutions que tu recommandes.

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

## 2026-10-19 — Affichage des virements dans la liste
**Contexte** : un virement = deux lignes ; les deux apparaîtraient dans « Opérations ».
**Choix** : sans filtre de compte, l'API ne renvoie que la ligne de sortie (affichée « A → B », montant neutre) ;
avec un filtre de compte, elle renvoie la ligne de ce compte et elle compte alors dans Entrées/Sorties de ce compte.
`transfer_id` est un UUID texte. Une opération existante ne peut pas changer de nature (virement ↔ dépense/revenu).
**Écarté** : afficher les deux lignes, ou créer une table `transfers` séparée (plus de jointures partout).

## 2026-10-19 — Suppression d'un compte qui a des virements
**Choix** : la ligne restante sur l'autre compte devient une opération simple (`transfer_id = NULL`) pour que le solde de
ce compte ne change pas.
**Écarté** : supprimer aussi la ligne d'en face (modifierait silencieusement le solde d'un compte conservé).

## 2026-10-19 — Opérations récurrentes
**Choix** :
- Fréquences `monthly` / `weekly` / `yearly` ; `day` = jour du mois (ramené au dernier jour si besoin, ex. 31 → 28 février)
  ou jour de la semaine (1 = lundi … 7 = dimanche). En annuel, le mois est celui de la date de début.
- Idempotence double : index unique partiel `(recurring_id, date)` + `INSERT OR IGNORE`, et `last_generated` pour ne
  jamais recréer une occurrence que l'utilisateur a supprimée.
- Mise en pause : à la reprise, la période de pause n'est pas rattrapée (`last_generated` = aujourd'hui).
- Supprimer une récurrence garde les opérations déjà générées. Modifier la date d'une occurrence la détache de sa règle.
- « À venir ce mois-ci » = somme **signée** (revenus − dépenses) des occurrences futures du mois affiché.
- L'UI ne propose que « Répéter chaque mois » (comme demandé) ; l'API accepte déjà les autres fréquences.
- La date du jour est celle du serveur (heure locale).
**Écarté** : un cron côté serveur (inutile pour une app perso : la génération au login et à l'ouverture de l'Aperçu suffit).

## 2026-10-19 — Validation des dates
**Choix** : toutes les dates d'entrée passent par `isoDate()` qui refuse les dates impossibles (`2026-02-30`), et plus
seulement le format.

## 2026-10-19 — Import CSV
**Choix** :
- Détection des doublons côté client : on charge les opérations du compte cible sur la période du fichier
  (nouveaux filtres `from` / `to` de `GET /api/transactions`). Libellé comparé sans tenir compte de la casse ni des espaces.
  Deux lignes identiques *dans le fichier* ne sont pas des doublons (deux cafés le même jour, c'est possible).
- Les virements de l'app sont exportés avec la catégorie « Virement » ; à l'import, ces lignes sont ignorées (elles
  s'annulent deux à deux dans un seul compte). C'est ce qui permet au réimport de redonner exactement les mêmes totaux.
- La catégorie proposée n'est modifiable qu'après import (dans la liste) : l'aperçu ne montre que 20 lignes, une
  correction ligne à ligne n'aurait concerné qu'une partie du fichier.
- Plus de 2000 lignes : refus avec un message clair (pas de découpage automatique en plusieurs transactions SQL).
- Les tests du parseur tournent avec Playwright (sans navigateur), pour ne pas ajouter vitest au client.
- `docs/exemple-releve.csv` : relevé fictif en Windows-1252 avec colonnes débit / crédit, pour essayer l'import.
**Écarté** : parser côté serveur (demandé côté client), import OFX (hors périmètre).

## 2026-10-19 — PWA
**Choix** :
- Icônes PNG générées par un script (`client/scripts/generate-icons.mjs`) qui réutilise le Chromium de Playwright, et
  versionnées dans `public/` : le build ne dépend pas de ce script.
- Hors ligne, la session n'est plus effacée : seul un vrai 401 déconnecte ; une erreur réseau garde le dernier utilisateur
  connu (`localStorage`). L'API n'est jamais mise en cache par le service worker (pas de données périmées affichées).
- Vérification : `Page.getInstallabilityErrors` (CDP) renvoie toujours `[]` en headless, même sans manifest (contre-test
  fait) ; le test vérifie donc explicitement les critères d'installation de Chrome (manifest complet, icônes 192/512 PNG
  servies, service worker actif qui contrôle la page et gère `fetch`). Lighthouse non utilisé (nouvelle dépendance lourde).
- `npm run test:e2e` lance d'abord `vite build` : le projet `pwa` teste le vrai build servi par Express.
**Écarté** : `@vite-pwa/assets-generator` (dépend de sharp, binaire natif) ; mise en cache des réponses API.

## 2026-10-19 — Objectifs d'épargne
**Choix** :
- Versements manuels stockés comme un total (`goals.saved`) modifié par `POST /api/goals/:id/contributions` (montant signé,
  jamais en dessous de 0). Un objectif lié à un compte refuse les versements manuels (sa progression = le solde du compte).
- Mois restants = différence de mois calendaires entre aujourd'hui et la date cible (au moins 1 tant que la date n'est
  pas passée). Montant mensuel = reste / mois restants, arrondi au centime supérieur. Date dépassée : on affiche le reste.
- Supprimer le compte lié détache l'objectif (`ON DELETE SET NULL`), il repasse en versements manuels.
**Écarté** : une table d'historique des versements (inutile pour le calcul demandé).

## 2026-10-19 — Production
**Choix** :
- Limitation de débit écrite à la main (`server/src/security.js`, ~20 lignes, fenêtre fixe en mémoire par IP) : suffisant
  pour une instance unique. Elle compte toutes les requêtes `/api/auth/*`. Réglable via `AUTH_RATE_LIMIT` (les tests la relèvent).
- `JWT_SECRET` refusé en production s'il est absent, égal à la valeur par défaut, ou de moins de 32 caractères.
- CORS en production : fermé par défaut (le front est servi par le même serveur), ouvert à `CORS_ORIGIN` si défini.
- CSP helmet : Google Fonts autorisé ; `upgrade-insecure-requests` désactivé (le HTTPS est l'affaire du reverse proxy,
  et la directive casserait un accès en HTTP simple sur le réseau local).
- Image `node:24-alpine`, utilisateur `node`, base dans le volume `/data`, `HEALTHCHECK` sur `/api/health`.
- Docker indisponible sur la machine de dev : l'image n'a pas été construite ; vérification par simulation locale (voir PROGRESS).
**Écarté** : `express-rate-limit` (dépendance pour quelques lignes) ; Redis (une seule instance).

## 2026-10-19 — Nouvelle feuille de route
**Contexte** : la feuille de route insère trois tâches (3 prévision, 4 abonnements, 5 patrimoine) ; import, PWA,
objectifs et sécurité deviennent les tâches 6 à 9 (déjà faites). La tâche 9 exclut Docker.
**Choix** : ne refaire que les tâches nouvelles. Garder `Dockerfile` / `docker-compose.yml` (ils ne gênent rien, ne
sont plus annoncés comme vérifiés) plutôt que supprimer des fichiers qui fonctionnent.

## 2026-10-19 — Prévision de fin de mois
**Choix** :
- Virements récurrents ajoutés aux récurrences (`to_account_id`) : sans eux, « l'épargne prévue » serait toujours nulle.
  La ligne de sortie porte `recurring_id` (pour l'unicité), les deux lignes partagent un `transfer_id` déterministe.
- `planned_savings` = toutes les occurrences **du mois** des virements récurrents vers un compte épargne ou un placement
  (passées comme à venir) : un virement déjà fait n'est pas une dépense, il faut donc aussi le retirer du reste à dépenser.
- La fin de mois estimée retire aussi les virements récurrents **à venir** qui quittent les comptes du quotidien (terme
  `upcoming_savings_out`, nul s'il n'y en a pas) : sinon l'estimation serait trop optimiste du montant de l'épargne.
- « Historique » : un mois passé ne compte que si la première opération de l'utilisateur est antérieure au 1er de ce mois
  (un mois commencé en cours de route sous-estimerait le rythme). Jours restants = aujourd'hui inclus, pour les deux calculs.
- Seuls les comptes liquides entrent dans les revenus/dépenses ; le solde de départ de la projection = courant + espèces + carte.
- Mois futur : 400. Le reste par jour est arrondi au centime inférieur (prudent).
**Écarté** : moyenne au lieu de la médiane (sensible à un mois exceptionnel).

## 2026-10-19 — Abonnements détectés
**Choix** :
- Normalisation : tout mot contenant un chiffre est retiré (références `P1A2B3`, dates `12/09`, numéros de carte), plus une
  courte liste de mots bancaires (CB, PRLV, SEPA, CARTE, FACTURE…). Libellé affiché = libellé normalisé en casse de titre.
- Mensuel : on teste l'intervalle **médian** (pas chaque intervalle), pour tolérer un prélèvement décalé de quelques jours.
- Un abonnement dont la dernière échéance date de plus de 45 jours (mensuel) ou 380 jours (annuel) est considéré comme arrêté.
- Fenêtre de lecture : 760 jours (deux échéances annuelles), mais le critère mensuel reste « 3 mois sur les 6 derniers ».
- Hausse de prix : dernier montant comparé au montant qui précédait la série actuelle (sinon, après deux mois au nouveau
  tarif, « dernier vs précédent » ne verrait plus rien) ; la date affichée est celle du premier prélèvement au nouveau tarif.
- Les totaux ne portent que sur les abonnements **détectés** : ceux déjà suivis en récurrence (ex. Netflix dans le seed)
  sont exclus de la détection, comme demandé.
- « Suivre comme récurrence » crée la règle à partir de la prochaine échéance attendue : aucune opération passée en double.
**Écarté** : un lien « Abonnements » dans la barre d'onglets (interdit sur mobile) ; regrouper par commerçant via une IA.

## 2026-10-19 — Patrimoine net
**Choix** :
- `balance` d'un compte = sa **valeur** actuelle selon sa famille (solde, dernière valorisation, − capital restant dû) :
  les totaux de la page Comptes et les objectifs liés à un placement l'utilisent directement.
- Placement sans valorisation : sa valeur est le total versé (solde de départ « déjà versé » + virements reçus).
- Crédit : la dette suit le tableau d'amortissement, pas les opérations. Le prêt est supposé débloqué un mois avant la
  1re échéance (date de déblocage non saisie). Les mensualités payées depuis le compte courant restent de simples
  dépenses (pas de ventilation intérêts / capital) ; le seed n'en génère pas, pour ne pas fausser le budget démo.
- Les virements vers un placement comptent dans l'« épargne prévue » de la prévision (comme vers un livret).
- Seed : en plus du PEA, de l'assurance-vie et du crédit demandés, un appartement locatif (placement immobilier) : sans
  l'actif financé, le patrimoine démo serait fortement négatif et peu parlant.
- Graphique : palette catégorielle de référence (3 premiers emplacements : bleu, aqua, orange), validée en clair et en
  sombre par le script de la skill dataviz ; l'aqua est sous 3:1 en clair → légende chiffrée et tableau des données.
  Le patrimoine net est une ligne couleur encre, les dettes une aire sous zéro, une seule échelle.
- `valuations` et `loans` portent un `user_id` pour vérifier la propriété avec `owns()` comme le reste de l'API.
**Écarté** : cotations automatiques (API externe, hors périmètre) ; ventiler chaque mensualité en intérêts et capital.

## 2026-10-19 — Découpage du serveur (tâche 0, 3e feuille de route)
**Choix** : chaque routeur (`src/routes/*.js`) déclare ses chemins complets (`/api/...`) et est monté par `app.use(router)` :
les URL restent identiques à l'octet près, y compris celles qui croisent les domaines (`/api/accounts/:id/loan` est dans
`routes/wealth.js`). Domaines en plus de ceux demandés : wealth, transfers, recurring, forecast, subscriptions, goals.
`saveTransfer` (accès base) va dans `src/transfers.js`, partagé par les routes opérations et virements.
**Écarté** : monter les routeurs sous un préfixe (`app.use('/api/accounts', …)`) qui aurait obligé à déplacer des routes.

## 2026-10-19 — Finitions UX (tâche 10)
**Choix** :
- **Annuler = réinsertion à l'identique** : la suppression est immédiate (les totaux se mettent à jour tout de suite) ; la route
  garde en mémoire les lignes supprimées (mêmes `id`) et les liens à refaire, et renvoie un jeton. `POST /api/undo` les
  réinsère dans une transaction SQL. Pour une catégorie : la catégorie, ses budgets (cascade) et la catégorie de ses
  opérations et récurrences. Jeton valable 60 s (le toast reste 6 s), à usage unique, lié à l'utilisateur ; perdu si le
  serveur redémarre (la suppression reste alors définitive, message clair). Plus de `confirm()` : le toast le remplace.
  **Écarté** : suppression différée côté serveur (colonne `deleted_at` à filtrer dans toutes les requêtes, ou délai pendant
  lequel les totaux affichés seraient faux).
- **Premier lancement** : affiché si `users.onboarded_at` est vide **et** qu'il n'y a aucune opération (migration idempotente) ;
  terminer ou passer les 3 écrans le remplit. Le solde saisi devient le solde de départ du compte courant ; le salaire crée une
  récurrence mensuelle à partir du **prochain** versement (le solde saisi compte déjà le dernier). Les « 3 catégories les plus
  courantes » d'un compte neuf (sans historique) : Courses, Restaurants, Transport.
- **Thème** : `data-theme` sur `<html>` (absent = Système), tokens sombres déclarés pour `prefers-color-scheme` et pour
  `[data-theme='dark']` ; nouveaux tokens `--chrome` / `--chrome-line` (barre latérale, toast). Appliqué dans `main.tsx`
  (un script inline dans `index.html` serait bloqué par la CSP).
- Réglages : lien dans l'en-tête de Comptes (toutes tailles) et dans le pied de la barre latérale ; « Se déconnecter » y est
  aussi, car la barre d'onglets mobile n'en avait pas.
- Raccourcis : ignorés dans un champ, avec une modale ouverte ou avec Ctrl/Alt/Méta ; ← → seulement sur une page qui a un
  sélecteur de mois ; « / » hors de Opérations y mène et place le curseur dans la recherche.
- Contrastes (axe) : `--ink-2` #5b6f6d → #536664 et `--in` #2f7d5b → #2a7353 en clair (4,3:1 et 4,4:1 → ≥ 4,9:1).
**Écarté** : un service worker / IndexedDB pour l'annulation hors ligne.

## 2026-10-19 — Règles et tags (tâche 11)
**Choix** :
- Départage entre règles : priorité la plus haute (0 à 100), puis motif le plus long (le plus précis), puis la plus ancienne.
  Une règle ne s'applique qu'aux opérations du même sens que sa catégorie (une règle « Loisirs » ne classe pas un revenu).
- Les règles s'appliquent quand **aucune** catégorie n'est donnée : création d'opération, lignes d'import sans catégorie
  (la catégorie devinée par le client à l'import reste prioritaire), création d'une récurrence. Une modification qui retire
  la catégorie ne la remplace pas (choix explicite de l'utilisateur).
- Suggestion : calculée par le serveur quand l'utilisateur **choisit** une catégorie (création ou changement) ; motif = début
  commun, mot par mot (3 mots max, 3 lettres min), avec la plus proche opération de la même catégorie. Rien si une règle
  reconnaît déjà le libellé. Pas de mémoire des suggestions refusées (le toast disparaît seul).
- Tags : normalisés (minuscules, sans #, tirets à la place des espaces, 40 caractères, 10 par opération), pas sur les
  virements. Bilan d'un tag = dépenses (positives), revenus à part, sur toute la période (pas seulement le mois affiché).
  Un tag sans opération n'est plus proposé (la ligne `tags` reste, sans effet).
- Saisie : `<datalist>` natif pour l'autocomplétion (pas de librairie), Entrée / virgule / espace valide un tag.
- Suppression d'une catégorie : ses règles reviennent aussi avec « Annuler » ; suppression d'une opération : ses tags aussi.
**Écarté** : expressions régulières dans les motifs (risque d'erreur et de lenteur, « contient » suffit) ; tags hiérarchiques.

## 2026-10-19 — Constats (tâche 12)
**Choix** :
- Mois en cours : la hausse/baisse d'une catégorie compare les dépenses **jusqu'au même jour** du mois (sinon un mois
  commencé serait toujours « en baisse »). Mois passé : mois complets.
- Historique : un mois compte si la première opération date d'avant son 1er jour (même règle que la prévision) ; moins de
  2 mois → aucun constat. La moyenne n'utilise que les mois d'historique parmi les 3 précédents.
- Dépense inhabituelle : il faut au moins 3 autres dépenses dans la catégorie sur les 6 mois (sinon la médiane ne veut rien
  dire) ; opérations sans catégorie ignorées.
- Budget : seulement pour le mois en cours, et seulement s'il n'est pas déjà dépassé (la barre le montre déjà) ;
  projection linéaire (dépensé ÷ jours écoulés × jours du mois), date = premier jour où le rythme atteint le plafond.
- Bonne nouvelle : mois en cours strictement moins dépensier que chacun des 5 précédents (dans l'historique) à la même date.
- Importance en euros : écart à la moyenne, excédent sur la médiane, dépassement projeté, économie vs moyenne.
- Les phrases sont construites par le serveur (un seul endroit pour les seuils et les chiffres) ; le lien est structuré
  (`month`, `category_id`, `q`) et le client en fait une URL de filtre.
- Tests e2e : `goTo` attend le titre de la nouvelle page, car avec `React.lazy` l'ancienne reste affichée pendant le
  chargement (un test cliquait la même opération dans les « Dernières opérations » de l'Aperçu).

## 2026-10-19 — Calendrier et vue annuelle (tâche 13)
**Choix** :
- Le calendrier réutilise la liste déjà chargée (`/api/transactions?month`) et ses filtres : pas de nouvelle route.
- Intensité : 4 niveaux par **quartiles** des jours avec dépense (et pas proportionnels au maximum : le jour du loyer
  écrasait tous les autres au niveau 1). Couleur = `--out` mélangé à `--surface` (12 → 54 %) : une seule teinte, claire →
  foncée en clair, et qui s'allume sur fond sombre en sombre. Légende « Moins → Plus » ; chiffres exacts dans le nom
  accessible et l'infobulle de chaque jour ; le détail du jour sert de vue tableau.
- Vue annuelle : mêmes filtres que `/api/stats` (liquidités, virements exclus), donc des totaux identiques à la somme des
  mois. Taux d'épargne = (revenus − dépenses) / revenus, `null` sans revenu. Lien « Vue annuelle » dans le panneau
  « Six derniers mois » de l'Aperçu. Pas d'année future.
**Écarté** : un graphique Recharts de plus sur la vue annuelle (le tableau répond déjà à la question, et garde la page légère).

## 2026-10-19 — Récap mensuel (tâche 14)
**Choix** :
- Le récap assemble côté client des routes existantes (stats du mois et du précédent, budgets, patrimoine, abonnements,
  objectifs, constats) : pas de route dédiée, donc aucun chiffre calculé deux fois.
- « Nouvel abonnement » : sa première échéance repérée tombe dans le mois du récap ou les deux précédents (il faut 3 mois
  pour reconnaître un abonnement mensuel). La détection est celle d'aujourd'hui : pour un vieux mois, c'est une approximation.
  « Hausse de prix » : `price_change.date` dans le mois. Ajout de `first_date` à la détection.
- Objectifs : avancement actuel (pas d'historique des objectifs). Évolution des catégories : vs le mois précédent.
- Impression : tokens clairs forcés dans `@media print` (un PDF sombre gaspille l'encre), `print-color-adjust: exact`
  pour garder barres et couleurs, `break-inside: avoid` sur chaque bloc.
- Test du nombre de pages : comptage des objets `/Type /Page` du PDF produit par `page.pdf()` (pas de dépendance PDF).
- Bannière : basée sur la date du navigateur (le test la fixe avec `page.clock`).

## 2026-10-19 — Dépenses partagées (tâche 15)
**Choix** :
- L'utilisateur est un membre comme les autres (`is_me`, à son prénom) : les soldes se calculent sans cas particulier.
- Arrondis : méthode des plus forts restes (à égalité, dans l'ordre des membres) ; montants personnalisés : leur somme doit
  être exactement le total, pourcentages : 100 % à 0,01 près — sinon un message dit de combien ça dépasse.
- Remboursements : glouton « plus gros débiteur → plus gros créancier ». Chaque étape solde au moins une personne, donc au
  plus n − 1 remboursements (le minimum absolu est un problème NP-difficile, le glouton est optimal dans les cas courants).
- Payé par moi : une opération de **ma part** sur le compte choisi (« Libellé (Groupe, ma part) ») ; le reste est une
  créance qui ne crée aucune opération. Payé par un autre : rien sur mes comptes. Un remboursement reçu ou fait ne crée pas
  d'opération non plus (sinon l'argent compterait deux fois) — le solde bancaire réel se rejoint quand tout est soldé.
- Supprimer une dépense supprime l'opération de ma part ; supprimer le groupe garde les opérations (elles ont eu lieu).
  Un membre qui a des dépenses ne peut pas être retiré.
- Accès depuis la page Comptes (section « Dépenses partagées »), pas de 5e onglet.
**Écarté** : comptes utilisateurs pour les membres (demandé : noms libres) ; devise par groupe (multi-devises hors périmètre).

## 2026-10-19 — Fonctions IA (tâche 16)
**Choix** :
- Modèle par défaut `claude-sonnet-5-5` (demandé par la feuille de route), configurable par `ANTHROPIC_MODEL`. Pour les
  modèles qui la permettent (Sonnet 5.5, Opus 5.5, Opus 5, Fable 5.1), appel par `client.beta.messages.create` avec la reprise
  serveur après refus (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) ; `stop_reason: "refusal"` est
  traité avant de lire la réponse. Pensée adaptative par défaut ; effort `low` pour le ticket, `medium` pour l'assistant.
- Ticket : `output_config.format` (JSON schema) **et** revalidation Zod stricte côté serveur ; champ illisible → `null`
  (montant 0, date impossible, catégorie hors des catégories de l'utilisateur). Erreurs SDK traduites par classes typées.
- Assistant : boucle d'outils écrite à la main (pas de Tool Runner, qui est en bêta et attendrait des schémas Zod 3) ;
  `tool_choice` auto (le forçage est refusé par Sonnet 5.5). Les outils n'ont **aucun** paramètre utilisateur : l'id vient
  de la session ; leurs entrées sont validées par Zod `.strict()` (un `user_id` glissé par le modèle est rejeté). Ils
  appellent les mêmes fonctions que les routes GET (`monthStats`, `listTransactions`, `budgetsOf`, `forecastOf`,
  `networthOf`, `subscriptionsView`), extraites pour l'occasion avec un helper `view()` sans changer les routes.
- Une question = un échange indépendant (pas d'historique envoyé) : moins de données transmises, coût prévisible. 8 tours
  d'outils au plus. Limite : 20 questions par jour et par utilisateur (table `ai_usage`), comptées avant l'appel.
- Consentement : colonne `users.ai_consent_at`, demandé dans le formulaire ou le panneau avant le 1er usage (pas de modale
  dans la modale).
- Corps JSON porté à 3 Mo (photo 1600 px en base64).
- Tests : faux client injecté (`ai.setClient`) ; aucun appel réseau, aucune clé réelle. Côté e2e, l'API IA est simulée par
  `page.route` pour vérifier le parcours du ticket dans l'interface.
**Écarté** : stocker les photos ; donner au modèle un accès SQL ou des outils d'écriture ; historique de conversation.

## 2026-11-14 — Application mobile hors ligne
**Contexte** : faire de Pécule une app mobile complète, **utilisable sans connexion**. Pas de Java ni de SDK Android
sur la machine de développement.
**Choix** :
- **Capacitor 8** autour du client React existant : les 16 fonctionnalités et leurs tests sont conservés, avec des
  plugins natifs (app, haptique, fichiers, partage, notifications locales, écran de démarrage ; barres système du cœur).
- **Données sur l'appareil, sans serveur** : le code de `server/src` est exécuté dans l'app. esbuild (plugin Vite
  `vite.backend.ts`, module virtuel `virtual:pecule-backend`) empaquette les routeurs inchangés avec des substituts
  (`client/src/local/shims`) : better-sqlite3 → sql.js (SQLite WebAssembly), express → petit routeur sans HTTP
  (`handle({ method, url, body })`), jsonwebtoken → jeton local, crypto/path → vides, zod → version ESM. Une seule
  source de vérité métier.
- Preuve d'équivalence : `npm run test:sqljs` rejoue **toute** la suite d'API (131 tests) sur l'adaptateur sql.js
  (redirection de `require('better-sqlite3')`), plus 6 tests de l'adaptateur ; contre-test fait (adaptateur cassé → échec).
- Piège sql.js : `export()` ferme et rouvre la base (requêtes préparées libérées, PRAGMA remis à zéro) → l'adaptateur
  re-prépare à la demande (compteur de génération) et rejoue les PRAGMA (`foreign_keys`).
- Persistance : après **chaque** requête qui a modifié la base (`takeDirty`), export puis écriture ; enregistrements
  sérialisés et regroupés. Téléphone : fichier dans le dossier privé de l'app (écriture .tmp, suppression, renommage ;
  relecture du .tmp si l'app est tuée entre les deux). Navigateur : IndexedDB. Après restauration ou effacement, la base
  en mémoire est gelée pour qu'un enregistrement tardif n'écrase rien. `allowBackup` Android reste actif (sauvegarde
  automatique du téléphone en filet de sécurité).
- Pas d'email ni de mot de passe dans l'app : routes locales `/api/local/*` (profils de l'appareil, session, démo).
  La confidentialité passe par un code à 4 chiffres (empreinte SHA-256 salée) : il protège l'ouverture, il ne chiffre pas.
- Build web inchangé : l'alias `@pecule/local` pointe vers `src/local/web.ts` (vide) hors mode mobile, car Rolldown
  n'élimine pas les `import()` placés derrière `if (LOCAL)` ; JS initial web 95 kB gzip.
- Police Instrument Sans embarquée (@fontsource) en mobile : pas de Google Fonts hors ligne.
- IA : SDK Anthropic appelé depuis l'app (`dangerouslyAllowBrowser`) avec la clé de l'utilisateur, gardée sur l'appareil.
- APK construit par GitHub Actions (Ubuntu : JDK 21 et SDK Android préinstallés) plutôt qu'installer ~5 Go sur le poste.
- Récap PDF : `window.print()` n'existe pas dans la WebView Android → bouton masqué dans l'app (récap consultable).
- Ouvrir un profil ramène toujours à l'Aperçu (sinon « Changer de profil » depuis Réglages rouvrait sur Réglages).
**Écarté** : réécriture React Native (des semaines pour retrouver l'existant) ; app connectée à un serveur hébergé (pas
de données sans réseau) ; dupliquer la logique métier côté client ; @capacitor-community/sqlite (natif, ni testable dans
le navigateur ni par la suite d'API) ; chiffrement de la base (la clé serait de toute façon sur l'appareil).

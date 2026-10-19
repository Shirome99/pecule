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

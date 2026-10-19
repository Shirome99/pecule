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

# Mission : mettre le projet Pécule sur GitHub

Mets ce projet sur un dépôt GitHub. **Pas de déploiement** : pas de GitHub Pages, pas de Render, pas de workflow de publication. On veut seulement le code sur GitHub.

Travaille en autonomie. Arrête-toi et demande-moi uniquement si une étape exige que je me connecte ou que je confirme quelque chose.

## 1. Nettoyer avant d'envoyer

- Vérifie ou crée `.gitignore` à la racine, avec au minimum :
  ```
  node_modules/
  dist/
  *.db
  *.db-shm
  *.db-wal
  .pgdata/
  .env
  .env.*
  !.env.example
  .DS_Store
  Thumbs.db
  coverage/
  playwright-report/
  test-results/
  ```
- Cherche dans tout le projet tout ce qui ressemble à un secret : clés API (`ANTHROPIC_API_KEY`, `sk-`…), mots de passe, chaînes de connexion, `JWT_SECRET` avec une vraie valeur. S'il y en a un dans le code, remplace-le par une lecture de variable d'environnement et documente la variable dans un fichier `.env.example` sans valeur réelle. La valeur par défaut `dev-secret-change-me` du serveur peut rester, car elle ne sert qu'en développement.
- Si un fichier sensible (base `.db`, `.env`) a déjà été commité, retire-le du suivi avec `git rm --cached` sans le supprimer du disque, et signale-le moi dans ton résumé final.
- Supprime `DEPLOY_PROMPT.md` s'il existe : il ne sert plus.

## 2. Préparer le dépôt local

- Si le dossier n'est pas encore un dépôt git : `git init` et `git branch -M main`.
- Vérifie que `git config user.name` et `git config user.email` sont définis. S'ils ne le sont pas, arrête-toi et demande-moi les valeurs.
- Vérifie que le `README.md` explique en quelques lignes ce qu'est l'app et comment la lancer en local (installation, `npm run seed`, `npm run dev` dans `server/` et `client/`). Complète-le si besoin.
- Lance `git status` et vérifie qu'aucun `node_modules`, `dist`, `.db` ou `.env` n'apparaît dans les fichiers à envoyer.
- Commit de tout le reste : `git add -A` puis `git commit -m "Pécule : app de gestion de budget (React + Express)"`. Si tout est déjà commité, ne crée pas de commit vide.

## 3. Créer le dépôt GitHub et envoyer

- Si la commande `gh` est installée **et** que `gh auth status` indique que je suis connecté :
  `gh repo create pecule --private --source . --remote origin --push`
  Si le nom `pecule` est déjà pris sur mon compte, utilise `pecule-budget`.
- Sinon, ne tente pas de contourner : arrête-toi et donne-moi exactement ces instructions :
  1. Créer un dépôt **privé** vide nommé `pecule` sur github.com, sans README ni .gitignore.
  2. Lancer :
     ```
     git remote add origin https://github.com/<mon-pseudo>/pecule.git
     git push -u origin main
     ```
- S'il existe déjà un remote `origin`, ne le remplace pas : fais seulement `git push -u origin main`.

## 4. Résumé final

Donne-moi :
- l'adresse du dépôt ;
- la liste des fichiers ignorés ou retirés du suivi, et pourquoi ;
- les commandes pour envoyer mes prochaines modifications : `git add -A`, `git commit -m "..."`, `git push`.

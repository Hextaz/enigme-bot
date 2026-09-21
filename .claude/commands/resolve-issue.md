# Commande `/resolve-issue` - Rituel de Résolution d'Issue

Exécute le rituel structuré de résolution pour l'issue spécifiée : `$ARGUMENTS`.

## Instructions pour Claude / Antigravity :

1. **Vérification de l'argument** :
   * L'argument `$ARGUMENTS` doit être un numéro d'issue GitHub (ex: `12` ou `#12`).
   * Si aucun numéro n'est fourni, demande poliment à l'utilisateur de préciser l'issue à traiter.

2. **Phase 1 : Cadrage, Contexte Git & Récolte d'informations** :
   * **Contexte Git** : Vérifie la branche active (`git branch --show-current`), les commits déjà existants sur la branche (`git log main..HEAD --oneline`), et les modifications non commitées en cours (`git status --short`). Alerte si on est sur `main` sans branche de feature dédiée.
   * Exécute `gh issue view $ARGUMENTS --json number,title,body,labels` pour lire le ticket.
   * Recherche les fichiers et fonctions concernés avec `rg` ou `fd`.
   * Vérifie la vérité de la DB dans `src/db/models.js` et les règles dans `src/game/` / `src/gamemodes/`.

3. **Phase 2 : 🛑 RÉCAPITULATIF & PLAN D'IMPLÉMENTATION (Point d'arrêt obligatoire)** :
   * Présente à l'utilisateur :
     - 🌿 État Git : Branche courante, travail déjà amorcé/commits existants, fichiers modifiés locaux.
     - 🎯 Résumé de l'objectif.
     - 📂 Fichiers exacts à modifier ou créer.
     - 🗄️ Impact base de données (colonnes Sequelize nécessaires).
     - ⚠️ Cas limites et pièges identifiés (délai 3s, verrous `transaction.js`, rollbacks, inventaire).
     - 🧪 Stratégie de vérification et de tests.
   * **STOP** : Demande explicitement validation à l'utilisateur avant d'écrire la moindre ligne de code. Ne commence à coder qu'après son accord.

4. **Phase 3 : Implémentation Rigoureuse & Discipline d'Ingénierie** :
   * Ordre : `DB (models.js) ➜ Gamemodes & Règles (src/gamemodes/, src/game/) ➜ Commandes & Handlers (src/commands/, src/index.js) ➜ Canvas (src/utils/canvas.js) ➜ Tests`.
   * **TDD strict avec Verify RED** : pour tout calcul de règle, écrire le test d'abord, exécuter et **constater l'échec pour la raison attendue**, puis implémenter le code pour passer au vert.
   * **Loi d'Airain Anti-Band-Aids** : interdiction formelle de poser des rustines (`?.` sauvages, `try/catch` vides) pour faire taire les erreurs. Trouver la cause racine.
   * **Règles Discord.js** : `deferReply()` / `deferUpdate()` dans les 3s, verrouillage `lockUser()` dans `try` avec `unlockUser()` en `finally`, messages éphémères pour les actions privées.

5. **Phase 4 : Porte de Vérification (Evidence Before Claims)** :
   * Interdiction formelle d'affirmer que c'est résolu sans **preuve terminale fraîche** :
     - Vérification de la syntaxe `node -c <fichier>`.
     - Tests unitaires `npm test` si configurés.

6. **Phase 5 : Clôture & Mini-Rapport (PAS D'AUTO-COMMIT)** :
   * Vérifie la propreté du `git diff` (aucun `console.log` de debug résiduel).
   * **N'exécute JAMAIS de `git commit` automatiquement.**
   * Affiche le mini-rapport en 5 lignes max (fichiers modifiés, preuves terminales, cas limites testés, commande de démarrage local, commande de commit et push déclenchant le déploiement sur Lordi via `deploy.hextaz.dev`).

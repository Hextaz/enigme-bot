# Commande `/code-review` - Revue de Code Intransigeante (Staff Engineer)

Déclenche un audit approfondi et intransigeant sur le code : `$ARGUMENTS`.

## Instructions pour Claude / Antigravity :

1. **Détection du Périmètre** :
   * Si `$ARGUMENTS` vaut `--full` : réalise un audit architectural global du bot (Commandes, Game Engine, Gamemodes, DB, Canvas).
   * Si `$ARGUMENTS` est un chemin de fichier (ex: `src/game/events.js` ou `src/commands/jouer.js`) : audite spécifiquement ce fichier et ses dépendances directes.
   * Si `$ARGUMENTS` est vide ou vaut `--diff` : audite les modifications courantes (`git diff` ou comparaison avec la branche principale).

2. **Diagnostic Automatisé Préalable** :
   * Vérifie la syntaxe JavaScript des fichiers modifiés avec `node -c <fichier>`.
   * Scanne les anti-patterns connus :
     - Oubli de `deferReply()` / `deferUpdate()` sur les interactions Discord lentes.
     - Utilisation de `lockUser()` sans `unlockUser()` garanti dans un bloc `finally`.
     - `try/catch` vides masquant les erreurs de base de données ou d'interaction.
     - `console.log()` de debug résiduels non structurés.

3. **Évaluation selon les 6 Piliers (/20 par pilier)** :
   * 🏛️ Architecture & Modularité Gamemodes
   * 🔒 Fiabilité Discord, Concurrence & Verrous (`transaction.js`)
   * ⚡ Performance, Gestion Mémoire & Rendu Canvas
   * 🗄️ Intégrité des Données SQLite & Sequelize
   * 💎 Clean Code, Anti-Symptômes & Robustesse
   * 🧪 Testabilité & Découplage de la Logique Métier

4. **Restitution du Rapport Complet** :
   * Tableau Scorecard avec Note Globale /100 et Verdict clair.
   * Tableau Répertoire des Anomalies avec IDs (`DISC-01`, `LOCK-01`, `DATA-01`, etc.) et Sévérité (`🔴 CRITIQUE`, `🟠 IMPORTANT`, `🟡 MOYEN`, `🟢 FAIBLE`).
   * Analyse détaillée avec diffs correctifs suggérés (`Avant ➜ Après`).
   * Matrice Effort vs Impact (Quick Wins vs Projets de fond).
   * **Prompts prêts à l'emploi** pour déléguer les résolutions dans de nouvelles conversations.

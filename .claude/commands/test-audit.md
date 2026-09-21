# Commande `/test-audit` - Audit Approfondi des Tests & Fiabilité

Exécute un audit rigoureux de la suite de tests et de la testabilité du moteur de jeu selon le standard Staff QA / Game Test Architect.

## Argument : `$ARGUMENTS` (Facultatif : `--all`, chemin vers un module ou vers un fichier de test)

## Instructions pour Claude / Antigravity :

1. **Identification du Périmètre** :
   * Si `$ARGUMENTS` est vide ou `--all`, analyse l'ensemble des modules du moteur de jeu (`src/game/`, `src/gamemodes/`).
   * Si un module est ciblé (ex: `src/game/events.js` ou `src/game/shop.js`), évalue la complétude des tests associés.
   * Si un fichier de test est fourni (ex: `tests/movement.test.js`), audite la qualité des assertions, des mocks et de l'isolation.

2. **Évaluation selon les 5 Piliers** :
   * **Couverture Moteur de Jeu (/20)** : présence de tests sur le calcul de déplacement, arrêts obligatoires Étoile/Boutique, effets d'objets, Boo, Bowser, paris.
   * **Chasse aux Tests Creux (/20)** : traquer les tests qui ne font que tester des mocks Discord au lieu de vérifier l'état en base de données.
   * **Cas Limites & Économie (/20)** : tester les soldes insuffisants (19 pièces vs 20), inventaire plein, boucle du plateau, joueurs inactifs/fantômes.
   * **Déterminisme & Concurrence (/20)** : isolation SQLite en mémoire, tests des verrous `transaction.js`, simulation déterministe des crons quotidiens.
   * **Structure AAA (/20)** : Arrange-Act-Assert, nommage descriptif, pas de logique complexe dans le test.

3. **Restitution du Rapport** :
   * Affiche la **Scorecard d'Excellence des Tests** (/100) avec verdict global.
   * Liste le **Répertoire des Anomalies de Test** classées (`🔴 CRITIQUE`, `🟠 IMPORTANT`, `🟡 MOYEN`, `🟢 FAIBLE`).
   * Génère les **Prompts de Création de Tests Prêts à l'Emploi** par scope pour implémenter les tests manquants.

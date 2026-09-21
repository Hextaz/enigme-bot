# Commande `/create-issue` - Atelier Interactif de Cadrage & Création d'Issue

Lance un atelier de cadrage interactif pour concevoir, spécifier et publier une issue selon le standard Enigme Bot.

## Argument : `$ARGUMENTS` (Idée brute, besoin ou description sommaire facultative)

## Instructions pour Claude / Antigravity :

1. **Phase 1 : Interview & Cadrage Métier** :
   * Si `$ARGUMENTS` est vide, demande à l'utilisateur d'exprimer son idée, son besoin ou le problème constaté.
   * Si une idée est fournie :
     - Vérifie immédiatement les doublons potentiels avec `gh issue list --state all --search "..."`.
     - Analyse le persona visé (Joueur, Maître du Jeu, Développeur).
     - Pose 2 ou 3 questions ciblées si le besoin nécessite des clarifications (périmètre MVP vs Nice-to-have, équilibre économique pièces/étoiles, cas limites).

2. **Phase 2 : Grounding Technique dans le Codebase** :
   * Inspecte les modèles Sequelize dans `src/db/models.js`.
   * Vérifie la structure des modes de jeu dans `src/gamemodes/` et les règles dans `src/game/`.
   * Identifie les commandes d'impact dans `src/commands/` et le rendu dans `src/utils/canvas.js`.

3. **Phase 3 : Rédaction Haute Définition ("Agent-Ready")** :
   * Rédige la spécification complète (Contexte & Problème, Spécifications Fonctionnelles, Spécifications Techniques, Fichiers Cibles, Sécurité & Concurrence, Critères d'Acceptation cochables).
   * Propose un titre normalisé : `feat(scope): ...` / `fix(...)` / `refactor(...)`.
   * Propose le triage :
     - **Priorité** : `P0` (bloquant/crash), `P1` (gameplay cœur), `P2` (finitions/UI).
     - **Taille** : `XS`, `S`, `M`, `L`.
     - **Labels GitHub**.

4. **Phase 4 : Point d'arrêt obligatoire (Validation utilisateur)** :
   * Affiche le brouillon complet du ticket et le triage proposé.
   * **STOP** : Demande confirmation explicite à l'utilisateur avant d'appeler `gh issue create`.

5. **Phase 5 : Publication Automatique GitHub CLI** :
   * Exécute `gh issue create --title "..." --body "..." --label "..."`.
   * Fournit à l'utilisateur le lien GitHub direct et la commande `/resolve-issue <NUMERO>` pour la future implémentation.

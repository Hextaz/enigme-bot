# Commande `/security-audit` - Audit de Sécurité & Intégrité du Jeu

Exécute un audit de sécurité intransigeant selon le standard Staff AppSec Engineer & Game Integrity Architect.

## Argument : `$ARGUMENTS` (Facultatif : `--full`, chemin vers une commande ou module de jeu)

## Instructions pour Claude / Antigravity :

1. **Identification du Périmètre** :
   * Si `$ARGUMENTS` est vide ou `--full`, audite l'ensemble du projet (commandes `/admin`, transactions de boutique, customIds de boutons, secrets, gestion des erreurs Discord API).
   * Si un dossier de commandes est ciblé (ex: `src/commands/`), vérifie le contrôle d'accès MJ/Admin et la validation des entrées.
   * Si un module de jeu est ciblé (ex: `src/game/shop.js` ou `src/game/events.js`), vérifie les verrous `transaction.js`, l'anti-triche et l'atomisme des flux financiers.

2. **Évaluation selon les 5 Piliers** :
   * **Contrôle d'Accès & Commandes MJ (/20)** : présence obligatoire de la vérification `MJ_USER_ID` et permissions Discord Administrateur sur `/admin`.
   * **Anti-Triche & Concurrence (/20)** : protection contre le double-spending et les doubles lancers de dés, verrouillage systématique via `lockUser` / `unlockUser`.
   * **Validation Entrées & CustomIDs (/20)** : vérification stricte de l'identité du joueur sur les boutons Discord (`interaction.user.id === targetUserId`).
   * **Secrets & Confidentialité Énigmes (/20)** : zéro token dans le code, solutions et indices d'énigmes jamais divulgués avant publication.
   * **Résilience, DoS & Anti-Crash (/20)** : gestion robuste des erreurs Discord (10062), timeouts sur le chargement d'avatars pour Canvas.

3. **Restitution du Rapport** :
   * Affiche la **Scorecard de Posture de Sécurité** (/100) avec verdict global.
   * Liste le **Répertoire des Vulnérabilités** classées (`🔴 CRITIQUE`, `🟠 IMPORTANT`, `🟡 MOYEN`, `🟢 FAIBLE`).
   * Fournit les **Prompts de Remédiation Clé en Main** pour corriger immédiatement toute faille détectée.

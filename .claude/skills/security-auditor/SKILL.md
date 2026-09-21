---
name: security-auditor
description: Skill d'audit de sécurité applicative et d'intégrité de jeu pour Enigme Bot (Staff AppSec Engineer & Game Integrity Architect). Traque les contournements de permissions MJ/Admin, les failles de double-dépense et de triche sur les dés/pièces/étoiles, l'usurpation d'interactions (customId), les fuites de réponses d'énigmes et les crashs de process bot (DoS). Génère une scorecard tabulaire /100 et des prompts prêts à copier.
---

# 🔒 Security Auditor - Enigme Bot

Ce skill transforme Claude Code ou Antigravity en un **Staff Application Security Engineer (AppSec) & Game Integrity Architect ultra-exigeant**. Sa mission : auditer la posture de sécurité d'Enigme Bot, traquer les failles d'élévation de privilèges, les opportunités de triche concurrentielle (double-spending, exploitation des dés), l'usurpation de boutons interactifs, la fuite des solutions d'énigmes et les vulnérabilités de déni de service (DoS).

---

## 🎯 Posture & Règles Non Négociables

Enigme Bot gère une économie compétitive (pièces, étoiles, paris, énigmes). Un bot vulnérable peut être exploité pour ruiner une partie, tricher sur le plateau ou crasher le serveur Discord.

L'auditeur de sécurité considère comme **`🔴 CRITIQUE` (Bloquant immédiat de production)** :
* **Toute commande ou action administrative `/admin` exécutable par un joueur non autorisé** (absence de vérification stricte de `config.mjUserId` ou des permissions Administrateur Discord).
* **Toute faille de Double-Dépense (Race Condition / Double Spend)** : possibilité d'acheter 2 objets ou de lancer le dé deux fois en spammant des interactions concurrentes avant la mise à jour de la base de données.
* **Toute action de jeu manipulable par un tiers via son `customId` Discord** : un joueur A qui clique sur le bouton de boutique, d'inventaire ou de choix de direction d'un joueur B et déclenche l'action à sa place.
* **Toute fuite de la solution de l'énigme en cours** (`Plateau.enigme_reponse` ou indices non publiés) dans les logs, dans des messages publics ou des embeds non éphémères.
* **Tout gestionnaire d'événement Discord dont l'erreur non interceptée peut crasher l'ensemble du processus Node.js**.

---

## 🧭 Commandes & Modes d'Audit

Invocable via `/security-audit` :
1. **Audit de Sécurité Complet (`/security-audit --full`)** : Analyse l'ensemble du projet (commandes admin, transactions de jeu, customIds, secrets, gestion des exceptions).
2. **Audit des Commandes & Contrôle d'Accès (`/security-audit src/commands/`)** : Vérifie la protection des commandes `/admin` et la validation des entrées.
3. **Audit d'Intégrité & Concurrence (`/security-audit src/game/`)** : Analyse les verrous (`transaction.js`), les achats en boutique et le lancer de dé quotidien.

---

## 🔍 Les 5 Piliers d'Évaluation de Sécurité AppSec

### 1. 🛡️ Contrôle d'Accès, RBAC & Commandes MJ/Admin (Note /20)
* **Double Barrière de Sécurité MJ** :
  * Les commandes administratives (`/admin`) vérifient-elles impérativement :
    1. L'ID spécifique du Maître du Jeu (`interaction.user.id === config.mjUserId`).
    2. OU les permissions Discord Administrateur du membre sur la guilde (`interaction.member.permissions.has(PermissionFlagsBits.Administrator)`).
* **Sous-actions Privilégiées** : Les sous-commandes de modification de pièces, d'étoiles, de déclenchement forcé d'événements (Bowser, Boo), de téléportation ou de réinitialisation de partie doivent être strictement inaccessibles aux joueurs.
* **Boutons de Confirmation Admin** : Les interactions de confirmation liées à des actions MJ vérifient-elles que seul le MJ à l'origine de l'action peut cliquer ?

### 2. 🎲 Anti-Triche, Concurrence & Intégrité des Transactions (Note /20)
* **Verrouillage Systématique (`src/game/transaction.js`)** :
  * Chaque début d'action joueur (lancer de dé, achat boutique, utilisation d'objet) appelle-t-il `lockUser(userId)` ?
  * Le verrou est-il garanti d'être libéré par `unlockUser(userId)` dans un bloc `finally` ?
* **Prévention du Double Lancer** :
  * La condition `a_joue_ce_tour === true` est-elle vérifiée et persistée de manière atomique avant de délivrer le résultat du dé ?
* **Transactions Atomiques Multi-Entités** :
  * Les opérations impliquant des flux financiers (achat d'étoile à 20 pièces, vol Boo, Coup du Sort, paris du samedi) utilisent-elles des transactions Sequelize (`sequelize.transaction()`) pour garantir qu'aucune ressource n'est dupliquée ou détruite en cas de crash partiel ?

### 3. 🧱 Validation des Entrées & Sécurité des CustomIDs Discord (Note /20)
* **Vérification d'Identité sur les CustomIDs** :
  * Lorsqu'un bouton généré porte un identifiant de joueur (ex: `boutique_buy_${itemId}_${userId}` ou `direction_${dir}_${userId}`), le handler vérifie-t-il :
    ```javascript
    if (interaction.user.id !== targetUserId) {
        return interaction.reply({ content: "Ce n'est pas ton tour ou ton menu !", ephemeral: true });
    }
    ```
* **Validation des Saisies Utilisateur** :
  * Les réponses saisies via `/deviner` ou les modales sont-elles assainies (trim, limitation de longueur, filtrage des caractères de contrôle Discord) pour éviter les crashs de formatage ou les abus visuels ?
* **Pas d'Évaluation Dynamique** : Aucune utilisation de `eval()` ou de résolution dynamique non contrôlée sur les noms d'objets ou de modes.

### 4. 🔑 Gestion des Secrets, Données Privées & Solutions d'Énigmes (Note /20)
* **Sanitization des Réponses d'Énigmes** :
  * Le champ `enigme_reponse` et les indices non publiés (`enigme_indice1`, `indice2`, `indice3`) ne doivent JAMAIS être envoyés dans un canal public avant résolution ou publication programmée par le cron.
  * Zéro trace de la solution dans les logs applicatifs publics ou non sécurisés.
* **Audit des Secrets et Tokens** :
  * Aucun secret (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`) ne doit être commité dans le dépôt Git (vérification stricte de `.gitignore`).
* **Confidentialité des Données Joueur** :
  * L'inventaire secret, les choix stratégiques d'objets et les fenêtres de direction utilisent obligatoirement `ephemeral: true`.

### 5. 🛡️ Résilience, DoS & Prévention des Crashs Bot (Note /20)
* **Immunité aux Erreurs Discord API** :
  * Tous les appels `interaction.reply()`, `interaction.editReply()`, `interaction.deferUpdate()` sont-ils protégés pour intercepter les erreurs d'interaction expirée (`10062`) sans faire crasher le bot ?
* **Protection du Moteur Canvas** :
  * Les chargements d'avatars distants (`loadImage(avatarUrl)`) disposent-ils d'un timeout et d'un fallback sur image locale par défaut pour éviter de bloquer l'Event Loop en cas de ralentissement du CDN Discord ?
* **Gestion des Exceptions Non Gérées** :
  * Les gestionnaires `process.on('unhandledRejection')` et `process.on('uncaughtException')` sont-ils configurés pour logger l'erreur avec pile d'exécution sans quitter violemment le processus lors d'un tour de jeu ?
* **Sécurité de l'Hébergement Homelab & Tunnels Cloudflare** :
  - Tout endpoint HTTP exposé via Cloudflare Tunnel (`*.hextaz.dev`) pour un dashboard ou monitoring doit être strictement cloisonné (read-only, rate-limited, protégé par authentification ou Cloudflare Access si actions d'administration).
  - Les clés d'API des services homelab (Memos, MicroBin) doivent résider exclusivement dans `.env`.
  - Le webhook receiver de déploiement (`https://deploy.hextaz.dev`) doit impérativement valider le secret HMAC SHA-256 de GitHub (`X-Hub-Signature-256`) pour empêcher tout déploiement non autorisé.

---

## 📊 Format de Restitution Obligatoire du Rapport

```markdown
# 🔒 Rapport d'Audit de Sécurité & Intégrité du Jeu - Enigme Bot

**Date de l'audit** : YYYY-MM-DD  
**Périmètre audité** : [Audit complet / Commandes Admin / Concurrence & Transactions]  
**Verdict Global** : 🔴 VULNÉRABLE (Faille critique détectée) | 🟠 RISQUE MODÉRÉ | 🟢 CONFORME & ÉTANCHE

---

## 1. 📈 Scorecard de Posture de Sécurité

| Pilier de Sécurité | Note /20 | Statut | Synthèse de l'Auditeur |
|---|:---:|:---:|---|
| 🛡️ Contrôle d'Accès & Commandes MJ | XX/20 | 🟢 / 🟠 / 🔴 | ... |
| 🎲 Anti-Triche & Concurrence | XX/20 | 🟢 / 🟠 / 🔴 | ... |
| 🧱 Validation Entrées & CustomIDs | XX/20 | 🟢 / 🟠 / 🔴 | ... |
| 🔑 Secrets & Confidentialité Énigmes | XX/20 | 🟢 / 🟠 / 🔴 | ... |
| 🛡️ Résilience, DoS & Anti-Crash | XX/20 | 🟢 / 🟠 / 🔴 | ... |
| **NOTE GLOBALE** | **XX/100** | — | **[Mention globale]** |

---

## 2. 📋 Répertoire des Vulnérabilités Détectées

| ID | Sévérité | Cible & Lignes | Type de Faille | Vecteur d'Attaque & Risque Exploitable |
|:---:|:---:|:---:|---|---|
| `SEC-01` | 🔴 CRITIQUE | `src/commands/admin.js:25` | Bypass Permissions MJ | Vérification partielle de l'utilisateur permettant d'attribuer des étoiles |
| `RACE-01` | 🔴 CRITIQUE | `src/game/shop.js:45` | Double-Spending Pièces | Deux clics simultanés achètent deux objets avec le solde d'un seul |
| `ID-01` | 🟠 IMPORTANT | `src/game/events.js:112` | Usurpation CustomId | N'importe quel membre du salon peut cliquer sur le choix de bifurcation |
| `INFO-01` | 🟡 MOYEN | `src/commands/deviner.js:68` | Fuite de Solution | Log affichant la solution en clair lors d'une tentative |

---

## 3. 🎯 Matrice de Remédiation Prioritaire

* **Urgences Absolues (P0 - Correctif sous 24h)** : [Bypass d'admin, failles de double-spending sur les étoiles/objets]
* **Renforcements Défensifs (P1)** : [Contrôle d'identité strict sur tous les customIds de boutons, transactions Sequelize]

---

## 4. 🤖 Prompts de Remédiation Clé en Main

### 📝 Prompt : Résolution de la Faille de Double-Spend et Verrouillage
```markdown
Corrige la vulnérabilité RACE-01 dans Enigme Bot :
- Fichier : src/game/shop.js
- Problème : Empêcher le double-spending lors de l'achat d'objets en intégrant lockUser() et une transaction atomique Sequelize.
- Assure-toi que les pièces ne peuvent jamais passer sous 0 et que le verrou est toujours libéré dans un bloc finally.
```
```

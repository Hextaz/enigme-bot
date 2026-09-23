# 🛠️ Guide d'Installation & Environnement de Développement (Dev Onboarding)

Ce guide s'adresse aux développeurs rejoignant le projet **Enigme Bot**. Suivez scrupuleusement ces étapes pour configurer votre environnement de travail local sans interférer avec la production ou avec les autres membres de l'équipe.

---

## ⚠️ Règle Fondamentale : Pas de Bot Discord Partagé en Local !

> [!CAUTION]
> **Ne JAMAIS partager un token de bot Discord en local entre plusieurs développeurs.**
> Si deux développeurs démarrent `npm start` avec le même `DISCORD_TOKEN`, Discord ouvrira deux connexions WebSocket concurrentes et déconnectera vos sessions à tour de rôle en boucle (erreur de heartbeat / 4004 / 4000).
> **Chaque développeur doit avoir sa propre application Discord de test et son propre serveur Discord.**

---

## 📋 1. Prérequis Système

* **Node.js** : version 18.x ou 20.x LTS recommandée (`node -v`).
* **npm** : version 9+ (`npm -v`).
* **Git** (`git --version`) configuré avec votre compte GitHub.
* **GitHub CLI** (`gh`) authentifié (`gh auth status`).
* **Compte Discord** avec le mode développeur activé (*Paramètres Discord -> Avancés -> Mode développeur*).

---

## 🤖 2. Création de Votre Bot Discord de Test (5 min)

1. Rendez-vous sur le **[Discord Developer Portal](https://discord.com/developers/applications)**.
2. Cliquez sur **New Application**, nommez-la (ex: `EnigmeBot-Dev-<VotrePrenom>`).
3. Allez dans l'onglet **Bot** :
   - Cliquez sur **Reset Token** et copiez immédiatement le token (ce sera votre `DISCORD_TOKEN`).
   - Descendez à la section **Privileged Gateway Intents** et activez impérativement :
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent**
   - Sauvegardez les modifications.
4. Allez dans l'onglet **OAuth2 ➔ URL Generator** :
   - Cochez les scopes : `bot` et `applications.commands`.
   - Cochez les permissions bot : `Administrator` (pour vos tests locaux sur votre serveur dédié).
   - Copiez l'URL générée en bas et ouvrez-la dans votre navigateur pour inviter votre bot sur votre propre serveur Discord de test.

---

## 💻 3. Installation Locale du Projet

### A. Cloner le dépôt
```bash
git clone git@github.com:Hextaz/enigme-bot.git
cd enigme-bot
```

### B. Installer les dépendances
```bash
npm install
```
*(Le paquet `canvas` compile des bindings C++ ; sur Linux, vous pouvez avoir besoin de `build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev` si npm échoue).*

### C. Configurer vos variables d'environnement
Copiez le modèle `.env.example` en `.env` (ou `.env.local`) :
```bash
cp .env.example .env
```
Éditez `.env` avec vos identifiants de test :
* `DISCORD_TOKEN` : Le token copié depuis le Developer Portal.
* `CLIENT_ID` : L'Application ID trouvé dans l'onglet *General Information* de votre application Discord.
* `GUILD_ID` : L'identifiant de votre serveur Discord de test (*Clic droit sur le serveur -> Copier l'identifiant du serveur*).
* `ENIGMA_CHANNEL_ID` : L'identifiant d'un salon texte de test pour les énigmes (*Clic droit sur le salon -> Copier l'identifiant du salon*).
* `BOARD_CHANNEL_ID` : L'identifiant d'un salon texte de test pour le plateau.
* `MJ_USER_ID` : Votre propre ID Discord (*Clic droit sur votre profil -> Copier l'identifiant d'utilisateur*) afin d'avoir accès aux commandes `/admin`.

---

## 🚀 4. Déploiement des Commandes & Lancement

### A. Enregistrer les commandes slash auprès de Discord
Cette commande publie les définitions de `/jouer`, `/plateau`, `/stats`, `/admin`, etc. sur votre serveur de test :
```bash
npm run deploy
```

### B. Démarrer le bot localement
```bash
npm start
```
Vous devriez voir les logs de démarrage :
```
[REGISTRY] 2 mode(s) de jeu détecté(s) : ile_defis, mario_party
[BOT] Connecté en tant que EnigmeBot-Dev#0000 !
```

---

## 🧪 5. Exécution des Tests Automatisés

Le projet dispose d'une suite de tests complète (Node.js Test Runner natif) :
```bash
npm test
```
Tous les tests doivent être au vert (`pass`).

---

## 🌿 6. Workflow Git pour Collaborer à 3

1. **Ne jamais commiter directement sur `main`** : la branche `main` est liée au déploiement automatique sur le serveur de production (Lordi) !
2. **Créer une branche par fonctionnalité / bugfix** :
   ```bash
   git checkout -b feat/nom-de-la-feature
   # ou
   git checkout -b fix/nom-du-bug
   ```
3. **Respecter la convention Conventional Commits** :
   - `feat(scope): message` (ex: `feat(shop): ajouter l objet tuyau dore`)
   - `fix(scope): message` (ex: `fix(canvas): corriger l alignement des avatars`)
   - `test(scope): message` (ex: `test(cron): couvrir la transition de 17h`)
4. **Pousser votre branche et ouvrir une Pull Request** :
   ```bash
   git push -u origin feat/nom-de-la-feature
   ```
   Remplissez la checklist du template de PR avant de demander une relecture à l'un de vos pairs.

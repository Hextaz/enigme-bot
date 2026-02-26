# Enigme Bot (Mario Party Discord)

Un bot Discord interactif qui combine des énigmes quotidiennes avec un jeu de plateau style Mario Party. Les joueurs gagnent des pièces en répondant aux énigmes, puis lancent des dés pour se déplacer sur un plateau généré dynamiquement, acheter des objets, déclencher des événements et récolter des Étoiles !

## 🌟 Fonctionnalités (V2)

- **Jeu de plateau dynamique** : Le plateau est généré en image (Canvas) avec les avatars des joueurs.
- **Système de déplacement avancé** : 
  - 1 lancer de dé par jour et par joueur (réinitialisation automatique à 11h00).
  - Mécanique "Passer devant" : Si un joueur passe devant une Étoile ou une Boutique, son déplacement se met en pause pour lui permettre d'interagir, puis il continue d'avancer de ses cases restantes.
- **Événements de cases** :
  - 🟦 Cases Bleues (+3 pièces) / 🟥 Cases Rouges (-3 pièces)
  - 🍀 Chance / 🌩️ Malchance
  - 👻 Boo (Vol de pièces ou d'Étoiles)
  - 🔥 Bowser (Événements catastrophiques)
  - 🎭 Coup du Sort (Échanges de places, de pièces, etc.)
- **Boutique & Inventaire** : Achetez des objets (Champignon, Dé Pipé, Tuyau, Pièges...) et utilisez-les stratégiquement avant de lancer votre dé.
- **Paris du Samedi** : Pas de lancer de dé le samedi, mais un système de paris sur le gagnant de l'énigme du dimanche.
- **Marché Noir du Dimanche** : Des objets exclusifs et surpuissants disponibles une fois par semaine.

## 🛠️ Installation & Configuration

1. **Cloner le dépôt**
   ```bash
   git clone https://github.com/Hextaz/enigme-bot.git
   cd enigme-bot
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configuration (.env)**
   Créez un fichier `.env` à la racine du projet avec les variables suivantes :
   ```env
   DISCORD_TOKEN=votre_token_discord
   CLIENT_ID=votre_client_id
   GUILD_ID=votre_guild_id
   ENIGMA_CHANNEL_ID=id_du_salon_enigmes
   BOARD_CHANNEL_ID=id_du_salon_plateau
   MJ_USER_ID=id_du_maitre_du_jeu
   ```

4. **Déployer les commandes Slash**
   ```bash
   node deploy-commands.js
   ```

5. **Lancer le bot**
   ```bash
   node src/index.js
   ```

## 📜 Commandes Principales

- `/jouer` : Affiche le menu privé pour lancer le dé, voir son inventaire ou voir le plateau.
- `/stats` : Affiche le classement actuel (Étoiles et Pièces).
- `/documentation` : Affiche les règles complètes du jeu.
- `/admin` : Commandes réservées au Maître du Jeu (donner des pièces, forcer un lancer, etc.).

## ⚙️ Technologies Utilisées

- [Discord.js](https://discord.js.org/) (v14)
- [Canvas](https://www.npmjs.com/package/canvas) (Génération d'images)
- [Sequelize](https://sequelize.org/) & SQLite (Base de données)
- [Node-cron](https://www.npmjs.com/package/node-cron) (Tâches planifiées)

# 🧩 Enigme Bot (Mario Party Discord)

[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20%7C%2020%2B-green.svg)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue.svg)](https://discord.js.org/)
[![Database](https://img.shields.io/badge/SQLite-Sequelize-orange.svg)](https://sequelize.org/)
[![Tests](https://img.shields.io/badge/Tests-Passing%20(100%25)-brightgreen.svg)]()

Un bot Discord interactif combinant des **énigmes quotidiennes** avec un **jeu de plateau style Mario Party**. Les joueurs gagnent des pièces en résolvant les énigmes, puis lancent des dés pour progresser sur un plateau généré dynamiquement en image (Canvas), acheter des objets stratégiques, déclencher des événements chaotiques et récolter des Étoiles !

---

## 🌟 Fonctionnalités Clés

- 🎨 **Plateau Dynamique en Temps Réel** : Rendu graphique 2D généré par Node-Canvas avec avatars, pions, pièges et étoiles.
- 🎲 **Système de Déplacement & "Passer Devant"** : 1 lancer par jour (déverrouillé à 21h après l'énigme). Pause automatique en franchissant l'Étoile ou la Boutique de Toad pour permettre l'achat, puis continuation du mouvement restant !
- 🟦 **Cases Interactives & Événements** :
  - 🟦 Cases Bleues (+3 pièces) / 🟥 Cases Rouges (-3 pièces)
  - 🍀 Roulette Chance / 🌩️ Roulette Malchance
  - 👻 Case Boo (Vol de pièces gratuit ou vol d'Étoile pour 50 pièces)
  - 🔥 Case Bowser (Événements catastrophiques et impôts)
  - 🎭 Coup du Sort (Échanges aléatoires de places ou de trésors)
- 🎒 **Boutique & Inventaire** : Champignons (+5), Super Champignons (+10), Dés Pipés, Tuyaux Téléporteurs et Pièges.
- 📅 **Week-End Spéciaux** : Paris du samedi sur l'énigme du dimanche & Marché Noir du dimanche aux objets légendaires.
- 👻 **Gestion de l'Inactivité** : Transformation automatique en fantôme après 3 jours d'inactivité.
- 🧩 **Architecture Multi-Modes** : Support du mode standard Mario Party (`mario_party`) et du mode alternatif Île aux Défis (`ile_defis`).

---

## 📚 Documentation Complète

Pour tout savoir sur le fonctionnement, les règles et le code :

| Document | Description |
| :--- | :--- |
| 🛠️ [**Guide d'Installation Développeur**](docs/SETUP_DEV.md) | Guide pas-à-pas pour configurer son bot de test local et son serveur dédié. |
| 🏗️ [**Architecture Technique**](docs/ARCHITECTURE.md) | Fonctionnement interne, verrous atomiques, modèle de données et Canvas. |
| 🎲 [**Manuel de Gameplay & Règles**](docs/GAMEPLAY.md) | Règles exhaustives, cycles journaliers, économie et probabilités. |
| 🛡️ [**Registre des Cas Limites**](docs/EDGE_CASES.md) | Invariants de sécurité, timeouts Discord 3s et tests de non-régression. |

---

## ⚡ Démarrage Rapide (En 3 Étapes)

### 1. Cloner et installer les dépendances
```bash
git clone git@github.com:Hextaz/enigme-bot.git
cd enigme-bot
npm install
```

### 2. Configurer votre environnement de test
```bash
cp .env.example .env
# Remplissez votre DISCORD_TOKEN, CLIENT_ID, GUILD_ID de test dans .env
```
*(Consultez [docs/SETUP_DEV.md](docs/SETUP_DEV.md) pour créer gratuitement votre bot de dev sur le portail Discord).*

### 3. Déployer les commandes et lancer
```bash
# Déployer les commandes slash sur votre serveur de test
npm run deploy

# Lancer les tests unitaires
npm test

# Démarrer le bot localement
npm start
```

---

## 📜 Commandes Slash Principales

| Commande | Description |
| :--- | :--- |
| `/jouer` | Ouvre l'interface de tour (utiliser un objet, lancer le dé, voir l'inventaire). |
| `/plateau` | Affiche l'image Canvas du plateau avec les positions actuelles des joueurs. |
| `/stats` | Affiche le classement général de la saison (Étoiles et Pièces). |
| `/deviner` | Permet de soumettre une réponse secrète à l'énigme du jour (entre 17h et 21h). |
| `/documentation` | Ouvre le livret de règles interactif directement dans Discord. |
| `/settings` | Permet au joueur de personnaliser son avatar et ses préférences. |
| `/admin` | Outils du Maître du Jeu (don de pièces, avancement de tour, arrêt de saison). |

---

## 🤝 Collaboration & Contribution

Le projet est développé en équipe selon les standards suivants :
- **Git Flow** : Interdiction de commit direct sur `main` (déploiement automatique sur Lordi). Branches de features (`feat/...`, `fix/...`) avec Pull Requests.
- **TDD Strict & Anti-Band-Aids** : Tout ajout de règle ou correction de bug est validé par un test automatisé (`npm test`).
- **Concurrence & Fiabilité** : Verrous `lockUser` / `unlockUser` dans un bloc `finally` et respect impératif du délai Discord de 3 secondes (`deferReply` / `deferUpdate`).

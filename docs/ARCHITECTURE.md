# 🏗️ Architecture Logicielle & Guide Technique — Enigme Bot

Ce document détaille l'architecture globale d'**Enigme Bot**, les choix de conception, les flux de données et les règles d'or d'ingénierie que chaque développeur doit respecter.

---

## 🧭 1. Vue d'Ensemble & Stack Technique

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Discord Gateway & API                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Interactions (Slash / Boutons / Modales)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  src/index.js (Routeur d'Interactions & Gestionnaire d'Erreurs 10062)   │
└─────────┬─────────────────────────┬──────────────────────────┬─────────┘
          │                         │                          │
          ▼                         ▼                          ▼
┌──────────────────┐      ┌──────────────────┐       ┌──────────────────┐
│  src/commands/   │      │   src/game/      │       │ src/gamemodes/   │
│  (Slash Discord) │      │ (Moteur Métier)  │       │ (Modes enfichables)
└─────────┬────────┘      └─────────┬────────┘       └─────────┬────────┘
          │                         │                          │
          └─────────────────────────┼──────────────────────────┘
                                    ▼
┌───────────────────────────────────┴────────────────────────────────────┐
│      Couche Persistance : SQLite via Sequelize (src/db/models.js)       │
│           + Générateur Visuel Canvas (src/utils/canvas.js)             │
└────────────────────────────────────────────────────────────────────────┘
```

### Technologies Clés
* **Discord.js (v14)** : Client WebSocket et manipulation de l'API Discord.
* **Sequelize & SQLite3** : ORM pour la persistance locale (`database.sqlite`).
* **Node-Canvas** : Rendu graphique 2D du plateau de jeu et superposition des avatars joueurs.
* **Node-Cron** : Planificateur de tâches temporelles (crons journaliers, rappels, clôtures d'énigmes).
* **P-Queue** : File d'attente pour séquencer les opérations lourdes de Canvas et limiter la charge CPU.

---

## 📂 2. Arborescence Détaillée

```
src/
├── commands/            # Commandes slash Discord (déclarations + exécution)
│   ├── admin.js         # Commandes MJ (gestion des pièces, lancement forcé, statut)
│   ├── deviner.js       # Réponse à l'énigme du jour
│   ├── documentation.js # Guide interactif des règles in-game
│   ├── jouer.js         # Lancer le dé, ouvrir l'inventaire, déplacer le pion
│   ├── plateau.js       # Afficher l'image du plateau en direct
│   ├── settings.js      # Préférences joueur (avatar, notifications)
│   └── stats.js         # Classement général (étoiles, pièces)
│
├── db/                  # Couche de données Sequelize
│   ├── database.js      # Connexion SQLite locale ou via DATA_DIR
│   └── models.js        # Modèles Joueur, Plateau, TourSnapshot
│
├── game/                # Moteur de règles du jeu
│   ├── board.js         # Structure des cases du plateau et coordonnées Canvas
│   ├── cron.js          # Automatismes (17h énigme, 21h déverrouillage, 15h rappel)
│   ├── endgame.js       # Calcul des podiums et clôture de saison
│   ├── enigma.js        # Cycle de vie des énigmes quotidiennes
│   ├── events.js        # Résolution des effets de cases (Bleue, Rouge, Chance...)
│   ├── health.js        # Auto-healing & battement de cœur Uptime Kuma
│   ├── items.js         # Catalogue et effets des objets (Champignon, Dé Pipé...)
│   ├── shop.js          # Logique d'achat dans la boutique
│   └── transaction.js   # Verrouillage atomique par utilisateur (anti-spam / anti-race)
│
├── gamemodes/           # Architecture extensible multi-modes
│   ├── mode-interface.js# Contrat d'interface abstrait (Lifecycle, Events, Shop, UI)
│   ├── registry.js      # Découverte et registre dynamique des modes
│   ├── mario_party/     # Mode Mario Party standard (étoiles, pièces, boutique)
│   └── ile_defis/       # Mode alternatif défi
│
├── utils/               # Utilitaires & Moteur graphique
│   └── canvas.js        # Génération d'images du plateau avec avatars et effets
│
├── config.js            # Chargement et validation des variables d'environnement
└── index.js             # Point d'entrée de l'application & initialisation Discord
```

---

## 🛡️ 3. Concurrence & Verrous Transactionnels (`src/game/transaction.js`)

Sur Discord, les joueurs peuvent cliquer frénétiquement sur un bouton ou déclencher simultanément plusieurs commandes. Sans protection, cela causerait des doubles lancers de dés, des doubles déductions de pièces ou des corruptions d'inventaire.

### Règle d'or de verrouillage :
Tout flux modifiant l'état d'un joueur DOIT être protégé par `lockUser` et **impérativement relâché dans un bloc `finally`** :

```javascript
const { lockUser, unlockUser } = require('../game/transaction');

if (!lockUser(interaction.user.id)) {
    return interaction.reply({ 
        content: "⏳ Une action est déjà en cours pour toi. Patiente un instant !", 
        ephemeral: true 
    });
}

try {
    // Logique de jeu (déplacement, achat, transaction DB)
    await processPlayerTurn(interaction);
} catch (error) {
    console.error('[ERROR] Échec lors du tour:', error);
} finally {
    // La libération est GARANTIE quoi qu'il arrive
    unlockUser(interaction.user.id);
}
```

*Note : un timeout de sécurité automatique de 120s est prévu dans `transaction.js` au cas où un verrou resterait bloqué par une exception imprévue.*

---

## ⏱️ 4. La Règle des 3 Secondes Discord (Timeouts 10062)

L'API Discord exige un accusé de réception dans un délai strict de **3 000 millisecondes**. Toute opération lourde (génération d'image Canvas, transaction SQLite ou fetch distant) dépassera souvent cette limite.

### Bonnes pratiques :
1. **Accuser réception immédiatement** :
   * Pour une nouvelle commande : `await interaction.deferReply({ ephemeral: true });`
   * Pour un clic de bouton ou un menu : `await interaction.deferUpdate();`
2. **Utiliser ensuite `editReply()` ou `followUp()`** :
   ```javascript
   await interaction.deferReply({ ephemeral: true });
   const imageBuffer = await genererImagePlateau();
   await interaction.editReply({ files: [imageAttachment] });
   ```
3. **Interception du code 10062** :
   Si l'utilisateur a cliqué sur un bouton après une longue période d'inactivité, Discord renvoie l'erreur `10062 Unknown interaction`. Cette erreur est gérée avec élégance dans `src/index.js` sous le tag `[Timeout]` pour ne pas faire crasher le bot.

---

## 🗄️ 5. Persistance & Sequelize (`src/db/models.js`)

Le schéma de données s'articule autour de 3 modèles principaux :

1. **`Joueur`** :
   - `userId` (String, clé primaire)
   - `pieces` (Integer, solde)
   - `etoiles` (Integer, total d'étoiles)
   - `position` (Integer, index de case actuel sur le plateau)
   - `inventaire` (JSON, tableau d'objets possédés, max 3)
   - `pieges_actifs` (JSON, pièges posés sur les cases)
   - `a_le_droit_de_jouer` (Boolean, réinitialisé chaque jour)
   - `jours_inactifs` (Integer, compteur d'inactivité)
   - `est_fantome` (Boolean, joueur inactif pénalisé)
   - `mode_data` (JSON, données spécifiques au mode de jeu actif)

2. **`Plateau`** :
   - `id` (Integer, singleton id=1)
   - `tour` (Integer, numéro du tour courant de la saison)
   - `enigme_status` (String : `waiting_enigme`, `enigme_active`, `season_ended`)
   - `etoile_position` (Integer, case où se trouve l'étoile active)
   - `mode_actif` (String : `mario_party` ou `ile_defis`)

3. **`TourSnapshot`** :
   - Historique tour par tour permettant au MJ de consulter l'évolution de la partie ou d'annuler une action.

> [!IMPORTANT]
> **Piège Sequelize sur les champs JSON** :
> Si vous modifiez un tableau ou un objet contenu dans `joueur.inventaire` sans réassigner la variable, Sequelize ne détecte pas le changement lors de `joueur.save()`. Vous devez appeler explicitement :
> `joueur.changed('inventaire', true);` avant `await joueur.save();`.

---

## 🧩 6. Architecture des Gamemodes (`src/gamemodes/`)

Le bot supporte plusieurs modes de jeu interchangeables grâce au contrat d'interface `ModeInterface` :
* **`mario_party`** : Jeu standard (étoiles, boutique, pièces, Boo, Bowser, paris, marché noir).
* **`ile_defis`** : Mode de défis alternatif avec progression linéaire.

Pour ajouter un mode ou modifier un comportement :
1. Consulter `src/gamemodes/mode-interface.js` pour voir les méthodes requises (`onTurnStart`, `onPassOverCase`, `onLandOnCase`, `getShopCatalog`, `renderBoard`).
2. Implémenter le mode dans `src/gamemodes/<nom_du_mode>/`.
3. Le registre dynamique (`src/gamemodes/registry.js`) détecte automatiquement le nouveau mode au démarrage.

---

## 🎨 7. Rendu Visuel Canvas (`src/utils/canvas.js`)

Le plateau est généré dynamiquement à partir d'un fichier de fond (`assets/plateau.png`) sur lequel le moteur :
1. Charge les avatars des joueurs via leurs URLs Discord.
2. Dessine les pions, badges de pièces/étoiles et positionnements.
3. Superpose l'étoile active et les icônes de pièges.
4. Exportes le résultat sous forme de buffer PNG envoyé comme pièce jointe Discord.

*Pour préserver la mémoire et éviter les fuites, les opérations Canvas sont séquencées par une `p-queue`.*

# 🛡️ Registre des Cas Limites & Invariants — Enigme Bot

Ce document consigne l'ensemble des **cas limites**, **invariants de sécurité** et **règles de résilience** d'Enigme Bot. Tout nouveau cas limite découvert ou corrigé doit être ajouté à ce registre et être couvert par un test de non-régression dans le dossier `test/`.

---

## 🧭 Règle d'Or de l'Ingénierie
> **Un cas limite n'est considéré comme maîtrisé que s'il est validé par un test automatisé exécutable (`npm test`) ou par un garde-fou défensif explicite.**

---

## 1. ⏰ Cycle de Vie, Saisons & Crons (`src/game/cron.js`, `src/game/endgame.js`)

| Identifiant | Domaine / Fonction | Scénario | Comportement Attendu | Test / Implémentation |
| :--- | :--- | :--- | :--- | :--- |
| **CRON-01** | `handle17hTransition` | Transition de 17h en semaine **sans énigme programmée**, saison active (`tour >= 1`) et joueurs actifs présents. | Le plateau reste ouvert. `tour` s'incrémente de 1. Les joueurs non-fantômes (`!j.est_fantome`) regagnent `a_le_droit_de_jouer = true`. Message d'avertissement sans mention de verrouillage. | `test/cron_lifecycle.test.js` |
| **CRON-02** | `handle17hTransition` | Joueur fantôme (`est_fantome: true`) lors d'une transition 17h sans énigme. | Le joueur fantôme conserve `a_le_droit_de_jouer = false` et ne peut pas lancer les dés tant qu'il ne s'est pas réveillé. | `test/cron_lifecycle.test.js` |
| **CRON-03** | `handle17hTransition` | Transition 17h sans énigme programmée alors qu'**aucun joueur** n'est inscrit dans la base (`tousLesJoueurs.length === 0`). | Aucun message ni ping de rôle envoyé sur Discord. Le compteur de tour reste inchangé (`tour` non incrémenté). | `test/season_end.test.js` |
| **CRON-04** | `handle17hTransition` | Transition 17h alors que la saison est en attente de lancement (`tour === 0`) et qu'aucune énigme n'est programmée. | Sortie immédiate (`return`). La saison reste en attente de son lancement officiel par le MJ. | `test/cron_lifecycle.test.js` |
| **CRON-05** | `handle17hTransition` | Transition 17h alors que la saison est terminée (`enigme_status === 'season_ended'`). | Aucun traitement de tour, aucun ping, aucun déverrouillage de plateau. | `test/cron_lifecycle.test.js` |
| **CRON-06** | `endSeason` | Clôture d'une saison (`/admin stop` ou tour 30) déjà clôturée (`season_ended`). | Idempotence : retourne `{ alreadyEnded: true, success: true }` sans envoyer de message en double. | `test/season_end.test.js` |
| **CRON-07** | `endSeason` | Clôture d'une saison alors qu'**aucun joueur** n'a participé (`tousLesJoueurs.length === 0`). | Ne crash pas sur le calcul du podium. Envoie une annonce Discord dédiée indiquant qu'aucun joueur n'a participé et retourne `{ playerCount: 0 }`. | `test/season_end.test.js` |
| **CRON-08** | `applyGhostRules` | Joueur inactif ayant manqué 3 tours consécutifs (`jours_inactifs >= 3`). | Transformé en fantôme (`est_fantome: true`). Annonce envoyée sur le salon du plateau. Personnage bloqué. | `src/game/cron.js` |
| **CRON-09** | `handle15hReminder` | Rappel de 15h (2h avant fin de tour) alors que la saison n'est pas active. | Aucun MP envoyé aux joueurs pour éviter les fausses alertes hors saison. | `test/cron_lifecycle.test.js` |
| **CRON-10** | `handleSaturday10hBets` | Déclenchement des paris du samedi en mode sans boutique / sans course (ex: `ile_defis`). | Sortie immédiate sans ouvrir les paris ni envoyer de message inutile. | `test/cron_lifecycle.test.js` |

---

## 2. 🌐 Fiabilité Discord & Réseau (`src/index.js`, `src/game/cron.js`)

| Identifiant | Composant | Scénario | Comportement Attendu | Test / Implémentation |
| :--- | :--- | :--- | :--- | :--- |
| **DISC-01** | `getChannel` | Salon absent du cache Discord.js local (redémarrage du bot ou mémoire non amorcée). | Tente `await client.channels.fetch(channelId)` avec `.catch(() => null)`. En cas d'échec ou d'absence de la méthode, effectue un fallback gracieux sur `client.channels.cache.get()`. | `test/cron_lifecycle.test.js` |
| **DISC-02** | Interactions Discord | Délai de calcul ou génération Canvas supérieur à 3 secondes. | Appel obligatoire et immédiat de `await interaction.deferReply({ ephemeral: true })` ou `await interaction.deferUpdate()` sous 3000 ms. | `src/commands/` |
| **DISC-03** | Commandes Slash / Boutons | Interaction expirée par Discord (`error.code === 10062` / "Unknown interaction"). | Interception propre dans le gestionnaire global d'erreurs avec log `[Timeout]` dédié, sans faire crasher le process du bot. | `src/index.js` |
| **DISC-04** | Boutons d'interaction | Un joueur clique sur un composant interactif appartenant à un autre joueur. | Rejet immédiat avec message éphémère (`flags: 64` ou `ephemeral: true`) signalant qu'il n'est pas l'auteur de l'action. | `src/index.js` |

---

## 3. 🔒 Concurrence, Transactions & Intégrité (`src/game/transaction.js`)

| Identifiant | Composant | Scénario | Comportement Attendu | Test / Implémentation |
| :--- | :--- | :--- | :--- | :--- |
| **LOCK-01** | `lockUser` / `unlockUser` | Un joueur clique frénétiquement sur un bouton ou lance deux commandes simultanément. | Le second appel est bloqué par `lockUser(userId) === false` et reçoit une réponse éphémère d'attente. | `src/game/transaction.js` |
| **LOCK-02** | `unlockUser` | Une exception survient pendant le tour d'un joueur (ex: erreur DB ou Discord). | Le verrou **DOIT** être libéré dans un bloc `finally` pour ne pas bloquer indéfiniment le joueur. | `src/commands/jouer.js` |
| **LOCK-03** | `lockUser` (Timeout) | Un verrou n'a pas été libéré après 120 secondes. | Expiration automatique du verrou pour éviter la famine de ressources d'un utilisateur. | `src/game/transaction.js` |
| **DB-01** | Sequelize Multi-Entités | Échange de pièces ou vol d'étoile entre deux joueurs (ex: Boo). | Exécution sous transaction atomique `sequelize.transaction(...)` pour garantir la cohérence des deux soldes. | `src/gamemodes/mario_party/events.js` |
| **DB-02** | Champs `DataTypes.JSON` | Modification en place d'un tableau/objet JSON (`inventaire`, `pieges_actifs`). | Appel obligatoire de `joueur.changed('inventaire', true)` avant `joueur.save()` pour forcer la détection de mutation par Sequelize. | `src/game/` |

---

## 4. 🎲 Économie & Plateau de Jeu (`src/game/`, `src/gamemodes/`)

| Identifiant | Composant | Scénario | Comportement Attendu | Test / Implémentation |
| :--- | :--- | :--- | :--- | :--- |
| **ECO-01** | Boutique / Objets | Achat d'un objet avec un solde insuffisant (`joueur.pieces < item.prix`). | Achat refusé, solde intact, aucun objet ajouté à l'inventaire. | `src/gamemodes/mario_party/shop.js` |
| **ECO-02** | Étoile Mario Party | Joueur passant sur la case Étoile avec moins de 20 pièces. | L'étoile lui est proposée mais l'achat est refusé faute de fonds ; le joueur continue son déplacement. | `src/gamemodes/mario_party/events.js` |
| **INV-01** | Inventaire | Joueur tentant d'acheter ou de recevoir un objet avec un inventaire plein (3 objets max). | Achat bloqué ou proposition de jeter un objet existant. | `src/game/items.js` |
| **BOARD-01** | Déplacements | Le joueur effectue un nombre de cases dépassant la dernière case du plateau. | Bouclage correct au début du plateau sans saut de case ni index hors limite. | `src/game/board.js` |

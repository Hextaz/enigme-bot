# 🛡️ Registre des Cas Limites & Invariants — Enigme Bot

Ce document consigne l'ensemble des **cas limites**, **invariants de sécurité** et **règles de résilience** d'Enigme Bot. Tout nouveau cas limite découvert ou corrigé doit être ajouté à ce registre et être couvert par un test de non-régression dans le dossier `test/`.

---

## 🧭 Règle d'Or de l'Ingénierie
> **Un cas limite n'est considéré comme maîtrisé que s'il est validé par un test automatisé exécutable (`npm test`) ou par un garde-fou défensif explicite.**

---

## 1. ⏰ Cycle de Vie, Saisons & Crons (`src/game/cron.ts`, `src/services/season.ts`, `src/game/endgame.ts`)

| Identifiant | Domaine / Fonction | Scénario | Comportement Attendu | Test |
| :--- | :--- | :--- | :--- | :--- |
| **CRON-01** | `handle17hTransition` | 17h en semaine **sans énigme programmée**, saison active et joueurs présents. | Plateau ouvert, `tour + 1`, les non-fantômes regagnent `a_le_droit_de_jouer`. Un seul message, sans mention de verrouillage. | `test/cron_lifecycle.test.js` |
| **CRON-02** | `handle17hTransition` | Joueur fantôme lors d'une transition 17h sans énigme. | Il conserve `a_le_droit_de_jouer = false`. | `test/cron_lifecycle.test.js` |
| **CRON-03** | `handle17hTransition` | 17h sans énigme et **aucun joueur**. | Aucun message, `tour` inchangé. | `test/season_end.test.js` |
| **CRON-04** | `handle17hTransition` | Saison en attente (`tour === 0`) sans énigme programmée. | Rien ne se passe. | `test/cron_lifecycle.test.js` |
| **CRON-05** | `handle17hTransition` | Saison terminée (`season_ended`). | Aucun traitement, aucun message. | `test/cron_lifecycle.test.js` |
| **CRON-06** | `endSeason` | Clôture d'une saison déjà clôturée. | Idempotent : `{ alreadyEnded: true }`, aucune annonce en double. | `test/season_end.test.js`, `test/season_services.test.js` |
| **CRON-07** | `endSeason` | Clôture sans aucun joueur. | Pas de crash ; annonce dédiée ; `playerCount: 0`. | `test/season_end.test.js` |
| **CRON-08** | `applyGhostRules` | Troisième tour consécutif sans jouer. | Le joueur devient fantôme et est annoncé ; les oublieurs du jour sont listés. | `test/season_services.test.js` |
| **CRON-09** | `handle15hReminder` | Rappel de 15h hors saison active. | Aucun MP. | `test/cron_lifecycle.test.js` |
| **CRON-10** | Paris / Marché Noir | Samedi/dimanche en mode sans boutique (`ile_defis`) ou saison terminée. | Rien ne s'ouvre. | `test/cron_lifecycle.test.js` |
| **CRON-11** | `endSeason` | Fin de saison Mario Party. | Étoiles bonus, statut `season_ended`, joueurs bloqués et choix en attente effacés **dans une transaction**, puis annonce. | `test/season_services.test.js` |
| **CRON-12** | `dailyTransition` | Un joueur a vaincu le Dragon sur l'île. | La saison se clôture au 17h suivant (annonce des vainqueurs). | `test/season_services.test.js` |
| **CRON-13** | Marché Noir | Ouverture du dimanche. | Seuls les non-fantômes regagnent le droit de jouer. | `test/season_services.test.js` |
| **BET-01** | Paris du samedi | Redémarrage entre 10h et 21h, double règlement, double pari. | L'ouverture est persistée (`plateau.mode_data.paris_ouverts`) ; un seul pari par joueur ; le règlement est transactionnel et ne paie qu'une fois. | `test/season_services.test.js` |

---

## 2. 🌐 Fiabilité Discord & Réseau (`src/discord/`)

| Identifiant | Composant | Scénario | Comportement Attendu | Test |
| :--- | :--- | :--- | :--- | :--- |
| **DISC-01** | `getChannel` | Salon absent du cache (redémarrage). | `channels.fetch` puis repli sur le cache ; `null` si aucun client. | `test/cron_lifecycle.test.js` |
| **DISC-02** | `handleInteraction` | Traitement de plus de 3 secondes. | Accusé de réception **avant** le handler (`deferUpdate`, `deferReply` éphémère ou public selon la commande) ; sauf interactions ouvrant une modale. | `test/interactions.test.js` |
| **DISC-03** | `handleInteraction` | Interaction expirée (`10062`) ou déjà acquittée (`40060`). | `[TIMEOUT]`, aucun handler métier exécuté. | `test/interactions.test.js` |
| **DISC-04** | `handleInteraction` | Composant d'un autre joueur. | Refus éphémère. | `test/interactions.test.js` |
| **DISC-05** | `handleInteraction` | Non-MJ sur `admin_*`, `reponse_*`, `modal_programmer_enigme`. | Refus éphémère. | `test/interactions.test.js` |
| **DISC-06** | `triggerEnigmaEnd` | Salon énigme indisponible à 21h. | Clôture et droits de jouer validés en base avant l'annonce. | `test/enigma_offline.test.js` |
| **DISC-07** | `handleInteraction` | Règle de jeu refusée (`GameRuleError`). | Message éphémère explicite, aucun `[ERROR]`. | `test/discord_flow.test.js` |
| **DISC-08** | Routeur | `customId` inconnu (ancien bouton supprimé). | Refus explicite « Action non disponible ». | `test/discord_flow.test.js` |
| **DISC-09** | `/plateau` (île) | Navigation par zone après un redémarrage. | Boutons sans état (`plateau_zone_<zone>`) traités par le routeur. | `src/commands/plateau.ts` |

---

## 3. 🔒 Concurrence, Transactions & Intégrité (`src/game/transaction.ts`)

| Identifiant | Composant | Scénario | Comportement Attendu | Test |
| :--- | :--- | :--- | :--- | :--- |
| **LOCK-01** | `withGameLock` (verrou global) | Double clic, deux commandes simultanées, deux joueurs en même temps. | Une seule opération à la fois ; la seconde interaction reçoit `GameBusyError`. | `test/transaction.test.js` |
| **LOCK-02** | `withGameLock` | Exception pendant une action. | Libération dans `finally`. | `test/transaction.test.js` |
| **LOCK-03** | Watchdog | Opération de plus de 50 s. | `[WARN]` seulement, jamais de déverrouillage. | `test/transaction.test.js` |
| **LOCK-04** | `withScheduledLock` | Cron ou timer pendant une action. | Il attend ; un timer n'hérite pas du verrou de l'opération créatrice. | `test/transaction.test.js` |
| **DB-01** | `booSteal` | Échec d'écriture de la cible. | Rollback des deux soldes ; le choix Boo reste en attente. | `test/economy_atomicity.test.js` |
| **DB-02** | `resolveStar` | Échec d'écriture du plateau. | Rollback complet de l'achat. | `test/economy_atomicity.test.js` |
| **DB-03** | `applyLanding` | Échec pendant un effet multi-joueurs. | Rollback de toutes les cibles et des blocs cachés. | `test/landing.test.js` |
| **DB-04** | Champs JSON | Modification d'un tableau/objet JSON. | Toujours réassigner un **nouvel** objet. Muter puis réassigner la même référence n'est pas sauvegardé (bug corrigé : portails, cascade et victoires au Dragon perdus). | `test/ile_turn.test.js` |
| **DB-05** | `migrate` | Base neuve, historique ou incompatible. | Création/adoption idempotente, refus sans modification. | `test/migrations.test.js` |
| **DB-06** | `backupDatabase` | Sauvegarde vers un fichier existant. | Refus d'écraser ; copie vérifiée. | `test/backup.test.js` |
| **DB-07** | `startTurn` | Échec pendant l'atterrissage. | Tout le tour (snapshot, lancer, déplacement, effets) est annulé. | `test/mario_turn.test.js` |
| **SEC-01** | `finishEnigma` & `startTurn` | Fantôme à 21h ou tentant de lancer. | Seuls les non-fantômes sont débloqués ; un fantôme ne peut pas lancer. | `test/ghost_security_and_plateau_defaults.test.js` |
| **DATA-01** | Modèle `Plateau` | Création. | `tour = 0`, `enigme_status = 'season_ended'`. | `test/ghost_security_and_plateau_defaults.test.js` |

---

## 4. ⏸️ Choix en attente & anciens boutons (`action_en_attente`)

| Identifiant | Composant | Scénario | Comportement Attendu | Test |
| :--- | :--- | :--- | :--- | :--- |
| **PEND-01** | Boo | Menu `boo_target_*` réutilisé hors de la case Boo (exploit : vol illimité). | `STALE`, aucun transfert. | `test/mario_turn.test.js` |
| **PEND-02** | Étoile | Bouton d'achat réutilisé après l'achat. | `STALE`. | `test/mario_turn.test.js`, `test/discord_flow.test.js` |
| **PEND-03** | Boutique | Ancien bouton d'achat après avoir quitté la boutique. | `STALE`. | `test/mario_turn.test.js` |
| **PEND-04** | Objets | Bouton `use_<objet>_<index>` dont l'emplacement contient un autre objet (exploit : effet appliqué, autre objet détruit). | `STALE`, inventaire intact. | `test/mario_turn.test.js` |
| **PEND-05** | Dé pipé | Menu de valeur réutilisé après consommation. | Le menu porte l'emplacement ; objet consommé et valeur appliqués ensemble. | `test/mario_turn.test.js` |
| **PEND-06** | Expiration | Timer d'un choix déjà résolu ou remplacé. | Ignoré (jeton différent). | `test/mario_turn.test.js`, `test/ile_turn.test.js` |
| **PEND-07** | Redémarrage | Choix en attente au moment d'un redémarrage. | Timers réarmés ; `/jouer` réaffiche le choix. | `test/discord_flow.test.js` |
| **PEND-08** | Boo | Fin du choix Boo (vol, passage, expiration). | Le déplacement reprend automatiquement (il restait bloqué auparavant). | `test/mario_turn.test.js` |

---

## 5. 🎲 Économie & Plateau Mario Party (`src/gamemodes/mario_party/`)

| Identifiant | Composant | Scénario | Comportement Attendu | Test |
| :--- | :--- | :--- | :--- | :--- |
| **ECO-01** | Boutique | Solde insuffisant. | `FUNDS`, aucune écriture. | `test/economy_rules.test.js` |
| **ECO-02** | Étoile | Moins de 20 pièces, pas de choix d'étoile en attente, saison fermée. | `FUNDS`, `STALE`, `CLOSED`. | `test/economy_rules.test.js` |
| **ECO-03** | Boutique | Objet plus proposé. | `STALE_SHOP`. | `test/shop_rules.test.js` |
| **ECO-04** | Cases rouges / bleues | Solde faible ; tours 26-30. | Jamais négatif ; gains/pertes doublés. | `test/landing.test.js`, `test/mario_turn.test.js` |
| **INV-01** | Inventaire | Achat avec inventaire plein (3 max). | Demande d'un objet à jeter ; un pack sans place suffisante est refusé (`FULL`). | `test/economy_rules.test.js` |
| **INV-02** | Remplacement | Index hors inventaire. | `SLOT`. | `test/shop_rules.test.js` |
| **INV-03** | Clé | Utilisation manuelle d'une Clé. | Refusée (`PASSIVE`) : elle est consommée automatiquement aux zones bonus. | `test/mario_turn.test.js` |
| **BOARD-01** | Déplacement | Intersections, passage devant Étoile/Boutique/Boo, boutique fermée au dernier tour. | Arrêt avant l'intersection ; arrêt sur l'étoile avec les pas restants ; boutique ignorée si `tour >= 30`. | `test/mario_rules.test.js` |
| **BOARD-02** | Direction | Chemin bonus (46, 55) sans Clé ; chemin qui ne part pas de la case. | `NO_KEY`, `DIRECTION` ; la Clé est consommée à l'entrée. | `test/mario_turn.test.js` |
| **BOARD-03** | Dés | Double, triple, pipé, dé limité, champignon. | 2-20, 3-30, valeur exacte, limite à 3 puis bonus ; modificateurs consommés. | `test/mario_rules.test.js` |
| **TURN-01** | Lancer | Pas le droit, fantôme, énigme en cours, samedi, déplacement en cours. | `NOT_ALLOWED`, `GHOST`, `LOCKED`, `SATURDAY`, `IN_PROGRESS`. | `test/mario_turn.test.js` |

---

## 6. 🏝️ Île aux Défis (`src/gamemodes/ile_defis/`)

| Identifiant | Composant | Scénario | Comportement Attendu | Test |
| :--- | :--- | :--- | :--- | :--- |
| **ILE-01** | Dragon | Attaque répétée avec le même bouton (exploit : victoire garantie). | Une attaque par choix en attente (`STALE` ensuite). | `test/ile_turn.test.js` |
| **ILE-02** | Dragon | Lancer de dé sur la case 73 (plantage et tour consommé auparavant). | Nouveau choix « attaquer le Dragon » sans déplacement. | `test/ile_turn.test.js` |
| **ILE-03** | Portail | Portail atteint par le chemin de droite d'une intersection (bouton inopérant auparavant). | La cible du portail est mémorisée dans le choix en attente ; la direction est conservée. | `test/ile_turn.test.js` |
| **ILE-04** | Obstacles partagés | Portail ouvert, cascade désactivée, victoire au Dragon. | Persistés pour tous (DB-04). | `test/ile_turn.test.js` |
| **ILE-05** | Double | Dé standard égal au dé bonus. | Un seul lancer gratuit ; `double_lancer` est recalculé à chaque lancer (il restait vrai auparavant). | `test/ile_turn.test.js` |
| **ILE-06** | Intersection | Mauvais côté (50 %). | Chute à l'eau (case 10 ou 31), fin du tour. | `test/ile_turn.test.js` |
| **ILE-07** | Rocher | Atterrissage sur un Rocher. | Tous les joueurs de la zone, déclencheur compris, reculent de 5. | `test/ile_turn.test.js` |

---

## 7. 🧩 Énigme & Administration (`src/services/enigma.ts`, `src/services/admin.ts`)

| Identifiant | Composant | Scénario | Comportement Attendu | Test |
| :--- | :--- | :--- | :--- | :--- |
| **ENIG-01** | Validation MJ | Double clic sur « Bonne réponse ». | Une seule récompense (`ALREADY`). | `test/enigma_services.test.js` |
| **ENIG-02** | Validation tardive | Validation après 21h d'un joueur ayant déjà joué. | Récompense sans nouveau droit de jouer (un second tour était offert auparavant). | `test/enigma_services.test.js` |
| **ENIG-03** | Programmation | Énigme en cours ou saison terminée. | Refus (`ACTIVE`, `CLOSED`) ; la réponse passe par un champ de la modale (plus de limite de 100 caractères du `customId`). | `test/enigma_services.test.js` |
| **ENIG-04** | `/deviner` | Cooldown 30 min, 3 pièces max par jour, fantôme. | Respectés. | `test/enigma_services.test.js` |
| **ADM-01** | `/admin start` | Nouvelle saison. | Remise à zéro atomique de tous les joueurs, snapshots et champs de saison, `mode_data` compris ; étoile et blocs cachés sur des cases distinctes. | `test/admin_services.test.js` |
| **ADM-02** | `/admin set_position` | Case inexistante sur la map active. | Refus ; un choix en attente est annulé. | `test/admin_services.test.js` |
| **ADM-03** | `/admin annuler_tour` | Annulation du dernier tour. | Restauration atomique joueur, plateau et autres joueurs ; snapshot consommé. | `test/admin_services.test.js` |
| **ADM-04** | `/admin give` objet | Objet hors catalogue ou inventaire plein. | Refus (`ITEM`, `FULL`). | `test/admin_services.test.js` |

# Tests et vérification

`npm run check` exécute typage, lint, compilation et tests. `npm test` reconstruit `dist/` avant chaque exécution : les tests chargent les modules et images réellement livrés. SQLite est forcé en mémoire et `.env` n’est pas chargé. Les sauvegardes de test sont créées dans un dossier temporaire et supprimées à la fin.

| Domaine | Preuve automatisée |
|---|---|
| Règles pures Mario Party : marche, intersections, arrêts, dés, candidats étoile/tuyau | `mario_rules` |
| Tour Mario Party : lancer atomique, refus, étoile, Boo, boutique, direction, expiration, objets | `mario_turn` |
| Île : marche, Dragon, Portail, Cascade, Liane, double, Rocher, expiration | `ile_turn` |
| Rollback Boo et achat d'étoile | `economy_atomicity` |
| Solde insuffisant, inventaire plein, packs, refus d'achat d'étoile | `economy_rules` |
| Ancien bouton boutique, remplacement hors inventaire | `shop_rules` |
| Effets d'atterrissage et rollback multi-joueurs | `landing` |
| Énigme : tranches, double validation, validation tardive, programmation, `/deviner` | `enigma_services`, `enigma_offline` |
| Saison : 17h, fantômes, paris persistés, Marché Noir, fin de saison et Dragon | `season_services`, `cron_lifecycle`, `season_end`, `ghost_security_and_plateau_defaults` |
| Admin : `start` atomique, `set_position`, `annuler_tour`, objets | `admin_services` |
| Frontière Discord : accusé préalable, expiration, propriétaire, MJ | `interactions` |
| Parcours Discord réel avec faux client, `/jouer` et choix en attente, erreurs métier | `discord_flow` |
| Verrou global : refus, imbrication, attente des crons, watchdog | `transaction` |
| Migrations et sauvegarde | `migrations`, `backup` |
| Contrats de modes, graphes, cache d'avatars | `contracts` |
| Point d'entrée compilé, commandes chargées, images | `runtime` |
| Rendu Canvas : JPEG pleine taille, zones de l'île, vue zoomée, taille maximale | `canvas` |
| **Équivalence avec l'ancien JS** (oracles figés de `main`, voir EDGE_CASES §8) : dés, étoile, effets d'atterrissage, déplacements Mario et île, boutique, étoiles bonus | `legacy_parity`, `legacy_landing_parity`, `legacy_walk_parity`, `legacy_island_parity`, `legacy_shop_parity`, `legacy_endgame_parity` |
| Reprise des joueurs arrêtés par l'ancienne version (choix non persistés) | `legacy_restart` |
| Santé SQLite/Discord/Kuma | `health` |
| Persistance de la direction | `direction` |

Ces tests ne démontrent pas une couverture à 100 %. Les textes et composants Discord ne sont vérifiés que sur les parcours principaux (`discord_flow`), avec un faux client. Un test sur un serveur Discord de test reste nécessaire avant chaque livraison importante.

## Discipline

Les fichiers `test/fixtures/legacy-*.js` sont des extraits **copiés tels quels** du code JavaScript de `main` (`a7405ca`), seules leurs dépendances étant injectées. Ils servent d'oracle : ne jamais les modifier pour faire passer un test. Une différence est soit corrigée dans `src/`, soit consignée comme exception dans `docs/EDGE_CASES.md` (§8). Un test d'équivalence doit prouver qu'il sait échouer : altérer temporairement une règle et constater l'échec.

Pour une correction métier : écrire un scénario reproduisant l’état incorrect, constater l’échec, corriger, relancer le scénario puis la suite. Préférer la vraie base SQLite en mémoire aux mocks de modèles ; injecter une erreur (hook `beforeUpdate`) pour prouver le rollback. Les services acceptent `{ random, now }` : injecter l’aléatoire et la date pour vérifier une branche exacte (un test ne doit pas dépendre du jour réel — samedi, dimanche).

La CI exécute `npm ci`, `npm run check`, l’audit des dépendances de production et la construction Docker. Son fichier ne configure pas à lui seul une protection de branche GitHub : activer le contrôle obligatoire `verify` dans les réglages du dépôt.

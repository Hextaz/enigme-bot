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
| Outils du bot de dev : `/dev` réservé (DEV_MODE + MJ), horloge virtuelle, étapes planifiées | `dev_tools` |

Ces tests ne démontrent pas une couverture à 100 %. Les textes et composants Discord ne sont vérifiés que sur les parcours principaux (`discord_flow`), avec un faux client. Un test sur un serveur Discord de test reste nécessaire avant chaque livraison importante.

## Test de bout en bout sur le bot de dev (`/dev`)

À faire avant chaque livraison importante, et après toute modification des crons, de l'énigme, des paris ou du Marché Noir. Installation et référence des commandes `/dev` : [`docs/SETUP_DEV.md` §5](SETUP_DEV.md#-5-tester-en-conditions-réelles-sur-le-bot-de-dev-dev).

**Préparation** : `DEV_MODE=1` dans `.env.local`, `npm run deploy`, puis une base jetable : `DATABASE_STORAGE=/tmp/enigme-e2e.sqlite npm start`. Gardez un œil sur les logs : aucun `[ERROR]`, `[WARN]` ou `[TIMEOUT]` ne doit apparaître.

| # | Action | Résultat attendu |
| :--- | :--- | :--- |
| 1 | `/admin start` → mode, variante, map, confirmation | Annonce de nouvelle saison, étoile placée. |
| 2 | `/jouer`, « Voir le plateau », « Inventaire » | Menu privé, image du plateau avec l'avatar sur la case 1. |
| 3 | `/admin programmer_enigme` (réponse, énigme, 3 indices) | « Énigme programmée avec succès ». `/deviner` répond « pas encore publiée ». |
| 4 | `/dev horloge jour:Lundi heure:17`, puis `/dev etape publication_17h` | Énigme publiée dans le salon énigme (tour 1), plateau verrouillé, oublis listés. `/dev etat` : énigme `active`. |
| 5 | `/dev horloge jour:Lundi heure:18`, puis `/deviner <bonne réponse>` | « +1 pièce de participation », MP de validation au MJ. |
| 6 | MP → « Bonne réponse » | « +7 pièces — tranche 18h-19h » (tranche de l'heure simulée), annonce dans le salon énigme. |
| 7 | `/dev etape indice_1` (puis `indice_2`, `indice_3`) | Indices publiés une seule fois chacun. |
| 8 | `/dev etape cloture_21h` | Réponse et gagnants annoncés, plateau rouvert ; `/dev etat` : énigme `finished`, « peut jouer : oui ». |
| 9 | `/jouer` → « Lancer le dé » | Dé actif (lundi simulé), déplacement annoncé avec l'image du plateau. |
| 10 | `/dev horloge jour:Samedi heure:10`, `/jouer` | Dé désactivé, message du samedi. |
| 11 | `/dev etape ouverture_paris`, bouton « Parier sur … », montant 3 | Annonce des paris avec 5 boutons ; « Tu as parié 3 pièces », solde inchangé (ticket offert). |
| 12 | `/dev etape resultat_paris` | Commentaire de la course, puis gains des gagnants (pot partagé). |
| 13 | `/dev horloge jour:Dimanche heure:11`, `/dev etape marche_noir`, `/jouer` | Annonce du Marché Noir, plateau ouvert (dé actif) ; les boutiques proposent les objets du Marché Noir. |
| 14 | `/dev horloge_reset` | `/dev etat` affiche l'heure « (réelle) ». |

Pour tester à plusieurs (boutons d'un autre joueur, paris concurrents, fantômes), utilisez un second compte Discord membre du serveur de test.

Ne jamais définir `DEV_MODE` en production (voir EDGE_CASES DEV-01).

## Discipline

Les fichiers `test/fixtures/legacy-*.js` sont des extraits **copiés tels quels** du code JavaScript de `main` (`a7405ca`), seules leurs dépendances étant injectées. Ils servent d'oracle : ne jamais les modifier pour faire passer un test. Une différence est soit corrigée dans `src/`, soit consignée comme exception dans `docs/EDGE_CASES.md` (§8). Un test d'équivalence doit prouver qu'il sait échouer : altérer temporairement une règle et constater l'échec.

Pour une correction métier : écrire un scénario reproduisant l’état incorrect, constater l’échec, corriger, relancer le scénario puis la suite. Préférer la vraie base SQLite en mémoire aux mocks de modèles ; injecter une erreur (hook `beforeUpdate`) pour prouver le rollback. Les services acceptent `{ random, now }` : injecter l’aléatoire et la date pour vérifier une branche exacte (un test ne doit pas dépendre du jour réel — samedi, dimanche).

La CI exécute `npm ci`, `npm run check`, l’audit des dépendances de production et la construction Docker. Son fichier ne configure pas à lui seul une protection de branche GitHub : activer le contrôle obligatoire `verify` dans les réglages du dépôt.

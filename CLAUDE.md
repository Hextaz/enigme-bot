# Enigme Bot - Directives pour Claude Code & Antigravity

## 📌 Vue d'ensemble du Projet

**Enigme Bot** est un bot Discord interactif combinant des énigmes quotidiennes avec un jeu de plateau style Mario Party. Les joueurs gagnent des pièces en répondant aux énigmes, puis lancent des dés pour se déplacer sur un plateau généré dynamiquement en image (Canvas), acheter des objets, déclencher des événements et récolter des Étoiles.

### Architecture du Projet
Tout le code applicatif est en **TypeScript strict** (`src/**/*.ts`, compilé dans `dist/`) ; les tests restent en JavaScript. Détails : `docs/ARCHITECTURE.md`.
* **`src/commands/`** : Commandes slash (`/jouer`, `/stats`, `/plateau`, `/deviner`, `/documentation`, `/settings`, `/admin`, et `/dev` réservée au bot de dev) — présentation uniquement.
* **`src/discord/`** : `interaction.ts` (frontière : permissions MJ, propriétaire du composant, accusé de réception, verrou, `GameRuleError` → message éphémère), `router.ts` (routage des `customId`), `admin-interactions.ts`, `channels.ts` (salons, annonces avec image), `pending-timers.ts` (expiration des choix).
* **`src/gamemodes/`** : un dossier par mode (`mario_party/`, `ile_defis/`) avec `mode.ts`, `maps/<map>/board.ts`, `variants/`, et :
  * `rules.ts` (Mario) / `turn.ts#walk` (île) : règles pures (dés, marche case par case) ;
  * `turn.ts` : services transactionnels du tour (lancer, choix en attente, objets, expiration) ;
  * `discord.ts` : boutons, invites et annonces du mode ; `endgame.ts` : fin de saison.
  * `mode-interface.ts` (contrat validé au démarrage) et `registry.ts`.
* **`src/services/`** : `enigma.ts` (programmation, validation, `/deviner`, clôture), `season.ts` (17h, fantômes, paris, Marché Noir), `admin.ts` (start, annuler_tour, ressources).
* **`src/game/`** : `transaction.ts` (verrou global `withGameLock` / `withScheduledLock`), `cron.ts` (planification et annonces), `endgame.ts`, `enigma.ts` (annonce de 21h).
* **`src/db/`** : `database.ts`, `models.ts` (`Joueur`, `Plateau`, `TourSnapshot`), `migrations.ts` (versionnées, **jamais** de `sync({ alter: true })`), `backup.ts`.
* **`src/domain/types.ts`** : types partagés, `GameRuleError`, `PendingAction`, aléatoire injectable (`Random`).
* **`src/utils/`** : `canvas.ts` (rendu du plateau), `clock.ts` (horloge de jeu `gameNow()`, simulable en dev), `time.ts` (heure de Paris), `health.ts` (Uptime Kuma).
* **`docs/`** : `ARCHITECTURE.md`, `DATABASE.md`, `GAMEPLAY.md`, `OPERATIONS.md`, `TESTING.md`, et **`EDGE_CASES.md`** (registre vivant des cas limites).
* **`deploy-commands.ts`** : enregistrement des commandes slash (`npm run deploy`).

---

## 🌐 Configuration propre à chaque instance

Les consignes publiques décrivent l'architecture et les commandes du projet. Les adresses d'administration, inventaires de services, identifiants de projets cloud, chemins locaux et procédures d'exploitation propres au mainteneur restent dans une documentation privée, hors du suivi Git.

- Utiliser uniquement les environnements et services explicitement autorisés pour la tâche. Une URL citée dans une documentation ne donne pas l'autorisation de contacter le service.
- Fournir les paramètres et secrets par l'environnement de l'instance. Ne jamais placer de token dans une URL, un exemple versionné, un log ou un message GitHub.
- Analyser les diagnostics localement par défaut. Avant tout partage de logs, stack traces, dumps ou données de joueurs, retirer les secrets et données personnelles ; ne transmettre que le minimum nécessaire, vers la destination expressément autorisée par l'utilisateur.
- Ne pas déployer ni contacter la production pour une simple tâche de développement. Toute opération de production doit être demandée et vérifiée séparément.

---

## 🥋 Rituel Obligatoire pour Résoudre une Issue

> [!IMPORTANT]
> **Avant de toucher au code pour résoudre une issue, appliquer OBLIGATOIREMENT le Skill de rituel :**
> * **Skill complet** : `.agents/skills/issue-ritual/SKILL.md` (accessible aussi via `.claude/skills/issue-ritual`)
> * **Commande rapide Claude Code** : `/resolve-issue <NUMERO>`

### Le Cycle en 5 Phases Systématiques :
1. **Phase 1 : Cadrage & Contexte Git (`gh issue view <NUMERO>`)** :
   * Vérifier la branche active (`git branch --show-current`), les commits de la branche (`git log main..HEAD --oneline`) et les modifs locales en cours (`git status --short`). Alerter si sur `main`.
   * Lire le ticket complet, cartographier les fichiers cibles et inspecter les modèles réels (`src/db/models.ts`) et `docs/DATABASE.md`.
   * Consulter systématiquement **`docs/EDGE_CASES.md`** pour vérifier les cas limites existants liés au domaine.
2. **Phase 2 : 🛑 RÉCAPITULATIF & PLAN D'IMPLÉMENTATION (Point d'arrêt obligatoire)** :
   * Présenter un récapitulatif clair : État Git, Objectif, Fichiers impactés, Évolution DB éventuelle, Cas limites (délai 3s, verrous, inventaire, et impacts sur `docs/EDGE_CASES.md`) et Stratégie de tests.
   * **STOP** : Attendre la validation explicite de l'utilisateur avant d'écrire la moindre ligne de code.
3. **Phase 3 : Implémentation Rigoureuse & Discipline d'Ingénierie** :
   * Ordre : `1. DB (models.ts + nouvelle migration dans migrations.ts)` ➔ `2. Règles pures & services (src/gamemodes/*/rules.ts, turn.ts, src/services/)` ➔ `3. Couche Discord (src/gamemodes/*/discord.ts, src/commands/, src/discord/)` ➔ `4. Rendu Canvas (src/utils/canvas.ts)` ➔ `5. Tests & Registre Cas Limites`.
   * 🔴 **TDD strict avec Verify RED** : pour tout calcul de règle ou de déplacement, écrire le test d'abord, **constater l'échec terminal pour la raison attendue**, puis implémenter le code minimal pour passer au vert.
   * 🛡️ **Loi d'airain Anti-Symptôme (Anti-Band-Aids)** : interdiction formelle de poser une rustine pour faire taire une exception (`?.` sauvage, `try/catch` vide qui étouffe l'erreur sans rollback). Identifier et corriger la cause racine.
   * 📝 **Gestion du Registre des Cas Limites (`docs/EDGE_CASES.md`)** :
     - **Compléter** : consigner systématiquement tout nouveau cas limite, comportement aux frontières ou correction de bug critique (ex: GAME-01, DISC-01) avec son ID, son comportement attendu et le test de non-régression associé.
     - **Vider / Mettre à jour** : si une règle de jeu change, est refactorée ou devient obsolète (suppression d'une mécanique, refonte de boutique, changement de mode), **purger ou actualiser immédiatement** les entrées obsolètes dans `docs/EDGE_CASES.md` pour éviter toute dette documentaire.
   * ⏱️ **Règles de Fiabilité Discord** :
     - Règle d'or des 3 secondes : assurée par `src/discord/interaction.ts` (accusé de réception avant le handler) ; ne pas la contourner.
     - Verrouillage : toute écriture d'état de jeu hors interaction (cron, timer) passe par `withScheduledLock` ; les écritures liées utilisent `sequelize.transaction`.
     - Réponses privées avec `ephemeral: true`.
4. **Phase 4 : Porte de Vérification (« Evidence Before Claims »)** :
   * Interdiction d'affirmer qu'une tâche est résolue sans **preuve terminale fraîche** :
     - Typage, lint, build et tests : `npm run check`.
5. **Phase 5 : Clôture & Mini-Rapport (PAS D'AUTO-COMMIT)** :
   * `git diff` audité sans console.log résiduels ou fichiers parasites, et **`docs/EDGE_CASES.md` synchronisé**.
   * Interdiction formelle d'exécuter `git commit` automatiquement.
   * Mini-rapport en 5 lignes max et commande de commit suggérée.

---

## 🧐 Code Reviewer Intransigeant (Skill d'Audit Staff Engineer)

Le projet intègre un skill d'audit complet pour évaluer le code avec un niveau d'exigence maximal (Architecture, Fiabilité Discord, Perfs Canvas, Intégrité SQLite, Clean Code, Testabilité) :
* **Skill complet** : `.agents/skills/code-reviewer/SKILL.md` (et `.claude/skills/code-reviewer`)
* **Commande rapide Claude Code** :
  * `/code-review` : Audite le diff de la branche courante.
  * `/code-review --full` : Audite l'architecture globale du bot.
  * `/code-review <chemin/vers/fichier>` : Audite un fichier spécifique.
* **Format de sortie** :
  1. Scorecard tabulaire avec Note Globale /100 et Verdict.
  2. Traque les **Timeouts 10062**, les **Locks orphelins**, les **Band-aids**, et les **Mutations non atomiques**.
  3. Répertoire exhaustif des anomalies classées (`🔴 CRITIQUE`, `🟠 IMPORTANT`, `🟡 MOYEN`, `🟢 FAIBLE`).
  4. Matrice Effort vs Impact et **Prompts prêts à copier-coller** pour les correctifs.

---

## 🧪 Test Auditor (Audit Approfondi de Testabilité & Fiabilité)

Skill d'audit dédié à l'évaluation impitoyable de la testabilité et de la couverture de la logique de jeu (Staff QA / Game Test Architect) :
* **Skill complet** : `.agents/skills/test-auditor/SKILL.md`
* **Commande rapide Claude Code** : `/test-audit [--all | <module> | <fichier_test>]`
* **Piliers d'audit** :
  1. Couverture du moteur de jeu (déplacements, arrêts "Passer devant", objets, Boo, Bowser, paris).
  2. Chasse aux **tests creux** et au mocking abusif de Discord.
  3. Couverture des **cas limites** (soldes négatifs, inventaire plein, boucle de plateau, inactifs).
  4. Déterminisme, isolation SQLite en mémoire et tests de concurrence de locks.
  5. Structure Arrange-Act-Assert (AAA) et lisibilité.
* **Sortie** : Scorecard /100, anomalies classées, prompts prêts à copier pour implémenter les tests manquants.

---

## 🔒 Security Auditor (Audit de Sécurité & Intégrité du Jeu)

Skill d'audit dédié à la sécurité applicative et à la lutte contre la triche (Staff AppSec Engineer) :
* **Skill complet** : `.agents/skills/security-auditor/SKILL.md`
* **Commande rapide Claude Code** : `/security-audit [--full | <commandes> | <game>]`
* **Piliers d'audit** :
  1. **Contrôle d'accès & Commandes MJ** (vérification stricte de `config.mjUserId` et permissions Discord Administrateur).
  2. **Anti-triche & Concurrence** (prévention du double-spending sur les pièces/étoiles, double lancer de dé, verrous).
  3. **Validation entrées & CustomIDs** (vérification que seul le propriétaire légitime peut cliquer sur un bouton).
  4. **Gestion des secrets & Confidentialité** (zéro fuite des réponses d'énigmes ou tokens).
  5. **Résilience & Anti-Crash DoS** (gestion robuste des erreurs 10062, timeouts Canvas, gestion des rejets non interceptés).
* **Sortie** : Scorecard /100, répertoire des vulnérabilités, prompts de remédiation immédiate.

---

## 💡 Issue Crafter (Atelier d'Idéation, Qualification & Cadrage)

Permet de transformer une idée brute de gameplay ou d'administration en spécification "Agent-Ready" après un échange critique, et de la publier sur GitHub :
* **Skill complet** : `.agents/skills/issue-crafter/SKILL.md`
* **Commande rapide Claude Code** : `/create-issue [description ou idée]`
* **Rôle** : Lead Product Manager & Staff Engineer (challenger le besoin, équilibre économique pièces/étoiles, grounding dans le codebase, rédaction de la spec et publication via `gh issue create`).

---

## 🛠️ Commandes & Scripts Essentiels

### 1. Démarrage du Bot
```bash
# Compile (TypeScript -> dist/) puis lance le bot
npm start
```

### 2. Déploiement des Commandes Slash
```bash
# Enregistrer les commandes auprès de Discord (après ajout/modification dans src/commands/)
npm run deploy
```

### 3. Vérification
```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # build puis tests (SQLite en mémoire)
npm run check       # les trois, comme la CI
```

### 4. Base de données
```bash
npm run db:migrate                      # applique les migrations
npm run db:backup -- /chemin/backup.sqlite
```
Voir `docs/OPERATIONS.md` avant toute migration de la base de production.

### 5. Test e2e sur le bot de dev (`/dev`)
```bash
# DEV_MODE=1 dans .env.local (bot de dev uniquement, jamais en prod)
npm run deploy
DATABASE_STORAGE=/tmp/enigme-e2e.sqlite npm start
```
* `/dev etape <publication_17h|indice_1..3|cloture_21h|ouverture_paris|resultat_paris|marche_noir|…>` exécute une étape planifiée tout de suite.
* `/dev horloge <jour> <heure> [minute]` / `/dev horloge_reset` simulent l'heure du jeu ; `/dev etat` résume l'état.
* Référence : `docs/SETUP_DEV.md` §5 ; scénario et résultats attendus : `docs/TESTING.md`.
* Toute nouvelle règle qui dépend de l'heure lit `gameNow()` (`src/utils/clock.ts`) ou un `now` injecté, **jamais** `new Date()` directement : sinon elle échappe à l'horloge simulée.

---

## 📐 Conventions de Code & Règles Non Négociables

### 1. Concurrence & Transactions (`src/game/transaction.ts`)
* Le verrou est **global** (plateau partagé) : une seule opération de jeu à la fois dans le processus. Une seule instance PM2.
* Les interactions Discord sont déjà verrouillées par `src/discord/interaction.ts` ; un handler n'acquiert pas de verrou lui-même.
* Un service ou un cron utilise `withGameLock` / `withScheduledLock`, qui libèrent le verrou dans leur `finally` :
  ```typescript
  return withGameLock(userId, () => sequelize.transaction(async transaction => {
      // relire, valider (GameRuleError), écrire avec { transaction }
  }));
  ```
* Toute décision qui bloque un déplacement est persistée dans `joueurs.action_en_attente` ; un bouton ne doit agir que si le choix en attente correspond (sinon `GameRuleError('STALE')`).
* Une règle refusée lève `GameRuleError(code, message)` : la frontière l'affiche en éphémère sans log `[ERROR]`.
* Les envois Discord se font **après** la validation de la transaction SQL.

### 2. Délai d'Interaction Discord (Règle des 3 secondes)
* L'API Discord exige une réponse ou un accusé de réception sous 3000 ms.
* `src/discord/interaction.ts` accuse réception (`deferUpdate` / `deferReply` éphémère) avant tout handler et gère les erreurs `10062` / `40060`.
* Exception : une interaction qui ouvre une modale doit être déclarée dans `opensModal` (`showModal` est sa réponse initiale).

### 3. Base de Données Sequelize & SQLite
* Les modifications liées entre plusieurs joueurs ou entre inventaire et pièces doivent utiliser `await sequelize.transaction(...)`.
* Pour les champs `DataTypes.JSON` (`inventaire`, `pieges_actifs`, `mode_data`), toujours appeler `joueur.changed('inventaire', true)` si la référence de l'objet est modifiée sur place.

### 4. Journalisation Structurée & Observabilité
* **Horodatage Standardisé PM2 (`time: true`)** :
  * PM2 préfixe automatiquement chaque ligne avec `YYYY-MM-DD HH:mm:ss: ` (configuré via `time: true` dans `ecosystem.config.cjs` ou `--time`).
  * **Interdiction formelle** de concaténer des horodatages manuels (ex: `new Date().toISOString()`) dans les messages de log afin d'éviter les doublons et préserver le tri chronologique.
* **Ségrégation Stderr vs Stdout** :
  * `stdout` (`console.log`) : Flux standard de l'application (`[INTERACTION]`, `[LOCK]`, `[GAME]`, `[CRON]`, `[HEALTH]`, `[REGISTRY]`).
  * `stderr` (`console.error`, `console.warn`) : Avertissements légers (`[WARN]`), timeouts d'interactions Discord (`[TIMEOUT]`), et exceptions (`[ERROR]`).
  * Permet la consultation séparée ou regroupée des flux dans l'environnement autorisé, sans publier les adresses d'administration.
* **Préfixes Normalisés** :
  * `[INTERACTION]` : Déclenchement d'une interaction utilisateur (`[INTERACTION] <userId> - <customId/commandName>`).
  * `[LOCK]` : Acquisition, refus ou libération de verrous transactionnels (`[LOCK] Acquis pour <userId>`).
  * `[GAME]` : Événements métier (déplacements, passage de cases, achat d'objets, étoiles).
  * `[CRON]` : Exécution des automatismes horaires/journaliers (11h distribution, clôture énigme 21h).
  * `[ADMIN]` : Actions exécutées par le MJ ou commandes privilégiées.
  * `[HEALTH]` : État du service ou battements de cœur vers le monitoring configuré pour l'instance.
  * `[WARN]` / `[TIMEOUT]` : Alertes non critiques (ex: interaction Discord 10062 expirée).
  * `[ERROR]` : Erreurs d'exécution et exceptions critiques.
* **Capture des Crashs & Stack Traces (Bus PM2)** :
  * Toujours passer l'objet `Error` en second argument : `console.error('[ERROR] Échec lors de la transaction:', error)` au lieu de le caster en chaîne pour préserver la stack trace complète sur `stderr`.
  * Si un bus PM2 (`pm2.launchBus`) relaie les plantages, vérifier que la destination est autorisée et que les alertes n'exposent ni secrets, ni données de joueurs, ni réponses d'énigmes.
* **Diagnostics volumineux** :
  * Ne jamais dumper de gros objets JSON ou de buffers Canvas dans la console.
  * Conserver les diagnostics localement par défaut. Ne transmettre un extrait qu'après suppression des secrets, données personnelles, solutions d'énigmes et informations privées de partie, vers une destination autorisée.

### 5. Registre Vivant des Cas Limites (`docs/EDGE_CASES.md`)
* Toute modification de code impactant des règles de bordure, des transitions d'états (inactifs, fantômes, fin de saison), des transactions économiques ou des résiliences Discord DOIT maintenir [`docs/EDGE_CASES.md`](docs/EDGE_CASES.md) rigoureusement synchronisé.
* **Obligation d'ajout** : Nouveau cas limite ou correctif = nouvelle entrée avec identifiant clair, comportement attendu et test unitaire associé.
* **Obligation de purge** : Règle dépréciée, supprimée ou modifiée = suppression ou mise à jour immédiate des entrées obsolètes pour éliminer toute dette documentaire.

---

## 🐙 Conventions de Commits & PR

* Appliquer rigoureusement la convention **Conventional Commits** :
  * `feat(scope): description` (Nouvelle fonctionnalité / mécanique de jeu)
  * `fix(scope): description` (Correction de bug / régression)
  * `perf(canvas): description` (Optimisation du rendu graphique)
  * `refactor(scope): description` (Refactoring interne sans changement de comportement)
  * `test(scope): description` (Ajout ou amélioration de tests)
* Scopes recommandés : `gameplay`, `canvas`, `admin`, `shop`, `items`, `cron`, `db`, `bot`.
* Toujours mentionner le numéro de ticket GitHub associé (ex: `#12`).
* **Interdiction formelle d'exécuter `git commit` automatiquement** : l'agent prépare le commit et le propose à l'utilisateur.

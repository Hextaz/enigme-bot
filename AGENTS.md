# Enigme Bot - Directives pour Claude Code & Antigravity

## 📌 Vue d'ensemble du Projet

**Enigme Bot** est un bot Discord interactif combinant des énigmes quotidiennes avec un jeu de plateau style Mario Party. Les joueurs gagnent des pièces en répondant aux énigmes, puis lancent des dés pour se déplacer sur un plateau généré dynamiquement en image (Canvas), acheter des objets, déclencher des événements et récolter des Étoiles.

### Architecture du Projet
* **`src/commands/`** : Commandes slash Discord.js v14 (`/jouer`, `/stats`, `/plateau`, `/deviner`, `/documentation`, `/settings`, `/admin`).
* **`src/game/`** : Cœur du moteur de jeu :
  * `board.js` : Définition des cases, boucles et coordonnées du plateau.
  * `events.js` : Gestion des événements de cases, pauses "Passer devant" et choix de direction.
  * `items.js` & `shop.js` : Catalogue des objets, boutique quotidienne et inventaire.
  * `cron.js` : Automatismes planifiés (11h00 réinitialisation des lancers, paris du samedi, marché noir du dimanche).
  * `transaction.js` : Système de verrouillage atomique (`lockUser`, `unlockUser`) pour éviter les conflits et la triche concurrente.
  * `enigma.js` : Gestion du cycle de vie des énigmes quotidiennes et distribution des récompenses.
* **`src/gamemodes/`** : Architecture extensible de modes de jeu :
  * `mode-interface.js` : Contrat d'interface abstrait pour tout mode de jeu.
  * `registry.js` : Registre central des modes de jeu disponibles.
  * `mario_party/` : Mode de jeu standard Mario Party (cartes, variantes, boutique, événements).
  * `ile_defis/` : Mode alternatif défi.
* **`src/db/`** : Couche de persistance SQLite via Sequelize :
  * `database.js` : Connexion SQLite (local ou via `DATA_DIR`).
  * `models.js` : Modèles `Joueur`, `Plateau`, `TourSnapshot`.
* **`src/utils/canvas.js`** : Moteur de rendu graphique Canvas (génération d'image du plateau, placement des cases et avatars).
* **`deploy-commands.js`** : Script d'enregistrement des commandes slash auprès de l'API Discord.

---

## 🌐 Environnement d'Hébergement & Services Homelab (24/7)

Le bot est hébergé en production sur une **machine dédiée personnelle allumée 24h/24** ("Lordi" / homelab), connectée à un écosystème de services auto-hébergés et Cloud accessibles via **Cloudflare Zero Trust (`lordi-tunnel`)** sous le domaine `*.hextaz.dev`.

### 🖥️ 1. Architecture Multi-Machines

```
 [ PC Portable Ubuntu ]           [ PC Fixe Gamer ]
   💻 Dev nomade & GitOps           🎮 Dev lourd & Gaming
           │                                │
           └──────────────┬─────────────────┘
                          │ (git push)
                          ▼
                    [ GITHUB ]
                          │ (webhook deploy)
                          ▼
            [ LORDI (HP ProBook x360) ]
              🛡️ Serveur Local 24/7 (PM2)
              📺 3ᵉ écran physique (Homepage)
```

| Machine | Système (OS) & Matériel | Rôle dans le setup |
| :--- | :--- | :--- |
| **PC Portable Dev** | **Ubuntu Linux** | **Machine de code nomade** : Développement, tests locaux (`node src/index.js`, `npm test`), commits et `git push`. |
| **PC Fixe** | **Windows / Linux** | **Station fixe & Gaming** : Développement lourd à la maison, gaming, stream. |
| **"Lordi"** | **Windows 11** *(HP ProBook x360, Celeron 1.1 GHz, 4 Go RAM)* | **Serveur de production 24/7 & écran physique** : Fait tourner tous les bots et outils légers avec **PM2** (`pm2-windows-startup`, `pm2-logrotate`), affiche le dashboard Homepage. |

---

### 🌐 2. Cartographie du domaine `hextaz.dev`

Tous les flux externes passent par **Cloudflare Tunnel (`lordi-tunnel`)**, ce qui signifie qu'**aucun port n'est ouvert sur la box internet** (sécurité maximale et HTTPS automatique).

| URL publique | Cible / Hébergement | Type de routage | Description |
| :--- | :--- | :--- | :--- |
| **`hextaz.dev`** / `www.hextaz.dev` | GitHub Pages (`Hextaz.github.io`) | DNS Direct (IPs GitHub) | Portfolio personnel et vitrine dev. |
| **`tournament.hextaz.dev`** | Vercel | CNAME Vercel | Application web frontend TournamentHub (Next.js). |
| **`home.hextaz.dev`** | Lordi ➔ `localhost:3000` | Cloudflare Tunnel + Access PIN | Tableau de bord Homepage (protégé par code email). |
| **`status.hextaz.dev`** | Lordi ➔ `localhost:3001` | Cloudflare Tunnel | Uptime Kuma : Statut 24/7, alertes Discord & anti-AFK Supabase. |
| **`notes.hextaz.dev`** | Lordi ➔ `localhost:5230` | Cloudflare Tunnel | Memos : Notes, TODOs, journal de dev (Go + SQLite). |
| **`bin.hextaz.dev`** | Lordi ➔ `localhost:8082` | Cloudflare Tunnel | MicroBin : Partage de code/fichiers éphémères & QR Code (Rust). |
| **`bot.hextaz.dev`** | Lordi ➔ `localhost:8080` | Cloudflare Tunnel | API Express du bot TournamentHub (pilotée par Vercel). |
| **`deploy.hextaz.dev`** | Lordi ➔ `localhost:8081` | Cloudflare Tunnel | Récepteur GitOps (GitHub Webhooks) + Console de logs `/logs`. |

---

### ⚙️ 3. Processus PM2 sur Lordi

| Service PM2 | Port | Techno | RAM | Rôle |
| :--- | :--- | :--- | :--- | :--- |
| **`enigme-bot`** | - | Node.js / Sequelize | ~35 Mo | **Notre bot Discord d'énigmes** (SQLite local). |
| **`tournament-bot`** | `8080` | Node.js / TS | ~30 Mo | Bot Discord tournois + API Express reliée à Supabase Prod. |
| **`splatoon-bot`** | - | Node.js | ~27 Mo | Bot Discord annonces festivals Splatoon 3. |
| **`uptime-kuma`** | `3001` | Node.js / SQLite | ~125 Mo | Monitoring 24/7, alertes Discord et ping anti-veille Supabase. |
| **`homepage`** | `3000` | Next.js | ~2 Mo | Hub de tuiles tactile affiché sur l'écran du Lordi. |
| **`webhook-receiver`** | `8081` | Node.js pur | ~15 Mo | Reçoit les `git push` pour auto-déployer + sert la page `/logs`. |
| **`memos`** | `5230` | Go (Binaire) | ~50 Mo | Serveur de notes personnel ultra-léger. |
| **`microbin`** | `8082` | Rust (Binaire) | ~10 Mo | Pastebin personnel instantané. |

---

### 🔄 4. Le Cycle de Déploiement GitOps (CD Automatisé)

1. Développer et valider les tests sur le **PC Portable Ubuntu** : `npm test`.
2. Pousser les modifications sur `main` :
   ```bash
   git push origin main
   ```
3. GitHub notifie le webhook `https://deploy.hextaz.dev/webhook`.
4. Le Lordi exécute en toute autonomie : `git pull` ➔ `npm install` ➔ `pm2 restart enigme-bot`.
5. **Suivi des logs en direct** :
   ```
   https://deploy.hextaz.dev/logs?token=<TOKEN_DEPLOY>&app=enigme-bot
   ```

> [!WARNING]
> **Sécurité du Dépôt Public GitHub :**
> Ce dépôt étant public, **le token secret de déploiement ne doit JAMAIS être commité** dans `AGENTS.md`, `README.md` ou tout autre fichier suivi par git.
> Le token réel et l'URL complète sont stockés localement sur la machine de dev dans `.env.local` (ignoré par Git) sous les variables :
> - `DEPLOY_LOGS_TOKEN`
> - `DEPLOY_LOGS_URL`

---

## 🥋 Rituel Obligatoire pour Résoudre une Issue

> [!IMPORTANT]
> **Avant de toucher au code pour résoudre une issue, appliquer OBLIGATOIREMENT le Skill de rituel :**
> * **Skill complet** : `.agents/skills/issue-ritual/SKILL.md` (accessible aussi via `.claude/skills/issue-ritual`)
> * **Commande rapide Claude Code** : `/resolve-issue <NUMERO>`

### Le Cycle en 5 Phases Systématiques :
1. **Phase 1 : Cadrage & Contexte Git (`gh issue view <NUMERO>`)** :
   * Vérifier la branche active (`git branch --show-current`), les commits de la branche (`git log main..HEAD --oneline`) et les modifs locales en cours (`git status --short`). Alerter si sur `main`.
   * Lire le ticket complet, cartographier les fichiers cibles et inspecter les modèles réels (`src/db/models.js`).
2. **Phase 2 : 🛑 RÉCAPITULATIF & PLAN D'IMPLÉMENTATION (Point d'arrêt obligatoire)** :
   * Présenter un récapitulatif clair : État Git, Objectif, Fichiers impactés, Évolution DB éventuelle, Cas limites (délai 3s, verrous, inventaire) et Stratégie de tests.
   * **STOP** : Attendre la validation explicite de l'utilisateur avant d'écrire la moindre ligne de code.
3. **Phase 3 : Implémentation Rigoureuse & Discipline d'Ingénierie** :
   * Ordre : `1. DB (models.js)` ➔ `2. Gamemodes & Règles (src/gamemodes/, src/game/)` ➔ `3. Commandes Discord (src/commands/)` ➔ `4. Rendu Canvas (src/utils/canvas.js)` ➔ `5. Tests`.
   * 🔴 **TDD strict avec Verify RED** : pour tout calcul de règle ou de déplacement, écrire le test d'abord, **constater l'échec terminal pour la raison attendue**, puis implémenter le code minimal pour passer au vert.
   * 🛡️ **Loi d'airain Anti-Symptôme (Anti-Band-Aids)** : interdiction formelle de poser une rustine pour faire taire une exception (`?.` sauvage, `try/catch` vide qui étouffe l'erreur sans rollback). Identifier et corriger la cause racine.
   * ⏱️ **Règles de Fiabilité Discord** :
     - Règle d'or des 3 secondes : `deferReply()` ou `deferUpdate()` systématique sur tout flux long (Canvas, DB).
     - Verrouillage obligatoire : `lockUser()` dans `try` et `unlockUser()` garanti dans `finally`.
     - Réponses privées avec `ephemeral: true`.
4. **Phase 4 : Porte de Vérification (« Evidence Before Claims »)** :
   * Interdiction d'affirmer qu'une tâche est résolue sans **preuve terminale fraîche** :
     - Vérification de la syntaxe : `node -c <fichier>`.
     - Tests unitaires : `npm test`.
5. **Phase 5 : Clôture & Mini-Rapport (PAS D'AUTO-COMMIT)** :
   * `git diff` audité sans console.log résiduels ou fichiers parasites.
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
# Lancer le bot localement
node src/index.js
# Ou via npm
npm start
```

### 2. Déploiement des Commandes Slash
```bash
# Enregistrer les commandes auprès de Discord (après ajout/modification dans src/commands/)
node deploy-commands.js
# Ou via npm
npm run deploy
```

### 3. Vérification de Syntaxe Rapide (Sans Watch)
```bash
# Vérifier la syntaxe d'un fichier sans l'exécuter
node -c src/index.js
node -c src/db/models.js
node -c src/game/events.js
```

### 4. Tests
```bash
npm test
```

---

## 📐 Conventions de Code & Règles Non Négociables

### 1. Concurrence & Transactions (`src/game/transaction.js`)
* Tout flux initié par un joueur manipulant son état de jeu DOIT acquérir le verrou utilisateur.
* Le verrou DOIT obligatoirement être relâché dans un bloc `finally` :
  ```javascript
  if (!lockUser(userId)) {
      return interaction.reply({ content: "Une action est déjà en cours pour toi.", ephemeral: true });
  }
  try {
      // Logique de tour
  } finally {
      unlockUser(userId);
  }
  ```

### 2. Délai d'Interaction Discord (Règle des 3 secondes)
* L'API Discord exige une réponse ou un accusé de réception sous 3000 ms.
* Appeler systématiquement `await interaction.deferReply({ ephemeral: true })` ou `await interaction.deferUpdate()` dès qu'une tâche asynchrone (génération d'image Canvas, transaction SQLite) est entreprise.
* Protéger les blocs de réponse contre l'erreur `10062 Unknown interaction`.

### 3. Base de Données Sequelize & SQLite
* Les modifications liées entre plusieurs joueurs ou entre inventaire et pièces doivent utiliser `await sequelize.transaction(...)`.
* Pour les champs `DataTypes.JSON` (`inventaire`, `pieges_actifs`, `mode_data`), toujours appeler `joueur.changed('inventaire', true)` si la référence de l'objet est modifiée sur place.

### 4. Journalisation Structurée
* Remplacer les `console.log()` vagues par les préfixes de log normalisés du projet :
  * `[ERROR]` : Erreurs d'exécution et exceptions.
  * `[TIMEOUT]` : Interactions Discord ayant expiré (10062).
  * `[LOCK]` : Acquisition, refus et libération de verrous.
  * `[GAME]` : Déplacements, achats, événements de cases, étoiles.
  * `[CRON]` : Exécution des automatismes horaires/journaliers.
  * `[ADMIN]` : Commandes exécutées par le MJ.

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

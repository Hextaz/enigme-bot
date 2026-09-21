---
name: issue-ritual
description: Rituel d'exécution obligatoire pour Claude Code et Antigravity lors de la résolution de toute issue sur Enigme Bot. Comprend le cadrage Git initial, la présentation d'un plan d'implémentation à valider avant de coder, le TDD strict avec Verify RED, la loi d'airain anti-bandaids, les règles de fiabilité Discord (timeouts 3s, verrous transaction.js, messages éphémères), la porte de vérification Evidence Before Claims, et un bilan final sans commit automatique.
---

# 🥋 Rituel de Résolution d'Issue - Enigme Bot

Ce rituel structure le travail de l'agent en **5 phases rigoureuses**. Il impose un **point d'arrêt obligatoire (Gate d'approbation)** après la récolte d'informations pour valider le plan avec l'utilisateur, applique une **discipline d'ingénierie d'élite (TDD, Anti-Band-Aids, Evidence Before Claims)**, et **interdit formellement tout commit automatique**.

---

## 🧭 Vue d'ensemble du Déroulement

```
┌─────────────────────────────────────────┐
│ PHASE 1 : Cadrage & Récolte d'Infos    │ ➜ Git context, gh issue view, DB inspection, game logic
└────────────────────┬────────────────────┘
                     ▼
┌─────────────────────────────────────────┐
│ PHASE 2 : 🛑 RÉCAPITULATIF & PLAN       │ ➜ Présenter le plan et attendre le feu vert explicite !
└────────────────────┬────────────────────┘
                     ▼ (Validation utilisateur)
┌─────────────────────────────────────────┐
│ PHASE 3 : Implémentation & TDD Strict   │ ➜ TDD Verify RED ➜ Anti-Band-Aids ➜ DB ➜ Game ➜ Commands ➜ Canvas
└────────────────────┬────────────────────┘
                     ▼
┌─────────────────────────────────────────┐
│ PHASE 4 : 🧪 Porte de Vérification      │ ➜ Evidence Before Claims : syntaxe node -c, tests, intégrité
└────────────────────┬────────────────────┘
                     ▼
┌─────────────────────────────────────────┐
│ PHASE 5 : Bilan Final (Zéro Auto-Commit)│ ➜ Diff propre, mini-rapport 5 lignes, commande commit prête
└─────────────────────────────────────────┘
```

---

## 📍 PHASE 1 : Cadrage & Collecte d'Informations (Ne jamais coder à l'aveugle)

### 1.1 Contexte Git & État de la Branche (CRUCIAL)
Avant toute analyse, vérifier où l'on se trouve pour ne pas écraser de travail ou polluer l'historique :
```bash
# 1. Quelle est la branche active ?
git branch --show-current

# 2. Quels sont les commits déjà présents sur cette branche par rapport à main ?
git log main..HEAD --oneline

# 3. Y a-t-il des modifications en cours non commitées ?
git status --short
git diff
```
* **Vérifications clés** :
  * Si la branche est `main` ou `master`, alerter l'utilisateur et recommander la création d'une branche dédiée : `git checkout -b feature/issue-<NUMERO>`.
  * Si des commits existent déjà sur la branche (`git log main..HEAD`), en prendre connaissance pour **ne pas réécrire ou réinventer ce qui a déjà été fait**.
  * Si des fichiers sont déjà modifiés/non commités (`git status`), les analyser pour distinguer ce qui relève du ticket en cours d'éventuels résidus d'une autre session.

### 1.2 Lire le ticket complet
```bash
gh issue view <NUMERO> --json number,title,body,labels
```
* Extraire les spécifications fonctionnelles, les fichiers cibles et les critères d'acceptation.
* Identifier la complexité et la priorité (`P0`, `P1`, `P2`).

### 1.3 Inspecter l'état réel du codebase
1. **Recherche de symboles existants** :
   ```bash
   rg "nomDuSymboleOuFonction" src/
   ```
2. **Vérité Base de Données Sequelize (`src/db/models.js`)** :
   * Inspecter les modèles `Joueur`, `Plateau`, `TourSnapshot`.
   * Identifier les colonnes existantes, les types de données et les valeurs par défaut.
3. **Vérité Logique de Jeu (`src/game/` et `src/gamemodes/`)** :
   * Vérifier comment les déplacements, achats et événements interagissent avec le plateau.
   * Vérifier les verrous dans `src/game/transaction.js`.

---

## 🛑 PHASE 2 : Récapitulatif & Validation du Plan (POINT D'ARRÊT OBLIGATOIRE)

> [!IMPORTANT]
> **Ne modifier AUCUN fichier de code avant d'avoir présenté ce récapitulatif et obtenu la confirmation explicite de l'utilisateur.**

L'agent doit produire un bilan clair structuré comme suit :
1. **🌿 Contexte Git** : Branche active, commits déjà existants pris en compte, statut des modifications locales en cours.
2. **🎯 Objectif & Périmètre** : Résumé en 2-3 phrases de ce que le ticket accomplit.
3. **📂 Fichiers impactés** : Liste ordonnée des fichiers à modifier ou créer.
4. **🗄️ Impact Base de Données** : Nouvelles colonnes Sequelize nécessaires (`src/db/models.js`).
5. **⚠️ Cas limites, Concurrence & Fiabilité Discord** :
   - Gestion du timeout de 3 secondes (`deferReply` / `deferUpdate`).
   - Verrouillage via `lockUser` et libération dans un bloc `finally`.
   - Cas limites de gameplay (soldes négatifs impossibles, inventaire plein, joueur fantôme, égalités).
6. **🧪 Stratégie de tests & validation** : Tests unitaires de règles métier et vérifications syntaxiques.
7. **❓ Questions / Arbitrages éventuels** (si ambiguïté subsistante).
8. **Demande explicite** : *"Ce plan te convient-il ? Dois-je commencer l'implémentation ?"*

---

## 💻 PHASE 3 : Implémentation Rigoureuse & Discipline d'Ingénierie

Appliquer les modifications dans l'ordre strict des dépendances du projet :

```
1. src/db/models.js          ➜ Évolution du schéma Joueur / Plateau / TourSnapshot
2. src/gamemodes/            ➜ Règles du mode (ex: mario_party/events.js, items.js)
3. src/game/                 ➜ Moteur de règles générique (events.js, shop.js, cron.js)
4. src/commands/ / index.js  ➜ Commandes Discord et écouteurs d'interaction (boutons/menus)
5. src/utils/canvas.js       ➜ Rendu visuel et génération d'images du plateau
6. Tests                     ➜ Tests de règles et logique métier
```

### 3.0 — Discipline d'Ingénierie & TDD Strict

- **TDD strict pour la logique métier et les calculs de règles** (calcul des cases, effets d'objets, probabilités, paris, cotes) :
  1. *RED* : Écrire le test décrivant le comportement attendu avant le code métier.
  2. *VERIFY RED (Obligatoire)* : Exécuter le test et **constater l'échec pour la raison attendue**. Un test qui passe immédiatement ne prouve rien.
  3. *GREEN* : Écrire le code minimal strict pour satisfaire le test.
  4. *VERIFY GREEN* : Ré-exécuter et vérifier que le test passe au vert.
  5. *REFACTOR* : Factoriser et nettoyer en restant vert.

- **Loi d'Airain Anti-Symptôme (Anti-Band-Aids)** :
  - **Aucune modification de code sans avoir formellement identifié et prouvé la cause racine.**
  - **Interdiction formelle de poser une rustine pour masquer une erreur console ou un crash** :
    - Pas de `try/catch` vide qui étouffe les erreurs en silence sans rollback.
    - Pas de `?.` (optional chaining) sauvage qui camoufle un modèle `Joueur` introuvable en base.
    - Pas de fallback magique (`?? 0` ou `|| []`) masquant une corruption de données.

### 3.1 — Règles de Code & Garde-Fous Techniques Discord.js :

- **Règle d'or du Délai d'Interaction Discord (3 secondes)** :
  - Dès qu'une action implique du Canvas, une transaction DB ou une attente, appeler immédiatement :
    `await interaction.deferReply({ ephemeral: true });` ou `await interaction.deferUpdate();`.
  - Toujours encapsuler dans une gestion d'erreur robuste interceptant le code `10062` (interaction expirée).
- **Règle absolue des Verrous (`src/game/transaction.js`)** :
  ```javascript
  if (!lockUser(userId)) {
      return interaction.reply({ content: "Une action est déjà en cours...", ephemeral: true });
  }
  try {
      // Exécution de l'action de jeu
  } finally {
      unlockUser(userId); // Libération GARANTIE même en cas d'exception
  }
  ```
- **Atomisme des Mutations Multi-Entités** :
  - Utiliser `await sequelize.transaction(async (t) => { ... })` pour toute opération impliquant plusieurs modifications critiques (déduction pièces + ajout objet, vol d'étoile entre 2 joueurs).
- **Respect des Permissions Administrateur** :
  - Vérifier systématiquement `interaction.user.id === config.mjUserId` ou les permissions Discord administrateur pour toute action privilégiée.

---

## 🧪 PHASE 4 : Porte de Vérification (« Evidence Before Claims »)

> [!CAUTION]
> **Interdiction formelle d'affirmer qu'une tâche est terminée, qu'un bug est résolu ou que le code fonctionne sans en apporter la preuve terminale fraîche.**

Exécuter et afficher les résultats des vérifications :

```bash
# 1. Vérification de la syntaxe de tous les fichiers modifiés (0 erreur tolérée)
node -c src/db/models.js
node -c src/game/...
node -c src/commands/...

# 2. Exécution des tests unitaires si configurés
npm test
```

Si une commande échoue, corriger immédiatement à la racine avant de continuer.

---

## 📦 PHASE 5 : Bilan Final & Clôture (PAS D'AUTO-COMMIT)

> [!CAUTION]
> **Interdiction formelle d'exécuter `git commit` automatiquement.**
> Le commit appartient à l'utilisateur. L'agent prépare le terrain, audite la propreté du diff, et fournit la commande de commit prête à copier.

### 5.1 Audit de propreté du Diff
```bash
git status
git diff
```
* **Nettoyage strict** : Aucun `console.log("DEBUG", ...)` résiduel, aucun fichier temporaire, aucun code mort.

### 5.2 Mini-Rapport de Clôture (5 lignes max)
Terminer systématiquement par un rapport dense et percutant :
1. **Fichiers modifiés** : Liste synthétique des fichiers code et schémas touchés.
2. **Preuves terminales validées** : Syntaxe `node -c` (Succès), tests unitaires (Succès).
3. **Cas limites vérifiés** : Verrous libérés en `finally`, soldes insuffisants gérés, timeouts 3s sécurisés.
4. **Test local & Déploiement Homelab** : Instructions pour démarrer le bot (`node src/index.js` ou `npm start`), surveillance du statut sur Uptime Kuma (`https://status.hextaz.dev`).
5. **Commande de commit suggérée** :
   ```bash
   git add <fichiers concernés>
   git commit -m "<type>(<scope>): <description claire> (#<NUMERO>)"
   git push origin main # Déclenche automatiquement le déploiement sur Lordi via deploy.hextaz.dev
   ```

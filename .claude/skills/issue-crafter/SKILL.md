---
name: issue-crafter
description: Skill d'interview interactive et de cadrage de tickets pour Enigme Bot (Lead Product Manager & Staff Engineer). Dialogue avec l'utilisateur pour challenger le besoin d'un nouveau mécanisme de jeu, d'une commande ou d'une correction, vérifier l'architecture (DB, gamemodes, canvas, transactions), traquer les doublons, et rédiger une spécification Agent-Ready complète publiable via gh issue create.
---

# 💡 Skill Issue Crafter - Enigme Bot

Ce skill transforme n'importe quelle idée brute (nouveau mode de jeu, mini-jeu de plateau, objet de boutique, commande MJ, amélioration d'interface Canvas) en une **spécification technique de niveau Staff Engineer ("Agent-Ready")**, prête à être implémentée ou publiée sur GitHub.

---

## 🎭 Posture : Lead Product Manager & Staff Engineer

Claude ne doit **pas** être un simple secrétaire qui prend des notes passives. Il doit **challenger l'idée avec bienveillance et rigueur** :
1. **Tester la valeur ludique & l'équilibre du jeu** : Cet ajout enrichit-il l'expérience Mario Party sur Discord sans casser l'équilibre économique (pièces/étoiles) ? Pour quel persona :
   - **Joueur** (plaisir de jeu, clarté des règles, fluidité mobile, temps de réponse) ?
   - **Maître du Jeu (MJ)** (facilité d'animation, commandes d'arbitrage `/admin`, équilibrage des gains) ?
   - **Développeur** (modularité des modes de jeu, maintenabilité, performance Canvas, résilience Discord) ?
2. **Éviter la dispersion & les doublons** : Le besoin n'est-il pas déjà couvert ou amorcé dans un ticket ou fichier existant ?
3. **Cadrer le MVP vs Nice-to-Have** : L'idée est-elle trop vaste ? Faut-il la découper en étapes (ex: logique de jeu d'abord, rendu visuel Canvas ensuite) ?
4. **Respecter l'arbre de dépendances** : Cette feature nécessite-t-elle de faire évoluer le modèle Sequelize (`Joueur`, `Plateau`, `TourSnapshot`) ?

---

## 🧭 Le Processus en 5 Phases

```
┌─────────────────────────────────────────────────────────┐
│ PHASE 1 : 🎙️ Interview & Challenge Produit              │ ➜ Questionner, challenger, chercher doublons
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│ PHASE 2 : 🔍 Grounding Technique dans le Codebase       │ ➜ DB models, Gamemodes, Game logic, Canvas, Commands
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│ PHASE 3 : 📝 Rédaction Haute Définition ("Agent-Ready") │ ➜ Spécification complète + Triage proposé
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│ PHASE 4 : 🛑 Validation & Accord Utilisateur (Point Stop)│ ➜ Revue du brouillon avant publication
└────────────────────────────┬────────────────────────────┘
                             ▼ (Accord utilisateur)
┌─────────────────────────────────────────────────────────┐
│ PHASE 5 : 🚀 Publication GitHub CLI (`gh`)              │ ➜ gh issue create avec labels et priorité
└─────────────────────────────────────────────────────────┘
```

---

## 🎙️ PHASE 1 : Interview & Challenge Produit

Quand l'utilisateur exprime une idée (ex: *"j'aimerais ajouter un nouvel objet qui vole des pièces"* ou *"on devrait pouvoir annuler le dernier tour en tant que MJ"*), Claude mène un échange constructif :

### 1. Recherche de doublons ou recoupements
```bash
gh issue list --state all --search "<mots-clés>" --limit 20
```
* Si un ticket similaire existe déjà : alerter immédiatement l'utilisateur et proposer d'enrichir le ticket existant plutôt que d'en créer un nouveau.

### 2. Le Questionnement Constructif (2 à 3 questions max, précises)
Poser des questions pertinentes pour cerner le périmètre :
* **Persona & Cas d'usage** : Qui déclenche l'action ? À quel moment de la boucle de jeu (avant de lancer le dé, en passant devant une case, pendant le tour MJ) ?
* **Équilibre & Règles** : Quel est le coût en pièces ? Quel est le taux d'apparition dans la boutique ? Que se passe-t-il si la cible a 0 pièce ou 0 étoile ?
* **Périmètre & MVP** : Quelle est la version minimale viable indispensable pour tester la mécanique ?

---

## 🔍 PHASE 2 : Grounding Technique dans le Codebase

Avant de formaliser la spec, Claude inspecte le code réel pour ancrer le ticket dans la réalité technique d'Enigme Bot :

1. **Base de données Sequelize (`src/db/models.js`)** :
   - Faut-il ajouter un champ dans `Joueur` (ex: nouvel effet actif, statistiques), `Plateau` (nouvel état de jeu) ou `TourSnapshot` ?
   - Quel type de données Sequelize (`DataTypes.INTEGER`, `DataTypes.BOOLEAN`, `DataTypes.JSON`) ?
2. **Modes de Jeu (`src/gamemodes/`)** :
   - La mécanique est-elle spécifique au mode `mario_party` (`src/gamemodes/mario_party/`) ou générique via l'interface (`src/gamemodes/mode-interface.js`) ?
3. **Moteur de Jeu (`src/game/`)** :
   - Quel module portera la logique : `events.js` (cases et déplacements), `items.js` (objets), `shop.js` (boutique), `cron.js` (automatismes 11h/week-end), `transaction.js` (verrous) ?
4. **Commandes & Interactions Discord (`src/commands/`, `src/index.js`)** :
   - Nouvelle commande slash ou sous-commande `/admin` ?
   - Nouveaux boutons avec customId (`boutique_buy_*`, `use_item_*`, etc.) ?
5. **Rendu Visuel Canvas (`src/utils/canvas.js`)** :
   - Un affichage sur le plateau ou une carte visuelle est-elle requise ?
   - Quelles dimensions, assets et animations d'icônes sont nécessaires ?
6. **Synergies Homelab & Services 24/7 (`*.hextaz.dev`)** :
   - La feature peut-elle s'appuyer sur l'écosystème de la machine hôte 24/7 ?
     - **Uptime Kuma** (`status.hextaz.dev`) : surveillance de santé ou heartbeat.
     - **MicroBin** (`bin.hextaz.dev`) : export de logs, rapports d'erreurs ou dumps de tour/partie.
     - **Memos** (`notes.hextaz.dev`) : alimentation de la banque d'énigmes via API REST.
     - **Cloudflare Tunnel** (`*.hextaz.dev`) : exposition d'une interface web légère ou de webhooks sécurisés.

---

## 📝 PHASE 3 : Rédaction Haute Définition ("Agent-Ready")

Rédiger le corps du ticket selon le standard d'excellence d'Enigme Bot :

```markdown
## 📌 Contexte & Problème
Description claire du besoin de gameplay, du problème constaté ou de la dette technique. Pourquoi ce changement est nécessaire.

## 🎯 Spécifications Fonctionnelles
- **User Story** : En tant que [Joueur / Maître du Jeu / Admin], je veux [Action] afin de [Bénéfice de gameplay].
- **Parcours joueur / Déroulement** : Description pas à pas du flux d'interaction (boutons, messages éphémères, annonces publiques).

## 🛠️ Spécifications Techniques
- **Base de Données (src/db/models.js)** : Colonnes à ajouter ou modifier sur Joueur / Plateau / TourSnapshot.
- **Logique Métier (src/game/ ou src/gamemodes/)** : Algorithme, gestion des états, coût, probabilités.
- **Interactions Discord (src/commands/ ou src/index.js)** : Commandes slash, boutons, modales, `ephemeral: true`.
- **Rendu Visuel (src/utils/canvas.js)** : Dessin de nouvelles cases, icônes d'objets, intégration des avatars.

## 📂 Fichiers Cibles Identifiés
- `src/db/models.js`
- `src/game/...`
- `src/gamemodes/...`
- `src/commands/...`
- `src/utils/canvas.js`

## ⚠️ Cas Limites, Concurrence & Sécurité
- **Délai Discord 3s** : `deferReply()` ou `deferUpdate()` nécessaire ?
- **Verrous & Concurrence** : Protection par `lockUser()` / `unlockUser()` requise ?
- **Cas limites de gameplay** : Solde insuffisant, inventaire plein (3 objets max), joueur inactif/fantôme, passages répétés sur la case.
- **Sécurité** : Si commande d'administration, vérification stricte du `MJ_USER_ID` et permissions Discord.

## ✅ Critères d'Acceptation (Definition of Done)
- [ ] La mécanique fonctionne comme décrit sans erreur d'interaction Discord (zéro code 10062)
- [ ] Les verrous utilisateur sont acquis et libérés systématiquement dans un bloc finally
- [ ] Les modifications en base de données sont persistées correctement et rollbackées en cas d'erreur
- [ ] Le rendu visuel Canvas s'adapte sans fuite mémoire
- [ ] Les cas limites (solde nul, inventaire plein) sont gérés avec des messages clairs
```

### Métadonnées & Triage proposés :
* **Titre standardisé** : `feat(scope): <description courte>` ou `fix(...)` / `refactor(...)`
  - Scopes recommandés : `gameplay`, `canvas`, `admin`, `shop`, `items`, `cron`, `db`, `bot`.
* **Labels** : ex: `enhancement`, `bug`, `gameplay`, `canvas`, `admin`, `p0`, `p1`, `p2`.
* **Priorité** :
  - `P0` : Critique (blocage de tour, faille d'interaction 10062, perte de données/pièces, crash bot).
  - `P1` : Gameplay Cœur (nouvel événement de case, équilibrage boutique, mécanique d'étoile).
  - `P2` : Polissage & Confort (améliorations Canvas, messages d'aide, statistiques).
* **Taille** : `XS` (1h), `S` (demi-journée), `M` (1-2 jours), `L` (3-4 jours).

---

## 🛑 PHASE 4 : Validation & Accord Utilisateur (Point d'arrêt obligatoire)

> [!IMPORTANT]
> **Ne JAMAIS exécuter `gh issue create` sans avoir présenté le brouillon complet et obtenu la validation explicite de l'utilisateur.**

Claude affiche le brouillon complet dans la conversation avec le cadrage proposé (Priorité, Taille, Labels) et demande :
> *"Voici la spécification complète proposée pour ce ticket. Les spécifications, la priorité (**P...**) et la taille (**...**) te conviennent-elles, ou souhaites-tu ajuster certains points avant publication ?"*

---

## 🚀 PHASE 5 : Publication GitHub CLI

Dès que l'utilisateur valide :

### 1. Création de l'issue GitHub
```bash
gh issue create \
  --title "feat(scope): Description claire" \
  --body "Contenu markdown rédigé en Phase 3" \
  --label "enhancement,gameplay"
```
*(Capturer l'URL et le numéro de l'issue retournée, ex: `https://github.com/Hextaz/enigme-bot/issues/12`)*

### 2. Restitution Finale pour l'Utilisateur
Fournir un récapitulatif clair :
* 🔗 Lien direct vers l'issue créée (`#<NUMERO>`)
* 📋 Synthèse du cadrage (Priorité, Périmètre, Fichiers touchés)
* 💡 Commande suggérée pour la résoudre avec le rituel d'ingénierie :
  `/resolve-issue <NUMERO>`

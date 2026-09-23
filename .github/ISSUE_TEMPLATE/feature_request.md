---
name: "🚀 Nouvelle Fonctionnalité / Règle de Jeu"
about: "Proposer un nouvel objet, événement de plateau, commande MJ ou amélioration de gameplay (Format Agent-Ready)"
title: "feat(scope): Description courte"
labels: ["enhancement"]
assignees: ""
---

## 📌 Contexte & Problème
<!-- Description claire du besoin de gameplay, du problème constaté ou de l'opportunité. Pourquoi ce changement est-il nécessaire ? -->

## 🎯 Spécifications Fonctionnelles
- **User Story** : En tant que [Joueur / Maître du Jeu / Développeur], je veux [action] afin de [bénéfice de gameplay].
- **Parcours joueur / Déroulement** :
  1. Le joueur déclenche...
  2. Le bot répond par...
  3. L'effet appliqué est...

## 🛠️ Spécifications Techniques (Grounding Codebase)
- **Base de Données (`src/db/models.js`)** : <!-- Colonnes Sequelize à ajouter/modifier sur Joueur, Plateau ou TourSnapshot -->
- **Logique Métier (`src/game/` ou `src/gamemodes/`)** : <!-- Algorithme, probabilités, coût en pièces, effets -->
- **Interactions Discord (`src/commands/` ou `src/index.js`)** : <!-- Commandes slash, customId des boutons, modales, flags ephemeral -->
- **Rendu Visuel (`src/utils/canvas.js`)** : <!-- Nouvelles icônes, coordonnées, impact sur l'image du plateau -->

## 📂 Fichiers Cibles Identifiés
- `src/db/models.js`
- `src/game/...`
- `src/gamemodes/...`
- `src/commands/...`
- `src/utils/canvas.js`

## ⚠️ Cas Limites, Concurrence & Sécurité
- **Délai Discord 3s** : `deferReply()` ou `deferUpdate()` requis ?
- **Verrous & Concurrence** : Protection par `lockUser()` / `unlockUser()` requise ?
- **Cas limites de gameplay** : Solde insuffisant, inventaire plein (3 objets max), joueur inactif/fantôme, passages répétés sur la case.
- **Sécurité** : Si commande d'administration, vérification stricte du `MJ_USER_ID` et permissions Discord.

## ✅ Critères d'Acceptation (Definition of Done)
- [ ] La mécanique fonctionne comme décrit sans erreur d'interaction Discord (zéro code 10062)
- [ ] Les verrous utilisateur sont acquis et libérés systématiquement dans un bloc `finally`
- [ ] Les modifications en base de données sont persistées correctement et rollbackées en cas d'erreur
- [ ] Le cas limite est consigné dans `docs/EDGE_CASES.md` et validé par un test automatisé (`npm test`)

---

### Triage Proposé :
* **Priorité** : [P0: Critique | P1: Gameplay Cœur | P2: Polissage]
* **Taille estimée** : [XS (< 1h) | S (demi-journée) | M (1-2 jours) | L (3-4 jours)]

## 📌 Contexte & Description des Changements
<!-- Résume clairement ce que cette PR apporte ou corrige. Mentionne le ticket lié. -->
Fixes #(numéro de l'issue)

## 🏷️ Type de Changement
- [ ] 🚀 `feat`: Nouvelle fonctionnalité / règle de jeu
- [ ] 🐛 `fix`: Correction de bug / régression
- [ ] ⚡ `perf`: Optimisation (Canvas, requêtes DB, mémoire)
- [ ] ♻️ `refactor`: Refactoring sans changement de comportement
- [ ] 🧪 `test`: Ajout ou amélioration de tests automatisés
- [ ] 📝 `docs`: Documentation (`docs/`, `README.md`)

---

## 🧪 Porte de Vérification (« Evidence Before Claims »)
<!-- Remplir avec les preuves d'exécution terminale réelles -->
- [ ] **Vérification complète** : `npm run check` (typecheck, lint, tests) passé au vert.
  *(Copier ci-dessous la ligne de résumé des tests)*
  ```
  ℹ tests ... | ℹ pass ... | ℹ fail 0
  ```
- [ ] **Commandes slash** : si `src/commands/` a changé, `npm run deploy` prévu après le déploiement.
- [ ] **Migration DB** : si `src/db/migrations.ts` a changé, nouvelle migration versionnée (jamais `sync({ alter: true })`) et backup prévu avant déploiement (`docs/OPERATIONS.md`).

---

## 🛡️ Checklist des Garde-Fous Techniques & Cas Limites
<!-- Tous les éléments ci-dessous doivent être vérifiés avant validation de la PR -->
- [ ] **Anti-Fuite de Secrets** : Aucun token Discord, webhook ou credential dans le diff.
- [ ] **Règle des 3 Secondes Discord** : l'accusé de réception reste centralisé dans `src/discord/interaction.ts` ; toute interaction qui ouvre une modale est déclarée dans `opensModal`.
- [ ] **Verrous Transactionnels** : les handlers d'interaction n'acquièrent pas de verrou eux-mêmes ; services, crons et timers passent par `withGameLock` / `withScheduledLock` (`src/game/transaction.ts`).
- [ ] **Transactions Sequelize** : Toute opération modifiant plusieurs soldes/joueurs utilise `await sequelize.transaction(...)`, et les envois Discord ont lieu après la validation de la transaction.
- [ ] **Choix en attente** : toute décision qui bloque un déplacement est persistée dans `action_en_attente` ; un bouton périmé lève `GameRuleError('STALE')`.
- [ ] **Champs JSON Sequelize** : Tout tableau/objet muté sur place (`inventaire`, `pieges_actifs`, `mode_data`) est précédé de `joueur.changed('...', true)` avant `.save()`.
- [ ] **Horloge de jeu** : toute règle dépendant de l'heure lit `gameNow()` ou un `now` injecté, jamais `new Date()`.
- [ ] **Anti-Band-Aids** : Aucune rustine pour masquer un crash (`try/catch` vide sans rollback, `?.` sauvage sur une entité requise).
- [ ] **Registre des Cas Limites** : [docs/EDGE_CASES.md](docs/EDGE_CASES.md) a été synchronisé (nouveau cas documenté ou cas obsolète purgé).

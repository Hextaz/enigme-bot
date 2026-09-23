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
- [ ] **Vérification syntaxique** : `node -c <fichiers modifiés>` passé sans erreur.
- [ ] **Tests unitaires exécutés** : `npm test` passé au vert.
  *(Copier ci-dessous la ligne de résumé des tests)*
  ```
  ℹ tests ... | ℹ pass ... | ℹ fail 0
  ```

---

## 🛡️ Checklist des Garde-Fous Techniques & Cas Limites
<!-- Tous les éléments ci-dessous doivent être vérifiés avant validation de la PR -->
- [ ] **Anti-Fuite de Secrets** : Aucun token Discord, webhook ou credential dans le diff.
- [ ] **Règle des 3 Secondes Discord** : `deferReply({ ephemeral: true })` ou `deferUpdate()` appelé immédiatement pour tout traitement asynchrone (Canvas, DB).
- [ ] **Verrous Transactionnels** : `lockUser(userId)` acquis et **systématiquement relâché dans un bloc `finally`** via `unlockUser(userId)`.
- [ ] **Transactions Sequelize** : Toute opération modifiant plusieurs soldes/joueurs utilise `await sequelize.transaction(...)`.
- [ ] **Champs JSON Sequelize** : Tout tableau/objet muté sur place (`inventaire`, `pieges_actifs`) est précédé de `joueur.changed('...', true)` avant `.save()`.
- [ ] **Anti-Band-Aids** : Aucune rustine pour masquer un crash (`try/catch` vide sans rollback, `?.` sauvage sur une entité requise).
- [ ] **Registre des Cas Limites** : [docs/EDGE_CASES.md](docs/EDGE_CASES.md) a été synchronisé (nouveau cas documenté ou cas obsolète purgé).

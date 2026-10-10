# 📌 Note Technique : Synchronisation GitHub Projects v2 & CLI / API

Ce document répertorie un comportement documenté et des cas limites liés à l'API GraphQL de **GitHub Projects v2** (Memex) et à la CLI `gh`.

---

## ⚠️ 1. Décalage d'Indexation (Elasticsearch / Memex) sur `ProjectsV2`

### Symptôme
Lorsqu'une issue est ajoutée à un projet GitHub Projects v2 via :
* La CLI : `gh project item-add <NUM> --url <ISSUE_URL>`
* La mutation GraphQL : `addProjectV2ItemById(input: { projectId, contentId })`

L'API répond avec succès et retourne un ID de nœud valide (`PVTI_...`).
* **Côté Issue** : Le badge de projet et le champ `Status` (ex: `Backlog`) apparaissent immédiatement sur la page de l'issue (`https://github.com/<owner>/<repo>/issues/<num>`).
* **Côté Board / Tableau du Projet** : L'item peut ne pas apparaître immédiatement dans la vue Kanban et `project.items.totalCount` peut ne pas s'incrémenter instantanément.

### Cause Technique Racine
GitHub Projects v2 s'appuie sur un moteur d'indexation asynchrone (Elasticsearch) distinct du graphe relationnel direct. Il existe une latence d'indexation connue entre l'écriture dans la base relationnelle et la réplication vers l'index de recherche du tableau. De plus, selon les discussions de la communauté GitHub (ex: issues #188487, #188492), les projets avec des workflows automatiques activés peuvent subir des lenteurs de synchronisation de la vue de recherche.

### Solutions & Contournements
1. **Liaison explicite lors de la création** : Utiliser `--project "<TITRE_PROJET>"` directement dans `gh issue create` (ex: `gh issue create --project "Enigme Bot - Roadmap"`).
2. **Ajout rapide via l'interface Web** : Si l'issue tarde à s'afficher dans la colonne du tableau, cliquer sur `+ Add item` en bas de la colonne et taper `#<NUMERO>` pour forcer l'indexation immédiate.

---

## 🔍 2. Troncation des Titres avec `gh issue list`

Par défaut, la commande `gh issue list` tronque les titres à ~30 caractères dans le terminal.
Pour éviter de créer des doublons d'issues existantes, toujours inspecter avec :
```bash
gh issue list --state all --json number,title,labels --limit 50
```
ou
```bash
gh issue view <NUMERO>
```

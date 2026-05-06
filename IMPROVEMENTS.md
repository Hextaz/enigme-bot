# Améliorations de la gestion des erreurs d'interaction Discord

## Date: 2026-05-06

## Problèmes identifiés

### 1. Erreur "Unknown interaction" (10062)
- **Cause**: Les interactions Discord expirent après 3 secondes si aucune réponse n'est envoyée
- **Symptôme**: Les joueurs reçoivent des erreurs quand ils cliquent sur des boutons après avoir attendu trop longtemps
- **Impact**: Expérience utilisateur dégradée, confusion sur l'état du jeu

### 2. Lock timeout incohérent
- **Cause**: Le système de verrouillage de 120 secondes expire mais les interactions peuvent toujours être en cours
- **Symptôme**: Conflits d'accès, messages d'erreur "Un autre joueur effectue actuellement son action"
- **Impact**: Blocage des joueurs, perte de progression

### 3. Gestion d'erreurs incohérente
- **Cause**: Certains endroits gèrent bien les erreurs, d'autres non
- **Symptôme**: Logs incomplets, difficulté à diagnostiquer les problèmes
- **Impact**: Temps de débogage augmenté

## Solutions implémentées

### 1. Amélioration de la gestion des interactions expirées

#### Fichier: `src/game/events.js`
- **Fonction**: `handleDirectionChoice`
- **Améliorations**:
  - Vérification de la validité de l'interaction avant `deferUpdate()`
  - Gestion robuste des erreurs avec try-catch
  - Log détaillé des erreurs d'interaction
  - Continuation du traitement même si l'interaction a expiré
  - Notification utilisateur en cas d'erreur critique

```javascript
// Vérification avant deferUpdate
try {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }
} catch (err) {
    console.error(`[INTERACTION FAIL] deferUpdate échoué pour ${interaction.user.id}:`, err);
    if (err.code === 10062) {
        console.log(`[INTERACTION EXPIRÉE] L'interaction a expiré, tentative de récupération...`);
    }
}
```

### 2. Amélioration du système de verrouillage

#### Fichier: `src/game/transaction.js`
- **Améliorations**:
  - Ajout de `lockStartTime` pour suivre la durée des verrous
  - Logs détaillés pour chaque opération de verrouillage
  - Renouvellement automatique du timeout pour le même utilisateur
  - Nouvelle fonction `getLockInfo()` pour diagnostiquer les problèmes
  - Messages d'avertissement plus explicites

```javascript
// Nouveau système de verrouillage avec tracking
function lockUser(userId) {
    if (activeLock && activeLock !== userId) {
        const lockAge = lockStartTime ? Date.now() - lockStartTime : 0;
        console.warn(`[LOCK] Verrou refusé pour ${userId} - déjà verrouillé par ${activeLock} (âge: ${Math.floor(lockAge/1000)}s)`);
        return false;
    }
    // ... logique de verrouillage améliorée
}
```

### 3. Amélioration de la gestion des erreurs globale

#### Fichier: `src/index.js`
- **Améliorations**:
  - Logs structurés avec préfixes `[ERROR]`, `[Timeout]`, `[LOCK]`
  - Gestion cohérente des erreurs 10062 pour tous les types d'interactions
  - Vérification de l'acquisition du verrou avant traitement
  - Libération conditionnelle du verrou dans le bloc `finally`
  - Messages d'erreur plus informatifs pour les utilisateurs

```javascript
// Gestion améliorée des erreurs de commande
try {
    await command.execute(interaction);
} catch (error) {
    if (error.code === 10062) {
        console.warn('[Timeout] Interaction (ChatInputCommand) a expiré avant réponse (10062).');
    } else {
        console.error('[ERROR] Erreur lors de l\'exécution de la commande:', error);
    }
    // ... gestion de la réponse utilisateur
}
```

## Avantages des améliorations

### 1. Meilleure expérience utilisateur
- Les erreurs sont gérées silencieusement quand possible
- Messages d'erreur plus clairs et informatifs
- Réduction des faux positifs de verrouillage

### 2. Meilleure observabilité
- Logs structurés et faciles à filtrer
- Informations détaillées sur les verrous et leur durée
- Traçabilité complète des erreurs d'interaction

### 3. Meilleure résilience
- Le système continue de fonctionner même avec des interactions expirées
- Gestion robuste des erreurs sans crash du bot
- Récupération automatique des situations d'erreur

## Recommandations d'utilisation

### Pour les développeurs
1. **Surveiller les logs**: Rechercher les préfixes `[ERROR]`, `[Timeout]`, `[LOCK]`
2. **Utiliser `getLockInfo()`**: Pour diagnostiquer les problèmes de verrouillage
3. **Vérifier les logs d'interaction**: Les logs `[INTERACTION]` montrent toutes les interactions

### Pour les administrateurs
1. **Surveiller les timeouts**: Si beaucoup d'erreurs 10062, envisager d'augmenter les délais
2. **Vérifier les verrous**: Utiliser les logs `[LOCK]` pour identifier les utilisateurs bloqués
3. **Analyser les patterns**: Les logs structurés facilitent l'analyse des problèmes récurrents

## Tests recommandés

1. **Test d'interaction expirée**: Attendre > 3 secondes avant de cliquer sur un bouton
2. **Test de verrouillage**: Tenter des actions simultanées avec plusieurs utilisateurs
3. **Test de récupération**: Vérifier que le système récupère correctement après une erreur

## Notes techniques

- Discord a une fenêtre de 3 secondes pour répondre initialement à une interaction
- Le timeout de verrouillage est de 120 secondes (configurable dans `transaction.js`)
- Les interactions peuvent être récupérées partiellement même après expiration
- Le système utilise `activeInteractionTokens` pour suivre les interactions actives
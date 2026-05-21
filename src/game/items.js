const { Plateau } = require('../db/models');
const registry = require('../gamemodes/registry');

// Fallback statique vers mario_party
const fallbackItems = require('../gamemodes/mario_party/items').ITEMS;

// Cache du mode actif mis à jour à chaque accès DB (lazy)
let _cachedModeId = 'mario_party';
let _cachedVariantId = 'standard';
let _lastDbCheck = 0;
const DB_CHECK_INTERVAL_MS = 5000; // Re-check toutes les 5s max

function getActiveItems() {
    const now = Date.now();
    // Rafraîchir le cache depuis la DB de manière asynchrone si assez de temps s'est écoulé
    // (on ne peut pas await dans un Proxy synchrone, donc on utilise un cache TTL)
    if (now - _lastDbCheck > DB_CHECK_INTERVAL_MS) {
        _lastDbCheck = now;
        // Fire-and-forget async update du cache
        Plateau.findByPk(1).then(plateau => {
            if (plateau) {
                _cachedModeId = plateau.game_mode || 'mario_party';
                _cachedVariantId = plateau.game_variant || 'standard';
            }
        }).catch(() => {});
    }

    try {
        const mode = registry.getMode(_cachedModeId);
        return mode ? mode.getItems(_cachedVariantId) : fallbackItems;
    } catch (e) {
        return fallbackItems;
    }
}

// On utilise un Proxy pour que les accès à ITEMS.OBJET retournent
// les données du mode actif sans bloquer de manière asynchrone.
const ITEMS = new Proxy({}, {
    get(target, prop) {
        if (prop === 'then' || prop === 'toJSON') return undefined;
        return getActiveItems()[prop];
    },
    ownKeys() {
        return Reflect.ownKeys(getActiveItems());
    },
    getOwnPropertyDescriptor(target, prop) {
        return Reflect.getOwnPropertyDescriptor(getActiveItems(), prop);
    }
});

module.exports = { ITEMS };

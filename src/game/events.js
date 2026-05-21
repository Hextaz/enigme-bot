const { Plateau } = require('../db/models');
const registry = require('../gamemodes/registry');

// Cache local de jetons pour la compatibilité (si jamais requis par d'autres modules)
const activeInteractionTokens = new Map();

// Fonction utilitaire pour récupérer le handler du mode actif
async function getHandler(handlerName) {
    const plateau = await Plateau.findByPk(1);
    const mode = registry.getActiveMode(plateau);
    const handlers = mode.getEventHandlers();
    
    if (!handlers[handlerName]) {
        throw new Error(`[EVENTS PROXY] Handler "${handlerName}" non trouvé dans le mode "${mode.id}"`);
    }
    
    return handlers[handlerName];
}

module.exports = {
    activeInteractionTokens,
    
    async handleDirectionChoice(...args) {
        const fn = await getHandler('handleDirectionChoice');
        return fn(...args);
    },
    async handleUnblockFantome(...args) {
        const fn = await getHandler('handleUnblockFantome');
        return fn(...args);
    },
    async handleLancerDe(...args) {
        const fn = await getHandler('handleLancerDe');
        return fn(...args);
    },
    async handleContinuerDeplacement(...args) {
        const fn = await getHandler('handleContinuerDeplacement');
        return fn(...args);
    },
    async handleAcheterEtoile(...args) {
        const fn = await getHandler('handleAcheterEtoile');
        return fn(...args);
    },
    async handlePasserEtoile(...args) {
        const fn = await getHandler('handlePasserEtoile');
        return fn(...args);
    },
    async handleUtiliserObjet(...args) {
        const fn = await getHandler('handleUtiliserObjet');
        return fn(...args);
    },
    async handleUseItem(...args) {
        const fn = await getHandler('handleUseItem');
        return fn(...args);
    },
    async handleDePipeChoix(...args) {
        const fn = await getHandler('handleDePipeChoix');
        return fn(...args);
    },
    async handleBooChoice(...args) {
        const fn = await getHandler('handleBooChoice');
        return fn(...args);
    },
    async handleBooTarget(...args) {
        const fn = await getHandler('handleBooTarget');
        return fn(...args);
    },
    async handleBuyItem(...args) {
        const fn = await getHandler('handleBuyItem');
        return fn(...args);
    },
    async handleBuyCancel(...args) {
        const fn = await getHandler('handleBuyCancel');
        return fn(...args);
    },
    async handleReplaceBuy(...args) {
        const fn = await getHandler('handleReplaceBuy');
        return fn(...args);
    },
    async handleReplaceChance(...args) {
        const fn = await getHandler('handleReplaceChance');
        return fn(...args);
    }
};

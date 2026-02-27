const { ITEMS } = require('./items');
const { Joueur } = require('../db/models');

const TIERS = {
    1: ['CHAMPIGNON', 'PIEGE_PIECES'],
    2: ['TUYAU', 'DE_PIPE', 'DOUBLE_DE'],
    3: ['MIROIR', 'SIFFLET']
};

const SUNDAY_ITEMS = ['DE_TRIPLE', 'TUYAU_DORE', 'PIEGE_ETOILE', 'PACK_PROMO_1', 'PACK_PROMO_2'];

async function isPlayerInLowerHalf(joueurId) {
    const joueurs = await Joueur.findAll({
        order: [
            ['etoiles', 'DESC'],
            ['pieces', 'DESC']
        ]
    });

    if (joueurs.length === 0) return false;

    const index = joueurs.findIndex(j => j.discord_id === joueurId);
    return index >= Math.floor(joueurs.length / 2);
}

function getRandomItem(tier) {
    const itemsInTier = TIERS[tier];
    const randomKey = itemsInTier[Math.floor(Math.random() * itemsInTier.length)];
    return ITEMS[randomKey];
}

async function generateShop(joueurId) {
    const joueur = await Joueur.findByPk(joueurId);
    if (!joueur) return [];

    // Si le joueur a déjà une boutique générée pour aujourd'hui, on la retourne
    if (joueur.boutique_du_jour && joueur.boutique_du_jour.length > 0) {
        return joueur.boutique_du_jour.map(id => ITEMS[id.toUpperCase()]);
    }

    const isLowerHalf = await isPlayerInLowerHalf(joueurId);
    
    // Probabilités de base
    let probTier1 = 0.60;
    let probTier2 = 0.30;
    let probTier3 = 0.10;

    // Buff pour les joueurs de la moitié basse
    if (isLowerHalf) {
        probTier1 = 0.45;
        probTier2 = 0.30;
        probTier3 = 0.25;
    }

    const shopItems = [];
    
    // Vérifier si on est dimanche (0 = Dimanche)
    const isSunday = new Date().getDay() === 0;

    // Générer 3 objets (ou 2 si c'est dimanche et qu'on veut des packs)
    // Le dimanche, on propose 3 objets spéciaux
    for (let i = 0; i < 3; i++) {
        let item;
        let attempts = 0;

        if (isSunday) {
            // Le dimanche, on ne propose QUE des objets du dimanche (Rares/Légendaires/Packs)
            do {
                const randomKey = SUNDAY_ITEMS[Math.floor(Math.random() * SUNDAY_ITEMS.length)];
                item = ITEMS[randomKey];
                attempts++;
            } while (shopItems.find(i => i.id === item.id) && attempts < 5);
        } else {
            const rand = Math.random();
            let selectedTier;

            if (rand < probTier1) {
                selectedTier = 1;
            } else if (rand < probTier1 + probTier2) {
                selectedTier = 2;
            } else {
                selectedTier = 3;
            }

            do {
                item = getRandomItem(selectedTier);
                attempts++;
            } while (shopItems.find(i => i.id === item.id) && attempts < 5);
        }

        shopItems.push(item);
    }

    // Sauvegarder la boutique du jour pour ce joueur
    joueur.boutique_du_jour = shopItems.map(i => i.id);
    await joueur.save();

    return shopItems;
}

module.exports = {
    generateShop
};

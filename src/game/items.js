const ITEMS = {
    CHAMPIGNON: {
        id: 'champignon',
        name: '🍄 Champignon',
        price: 5,
        description: '+3 au prochain lancer.'
    },
    PIEGE_PIECES: {
        id: 'piege_pieces',
        name: '💰 Piège à pièces',
        price: 5,
        description: 'Vole 10 pièces au prochain marcheur.'
    },
    TUYAU: {
        id: 'tuyau',
        name: '🧪 Tuyau',
        price: 8,
        description: 'Téléportation aléatoire.'
    },
    DE_PIPE: {
        id: 'de_pipe',
        name: '🎲 Dé pipé',
        price: 10,
        description: 'Choix de 1 à 6.'
    },
    DOUBLE_DE: {
        id: 'double_de',
        name: '🎲🎲 Double Dé',
        price: 12,
        description: 'Jet de 2 à 12.'
    },
    MIROIR: {
        id: 'miroir',
        name: '🪞 Miroir',
        price: 15,
        description: 'Échange de position aléatoire.'
    },
    SIFFLET: {
        id: 'sifflet',
        name: '🎺 Sifflet',
        price: 15,
        description: 'Téléporte l\'Étoile ailleurs.'
    },
    CLE: {
        id: 'cle',
        name: '🔑 Clé',
        price: 5,
        description: 'Permet d\'ouvrir un portail vers une zone bonus.'
    },
    // Objets du dimanche
    DE_TRIPLE: {
        id: 'de_triple',
        name: '🎲🎲🎲 Dé Triple',
        price: 20,
        description: 'Jet de 3 à 18.',
        sundayOnly: true
    },
    TUYAU_DORE: {
        id: 'tuyau_dore',
        name: '🏆 Tuyau Doré',
        price: 25,
        description: 'TP direct devant l\'Étoile (nécessite 20p supplémentaires pour l\'acheter).',
        sundayOnly: true
    },
    PIEGE_ETOILE: {
        id: 'piege_etoile',
        name: '🌟 Piège à Étoile',
        price: 30,
        description: 'Vole 1 Étoile au prochain marcheur.',
        sundayOnly: true
    },
    PACK_PROMO_1: {
        id: 'pack_promo_1',
        name: '🎁 Pack Promo 1',
        price: 15,
        description: 'Contient 1 Champignon et 1 Tuyau.',
        sundayOnly: true,
        isPack: true,
        contents: ['CHAMPIGNON', 'TUYAU']
    },
    PACK_PROMO_2: {
        id: 'pack_promo_2',
        name: '🎁 Pack Promo 2',
        price: 25,
        description: 'Contient 1 Dé pipé et 1 Miroir.',
        sundayOnly: true,
        isPack: true,
        contents: ['DE_PIPE', 'MIROIR']
    }
};

module.exports = {
    ITEMS
};

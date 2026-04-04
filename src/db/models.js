const { DataTypes } = require('sequelize');
const sequelize = require('./database');

const Joueur = sequelize.define('Joueur', {
    discord_id: {
        type: DataTypes.STRING,
        primaryKey: true,
    },
    etoiles: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    pieces: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    position: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
    },
    inventaire: {
        type: DataTypes.JSON,
        defaultValue: [],
    },
    guess_du_jour: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    a_le_droit_de_jouer: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    bonus_prochain_lancer: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    de_limite: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    type_de: {
        type: DataTypes.STRING,
        defaultValue: 'normal', // 'normal', 'double', 'triple', 'pipe'
    },
    de_pipe_valeur: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    auto_remind_guess: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    auto_remind_turn: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    boutique_du_jour: {
        type: DataTypes.JSON,
        defaultValue: [],
    },
    jours_inactifs: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    est_fantome: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    fantome_unblock_used: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    a_joue_ce_tour: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    cases_restantes: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    last_deviner_time: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    pari_coureurId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
    },
    pari_montant: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    stat_cases_chance: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    stat_cases_malchance: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    stat_cases_avancees: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    stat_enigmes_trouvees: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    stat_objets_utilises: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    }
}, {
    tableName: 'joueurs',
    timestamps: false
});

const Plateau = sequelize.define('Plateau', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    position_etoile: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
    },
    pieges_actifs: {
        type: DataTypes.JSON,
        defaultValue: [],
    },
    tour: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
    },
    enigme_resolue: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    enigme_status: {
        type: DataTypes.STRING,
        defaultValue: 'active', // 'active', 'countdown', 'finished'
    },
    enigme_reponse: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    premier_gagnant: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    autres_gagnants: {
        type: DataTypes.JSON,
        defaultValue: [],
    },
    enigme_channel_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    fin_enigme_timestamp: {
        type: DataTypes.BIGINT,
        allowNull: true,
    },
    blocs_caches: {
        type: DataTypes.JSON,
        defaultValue: {},
    }
}, {
    tableName: 'plateau',
    timestamps: false
});

module.exports = { Joueur, Plateau, sequelize };

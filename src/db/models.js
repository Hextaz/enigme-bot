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
    boutique_du_jour: {
        type: DataTypes.JSON,
        defaultValue: [],
    },
    cases_restantes: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    last_deviner_time: {
        type: DataTypes.DATE,
        allowNull: true,
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
    }
}, {
    tableName: 'plateau',
    timestamps: false
});

module.exports = { Joueur, Plateau, sequelize };

const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Déterminer le chemin de la base de données
// Utilise DATA_DIR si défini (ex: conteneur Docker ou volume dédié), sinon la racine du projet en local
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../');
const dbPath = path.join(dataDir, 'database.sqlite');

// S'assurer que le dossier existe si un dossier personnalisé est spécifié
if (process.env.DATA_DIR && !fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false
});

module.exports = sequelize;

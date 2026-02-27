const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Déterminer le chemin de la base de données
// Si on est sur Fly.io (ou Docker avec un volume monté sur /app/data), on utilise ce dossier
// Sinon, on utilise la racine du projet en local
const dataDir = process.env.FLY_APP_NAME ? '/app/data' : path.join(__dirname, '../../');
const dbPath = path.join(dataDir, 'database.sqlite');

// S'assurer que le dossier existe (utile si le volume vient d'être monté)
if (process.env.FLY_APP_NAME && !fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false
});

module.exports = sequelize;

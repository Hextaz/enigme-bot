import { Sequelize } from 'sequelize';
import path from 'node:path';
import fs from 'node:fs';
import { projectRoot } from '../runtime/paths';

// Déterminer le chemin de la base de données
// Utilise DATA_DIR si défini (ex: conteneur Docker ou volume dédié), sinon la racine du projet en local
const dataDir = process.env.DATA_DIR || projectRoot;
// Tests never inherit a developer/production database path.
const dbPath = process.env.NODE_ENV === 'test'
    ? ':memory:'
    : process.env.DATABASE_STORAGE || path.join(dataDir, 'database.sqlite');

// S'assurer que le dossier existe si un dossier personnalisé est spécifié
if (dbPath !== ':memory:' && !fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false
});

export = sequelize;

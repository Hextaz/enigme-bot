import { DataTypes, QueryTypes, Sequelize, Transaction } from 'sequelize';
import schema from './schema-v1.json';

type Column = { type: string; primaryKey?: boolean; autoIncrement?: boolean; allowNull?: boolean; defaultValue?: unknown; defaultNow?: boolean };
const types = { STRING: DataTypes.STRING, TEXT: DataTypes.TEXT, INTEGER: DataTypes.INTEGER, BIGINT: DataTypes.BIGINT, BOOLEAN: DataTypes.BOOLEAN, JSON: DataTypes.JSON, DATE: DataTypes.DATE };

/** Frozen baseline: never derive historical migrations from the current models. */
async function baseline(db: Sequelize, transaction: Transaction): Promise<void> {
  const qi = db.getQueryInterface();
  const existing = await qi.showAllTables({ transaction });
  for (const [table, fields] of Object.entries(schema)) {
    if (existing.includes(table)) {
      const columns = await qi.describeTable(table, { transaction, logging: false } as Parameters<typeof qi.describeTable>[1]);
      const missing = Object.keys(fields).filter(name => !(name in columns));
      if (missing.length) throw new Error(`Schéma ${table} incompatible, colonnes manquantes : ${missing.join(', ')}`);
      continue;
    }
    const attributes = Object.fromEntries(Object.entries(fields).map(([name, raw]) => {
      const field = raw as Column;
      const { type, defaultNow, ...options } = field;
      const dataType = types[type as keyof typeof types];
      if (!dataType) throw new Error(`Type inconnu : ${type}`);
      return [name, { ...options, type: dataType, ...(defaultNow ? { defaultValue: DataTypes.NOW } : {}) }];
    }));
    await qi.createTable(table, attributes, { transaction });
  }
}
const migrations = [
  { name: '001-baseline', up: baseline },
  { name: '002-persist-direction', up: async (db: Sequelize, transaction: Transaction) => {
    const qi = db.getQueryInterface();
    for (const table of ['joueurs', 'tour_snapshots']) {
      const columns = await qi.describeTable(table, { transaction, logging: false } as Parameters<typeof qi.describeTable>[1]);
      if (!columns.temp_choix_direction) await qi.addColumn(table, 'temp_choix_direction', { type: DataTypes.INTEGER, allowNull: true, defaultValue: null }, { transaction });
    }
    await qi.addIndex('tour_snapshots', ['discord_id', 'timestamp'], { name: 'snapshot_player_time', transaction });
  } },
  { name: '003-pending-action', up: async (db: Sequelize, transaction: Transaction) => {
    // A pending choice (star, shop, Boo, crossroads, challenge) must survive restarts and reject stale buttons.
    await db.getQueryInterface().addColumn('joueurs', 'action_en_attente', { type: DataTypes.JSON, allowNull: true, defaultValue: null }, { transaction });
  } },
];

export async function migrate(db: Sequelize): Promise<string[]> {
  const applied: string[] = [];
  await db.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY NOT NULL)', { transaction });
    const rows = await db.query<{ name: string }>('SELECT name FROM schema_migrations', { type: QueryTypes.SELECT, transaction });
    const unknown = rows.filter(row => !migrations.some(m => m.name === row.name));
    if (unknown.length) throw new Error('La base utilise une version plus récente du schéma.');
    for (const migration of migrations) {
      if (rows.some(row => row.name === migration.name)) continue;
      await migration.up(db, transaction);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($name)', { bind: { name: migration.name }, transaction });
      applied.push(migration.name);
    }
  });
  return applied;
}

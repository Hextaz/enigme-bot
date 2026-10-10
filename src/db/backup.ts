import { Sequelize, QueryTypes } from 'sequelize';
import path from 'node:path';
import fs from 'node:fs';
/** VACUUM INTO takes a consistent SQLite snapshot, including committed WAL data. */
export async function backupDatabase(db: Sequelize, destination: string): Promise<void> {
  const target = path.resolve(destination);
  if (fs.existsSync(target)) throw new Error('La destination de sauvegarde existe déjà.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await db.query('VACUUM INTO $target', { bind: { target } });
  const copy = new Sequelize({ dialect: 'sqlite', storage: target, logging: false });
  try {
    const rows = await copy.query<{ integrity_check: string }>('PRAGMA integrity_check', { type: QueryTypes.SELECT });
    if (rows.length !== 1 || rows[0]?.integrity_check !== 'ok') throw new Error('Sauvegarde SQLite invalide.');
  } finally { await copy.close(); }
}

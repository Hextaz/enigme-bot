import sequelize = require('./database');
import { backupDatabase } from './backup';
async function main() {
  const destination = process.argv[2];
  if (!destination) throw new Error('Usage : npm run db:backup -- /chemin/nouveau-backup.sqlite');
  try { await backupDatabase(sequelize, destination); console.log('[DB] Sauvegarde vérifiée.'); }
  finally { await sequelize.close(); }
}
main().catch(error => { console.error('[ERROR] Sauvegarde impossible :', error); process.exitCode = 1; });

import sequelize = require('./database');
import { migrate } from './migrations';
async function main() {
  try { console.log('[DB] Migrations appliquées :', await migrate(sequelize)); }
  finally { await sequelize.close(); }
}
main().catch(error => { console.error('[ERROR] Migration impossible :', error); process.exitCode = 1; });

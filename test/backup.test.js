const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Sequelize, QueryTypes } = require('sequelize');
const { backupDatabase } = require('../src/db/backup');
test('a backup can be restored independently and existing backups are never overwritten', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'enigme-backup-'));
  const file = path.join(directory, 'backup.sqlite');
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  let restored;
  try {
    await db.query('CREATE TABLE balances (id TEXT, pieces INTEGER)');
    await db.query("INSERT INTO balances VALUES ('one', 42)");
    await backupDatabase(db, file);
    await db.query('UPDATE balances SET pieces = 0');
    restored = new Sequelize({ dialect: 'sqlite', storage: file, logging: false });
    const [row] = await restored.query('SELECT pieces FROM balances', { type: QueryTypes.SELECT });
    assert.equal(row.pieces, 42);
    await assert.rejects(backupDatabase(db, file), /existe déjà/);
  } finally {
    await restored?.close(); await db.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test('a disk WAL backup includes committed journal pages and restores without the source WAL', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'enigme-wal-'));
  const db = new Sequelize({ dialect: 'sqlite', storage: path.join(directory, 'live.sqlite'), logging: false });
  let restored;
  try {
    const [journal] = await db.query('PRAGMA journal_mode=WAL', { type: QueryTypes.SELECT });
    assert.equal(journal.journal_mode, 'wal');
    await db.query('PRAGMA wal_autocheckpoint=0');
    await db.query('CREATE TABLE balances (id TEXT, pieces INTEGER)');
    await db.transaction(async transaction => {
      await db.query("INSERT INTO balances VALUES ('one', 42)", { transaction });
    });
    const backup = path.join(directory, 'snapshot.sqlite');
    await backupDatabase(db, backup);
    await db.query('UPDATE balances SET pieces = 0');
    restored = new Sequelize({ dialect: 'sqlite', storage: backup, logging: false });
    const [row] = await restored.query('SELECT pieces FROM balances', { type: QueryTypes.SELECT });
    assert.equal(row.pieces, 42);
    const [integrity] = await restored.query('PRAGMA integrity_check', { type: QueryTypes.SELECT });
    assert.equal(integrity.integrity_check, 'ok');
  } finally {
    await restored?.close(); await db.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'dashboard.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS ad_spend (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_name TEXT NOT NULL,
    date TEXT NOT NULL,
    spend REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ad_name, date)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const upsertSpend = db.prepare(`
  INSERT INTO ad_spend (ad_name, date, spend)
  VALUES (@ad_name, @date, @spend)
  ON CONFLICT(ad_name, date) DO UPDATE SET
    spend = @spend,
    created_at = CURRENT_TIMESTAMP
`);

const getSpendByRange = db.prepare(`
  SELECT * FROM ad_spend
  WHERE date >= @start AND date <= @end
  ORDER BY date DESC
`);

const getSpendByAdAndRange = db.prepare(`
  SELECT ad_name, SUM(spend) as total_spend
  FROM ad_spend
  WHERE date >= @start AND date <= @end
  GROUP BY ad_name
`);

const deleteSpend = db.prepare('DELETE FROM ad_spend WHERE id = @id');

const getSetting = db.prepare('SELECT value FROM settings WHERE key = @key');

const upsertSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (@key, @value)
  ON CONFLICT(key) DO UPDATE SET value = @value
`);

module.exports = {
  db,
  upsertSpend,
  getSpendByRange,
  getSpendByAdAndRange,
  deleteSpend,
  getSetting,
  upsertSetting,
};

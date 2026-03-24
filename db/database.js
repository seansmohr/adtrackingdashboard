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

  CREATE TABLE IF NOT EXISTS known_ads (
    ad_name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS ad_id_map (
    ad_id TEXT PRIMARY KEY,
    ad_name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ad_revenue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_name TEXT NOT NULL,
    date TEXT NOT NULL,
    revenue REAL NOT NULL,
    contact_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ad_name, date, contact_name)
  );
`);

// Seed known ad names
const knownAds = [
  "Winning Ad | Don't Overpay",
  'Winning Ad | Enrollment Window',
  'Winning Ad | One Year',
  'Winning Ad | Not Free',
];

const insertKnownAd = db.prepare(
  'INSERT OR IGNORE INTO known_ads (ad_name) VALUES (?)'
);
for (const name of knownAds) {
  insertKnownAd.run(name);
}

// Seed known ad ID → name mappings
const knownAdIdMap = {
  '120243275937490544': 'Winning Ad | Not Free',
};

const upsertAdIdMap = db.prepare(
  'INSERT OR REPLACE INTO ad_id_map (ad_id, ad_name) VALUES (@ad_id, @ad_name)'
);
for (const [adId, adName] of Object.entries(knownAdIdMap)) {
  upsertAdIdMap.run({ ad_id: adId, ad_name: adName });
}

const getAdIdMap = db.prepare('SELECT ad_id, ad_name FROM ad_id_map');
const getAdNameById = db.prepare('SELECT ad_name FROM ad_id_map WHERE ad_id = @ad_id');

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

const insertRevenue = db.prepare(`
  INSERT INTO ad_revenue (ad_name, date, revenue, contact_name)
  VALUES (@ad_name, @date, @revenue, @contact_name)
  ON CONFLICT(ad_name, date, contact_name) DO UPDATE SET
    revenue = @revenue,
    created_at = CURRENT_TIMESTAMP
`);

const getRevenueByRange = db.prepare(`
  SELECT * FROM ad_revenue
  WHERE date >= @start AND date <= @end
  ORDER BY date DESC
`);

const getRevenueByAdAndRange = db.prepare(`
  SELECT ad_name, SUM(revenue) as total_revenue, COUNT(*) as entry_count
  FROM ad_revenue
  WHERE date >= @start AND date <= @end
  GROUP BY ad_name
`);

const deleteRevenue = db.prepare('DELETE FROM ad_revenue WHERE id = @id');

module.exports = {
  db,
  upsertSpend,
  getSpendByRange,
  getSpendByAdAndRange,
  deleteSpend,
  getSetting,
  upsertSetting,
  insertRevenue,
  getRevenueByRange,
  getRevenueByAdAndRange,
  deleteRevenue,
  upsertAdIdMap,
  getAdIdMap,
  getAdNameById,
};

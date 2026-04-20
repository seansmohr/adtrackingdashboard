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
`);

// Seed known ad names
const knownAds = [
  "Winning Ad | Don't Overpay",
  'Winning Ad | Enrollment Window',
  'Winning Ad | One Year',
  'Winning Ad | Not Free',
  'Test Ad | Worst Mistake',
  'Winning Ad | Not Ready',
  'Test Ad | Cost',
  'Test Ad | Med Supp vs Adv',
  'Test Ad | Original Medicare',
];

const insertKnownAd = db.prepare(
  'INSERT OR IGNORE INTO known_ads (ad_name) VALUES (?)'
);
for (const name of knownAds) {
  insertKnownAd.run(name);
}

// Seed known ad ID → name mappings
const knownAdIdMap = {
  '120243273380180544': "Winning Ad | Don't Overpay",
  '120243275838750544': 'Winning Ad | Enrollment Window',
  '120243275895790544': 'Winning Ad | One Year',
  '120243275937490544': 'Winning Ad | Not Free',
  '120243449557000544': 'Test Ad | Worst Mistake',
  '120244123017720544': 'Winning Ad | Not Ready',
  '120244840899860544': 'Test Ad | Cost',
  '120244840341920544': 'Test Ad | Med Supp vs Adv',
  '120244840241170544': 'Test Ad | Original Medicare',
};

const upsertAdIdMap = db.prepare(
  'INSERT OR REPLACE INTO ad_id_map (ad_id, ad_name) VALUES (@ad_id, @ad_name)'
);
for (const [adId, adName] of Object.entries(knownAdIdMap)) {
  upsertAdIdMap.run({ ad_id: adId, ad_name: adName });
}

const getAdIdMap = db.prepare('SELECT ad_id, ad_name FROM ad_id_map');

const getSetting = db.prepare('SELECT value FROM settings WHERE key = @key');

const upsertSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (@key, @value)
  ON CONFLICT(key) DO UPDATE SET value = @value
`);

module.exports = {
  db,
  getSetting,
  upsertSetting,
  getAdIdMap,
};

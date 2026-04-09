const { getSetting, upsertSetting, getAdIdMap } = require('../db/database');

const BASE_URL = 'https://services.leadconnectorhq.com';
const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'America/Los_Angeles';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status === 429 && attempt < maxRetries) {
      const delay = Math.pow(2, attempt + 1) * 1000;
      console.log(`Rate limited. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(delay);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GHL API error ${res.status}: ${body}`);
    }

    return res.json();
  }
}

async function getCustomFieldKey(fieldName, cacheKey) {
  const cached = getSetting.get({ key: cacheKey });
  if (cached) return cached.value;

  const data = await fetchWithRetry(
    `${BASE_URL}/locations/${LOCATION_ID}/customFields`,
    { method: 'GET', headers: HEADERS }
  );

  const fields = data.customFields || [];
  const field = fields.find(
    (f) => f.name.toLowerCase() === fieldName.toLowerCase()
  );

  if (!field) {
    throw new Error(`Custom field "${fieldName}" not found in GHL location`);
  }

  upsertSetting.run({ key: cacheKey, value: field.id });
  return field.id;
}

async function getAdCreativeFieldKey() {
  return getCustomFieldKey('Ad Creative', 'ad_creative_field_key');
}

async function searchContacts(startDate, endDate) {
  const adFieldKey = await getAdCreativeFieldKey();
  const allContacts = [];
  let page = 1;
  const pageLimit = 100;

  while (true) {
    const body = {
      locationId: LOCATION_ID,
      page,
      pageLimit,
    };

    const data = await fetchWithRetry(
      `${BASE_URL}/contacts/search`,
      {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(body),
      }
    );

    const contacts = data.contacts || [];
    allContacts.push(...contacts);

    const total = data.total || 0;
    console.log(`GHL search page ${page}: got ${contacts.length} contacts (${allContacts.length}/${total} total)`);
    if (allContacts.length >= total || contacts.length === 0) break;
    page++;
  }

  console.log(`GHL search complete: ${allContacts.length} total contacts fetched`);

  // Build ad ID → name lookup from the database
  const adIdRows = getAdIdMap.all();
  const adIdToName = {};
  for (const row of adIdRows) {
    adIdToName[row.ad_id] = row.ad_name;
  }

  const leadsWithAd = [];

  for (const contact of allContacts) {
    // Filter by date client-side
    let contactDate = '';
    if (contact.dateAdded) {
      const dt = new Date(contact.dateAdded);
      const parts = dt.toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ });
      contactDate = parts;
    }
    if (contactDate && (contactDate < startDate || contactDate > endDate)) {
      continue;
    }

    const customFields = contact.customFields || [];
    const adField = customFields.find((cf) => cf.id === adFieldKey);
    if (!adField || !adField.value) {
      continue;
    }

    // Resolve ad ID to friendly name if it's a numeric ID
    let adName = adField.value;
    if (adIdToName[adName]) {
      adName = adIdToName[adName];
    }

    // Check for "scheduled" tag
    const tags = contact.tags || [];
    const isScheduled = tags.includes('scheduled');

    leadsWithAd.push({
      id: contact.id,
      name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      email: contact.email || '',
      phone: contact.phone || '',
      date: contactDate,
      ad_name: adName,
      is_scheduled: isScheduled,
    });
  }

  console.log(`GHL filter results for ${startDate} to ${endDate}: ${leadsWithAd.length} leads with ad data`);

  return leadsWithAd;
}

module.exports = { searchContacts };

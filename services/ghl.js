const { getSetting, upsertSetting } = require('../db/database');

const BASE_URL = 'https://services.leadconnectorhq.com';
const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

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

async function getAdCreativeFieldKey() {
  const cached = getSetting.get({ key: 'ad_creative_field_key' });
  if (cached) return cached.value;

  const data = await fetchWithRetry(
    `${BASE_URL}/locations/${LOCATION_ID}/customFields`,
    { method: 'GET', headers: HEADERS }
  );

  const fields = data.customFields || [];
  const adCreativeField = fields.find(
    (f) => f.name.toLowerCase() === 'ad creative'
  );

  if (!adCreativeField) {
    throw new Error('Custom field "Ad Creative" not found in GHL location');
  }

  upsertSetting.run({ key: 'ad_creative_field_key', value: adCreativeField.id });
  return adCreativeField.id;
}

async function searchContacts(startDate, endDate) {
  const fieldKey = await getAdCreativeFieldKey();
  const allContacts = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const body = {
      locationId: LOCATION_ID,
      page,
      pageSize,
      filters: [
        {
          field: 'dateAdded',
          operator: 'BETWEEN',
          value: startDate,
          secondValue: endDate,
        },
      ],
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
    if (allContacts.length >= total || contacts.length === 0) break;
    page++;
  }

  const leadsWithAd = [];

  for (const contact of allContacts) {
    const customFields = contact.customFields || [];
    const adField = customFields.find((cf) => cf.id === fieldKey);
    if (adField && adField.value) {
      leadsWithAd.push({
        name: `${contact.firstNameRaw || contact.firstName || ''} ${contact.lastNameRaw || contact.lastName || ''}`.trim(),
        email: contact.email || '',
        phone: contact.phone || '',
        date: contact.dateAdded ? contact.dateAdded.split('T')[0] : '',
        ad_name: adField.value,
      });
    }
  }

  return leadsWithAd;
}

module.exports = { searchContacts, getAdCreativeFieldKey };

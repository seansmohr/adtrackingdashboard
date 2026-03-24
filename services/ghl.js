const { getSetting, upsertSetting } = require('../db/database');

const BASE_URL = 'https://services.leadconnectorhq.com';
const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

const SALE_VALUES = ['Sale (umbrella)', 'Sale (MA)', 'Sale (MedSupp)'];

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

async function getAppointmentStatusFieldKey() {
  return getCustomFieldKey('Appointment Status', 'appointment_status_field_key');
}

async function searchContacts(startDate, endDate) {
  const adFieldKey = await getAdCreativeFieldKey();
  const apptStatusFieldKey = await getAppointmentStatusFieldKey();
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
    if (allContacts.length >= total || contacts.length === 0) break;
    page++;
  }

  const leadsWithAd = [];

  for (const contact of allContacts) {
    // Filter by date client-side
    const contactDate = contact.dateAdded ? contact.dateAdded.split('T')[0] : '';
    if (contactDate && (contactDate < startDate || contactDate > endDate)) {
      continue;
    }

    const customFields = contact.customFields || [];
    const adField = customFields.find((cf) => cf.id === adFieldKey);
    if (adField && adField.value) {
      // Check for "scheduled" tag (deduplicated by contact id)
      const tags = contact.tags || [];
      const isScheduled = tags.includes('scheduled');

      // Check appointment status for sale
      const apptStatusField = customFields.find((cf) => cf.id === apptStatusFieldKey);
      const apptStatusValue = apptStatusField ? apptStatusField.value : '';
      const isSale = SALE_VALUES.includes(apptStatusValue);

      leadsWithAd.push({
        id: contact.id,
        name: `${contact.firstNameRaw || contact.firstName || ''} ${contact.lastNameRaw || contact.lastName || ''}`.trim(),
        email: contact.email || '',
        phone: contact.phone || '',
        date: contactDate,
        ad_name: adField.value,
        is_scheduled: isScheduled,
        is_sale: isSale,
        sale_type: isSale ? apptStatusValue : null,
      });
    }
  }

  return leadsWithAd;
}

module.exports = { searchContacts, getAdCreativeFieldKey, getAppointmentStatusFieldKey };

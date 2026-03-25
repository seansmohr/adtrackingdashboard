const { getSetting, upsertSetting, getAdIdMap } = require('../db/database');

const BASE_URL = 'https://services.leadconnectorhq.com';
const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

const SALE_VALUES = ['Sale (umbrella)', 'Sale (MA)', 'Sale (MedSupp)'];
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
  let dateFiltered = 0;
  let noAdField = 0;
  let inRangeTotal = 0;

  for (const contact of allContacts) {
    // Filter by date client-side
    let contactDate = '';
    if (contact.dateAdded) {
      const dt = new Date(contact.dateAdded);
      const parts = dt.toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ });
      contactDate = parts; // en-CA locale gives YYYY-MM-DD format
    }
    if (contactDate && (contactDate < startDate || contactDate > endDate)) {
      dateFiltered++;
      continue;
    }
    inRangeTotal++;

    const customFields = contact.customFields || [];
    const adField = customFields.find((cf) => cf.id === adFieldKey);
    if (!adField || !adField.value) {
      noAdField++;
    }

    // Resolve ad name: use Ad Creative field if present, otherwise "Unattributed"
    let adName = 'Unattributed';
    if (adField && adField.value) {
      adName = adField.value;
      if (adIdToName[adName]) {
        adName = adIdToName[adName];
      }
    }

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
      ad_name: adName,
      is_scheduled: isScheduled,
      is_sale: isSale,
      sale_type: isSale ? apptStatusValue : null,
    });
  }

  console.log(`GHL filter results for ${startDate} to ${endDate}: ${dateFiltered} outside date range, ${inRangeTotal} in range, ${noAdField} missing Ad Creative field (counted as Unattributed), ${leadsWithAd.length} total leads`);

  return leadsWithAd;
}

module.exports = { searchContacts, getAdCreativeFieldKey, getAppointmentStatusFieldKey };

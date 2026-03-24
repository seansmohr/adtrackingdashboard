const express = require('express');
const router = express.Router();
const { searchContacts } = require('../services/ghl');
const { getSpendByAdAndRange } = require('../db/database');

router.get('/dashboard', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query parameters are required' });
    }

    const leads = await searchContacts(start, end);

    const grouped = {};
    for (const lead of leads) {
      if (!grouped[lead.ad_name]) {
        grouped[lead.ad_name] = { ad_name: lead.ad_name, leads: [] };
      }
      grouped[lead.ad_name].leads.push(lead);
    }

    const spendData = getSpendByAdAndRange.all({ start, end });
    const spendMap = {};
    for (const row of spendData) {
      spendMap[row.ad_name] = row.total_spend;
    }

    let totalLeads = 0;
    let totalSpend = 0;

    const leadsByAd = Object.values(grouped).map((group) => {
      const leadCount = group.leads.length;
      const spend = spendMap[group.ad_name] || 0;
      const cpl = spend > 0 && leadCount > 0 ? spend / leadCount : 0;

      totalLeads += leadCount;
      totalSpend += spend;

      return {
        ad_name: group.ad_name,
        lead_count: leadCount,
        total_spend: Math.round(spend * 100) / 100,
        cpl: Math.round(cpl * 100) / 100,
        leads: group.leads,
      };
    });

    leadsByAd.sort((a, b) => b.lead_count - a.lead_count);

    res.json({
      leads_by_ad: leadsByAd,
      totals: {
        total_leads: totalLeads,
        total_spend: Math.round(totalSpend * 100) / 100,
        avg_cpl: totalLeads > 0 ? Math.round((totalSpend / totalLeads) * 100) / 100 : 0,
      },
      date_range: { start, end },
      last_refreshed: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/ads', async (req, res) => {
  try {
    const { db } = require('../db/database');
    const rows = db.prepare('SELECT DISTINCT ad_name FROM ad_spend ORDER BY ad_name').all();
    res.json({ ads: rows.map((r) => r.ad_name) });
  } catch (err) {
    console.error('Ads list error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

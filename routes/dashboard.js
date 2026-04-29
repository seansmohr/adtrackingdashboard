const express = require('express');
const router = express.Router();
const { searchContacts } = require('../services/ghl');

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
        grouped[lead.ad_name] = {
          ad_name: lead.ad_name,
          leads: [],
          scheduled_ids: new Set(),
        };
      }
      const g = grouped[lead.ad_name];
      g.leads.push(lead);

      if (lead.is_scheduled) {
        g.scheduled_ids.add(lead.id);
      }
    }

    let totalLeads = 0;
    let totalAppts = 0;

    const leadsByAd = Object.values(grouped).map((group) => {
      const leadCount = group.leads.length;
      const apptCount = group.scheduled_ids.size;

      totalLeads += leadCount;
      totalAppts += apptCount;

      return {
        ad_name: group.ad_name,
        lead_count: leadCount,
        appt_count: apptCount,
        leads: group.leads,
      };
    });

    leadsByAd.sort((a, b) => b.lead_count - a.lead_count);

    res.json({
      leads_by_ad: leadsByAd,
      totals: {
        total_leads: totalLeads,
        total_appts: totalAppts,
      },
      date_range: { start, end },
      last_refreshed: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

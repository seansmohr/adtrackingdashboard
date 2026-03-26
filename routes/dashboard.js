const express = require('express');
const router = express.Router();
const { searchContacts } = require('../services/ghl');
const { getSpendByAdAndRange, getRevenueByAdAndRange } = require('../db/database');

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
        grouped[lead.ad_name] = { ad_name: lead.ad_name, leads: [], scheduled_ids: new Set(), sales: [] };
      }
      const g = grouped[lead.ad_name];
      g.leads.push(lead);

      // Deduplicate appointments by contact id
      if (lead.is_scheduled) {
        g.scheduled_ids.add(lead.id);
      }

      if (lead.is_sale) {
        g.sales.push({
          name: lead.name,
          date: lead.date,
          sale_type: lead.sale_type,
        });
      }
    }

    const spendData = getSpendByAdAndRange.all({ start, end });
    const spendMap = {};
    for (const row of spendData) {
      spendMap[row.ad_name] = row.total_spend;
    }

    const revenueData = getRevenueByAdAndRange.all({ start, end });
    const revenueMap = {};
    for (const row of revenueData) {
      revenueMap[row.ad_name] = row.total_revenue;
    }

    // Ensure ads with spend or revenue data appear even if they have no leads
    for (const adName of Object.keys(spendMap)) {
      if (!grouped[adName]) {
        grouped[adName] = { ad_name: adName, leads: [], scheduled_ids: new Set(), sales: [] };
      }
    }
    for (const adName of Object.keys(revenueMap)) {
      if (!grouped[adName]) {
        grouped[adName] = { ad_name: adName, leads: [], scheduled_ids: new Set(), sales: [] };
      }
    }

    let totalLeads = 0;
    let totalSpend = 0;
    let totalAppts = 0;
    let totalSales = 0;
    let totalRevenue = 0;

    const leadsByAd = Object.values(grouped).map((group) => {
      const leadCount = group.leads.length;
      const apptCount = group.scheduled_ids.size;
      const saleCount = group.sales.length;
      const spend = spendMap[group.ad_name] || 0;
      const revenue = revenueMap[group.ad_name] || 0;
      const cpl = spend > 0 && leadCount > 0 ? spend / leadCount : 0;
      const leadToApptPct = leadCount > 0 ? (apptCount / leadCount) * 100 : 0;
      const leadToSalePct = leadCount > 0 ? (saleCount / leadCount) * 100 : 0;
      const roas = spend > 0 ? revenue / spend : 0;
      const avgRevPerClient = saleCount > 0 ? revenue / saleCount : 0;

      totalLeads += leadCount;
      totalSpend += spend;
      totalAppts += apptCount;
      totalSales += saleCount;
      totalRevenue += revenue;

      return {
        ad_name: group.ad_name,
        lead_count: leadCount,
        appt_count: apptCount,
        sale_count: saleCount,
        total_spend: Math.round(spend * 100) / 100,
        total_revenue: Math.round(revenue * 100) / 100,
        cpl: Math.round(cpl * 100) / 100,
        lead_to_appt_pct: Math.round(leadToApptPct * 10) / 10,
        lead_to_sale_pct: Math.round(leadToSalePct * 10) / 10,
        roas: Math.round(roas * 100) / 100,
        avg_rev_per_client: Math.round(avgRevPerClient * 100) / 100,
        leads: group.leads,
        sales: group.sales,
      };
    });

    leadsByAd.sort((a, b) => b.lead_count - a.lead_count);

    res.json({
      leads_by_ad: leadsByAd,
      totals: {
        total_leads: totalLeads,
        total_spend: Math.round(totalSpend * 100) / 100,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_appts: totalAppts,
        total_sales: totalSales,
        avg_cpl: totalLeads > 0 ? Math.round((totalSpend / totalLeads) * 100) / 100 : 0,
        avg_roas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0,
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
    const rows = db.prepare(`
      SELECT ad_name FROM known_ads
      UNION
      SELECT DISTINCT ad_name FROM ad_spend
      UNION
      SELECT DISTINCT ad_name FROM ad_revenue
      ORDER BY ad_name
    `).all();
    res.json({ ads: rows.map((r) => r.ad_name) });
  } catch (err) {
    console.error('Ads list error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

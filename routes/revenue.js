const express = require('express');
const router = express.Router();
const { insertRevenue, getRevenueByRange, deleteRevenue } = require('../db/database');

router.post('/', (req, res) => {
  try {
    const { ad_name, date, revenue, contact_name } = req.body;

    if (!ad_name || !date || revenue === undefined || revenue === null) {
      return res.status(400).json({ error: 'ad_name, date, and revenue are required' });
    }

    if (typeof revenue !== 'number' || revenue < 0) {
      return res.status(400).json({ error: 'revenue must be a non-negative number' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    insertRevenue.run({ ad_name, date, revenue, contact_name: contact_name || null });
    res.json({ success: true });
  } catch (err) {
    console.error('Revenue insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query parameters are required' });
    }

    const rows = getRevenueByRange.all({ start, end });
    res.json({ revenue: rows });
  } catch (err) {
    console.error('Revenue fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const result = deleteRevenue.run({ id });
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Revenue entry not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Revenue delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

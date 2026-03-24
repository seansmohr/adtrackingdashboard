const express = require('express');
const router = express.Router();
const { upsertSpend, getSpendByRange, deleteSpend } = require('../db/database');

router.post('/', (req, res) => {
  try {
    const { ad_name, date, spend } = req.body;

    if (!ad_name || !date || spend === undefined || spend === null) {
      return res.status(400).json({ error: 'ad_name, date, and spend are required' });
    }

    if (typeof spend !== 'number' || spend < 0) {
      return res.status(400).json({ error: 'spend must be a non-negative number' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    upsertSpend.run({ ad_name, date, spend });
    res.json({ success: true });
  } catch (err) {
    console.error('Spend upsert error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query parameters are required' });
    }

    const rows = getSpendByRange.all({ start, end });
    res.json({ spend: rows });
  } catch (err) {
    console.error('Spend fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const result = deleteSpend.run({ id });
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Spend entry not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Spend delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

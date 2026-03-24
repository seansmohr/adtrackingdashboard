require('dotenv').config();

const express = require('express');
const path = require('path');

const dashboardRoutes = require('./routes/dashboard');
const spendRoutes = require('./routes/spend');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', dashboardRoutes);
app.use('/api/spend', spendRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});

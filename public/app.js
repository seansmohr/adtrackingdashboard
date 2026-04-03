(function () {
  'use strict';

  let currentSort = { field: 'lead_count', desc: true };
  let dashboardData = null;

  // Date helpers
  function fmt(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getRange(preset) {
    const today = new Date();
    const end = fmt(today);
    if (preset === 'today') return { start: end, end };
    if (preset === '7') {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { start: fmt(d), end };
    }
    if (preset === '30') {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      return { start: fmt(d), end };
    }
    return null;
  }

  function currentDateRange() {
    const active = document.querySelector('.btn-toggle.active');
    const range = active ? active.dataset.range : '7';
    if (range === 'custom') {
      return {
        start: document.getElementById('start-date').value,
        end: document.getElementById('end-date').value,
      };
    }
    return getRange(range);
  }

  // API
  async function api(url, opts) {
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // Show/hide error
  function showError(msg) {
    document.getElementById('error-message').textContent = msg;
    document.getElementById('error-banner').classList.remove('hidden');
  }

  function hideError() {
    document.getElementById('error-banner').classList.add('hidden');
  }

  // Format currency
  function money(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Load dashboard
  async function loadDashboard() {
    const range = currentDateRange();
    if (!range || !range.start || !range.end) return;

    hideError();
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('performance-table').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');

    try {
      dashboardData = await api(`/api/dashboard?start=${range.start}&end=${range.end}`);
      renderDashboard(dashboardData);
    } catch (err) {
      showError('Failed to load dashboard: ' + err.message);
      document.getElementById('loading').classList.add('hidden');
    }
  }

  function renderDashboard(data) {
    document.getElementById('loading').classList.add('hidden');

    // Metrics
    document.getElementById('total-leads').textContent = data.totals.total_leads;
    document.getElementById('total-appts').textContent = data.totals.total_appts;
    document.getElementById('total-autobooked').textContent = data.totals.total_autobooked;
    document.getElementById('total-va-booked').textContent = data.totals.total_va_booked;
    document.getElementById('total-sales').textContent = data.totals.total_sales;
    document.getElementById('total-spend').textContent = money(data.totals.total_spend);
    document.getElementById('total-revenue').textContent = money(data.totals.total_revenue);
    document.getElementById('avg-cpl').textContent = data.totals.total_leads > 0 ? money(data.totals.avg_cpl) : '—';
    document.getElementById('avg-cpa').textContent = data.totals.total_appts > 0 ? money(data.totals.avg_cpa) : '—';
    document.getElementById('avg-roas').textContent = data.totals.total_spend > 0 ? data.totals.avg_roas.toFixed(2) + 'x' : '—';
    document.getElementById('active-ads').textContent = data.leads_by_ad.length;

    // Last refreshed
    const refreshed = new Date(data.last_refreshed);
    document.getElementById('last-refreshed').textContent =
      'Updated ' + refreshed.toLocaleTimeString();

    if (data.leads_by_ad.length === 0) {
      document.getElementById('empty-state').classList.remove('hidden');
      document.getElementById('performance-table').classList.add('hidden');
      return;
    }

    document.getElementById('performance-table').classList.remove('hidden');
    renderTable(data);
    populateAdDropdown(data);
    populateContactDropdown(data);
  }

  function renderTable(data) {
    const ads = [...data.leads_by_ad];
    const total = data.totals.total_leads;

    // Add pct field
    ads.forEach((a) => {
      a.pct = total > 0 ? (a.lead_count / total) * 100 : 0;
    });

    // Sort
    ads.sort((a, b) => {
      let va = a[currentSort.field];
      let vb = b[currentSort.field];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if (va < vb) return currentSort.desc ? 1 : -1;
      if (va > vb) return currentSort.desc ? -1 : 1;
      return 0;
    });

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    ads.forEach((ad) => {
      const tr = document.createElement('tr');
      tr.className = 'ad-row';
      tr.innerHTML = `
        <td><strong>${esc(ad.ad_name)}</strong></td>
        <td>${ad.lead_count}</td>
        <td>${ad.appt_count}</td>
        <td>${ad.autobooked_count}</td>
        <td>${ad.va_booked_count}</td>
        <td>${ad.sale_count}</td>
        <td class="spend-cell" data-ad="${esc(ad.ad_name)}">${money(ad.total_spend)}</td>
        <td>${ad.total_spend > 0 ? money(ad.cpl) : '—'}</td>
        <td>${ad.total_spend > 0 && ad.appt_count > 0 ? money(ad.cpa) : '—'}</td>
        <td>${ad.pct.toFixed(1)}%</td>
        <td>${ad.lead_to_appt_pct.toFixed(1)}%</td>
        <td>${ad.lead_to_sale_pct.toFixed(1)}%</td>
        <td>${money(ad.total_revenue)}</td>
        <td>${ad.total_spend > 0 ? ad.roas.toFixed(2) + 'x' : '—'}</td>
        <td>${ad.sale_count > 0 ? money(ad.avg_rev_per_client) : '—'}</td>
      `;

      // Toggle detail on click
      tr.addEventListener('click', function (e) {
        if (e.target.classList.contains('inline-spend')) return;
        const next = tr.nextElementSibling;
        if (next && next.classList.contains('lead-detail-row')) {
          next.remove();
        } else {
          let salesHtml = '';
          if (ad.sales && ad.sales.length > 0) {
            salesHtml = `
              <div class="sales-detail">
                <h4>Sold Contacts</h4>
                <table>
                  <thead><tr><th>Name</th><th>Date</th><th>Type</th></tr></thead>
                  <tbody>${ad.sales.map((s) => `<tr>
                    <td>${esc(s.name)}</td>
                    <td>${esc(s.date)}</td>
                    <td>${esc(s.sale_type)}</td>
                  </tr>`).join('')}</tbody>
                </table>
              </div>`;
          }

          const detailRow = document.createElement('tr');
          detailRow.className = 'lead-detail-row';
          detailRow.innerHTML = `<td colspan="15"><div class="lead-detail">
            <h4>Lead Details</h4>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Date</th><th>Appt</th><th>Booking</th><th>Sale</th></tr></thead>
              <tbody>${ad.leads.map((l) => `<tr>
                <td>${esc(l.name)}</td>
                <td>${esc(l.email)}</td>
                <td>${esc(l.phone)}</td>
                <td>${esc(l.date)}</td>
                <td>${l.is_scheduled ? 'Yes' : ''}</td>
                <td>${l.booking_type === 'autobooked' ? 'Auto (T65)' : l.booking_type === 'va_booked' ? 'VA' : ''}</td>
                <td>${l.is_sale ? esc(l.sale_type) : ''}</td>
              </tr>`).join('')}</tbody>
            </table>
            ${salesHtml}
          </div></td>`;
          tr.after(detailRow);
        }
      });

      // Inline spend edit
      const spendCell = tr.querySelector('.spend-cell');
      spendCell.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        const range = currentDateRange();
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'inline-spend';
        input.step = '0.01';
        input.min = '0';
        input.value = ad.total_spend || '';
        spendCell.textContent = '';
        spendCell.appendChild(input);
        input.focus();

        async function save() {
          const val = parseFloat(input.value);
          if (isNaN(val) || val < 0) {
            spendCell.textContent = money(ad.total_spend);
            return;
          }
          try {
            await api('/api/spend', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ad_name: ad.ad_name, date: range.end, spend: val }),
            });
            loadDashboard();
          } catch (err) {
            showError('Failed to save spend: ' + err.message);
            spendCell.textContent = money(ad.total_spend);
          }
        }

        input.addEventListener('blur', save);
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { input.blur(); }
          if (ev.key === 'Escape') {
            spendCell.textContent = money(ad.total_spend);
          }
        });
      });

      tbody.appendChild(tr);
    });

    // Update sort indicators
    document.querySelectorAll('th.sortable').forEach((th) => {
      th.classList.remove('sort-active', 'sort-desc');
      if (th.dataset.sort === currentSort.field) {
        th.classList.add('sort-active');
        if (currentSort.desc) th.classList.add('sort-desc');
      }
    });
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function populateAdDropdown(data) {
    const list = document.getElementById('ad-name-list');
    const names = new Set();
    if (data) {
      data.leads_by_ad.forEach((a) => names.add(a.ad_name));
    }

    // Also fetch from spend DB + known ads
    api('/api/ads').then((res) => {
      (res.ads || []).forEach((n) => names.add(n));
      list.innerHTML = '';
      [...names].sort().forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        list.appendChild(opt);
      });
    }).catch(() => {});
  }

  function populateContactDropdown(data) {
    const list = document.getElementById('contact-name-list');
    list.innerHTML = '';
    if (!data) return;
    const contacts = new Set();
    data.leads_by_ad.forEach((ad) => {
      if (ad.sales) {
        ad.sales.forEach((s) => { if (s.name) contacts.add(s.name); });
      }
      if (ad.leads) {
        ad.leads.forEach((l) => { if (l.name) contacts.add(l.name); });
      }
    });
    [...contacts].sort().forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      list.appendChild(opt);
    });
  }

  // Spend entries
  async function loadSpendEntries() {
    const range = currentDateRange();
    if (!range || !range.start || !range.end) return;

    try {
      const data = await api(`/api/spend?start=${range.start}&end=${range.end}`);
      const tbody = document.getElementById('spend-table-body');
      const table = document.getElementById('spend-table');
      const empty = document.getElementById('spend-entries-empty');

      if (data.spend.length === 0) {
        table.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');
      table.classList.remove('hidden');
      tbody.innerHTML = '';

      data.spend.forEach((entry) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${esc(entry.ad_name)}</td>
          <td>${esc(entry.date)}</td>
          <td>${money(entry.spend)}</td>
          <td><button class="btn btn-small btn-danger" data-id="${entry.id}">Delete</button></td>
        `;
        tr.querySelector('button').addEventListener('click', async () => {
          try {
            await api(`/api/spend/${entry.id}`, { method: 'DELETE' });
            loadSpendEntries();
            loadDashboard();
          } catch (err) {
            showError('Failed to delete: ' + err.message);
          }
        });
        tbody.appendChild(tr);
      });
    } catch (err) {
      showError('Failed to load spend entries: ' + err.message);
    }
  }

  // Revenue entries
  async function loadRevenueEntries() {
    const range = currentDateRange();
    if (!range || !range.start || !range.end) return;

    try {
      const data = await api(`/api/revenue?start=${range.start}&end=${range.end}`);
      const tbody = document.getElementById('revenue-table-body');
      const table = document.getElementById('revenue-table');
      const empty = document.getElementById('revenue-entries-empty');

      if (data.revenue.length === 0) {
        table.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');
      table.classList.remove('hidden');
      tbody.innerHTML = '';

      data.revenue.forEach((entry) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${esc(entry.ad_name)}</td>
          <td>${esc(entry.date)}</td>
          <td>${money(entry.revenue)}</td>
          <td>${esc(entry.contact_name || '')}</td>
          <td><button class="btn btn-small btn-danger" data-id="${entry.id}">Delete</button></td>
        `;
        tr.querySelector('button').addEventListener('click', async () => {
          try {
            await api(`/api/revenue/${entry.id}`, { method: 'DELETE' });
            loadRevenueEntries();
            loadDashboard();
          } catch (err) {
            showError('Failed to delete: ' + err.message);
          }
        });
        tbody.appendChild(tr);
      });
    } catch (err) {
      showError('Failed to load revenue entries: ' + err.message);
    }
  }

  // Event listeners
  document.querySelectorAll('.btn-toggle').forEach((btn) => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.btn-toggle').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const custom = document.getElementById('custom-range');
      if (btn.dataset.range === 'custom') {
        custom.classList.remove('hidden');
      } else {
        custom.classList.add('hidden');
        loadDashboard();
        loadSpendEntries();
        loadRevenueEntries();
      }
    });
  });

  document.getElementById('btn-apply-range').addEventListener('click', () => {
    loadDashboard();
    loadSpendEntries();
    loadRevenueEntries();
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadDashboard();
    loadSpendEntries();
    loadRevenueEntries();
  });

  document.getElementById('btn-error-retry').addEventListener('click', () => {
    loadDashboard();
    loadSpendEntries();
    loadRevenueEntries();
  });

  document.getElementById('btn-error-dismiss').addEventListener('click', hideError);

  // Sort
  document.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (currentSort.field === field) {
        currentSort.desc = !currentSort.desc;
      } else {
        currentSort.field = field;
        currentSort.desc = true;
      }
      if (dashboardData) renderTable(dashboardData);
    });
  });

  // Save spend
  document.getElementById('btn-save-spend').addEventListener('click', async () => {
    const adName = document.getElementById('spend-ad-name').value.trim();
    const date = document.getElementById('spend-date').value;
    const spend = parseFloat(document.getElementById('spend-amount').value);

    if (!adName) return showError('Please enter an ad name');
    if (!date) return showError('Please select a date');
    if (isNaN(spend) || spend < 0) return showError('Please enter a valid spend amount');

    try {
      await api('/api/spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_name: adName, date, spend }),
      });
      document.getElementById('spend-amount').value = '';
      hideError();
      loadSpendEntries();
      loadDashboard();
    } catch (err) {
      showError('Failed to save spend: ' + err.message);
    }
  });

  // Save revenue
  document.getElementById('btn-save-revenue').addEventListener('click', async () => {
    const adName = document.getElementById('revenue-ad-name').value.trim();
    const date = document.getElementById('revenue-date').value;
    const revenue = parseFloat(document.getElementById('revenue-amount').value);
    const contactName = document.getElementById('revenue-contact').value.trim();

    if (!adName) return showError('Please enter an ad name');
    if (!date) return showError('Please select a date');
    if (isNaN(revenue) || revenue < 0) return showError('Please enter a valid revenue amount');

    try {
      await api('/api/revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_name: adName, date, revenue, contact_name: contactName || null }),
      });
      document.getElementById('revenue-amount').value = '';
      document.getElementById('revenue-contact').value = '';
      hideError();
      loadRevenueEntries();
      loadDashboard();
    } catch (err) {
      showError('Failed to save revenue: ' + err.message);
    }
  });

  // Set default dates for inputs
  document.getElementById('spend-date').value = fmt(new Date());
  document.getElementById('revenue-date').value = fmt(new Date());

  // Initial load
  loadDashboard();
  loadSpendEntries();
  loadRevenueEntries();
  populateAdDropdown(null);
})();

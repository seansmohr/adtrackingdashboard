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
  async function api(url) {
    const res = await fetch(url);
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

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
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
  }

  function renderTable(data) {
    const ads = [...data.leads_by_ad];

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
      `;

      // Toggle detail on click
      tr.addEventListener('click', function () {
        const next = tr.nextElementSibling;
        if (next && next.classList.contains('lead-detail-row')) {
          next.remove();
        } else {
          const detailRow = document.createElement('tr');
          detailRow.className = 'lead-detail-row';
          detailRow.innerHTML = `<td colspan="3"><div class="lead-detail">
            <h4>Lead Details</h4>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Date</th><th>Appt</th></tr></thead>
              <tbody>${ad.leads.map((l) => `<tr>
                <td>${esc(l.name)}</td>
                <td>${esc(l.email)}</td>
                <td>${esc(l.phone)}</td>
                <td>${esc(l.date)}</td>
                <td>${l.is_scheduled ? 'Yes' : ''}</td>
              </tr>`).join('')}</tbody>
            </table>
          </div></td>`;
          tr.after(detailRow);
        }
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
      }
    });
  });

  document.getElementById('btn-apply-range').addEventListener('click', loadDashboard);
  document.getElementById('btn-refresh').addEventListener('click', loadDashboard);
  document.getElementById('btn-error-retry').addEventListener('click', loadDashboard);
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

  // Initial load
  loadDashboard();
})();

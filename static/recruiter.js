/* ============================================================
   Recruiter Dashboard JS
   ============================================================ */

// ── Elements ─────────────────────────────────────────────────
const candidateInput   = document.getElementById('recruiter-resume-input');
const downloadCsvBtn   = document.getElementById('download-recruiter-csv');
const errorToast       = document.getElementById('error-toast');
const errorMsg         = document.getElementById('error-msg');
const errorClose       = document.getElementById('error-close');
const uploadToast      = document.getElementById('upload-toast');
const toastMsg         = document.getElementById('toast-msg');
const modalOverlay     = document.getElementById('modal-overlay');
const modalClose       = document.getElementById('modal-close');
const searchInput      = document.getElementById('candidate-search');
const sortSelect       = document.getElementById('sort-select');
const tbody            = document.getElementById('candidates-tbody');
const tableEmpty       = document.getElementById('table-empty');

let allCandidates = [];   // raw CSV rows from API
let barChart = null;
let radarChart = null;

// ── SVG gradient ──────────────────────────────────────────────
function injectRingGradient() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.innerHTML = `<defs>
    <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
  </defs>`;
  document.body.prepend(svg);
}
injectRingGradient();

// ── Helpers ───────────────────────────────────────────────────
function num(val) { const n = parseFloat(val); return isNaN(n) ? 0 : n; }

function gradeInfo(score) {
  if (score >= 85) return { label: 'S',  cls: 'grade-s' };
  if (score >= 70) return { label: 'A',  cls: 'grade-a' };
  if (score >= 55) return { label: 'B',  cls: 'grade-b' };
  if (score >= 40) return { label: 'C',  cls: 'grade-c' };
  return               { label: 'D',    cls: 'grade-d' };
}

function computeFinal(row) {
  const base = num(row.open_source_score) + num(row.self_projects_score)
             + num(row.production_score)  + num(row.technical_skills_score);
  return Math.max(0, Math.min(120, base + num(row.bonus_points) - num(row.deductions)));
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorToast.classList.remove('hidden');
}

function showToast(msg) {
  toastMsg.textContent = msg;
  uploadToast.classList.remove('hidden');
}

function hideToast() { uploadToast.classList.add('hidden'); }

errorClose.addEventListener('click', () => errorToast.classList.add('hidden'));

// ── Load data from CSV API ────────────────────────────────────
async function loadData() {
  try {
    const res  = await fetch('/api/recruiter/data');
    const rows = await res.json();
    allCandidates = rows;
    renderDashboard(rows);
  } catch (err) {
    showError('Failed to load candidate data.');
  }
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats(rows) {
  const scores = rows.map(r => computeFinal(r));
  const total   = rows.length;
  const avg     = total ? (scores.reduce((a,b) => a+b, 0) / total).toFixed(1) : '–';
  const top     = total ? Math.max(...scores).toFixed(1) : '–';
  const passing = scores.filter(s => s >= 60).length;

  document.getElementById('stat-total-val').textContent   = total;
  document.getElementById('stat-avg-val').textContent     = avg;
  document.getElementById('stat-top-val').textContent     = top;
  document.getElementById('stat-passing-val').textContent = passing;
}

// ── Charts ────────────────────────────────────────────────────
const CHART_COLORS = {
  bar: 'rgba(99,102,241,0.7)',
  barBorder: 'rgba(99,102,241,1)',
  radar: [
    'rgba(99,102,241,0.25)',
    'rgba(99,102,241,0.8)',
  ]
};

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';

function renderBarChart(rows) {
  const labels = rows.map(r => r.name || r.file_name || 'Unknown');
  const data   = rows.map(r => computeFinal(r));

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('bar-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'ATS Score',
        data,
        backgroundColor: data.map(s =>
          s >= 85 ? 'rgba(16,185,129,0.7)' :
          s >= 70 ? 'rgba(99,102,241,0.7)' :
          s >= 55 ? 'rgba(6,182,212,0.7)'  :
          s >= 40 ? 'rgba(245,158,11,0.7)' :
                    'rgba(244,63,94,0.7)'
        ),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 40, font: { size: 11 } } },
        y: { min: 0, max: 120, grid: { color: 'rgba(255,255,255,0.04)' } },
      }
    }
  });
}

function renderRadarChart(rows) {
  const avg = key => rows.length
    ? rows.reduce((acc, r) => acc + num(r[key]), 0) / rows.length
    : 0;

  const catMaxes = { open_source_score: 35, self_projects_score: 30, production_score: 25, technical_skills_score: 10 };
  const labels   = ['Open Source', 'Self Projects', 'Production', 'Tech Skills'];
  const keys     = ['open_source_score', 'self_projects_score', 'production_score', 'technical_skills_score'];
  const data     = keys.map((k, i) => {
    const max = catMaxes[k];
    return Math.round((avg(k) / max) * 100);
  });

  if (radarChart) radarChart.destroy();
  radarChart = new Chart(document.getElementById('radar-chart'), {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Avg %',
        data,
        backgroundColor: CHART_COLORS.radar[0],
        borderColor: CHART_COLORS.radar[1],
        borderWidth: 2,
        pointBackgroundColor: CHART_COLORS.radar[1],
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { stepSize: 25, font: { size: 10 }, color: '#64748b', backdropColor: 'transparent' },
          pointLabels: { font: { size: 11 }, color: '#94a3b8' }
        }
      }
    }
  });
}

// ── Table ─────────────────────────────────────────────────────
function renderTable(rows) {
  if (!rows.length) {
    tableEmpty.classList.remove('hidden');
    tbody.innerHTML = '';
    return;
  }
  tableEmpty.classList.add('hidden');

  tbody.innerHTML = rows.map((row, idx) => {
    const score = computeFinal(row);
    const { label: grade, cls: gradeCls } = gradeInfo(score);
    const position = [row.current_position, row.current_company].filter(Boolean).join(' @ ') || '–';
    return `
      <tr data-idx="${idx}" onclick="openModal(${idx})">
        <td>${idx + 1}</td>
        <td class="candidate-name-cell">${row.name || '–'}</td>
        <td style="color:var(--c-text-2);font-size:0.82rem">${position}</td>
        <td class="score-cell" style="color:#6366f1">${num(row.open_source_score)}</td>
        <td class="score-cell" style="color:#8b5cf6">${num(row.self_projects_score)}</td>
        <td class="score-cell" style="color:#06b6d4">${num(row.production_score)}</td>
        <td class="score-cell" style="color:#10b981">${num(row.technical_skills_score)}</td>
        <td class="score-cell" style="color:#f59e0b">+${num(row.bonus_points)}</td>
        <td class="score-cell" style="font-size:1rem">${score.toFixed(1)}</td>
        <td><span class="grade-badge ${gradeCls}">${grade}</span></td>
        <td><button class="detail-btn" onclick="event.stopPropagation();openModal(${idx})">View →</button></td>
      </tr>
    `;
  }).join('');
}

// ── Dashboard render ──────────────────────────────────────────
function renderDashboard(rows) {
  renderStats(rows);
  renderBarChart(rows);
  renderRadarChart(rows);
  renderTable(filteredSorted(rows));
}

// ── Search & Sort ─────────────────────────────────────────────
function filteredSorted(rows) {
  const q     = (searchInput.value || '').toLowerCase();
  const sort  = sortSelect.value;

  let filtered = q
    ? rows.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.current_company || '').toLowerCase().includes(q) ||
        (r.current_position || '').toLowerCase().includes(q)
      )
    : [...rows];

  filtered.sort((a, b) => {
    switch (sort) {
      case 'total_score_desc': return computeFinal(b) - computeFinal(a);
      case 'total_score_asc':  return computeFinal(a) - computeFinal(b);
      case 'name_asc':         return (a.name||'').localeCompare(b.name||'');
      case 'name_desc':        return (b.name||'').localeCompare(a.name||'');
      default: return 0;
    }
  });
  return filtered;
}

searchInput.addEventListener('input', () => renderTable(filteredSorted(allCandidates)));
sortSelect.addEventListener('change', () => renderTable(filteredSorted(allCandidates)));

// ── Modal ─────────────────────────────────────────────────────
function openModal(idx) {
  const rows = filteredSorted(allCandidates);
  const row  = rows[idx];
  if (!row) return;

  const score = computeFinal(row);
  const circumference = 326.7;
  const pct   = Math.min(score / 100, 1);
  const fill  = document.getElementById('modal-ring-fill');
  fill.style.strokeDashoffset = 326.7; // reset
  requestAnimationFrame(() => {
    fill.style.transition = 'stroke-dashoffset 1s ease';
    fill.style.strokeDashoffset = circumference * (1 - pct);
  });

  document.getElementById('modal-score').textContent    = score.toFixed(0);
  document.getElementById('modal-name').textContent     = row.name || '–';
  document.getElementById('modal-position').textContent = [row.current_position, row.current_company].filter(Boolean).join(' @ ') || '–';
  document.getElementById('modal-email').textContent    = row.email || '';

  const { label: grade, cls: gradeCls } = gradeInfo(score);
  const mb = document.getElementById('modal-badge');
  mb.textContent  = grade + (score >= 85 ? ' — Exceptional' : score >= 70 ? ' — Excellent' : score >= 55 ? ' — Good' : score >= 40 ? ' — Average' : ' — Needs Work');
  mb.className    = `modal-badge ${gradeCls}`;

  // Category bars
  const cats = [
    { key: 'open_source_score',      label: '🌐 Open Source',          max: 35, color: '#6366f1' },
    { key: 'self_projects_score',    label: '🚀 Self Projects',         max: 30, color: '#8b5cf6' },
    { key: 'production_score',       label: '🏢 Production Experience', max: 25, color: '#06b6d4' },
    { key: 'technical_skills_score', label: '💻 Technical Skills',      max: 10, color: '#10b981' },
  ];
  document.getElementById('modal-scores').innerHTML = cats.map(c => {
    const val = num(row[c.key]);
    const pct = Math.round((val / c.max) * 100);
    return `
      <div class="modal-score-row">
        <span class="modal-score-label">
          ${c.label}
          <span class="modal-score-val" style="color:${c.color}">${val}/${c.max}</span>
        </span>
        <div class="progress-bar-wrap">
          <div class="progress-bar" style="width:${pct}%;background:${c.color}"></div>
        </div>
      </div>
    `;
  }).join('');

  // Strengths / improvements
  const strengths = (row.key_strengths || '').split(';').filter(Boolean);
  const improvements = (row.areas_for_improvement || '').split(';').filter(Boolean);
  document.getElementById('modal-strengths').innerHTML    = strengths.map(s => `<li>${s.trim()}</li>`).join('') || '<li>–</li>';
  document.getElementById('modal-improvements').innerHTML = improvements.map(s => `<li>${s.trim()}</li>`).join('') || '<li>–</li>';

  // Skills
  const skills = (row.skills_list || '').split(',').filter(Boolean);
  document.getElementById('modal-skills').innerHTML = skills.map(s => `<span class="skill-tag">${s.trim()}</span>`).join('');

  modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

function closeModal() {
  modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Upload resume ─────────────────────────────────────────────
candidateInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showError('Only PDF files are allowed.');
    return;
  }

  showToast('Uploading and analyzing resume… this may take a minute.');

  const formData = new FormData();
  formData.append('resume', file);

  try {
    const res  = await fetch('/api/recruiter/upload', { method: 'POST', body: formData });
    const json = await res.json();
    hideToast();

    if (!res.ok || !json.success) {
      showError(json.error || 'Failed to process resume.');
      return;
    }

    // Reload data to reflect new candidate
    await loadData();
  } catch (err) {
    hideToast();
    showError('Network error. Is the server running?');
  }

  candidateInput.value = '';
});

// ── Download CSV ──────────────────────────────────────────────
downloadCsvBtn.addEventListener('click', () => {
  window.location.href = '/api/recruiter/download';
});

// ── Init ──────────────────────────────────────────────────────
loadData();

/* ============================================================
   Individual page JS
   ============================================================ */

// ── Elements ─────────────────────────────────────────────────
const uploadPanel   = document.getElementById('upload-panel');
const loadingPanel  = document.getElementById('loading-panel');
const resultsPanel  = document.getElementById('results-panel');
const dropZone      = document.getElementById('drop-zone');
const uploadZone    = document.getElementById('upload-zone');
const resumeInput   = document.getElementById('resume-input');
const fileSelected  = document.getElementById('file-selected');
const fileNameDisp  = document.getElementById('file-name-display');
const fileSizeDisp  = document.getElementById('file-size-display');
const fileRemoveBtn = document.getElementById('file-remove-btn');
const analyzeBtn    = document.getElementById('analyze-btn');
const errorToast    = document.getElementById('error-toast');
const errorMsg      = document.getElementById('error-msg');
const errorClose    = document.getElementById('error-close');
const downloadCsv   = document.getElementById('download-csv-btn-individual');
const analyzeAnother= document.getElementById('analyze-another-btn');

let selectedFile = null;

// ── SVG gradient for score ring ───────────────────────────────
function injectRingGradient() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.innerHTML = `<defs>
    <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>`;
  document.body.prepend(svg);
}
injectRingGradient();

// ── File handling ─────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showFileSelected(file) {
  selectedFile = file;
  fileNameDisp.textContent = file.name;
  fileSizeDisp.textContent = formatSize(file.size);
  fileSelected.classList.remove('hidden');
  uploadZone.classList.add('hidden');
}

function clearFile() {
  selectedFile = null;
  resumeInput.value = '';
  fileSelected.classList.add('hidden');
  uploadZone.classList.remove('hidden');
}

resumeInput.addEventListener('change', e => {
  if (e.target.files[0]) showFileSelected(e.target.files[0]);
});

fileRemoveBtn.addEventListener('click', clearFile);

// Drag & Drop
['dragenter', 'dragover'].forEach(ev => {
  dropZone.addEventListener(ev, e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
});
['dragleave', 'drop'].forEach(ev => {
  dropZone.addEventListener(ev, e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); });
});
dropZone.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') showFileSelected(file);
  else showError('Please drop a PDF file.');
});

// ── Loading step animation ────────────────────────────────────
const steps = ['step-extract', 'step-github', 'step-evaluate', 'step-save'];
let stepInterval = null;

function startLoadingSteps() {
  let idx = 0;
  steps.forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'done');
  });
  document.getElementById(steps[0]).classList.add('active');
  stepInterval = setInterval(() => {
    document.getElementById(steps[idx]).classList.remove('active');
    document.getElementById(steps[idx]).classList.add('done');
    idx++;
    if (idx < steps.length) {
      document.getElementById(steps[idx]).classList.add('active');
    } else {
      clearInterval(stepInterval);
    }
  }, 4000);
}

function stopLoadingSteps() {
  if (stepInterval) clearInterval(stepInterval);
  steps.forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active');
    el.classList.add('done');
  });
}

// ── Analyze ───────────────────────────────────────────────────
analyzeBtn.addEventListener('click', uploadAndAnalyze);

async function uploadAndAnalyze() {
  if (!selectedFile) return;

  uploadPanel.classList.add('hidden');
  loadingPanel.classList.remove('hidden');
  startLoadingSteps();

  const formData = new FormData();
  formData.append('resume', selectedFile);

  try {
    const res = await fetch('/api/individual/upload', { method: 'POST', body: formData });
    const json = await res.json();

    stopLoadingSteps();

    if (!res.ok || !json.success) {
      showError(json.error || 'Evaluation failed. Please try again.');
      loadingPanel.classList.add('hidden');
      uploadPanel.classList.remove('hidden');
      clearFile();
      return;
    }

    loadingPanel.classList.add('hidden');
    renderResults(json.data);
    resultsPanel.classList.remove('hidden');

  } catch (err) {
    stopLoadingSteps();
    loadingPanel.classList.add('hidden');
    uploadPanel.classList.remove('hidden');
    clearFile();
    showError('Network error. Is the server running?');
  }
}

// ── Render Results ────────────────────────────────────────────
const CAT_META = {
  open_source:      { label: '🌐 Open Source',          color: '#6366f1', max: 35 },
  self_projects:    { label: '🚀 Self Projects',         color: '#8b5cf6', max: 30 },
  production:       { label: '🏢 Production Experience', color: '#06b6d4', max: 25 },
  technical_skills: { label: '💻 Technical Skills',      color: '#10b981', max: 10 },
};

function gradeInfo(score) {
  if (score >= 85) return { label: 'S — Exceptional',  cls: 'grade-s' };
  if (score >= 70) return { label: 'A — Excellent',     cls: 'grade-a' };
  if (score >= 55) return { label: 'B — Good',          cls: 'grade-b' };
  if (score >= 40) return { label: 'C — Average',       cls: 'grade-c' };
  return               { label: 'D — Needs Work',       cls: 'grade-d' };
}

function renderResults(data) {
  // Score ring
  const score = parseFloat(data.final_score) || 0;
  document.getElementById('final-score').textContent = score.toFixed(0);

  const circumference = 326.7;
  const pct = Math.min(score / 100, 1);
  const fill = document.getElementById('score-ring-fill');
  fill.style.strokeDashoffset = circumference * (1 - pct);

  // Grade badge
  const { label: gradeLabel, cls: gradeCls } = gradeInfo(score);
  const badge = document.getElementById('score-badge');
  badge.textContent = gradeLabel;
  badge.className = `score-badge ${gradeCls}`;

  document.getElementById('candidate-name').textContent = data.candidate_name || 'Candidate';
  const pos = [data.current_position, data.current_company].filter(Boolean).join(' @ ');
  document.getElementById('candidate-position').textContent = pos || '–';

  // Category cards
  const grid = document.getElementById('scores-grid');
  grid.innerHTML = '';
  Object.entries(data.scores || {}).forEach(([key, cat]) => {
    const meta = CAT_META[key] || { label: key, color: '#6366f1', max: cat.max };
    const pctBar = Math.round((cat.score / cat.max) * 100);
    grid.insertAdjacentHTML('beforeend', `
      <div class="score-cat-card">
        <div class="cat-header">
          <span class="cat-name">${meta.label}</span>
          <span class="cat-score" style="color:${meta.color}">${cat.score}/${cat.max}</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar" style="width:0%;background:${meta.color}" data-width="${pctBar}%"></div>
        </div>
        <p class="cat-evidence">${cat.evidence || ''}</p>
      </div>
    `);
  });

  // Animate progress bars
  requestAnimationFrame(() => {
    grid.querySelectorAll('.progress-bar').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  });

  // Bonus
  const bonus = parseFloat(data.bonus_points) || 0;
  document.getElementById('bonus-value').textContent = `+${bonus}`;
  document.getElementById('bonus-detail').textContent = data.bonus_breakdown || '';

  const deduction = parseFloat(data.deductions) || 0;
  if (deduction > 0) {
    document.getElementById('deduction-card').classList.remove('hidden');
    document.getElementById('deduction-value').textContent = `-${deduction}`;
    document.getElementById('deduction-detail').textContent = data.deduction_reasons || '';
  }

  // Strengths
  const sl = document.getElementById('strengths-list');
  sl.innerHTML = (data.key_strengths || []).map(s => `<li>${s}</li>`).join('');

  // Improvements
  const il = document.getElementById('improvements-list');
  il.innerHTML = (data.areas_for_improvement || []).map(a => `<li>${a}</li>`).join('');

  // Skills
  const st = document.getElementById('skills-tags');
  st.innerHTML = (data.skills || []).map(s => `<span class="skill-tag">${s}</span>`).join('');

  // Contact
  const cr = document.getElementById('contact-row');
  const items = [];
  if (data.email) items.push(`<span class="contact-item">📧 ${data.email}</span>`);
  if (data.phone) items.push(`<span class="contact-item">📱 ${data.phone}</span>`);
  if (data.github_url) items.push(`<a class="contact-item" href="${data.github_url}" target="_blank" rel="noopener">🐙 GitHub</a>`);
  cr.innerHTML = items.join('');
}

// ── Error toast ───────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorToast.classList.remove('hidden');
}
errorClose.addEventListener('click', () => errorToast.classList.add('hidden'));

// ── Download CSV ──────────────────────────────────────────────
downloadCsv.addEventListener('click', () => {
  window.location.href = '/api/individual/download';
});

// ── Analyze Another ───────────────────────────────────────────
analyzeAnother.addEventListener('click', () => {
  resultsPanel.classList.add('hidden');
  clearFile();
  uploadPanel.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

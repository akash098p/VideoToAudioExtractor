// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
const state = {
  v: { buf: null, dur: 0, start: 0.1, end: 0.9, dragging: null, audioEl: null, raf: null, origBuf: null },
  a: { buf: null, dur: 0, start: 0.1, end: 0.9, dragging: null, audioEl: null, raf: null, origBuf: null }
};

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// ═══════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════
function switchTab(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active');
  document.getElementById('tab-' + id).classList.add('active');
}

// ═══════════════════════════════════════════
//  DRAG & DROP
// ═══════════════════════════════════════════
function vzDrag(e, over, panel) {
  e.preventDefault();
  const zone = panel === 'a' ? document.getElementById('a-upload-zone') : document.getElementById('v-upload-zone');
  if (zone) zone.classList.toggle('dragover', over);
}

function vzDrop(e, type) {
  e.preventDefault();
  const id = type === 'video' ? 'v-upload-zone' : 'a-upload-zone';
  document.getElementById(id)?.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  type === 'video' ? handleVideoFile(file) : handleAudioFile(file);
}

document.getElementById('videoInput').addEventListener('change', e => { if (e.target.files[0]) handleVideoFile(e.target.files[0]); });
document.getElementById('audioInput').addEventListener('change', e => { if (e.target.files[0]) handleAudioFile(e.target.files[0]); });

// ═══════════════════════════════════════════
//  FILE HANDLERS
// ═══════════════════════════════════════════
function fmtSize(bytes) {
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

async function handleVideoFile(file) {
  showStatus('v', 'Loading video...', 'loading');
  const url = URL.createObjectURL(file);
  const vid = document.getElementById('previewVideo');
  vid.src = url;
  state.v.audioEl = vid;

  document.getElementById('v-filename').textContent = file.name;
  document.getElementById('v-size').textContent = fmtSize(file.size);

  vid.onloadedmetadata = async () => {
    state.v.dur = vid.duration;
    document.getElementById('v-dur').textContent = fmt(vid.duration);
    document.getElementById('v-features').style.display = 'none';
    document.getElementById('v-upload-zone').style.display = 'none';
    document.getElementById('v-editor').style.display = 'block';

    showStatus('v', 'Decoding audio...', 'processing');
    try {
      const buf = await file.arrayBuffer();
      const ab = await getAudioCtx().decodeAudioData(buf);
      state.v.buf = ab;
      state.v.origBuf = ab;
      state.v.dur = ab.duration;
      state.v.start = 0.1; state.v.end = 0.9;
      drawWaveform('v');
      drawRuler('v');
      updateUI('v');
      showStatus('v', '✓ Ready — drag handles to select trim region', 'success');
    } catch(err) {
      showStatus('v', 'Could not decode audio: ' + err.message, 'error');
    }
  };
}

async function handleAudioFile(file) {
  showStatus('a', 'Loading audio...', 'loading');
  document.getElementById('a-filename').textContent = file.name;
  document.getElementById('a-size').textContent = fmtSize(file.size);
  document.getElementById('a-features').style.display = 'none';
  document.getElementById('a-upload-zone').style.display = 'none';
  document.getElementById('a-editor').style.display = 'block';

  showStatus('a', 'Decoding audio...', 'processing');
  try {
    const buf = await file.arrayBuffer();
    const ab = await getAudioCtx().decodeAudioData(buf);
    state.a.buf = ab;
    state.a.origBuf = ab;
    state.a.dur = ab.duration;
    state.a.start = 0.1; state.a.end = 0.9;

    // Create audio element for playback
    const url = URL.createObjectURL(file);
    const ael = new Audio(url);
    state.a.audioEl = ael;
    document.getElementById('a-dur').textContent = fmt(ab.duration);

    drawWaveform('a');
    drawRuler('a');
    updateUI('a');
    showStatus('a', '✓ Ready — trim or cut your audio', 'success');
  } catch(err) {
    showStatus('a', 'Could not decode audio: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════
//  WAVEFORM DRAWING
// ═══════════════════════════════════════════
function getCanvas(p) {
  return p === 'v' ? document.getElementById('waveformCanvas') : document.getElementById('audioWaveformCanvas');
}

function drawWaveform(p) {
  const s = state[p];
  if (!s.buf) return;
  const canvas = getCanvas(p);
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth * window.devicePixelRatio;
  const H = wrap.clientHeight * window.devicePixelRatio;
  canvas.width = W; canvas.height = H;
  canvas.style.width = '100%'; canvas.style.height = '100%';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#0f1117';
  ctx.fillRect(0, 0, W, H);

  const data = s.buf.getChannelData(0);
  const step = Math.ceil(data.length / W);
  const amp = H / 2;
  const startX = Math.floor(s.start * W);
  const endX = Math.floor(s.end * W);

  // Draw un-selected dim
  for (let i = 0; i < W; i++) {
    let mn = 1, mx = -1;
    for (let j = 0; j < step; j++) {
      const d = data[i * step + j] || 0;
      if (d < mn) mn = d; if (d > mx) mx = d;
    }
    const isSelected = i >= startX && i <= endX;
    if (!isSelected) {
      ctx.strokeStyle = '#2a2e3f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(i, (1 + mn) * amp);
      ctx.lineTo(i, (1 + mx) * amp);
      ctx.stroke();
    }
  }

  // Draw selected bright
  for (let i = startX; i <= endX; i++) {
    let mn = 1, mx = -1;
    for (let j = 0; j < step; j++) {
      const d = data[i * step + j] || 0;
      if (d < mn) mn = d; if (d > mx) mx = d;
    }
    const prog = (i - startX) / Math.max(1, endX - startX);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, p === 'a' ? '#0de8c5' : '#f0b429');
    g.addColorStop(1, p === 'a' ? '#0de8c550' : '#f0b42950');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(i, (1 + mn) * amp);
    ctx.lineTo(i, (1 + mx) * amp);
    ctx.stroke();
  }

  // Center line
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, amp); ctx.lineTo(W, amp);
  ctx.stroke();
}

function drawRuler(p) {
  const s = state[p];
  const cid = p === 'v' ? 'rulerCanvas' : 'audioRulerCanvas';
  const canvas = document.getElementById(cid);
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  canvas.width = W * 2; canvas.height = H * 2;
  canvas.style.width = '100%'; canvas.style.height = '100%';
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#0a0b0f';
  ctx.fillRect(0, 0, W, H);

  if (!s.buf) return;
  const dur = s.dur;
  const interval = dur <= 10 ? 1 : dur <= 60 ? 5 : dur <= 300 ? 15 : 30;
  ctx.fillStyle = '#4b5563';
  ctx.font = '8px DM Mono, monospace';
  ctx.textAlign = 'center';
  for (let t = 0; t <= dur; t += interval) {
    const x = (t / dur) * W;
    ctx.fillStyle = '#3a3f55';
    ctx.fillRect(x, 0, 1, H * 0.5);
    ctx.fillStyle = '#6b7280';
    ctx.fillText(fmt(t), x, H - 2);
  }
}

// ═══════════════════════════════════════════
//  UI UPDATE
// ═══════════════════════════════════════════
function updateUI(p) {
  const s = state[p];
  const dur = s.dur;

  const sT = s.start * dur;
  const eT = s.end * dur;
  const selDur = eT - sT;

  document.getElementById(p + '-start-disp').textContent = fmt(sT);
  document.getElementById(p + '-end-disp').textContent = fmt(eT);
  document.getElementById(p + '-dur-disp').textContent = fmt(selDur);
  document.getElementById(p + '-sel-label').textContent = `${fmt(sT)} → ${fmt(eT)}`;

  // Handles
  document.getElementById(p + '-start-handle').style.left = (s.start * 100) + '%';
  document.getElementById(p + '-end-handle').style.left = (s.end * 100) + '%';
  document.getElementById(p + '-sel-fill').style.left = (s.start * 100) + '%';
  document.getElementById(p + '-sel-fill').style.width = ((s.end - s.start) * 100) + '%';

  // Sliders
  const ss = document.getElementById(p + '-start-slider');
  const es = document.getElementById(p + '-end-slider');
  ss.value = s.start * 100;
  es.value = s.end * 100;
  document.getElementById(p + '-start-pct').textContent = Math.round(s.start * 100) + '%';
  document.getElementById(p + '-end-pct').textContent = Math.round(s.end * 100) + '%';
  ss.style.setProperty('--pct', (s.start * 100) + '%');
  es.style.setProperty('--pct', (s.end * 100) + '%');
}

// ═══════════════════════════════════════════
//  WAVEFORM MOUSE/TOUCH
// ═══════════════════════════════════════════
function getRelX(e, el) {
  const rect = el.getBoundingClientRect();
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  return Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
}

function nearHandle(p, pct) {
  const s = state[p];
  const d = 0.035;
  if (Math.abs(pct - s.start) < d) return 'start';
  if (Math.abs(pct - s.end) < d) return 'end';
  return null;
}

function wvMouseDown(e, p) {
  e.preventDefault();
  const wrap = document.getElementById(p + '-canvas-wrap');
  const pct = getRelX(e, wrap);
  const hit = nearHandle(p, pct);
  if (hit) {
    state[p].dragging = hit;
  } else {
    // click to move nearest
    const s = state[p];
    const dStart = Math.abs(pct - s.start);
    const dEnd = Math.abs(pct - s.end);
    state[p].dragging = dStart < dEnd ? 'start' : 'end';
    applyDrag(p, pct);
  }
}

function wvMouseMove(e, p) {
  if (!state[p].dragging) return;
  e.preventDefault();
  const wrap = document.getElementById(p + '-canvas-wrap');
  applyDrag(p, getRelX(e, wrap));
}

function wvMouseUp(e, p) { state[p].dragging = null; }

function wvTouchStart(e, p) { wvMouseDown(e, p); }
function wvTouchMove(e, p) { wvMouseMove(e, p); }

function applyDrag(p, pct) {
  const s = state[p];
  const MIN_GAP = 0.01;
  if (s.dragging === 'start') {
    s.start = Math.max(0, Math.min(pct, s.end - MIN_GAP));
  } else {
    s.end = Math.min(1, Math.max(pct, s.start + MIN_GAP));
  }
  drawWaveform(p);
  updateUI(p);
}

// ═══════════════════════════════════════════
//  SLIDERS
// ═══════════════════════════════════════════
function onSlider(p, which, el) {
  const v = parseFloat(el.value) / 100;
  const s = state[p];
  const MIN_GAP = 0.01;
  if (which === 'start') s.start = Math.min(v, s.end - MIN_GAP);
  else s.end = Math.max(v, s.start + MIN_GAP);
  drawWaveform(p);
  updateUI(p);
}

// ═══════════════════════════════════════════
//  QUICK SELECT
// ═══════════════════════════════════════════
function selectAll(p) { state[p].start = 0; state[p].end = 1; drawWaveform(p); updateUI(p); }
function selectFirst(p, frac) { state[p].start = 0; state[p].end = frac; drawWaveform(p); updateUI(p); }
function selectLast(p, frac) { state[p].start = 1 - frac; state[p].end = 1; drawWaveform(p); updateUI(p); }

// ═══════════════════════════════════════════
//  PLAYBACK
// ═══════════════════════════════════════════
function togglePlay(p) {
  const el = state[p].audioEl;
  if (!el) return;
  if (el.paused) {
    el.play();
    document.getElementById(p + '-play-btn').textContent = '⏸';
    startPlayhead(p);
  } else {
    el.pause();
    document.getElementById(p + '-play-btn').textContent = '▶';
    stopPlayhead(p);
  }
}

function startPlayhead(p) {
  const el = state[p].audioEl;
  const ph = document.getElementById(p + '-playhead');
  const dur = state[p].dur || el.duration;
  ph.style.display = 'block';

  function tick() {
    const t = el.currentTime;
    const pct = dur > 0 ? (t / dur) * 100 : 0;
    ph.style.left = pct + '%';
    document.getElementById(p + '-playback-time').textContent = fmt(t) + ' / ' + fmt(dur);
    if (!el.paused) state[p].raf = requestAnimationFrame(tick);
    else {
      document.getElementById(p + '-play-btn').textContent = '▶';
      ph.style.display = 'none';
    }
  }
  state[p].raf = requestAnimationFrame(tick);
}

function stopPlayhead(p) {
  if (state[p].raf) cancelAnimationFrame(state[p].raf);
  document.getElementById(p + '-playhead').style.display = 'none';
}

function setVolume(p, v) {
  if (state[p].audioEl) state[p].audioEl.volume = parseFloat(v);
}

// ═══════════════════════════════════════════
//  TRIM PREVIEW
// ═══════════════════════════════════════════
async function previewTrim(p) {
  const s = state[p];
  if (!s.buf) { showStatus(p, 'Load a file first', 'error'); return; }
  showStatus(p, 'Generating preview...', 'processing');
  try {
    const trimmed = await renderTrim(s.buf, s.start * s.dur, (s.end - s.start) * s.dur);
    const blob = bufToWav(trimmed);
    const url = URL.createObjectURL(blob);
    const wrapId = p + '-preview-audio-wrap';
    const audId = p + '-preview-audio';
    document.getElementById(wrapId).style.display = 'block';
    document.getElementById(audId).src = url;
    showStatus(p, '✓ Preview ready — press play below', 'success');
  } catch(e) {
    showStatus(p, 'Error: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════
async function exportAudio(p) {
  const s = state[p];
  if (!s.buf) { showStatus(p, 'Load a file first', 'error'); return; }
  showStatus(p, 'Exporting...', 'processing');
  try {
    const trimmed = await renderTrim(s.buf, s.start * s.dur, (s.end - s.start) * s.dur);
    const blob = bufToWav(trimmed);
    const name = (p === 'v' ? document.getElementById('v-filename') : document.getElementById('a-filename')).textContent;
    const base = name.replace(/\.[^.]+$/, '');
    dlBlob(blob, base + '_trimmed.wav');
    showStatus(p, '✓ Downloaded successfully!', 'success');
  } catch(e) {
    showStatus(p, 'Error: ' + e.message, 'error');
  }
}

async function renderTrim(buf, startT, durT) {
  const ctx = getAudioCtx();
  const samples = Math.floor(durT * buf.sampleRate);
  const off = new OfflineAudioContext(buf.numberOfChannels, samples, buf.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0, startT, durT);
  return await off.startRendering();
}

// ═══════════════════════════════════════════
//  CUT REGION
// ═══════════════════════════════════════════
async function cutRegion(p) {
  const s = state[p];
  if (!s.buf) { showStatus(p, 'Load a file first', 'error'); return; }
  showStatus(p, 'Cutting region...', 'processing');
  try {
    // Render before start + after end
    const buf = s.buf;
    const sr = buf.sampleRate;
    const ch = buf.numberOfChannels;
    const startSample = Math.floor(s.start * s.dur * sr);
    const endSample = Math.floor(s.end * s.dur * sr);
    const beforeLen = startSample;
    const afterLen = buf.length - endSample;
    const totalLen = beforeLen + afterLen;

    if (totalLen <= 0) { showStatus(p, 'Nothing left after cut!', 'error'); return; }

    const ctx = getAudioCtx();
    const newBuf = ctx.createBuffer(ch, totalLen, sr);
    for (let c = 0; c < ch; c++) {
      const src = buf.getChannelData(c);
      const dst = newBuf.getChannelData(c);
      dst.set(src.subarray(0, beforeLen), 0);
      dst.set(src.subarray(endSample), beforeLen);
    }

    s.buf = newBuf;
    s.dur = newBuf.duration;
    s.start = 0.1; s.end = 0.9;
    document.getElementById('a-dur').textContent = fmt(s.dur);
    drawWaveform(p);
    drawRuler(p);
    updateUI(p);
    showStatus(p, '✓ Region cut — you can undo or export', 'success');
  } catch(e) {
    showStatus(p, 'Error: ' + e.message, 'error');
  }
}

function undoCut(p) {
  const s = state[p];
  if (!s.origBuf) { showStatus(p, 'Nothing to undo', 'error'); return; }
  s.buf = s.origBuf;
  s.dur = s.origBuf.duration;
  s.start = 0.1; s.end = 0.9;
  document.getElementById('a-dur').textContent = fmt(s.dur);
  drawWaveform(p);
  drawRuler(p);
  updateUI(p);
  showStatus(p, '✓ Restored to original', 'success');
}

// ═══════════════════════════════════════════
//  WAV ENCODER
// ═══════════════════════════════════════════
function bufToWav(buf) {
  const ch = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const len = buf.length;
  const ab = new ArrayBuffer(44 + len * ch * 2);
  const view = new DataView(ab);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + len * ch * 2, true);
  str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * ch * 2, true);
  view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, len * ch * 2, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

function dlBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// ═══════════════════════════════════════════
//  STATUS
// ═══════════════════════════════════════════
const statusTimers = {};
function showStatus(p, msg, type) {
  const el = document.getElementById(p + '-status');
  el.textContent = msg;
  el.className = 'status-bar ' + type;
  el.style.display = 'block';
  clearTimeout(statusTimers[p]);
  if (type === 'success' || type === 'error') {
    statusTimers[p] = setTimeout(() => { el.style.display = 'none'; }, 4000);
  }
}

// ═══════════════════════════════════════════
//  RESET
// ═══════════════════════════════════════════
function resetVideo() {
  const s = state.v;
  if (s.audioEl) { s.audioEl.pause(); s.audioEl.src = ''; }
  s.buf = null; s.origBuf = null; s.dur = 0; s.start = 0.1; s.end = 0.9;
  document.getElementById('v-upload-zone').style.display = 'block';
  document.getElementById('v-editor').style.display = 'none';
  document.getElementById('v-features').style.display = 'grid';
  document.getElementById('videoInput').value = '';
  document.getElementById('v-preview-audio-wrap').style.display = 'none';
  document.getElementById('v-status').style.display = 'none';
}

function resetAudio() {
  const s = state.a;
  if (s.audioEl) { s.audioEl.pause(); s.audioEl.src = ''; }
  s.buf = null; s.origBuf = null; s.dur = 0; s.start = 0.1; s.end = 0.9;
  document.getElementById('a-upload-zone').style.display = 'block';
  document.getElementById('a-editor').style.display = 'none';
  document.getElementById('a-features').style.display = 'grid';
  document.getElementById('audioInput').value = '';
  document.getElementById('a-preview-audio-wrap').style.display = 'none';
  document.getElementById('a-status').style.display = 'none';
}

// ═══════════════════════════════════════════
//  TIME FORMAT
// ═══════════════════════════════════════════
function fmt(s) {
  if (!isFinite(s)) return '0:00.00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${m}:${String(sec).padStart(2,'0')}.${String(ms).padStart(2,'0')}`;
}

// ═══════════════════════════════════════════
//  RESIZE HANDLER
// ═══════════════════════════════════════════
window.addEventListener('resize', () => {
  if (state.v.buf) { drawWaveform('v'); drawRuler('v'); }
  if (state.a.buf) { drawWaveform('a'); drawRuler('a'); }
});

// ── INIT ──
document.getElementById('yr').textContent = new Date().getFullYear();
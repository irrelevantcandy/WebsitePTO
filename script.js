/* ==========================================================
   SWIMGUARD Dashboard - Simulasi data sEMG real-time
   ========================================================== */
(() => {
  'use strict';

  /* ---------- Helper ---------- */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, '0');

  /* ---------- Konstanta ---------- */
  const N = 60;                    // jumlah titik grafik (detik)
  const TARGET = 45 * 60;          // target sesi (detik)
  const RING_C = 339.29;           // keliling lingkaran timer
  const LV = { ok: 0, warn: 1, bad: 2 };
  const LABEL = { ok: 'Aman', warn: 'Waspada', bad: 'Bahaya' };
  const HIST_LABEL = { ok: 'Normal', warn: 'Waspada', bad: 'Bahaya' };
  const AVATARS = [
    ['#3a3cff', '#6f8bff'], ['#ff7a59', '#ffb15c'], ['#14b883', '#5fe0b4'],
    ['#a24dff', '#d08bff'], ['#ff4d8d', '#ff8fb5'], ['#00a6d6', '#58d4f0']
  ];
  const ICONS = {
    info: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
    warn: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    bad:  '<path d="M12 3 2.5 20h19z"/><path d="M12 10v5M12 17.5v.5"/>'
  };

  /* ---------- State ---------- */
  const settings = { warn: 55, danger: 80, vibration: true, acoustic: true };
  const ui = { filter: 'all', query: '', selected: 0, paused: false, unread: 0, histFilter: 'all' };
  let sessionSec = 24 * 60 + 10;
  let notifs = [];
  let history = [];
  let notifId = 0;

  /* Model sEMG: amplitudo (µV) naik seiring indeks kelelahan */
  const ampOf = f => 18 + f * 1.1;
  const statusOf = f => (f >= settings.danger ? 'bad' : f >= settings.warn ? 'warn' : 'ok');
  const initials = name => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const swimmers = [
    { name: 'Raka Pratama',    role: 'Atlet junior',     lane: 'Lintasan 1', muscle: 'Betis kanan', f: 62, rate: 1.3, offset: 0 },
    { name: 'Dewi Lestari',    role: 'Perenang klub',    lane: 'Lintasan 2', muscle: 'Betis kiri',  f: 41, rate: 0.9, offset: 1 },
    { name: 'Bagas Wirawan',   role: 'Perenang pemula',  lane: 'Lintasan 3', muscle: 'Paha kanan',  f: 33, rate: 0.6, offset: 2 },
    { name: 'Salsa Nurhaliza', role: 'Atlet junior',     lane: 'Lintasan 4', muscle: 'Bahu kanan',  f: 50, rate: 1.1, offset: 0 },
    { name: 'Fajar Ramadhan',  role: 'Perenang rekreasi', lane: 'Lintasan 5', muscle: 'Betis kanan', f: 28, rate: 0.5, offset: 3 },
    { name: 'Intan Permata',   role: 'Perenang klub',    lane: 'Lintasan 6', muscle: 'Paha kiri',   f: 46, rate: 0.8, offset: 1 }
  ].map((s, i) => {
    s.idx = i;
    s.badTicks = 0;
    s.status = statusOf(s.f);
    s.hist = Array.from({ length: N }, (_, k) => {
      const ff = Math.max(10, s.f - (N - 1 - k) * s.rate * 0.35);
      return noisy(ff);
    });
    return s;
  });

  function noisy(f) {
    return Math.max(4, ampOf(f) + (Math.random() - 0.5) * (6 + f * 0.14));
  }

  /* ---------- Data awal ---------- */
  function seedData() {
    const now = Date.now();
    const m = min => now - min * 60000;
    history = [
      { ts: m(5),  name: 'Bagas Wirawan',   event: 'Mulai kelelahan',                 level: 'warn', muscle: 'Paha kanan',  idx: 57 },
      { ts: m(9),  name: 'Dewi Lestari',    event: 'Kembali normal setelah istirahat', level: 'ok',   muscle: 'Betis kiri',  idx: 29 },
      { ts: m(12), name: 'Dewi Lestari',    event: 'Risiko kram',                     level: 'bad',  muscle: 'Betis kiri',  idx: 82 },
      { ts: m(17), name: 'Salsa Nurhaliza', event: 'Mulai kelelahan',                 level: 'warn', muscle: 'Bahu kanan',  idx: 56 },
      { ts: m(22), name: 'Intan Permata',   event: 'Mulai kelelahan',                 level: 'warn', muscle: 'Paha kiri',   idx: 55 },
      { ts: m(29), name: 'Raka Pratama',    event: 'Kembali normal setelah istirahat', level: 'ok',   muscle: 'Betis kanan', idx: 31 },
      { ts: m(31), name: 'Raka Pratama',    event: 'Risiko kram',                     level: 'bad',  muscle: 'Betis kanan', idx: 83 }
    ];
    notifs = [
      {
        id: ++notifId, ts: m(4), level: 'warn',
        title: 'Raka Pratama mulai kelelahan',
        desc: 'Indeks kelelahan 62 di betis kanan. Getaran dikirim ke perangkat perenang dan alarm akustik dikirim ke pengawas.',
        isNew: false
      },
      {
        id: ++notifId, ts: m(24), level: 'info',
        title: 'Semua perangkat tersambung',
        desc: '6 gelang sEMG dan hydrophone kolam siap. Pemantauan sesi latihan dimulai.',
        isNew: false
      }
    ];
  }

  /* ---------- Format ---------- */
  function ago(ts) {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 10) return 'baru saja';
    if (s < 60) return `${s} detik lalu`;
    if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
    return `${Math.floor(s / 3600)} jam lalu`;
  }
  const clock = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const mmss = sec => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ==========================================================
     LOGIKA PERINGATAN
     ========================================================== */
  function channelText() {
    const ch = [];
    if (settings.vibration) ch.push('getaran dikirim ke perangkat perenang');
    if (settings.acoustic) ch.push('alarm akustik dikirim ke pengawas');
    if (!ch.length) return 'Peringatan hanya tampil di dashboard';
    const t = ch.join(' dan ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function addNotif(s, level) {
    const idx = Math.round(s.f);
    const n = level === 'bad'
      ? { title: `Risiko kram: ${s.name}`,
          desc: `Indeks ${idx} melewati batas bahaya di ${s.muscle.toLowerCase()}. ${channelText()}.` }
      : { title: `${s.name} mulai kelelahan`,
          desc: `Indeks kelelahan ${idx} di ${s.muscle.toLowerCase()}. ${channelText()}.` };
    notifs.unshift({ id: ++notifId, ts: Date.now(), level, isNew: true, ...n });
    notifs = notifs.slice(0, 8);
    ui.unread++;
    renderNotifs();
    renderBell();
  }

  function addHistory(s, level, event) {
    history.unshift({
      ts: Date.now(), name: s.name, event, level,
      muscle: s.muscle, idx: Math.round(s.f)
    });
    history = history.slice(0, 200);
    if ($('#view-riwayat').classList.contains('active')) renderHistory();
  }

  function evaluate(s) {
    const now = statusOf(s.f);
    const prev = s.status;
    s.badTicks = now === 'bad' ? s.badTicks + 1 : 0;

    // perenang berhenti dan beristirahat setelah beberapa detik di level bahaya
    if (s.badTicks >= 12) {
      s.f = 26 + Math.random() * 8;
      s.badTicks = 0;
      s.status = 'ok';
      addHistory(s, 'ok', 'Kembali normal setelah istirahat');
      return;
    }
    if (LV[now] > LV[prev]) {
      addNotif(s, now);
      addHistory(s, now, now === 'warn' ? 'Mulai kelelahan' : 'Risiko kram');
    }
    s.status = now;
  }

  /* ==========================================================
     RENDER: NOTIFIKASI
     ========================================================== */
  function renderNotifs() {
    $('#notifList').innerHTML = notifs.map(n => `
      <article class="notif ${n.isNew ? 'is-new' : ''}">
        <div class="notif-banner ${n.level}">
          <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n.level]}</svg>
        </div>
        <div class="notif-body">
          <h4>${n.title}</h4>
          <p>${n.desc}</p>
          <div class="notif-foot">
            <span class="mini-av">SG</span>
            <div><b>Oleh Sistem SWIMGUARD</b><span data-ago="${n.ts}">${ago(n.ts)}</span></div>
          </div>
        </div>
      </article>`).join('');
    notifs.forEach(n => (n.isNew = false));
  }

  function updateAgo() {
    $$('[data-ago]').forEach(el => (el.textContent = ago(+el.dataset.ago)));
  }

  function renderBell() {
    const dot = $('#bellDot');
    dot.hidden = ui.unread === 0;
    dot.textContent = ui.unread > 9 ? '9+' : ui.unread;
  }

  /* ==========================================================
     RENDER: DAFTAR PERENANG
     ========================================================== */
  function renderList() {
    const q = ui.query.trim().toLowerCase();
    const items = swimmers.filter(s => {
      const byFilter = ui.filter === 'all' || (ui.filter === 'alert' ? s.status !== 'ok' : s.status === 'ok');
      return byFilter && s.name.toLowerCase().includes(q);
    });

    $('#swimmerList').innerHTML = items.length
      ? items.map(s => {
          const [c1, c2] = AVATARS[s.idx % AVATARS.length];
          return `
          <article class="row" data-i="${s.idx}" tabindex="0" role="button" aria-label="Lihat grafik ${s.name}">
            <div>
              <p class="lbl">Nama</p>
              <div class="who">
                <div class="avatar-sm" style="background:linear-gradient(135deg,${c1},${c2})">${initials(s.name)}</div>
                <div><strong>${s.name}</strong><span>${s.role}</span></div>
              </div>
            </div>
            <div class="cell">
              <p class="lbl">Waktu / lintasan</p>
              <strong data-k="dur"></strong>
              <span>${s.lane}</span>
            </div>
            <div class="cell">
              <p class="lbl">Sinyal sEMG</p>
              <strong data-k="amp"></strong>
              <span>${s.muscle}</span>
            </div>
            <div>
              <p class="lbl">Status</p>
              <span class="badge" data-k="badge"></span>
            </div>
          </article>`;
        }).join('')
      : '<div class="empty">Tidak ada perenang yang cocok dengan filter ini.</div>';

    updateList();
  }

  function updateList() {
    $$('#swimmerList .row').forEach(row => {
      const s = swimmers[+row.dataset.i];
      const amp = s.hist[s.hist.length - 1];
      const badge = $('[data-k="badge"]', row);
      $('[data-k="dur"]', row).textContent = `Berenang ${Math.max(1, Math.floor(sessionSec / 60) - s.offset)} menit`;
      $('[data-k="amp"]', row).textContent = `${Math.round(amp)} µV, indeks ${Math.round(s.f)}`;
      badge.className = `badge ${s.status}`;
      badge.textContent = LABEL[s.status];
      row.classList.toggle('selected', s.idx === ui.selected);
    });
  }

  /* ==========================================================
     RENDER: GRAFIK sEMG
     ========================================================== */
  function fillSelect() {
    $('#chartSwimmer').innerHTML = swimmers
      .map(s => `<option value="${s.idx}">${s.name}</option>`).join('');
    $('#chartSwimmer').value = ui.selected;
  }

  function updateChartHead() {
    const s = swimmers[ui.selected];
    $('#chartSwimmer').value = s.idx;
    $('#chartMuscle').textContent = `${s.muscle}, ${s.lane}`;
    $('#statAmp').textContent = `${Math.round(s.hist[s.hist.length - 1])} µV`;
    $('#statIdx').textContent = Math.round(s.f);
    const b = $('#chartBadge');
    b.className = `badge ${s.status}`;
    b.textContent = LABEL[s.status];
  }

  function drawChart() {
    const c = $('#chart');
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = swimmers[ui.selected];
    const pad = { l: 44, r: 12, t: 10, b: 26 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const ymax = 160;
    const X = i => pad.l + (i / (N - 1)) * iw;
    const Y = v => pad.t + ih - (Math.min(v, ymax) / ymax) * ih;
    const font = '11px "Plus Jakarta Sans", system-ui, sans-serif';

    const yWarn = Y(ampOf(settings.warn));
    const yBad = Y(ampOf(settings.danger));

    // zona waspada dan bahaya
    ctx.fillStyle = 'rgba(242,164,58,.10)';
    ctx.fillRect(pad.l, yBad, iw, yWarn - yBad);
    ctx.fillStyle = 'rgba(238,69,96,.09)';
    ctx.fillRect(pad.l, pad.t, iw, yBad - pad.t);

    // grid + label sumbu Y
    ctx.font = font;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    for (let v = 0; v <= ymax; v += 40) {
      const y = Y(v);
      ctx.strokeStyle = '#eef0fb';
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = '#a9aed3';
      ctx.fillText(v, pad.l - 8, y);
    }

    // sumbu X
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';  ctx.fillText('-60 dtk', pad.l, h - pad.b + 8);
    ctx.textAlign = 'center'; ctx.fillText('-30 dtk', pad.l + iw / 2, h - pad.b + 8);
    ctx.textAlign = 'right'; ctx.fillText('sekarang', w - pad.r, h - pad.b + 8);

    // garis ambang
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#f2a43a';
    ctx.beginPath(); ctx.moveTo(pad.l, yWarn); ctx.lineTo(w - pad.r, yWarn); ctx.stroke();
    ctx.strokeStyle = '#ee4560';
    ctx.beginPath(); ctx.moveTo(pad.l, yBad); ctx.lineTo(w - pad.r, yBad); ctx.stroke();
    ctx.setLineDash([]);

    // area di bawah garis
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
    grad.addColorStop(0, 'rgba(58,60,255,.22)');
    grad.addColorStop(1, 'rgba(58,60,255,0)');
    ctx.beginPath();
    s.hist.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.lineTo(X(N - 1), pad.t + ih);
    ctx.lineTo(X(0), pad.t + ih);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // garis sEMG
    ctx.beginPath();
    s.hist.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.strokeStyle = '#3a3cff';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // titik terakhir
    const dotColor = { ok: '#14b883', warn: '#f2a43a', bad: '#ee4560' }[s.status];
    const lx = X(N - 1);
    const ly = Y(s.hist[N - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 8, 0, Math.PI * 2); ctx.fillStyle = dotColor + '33'; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 4.2, 0, Math.PI * 2); ctx.fillStyle = dotColor; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  }

  /* ==========================================================
     RENDER: KOLOM SAMPING
     ========================================================== */
  function updateSide() {
    const total = swimmers.length;
    const cnt = { ok: 0, warn: 0, bad: 0 };
    swimmers.forEach(s => cnt[s.status]++);
    $('#cntOk').textContent = cnt.ok;
    $('#cntWarn').textContent = cnt.warn;
    $('#cntBad').textContent = cnt.bad;
    $('#barOk').style.width = `${(cnt.ok / total) * 100}%`;
    $('#barWarn').style.width = `${(cnt.warn / total) * 100}%`;
    $('#barBad').style.width = `${(cnt.bad / total) * 100}%`;

    $('#timerText').textContent = mmss(sessionSec);
    $('#ringFg').style.strokeDashoffset = RING_C * (1 - Math.min(sessionSec / TARGET, 1));
    $('#poolActive').textContent = `${total} perangkat`;
  }

  /* ==========================================================
     RENDER: RIWAYAT
     ========================================================== */
  function renderHistory() {
    const rows = history.filter(h => ui.histFilter === 'all' || h.level === ui.histFilter);
    $('#histBody').innerHTML = rows.length
      ? rows.map(h => `
        <tr>
          <td>${clock(h.ts)}</td>
          <td><b>${h.name}</b></td>
          <td>${h.event}</td>
          <td>${h.muscle}</td>
          <td>${h.idx}</td>
          <td><span class="badge ${h.level}">${HIST_LABEL[h.level]}</span></td>
        </tr>`).join('')
      : '<tr><td colspan="6"><div class="empty">Belum ada catatan untuk filter ini.</div></td></tr>';
  }

  function downloadCsv() {
    const head = ['Waktu', 'Perenang', 'Peristiwa', 'Otot', 'Indeks', 'Level'];
    const lines = history.map(h =>
      [clock(h.ts), h.name, h.event, h.muscle, h.idx, HIST_LABEL[h.level]]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['\ufeff' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'riwayat-swimguard.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Riwayat diunduh sebagai CSV');
  }

  /* ==========================================================
     SIKLUS UTAMA
     ========================================================== */
  function refreshAll() {
    updateList();
    updateChartHead();
    drawChart();
    updateSide();
  }

  function tick() {
    if (ui.paused) return;
    sessionSec++;

    swimmers.forEach(s => {
      s.f += s.rate * (0.25 + Math.random() * 0.5);
      if (Math.random() < 0.012) s.f += 6 + Math.random() * 6;   // lonjakan otot mendadak
      s.f = Math.min(s.f, 100);
      evaluate(s);
      s.hist.push(noisy(s.f));
      if (s.hist.length > N) s.hist.shift();
    });

    // jika filter bukan "Semua", susun ulang daftar agar sesuai status terbaru
    const needsRebuild = ui.filter !== 'all' &&
      $$('#swimmerList .row').some(r => {
        const s = swimmers[+r.dataset.i];
        return (ui.filter === 'alert') !== (s.status !== 'ok');
      });
    if (needsRebuild || (ui.filter !== 'all' && $$('#swimmerList .row').length !== visibleCount())) renderList();

    refreshAll();
    updateAgo();
  }

  function visibleCount() {
    const q = ui.query.trim().toLowerCase();
    return swimmers.filter(s => {
      const f = ui.filter === 'all' || (ui.filter === 'alert' ? s.status !== 'ok' : s.status === 'ok');
      return f && s.name.toLowerCase().includes(q);
    }).length;
  }

  /* ==========================================================
     EVENT
     ========================================================== */
  function setView(name) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'dashboard') requestAnimationFrame(drawChart);
    if (name === 'riwayat') renderHistory();
  }

  function bind() {
    // navigasi
    $$('.nav-item').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

    // tab status
    $$('.tab[data-filter]').forEach(t => t.addEventListener('click', () => {
      ui.filter = t.dataset.filter;
      $$('.tab[data-filter]').forEach(x => x.classList.toggle('active', x === t));
      renderList();
    }));

    // pencarian
    $('#search').addEventListener('input', e => { ui.query = e.target.value; renderList(); });

    // pilih perenang dari daftar
    const list = $('#swimmerList');
    const pick = e => {
      const row = e.target.closest('.row');
      if (!row) return;
      ui.selected = +row.dataset.i;
      updateList(); updateChartHead(); drawChart();
    };
    list.addEventListener('click', pick);
    list.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); }
    });

    // pilih perenang dari dropdown
    $('#chartSwimmer').addEventListener('change', e => {
      ui.selected = +e.target.value;
      updateList(); updateChartHead(); drawChart();
    });

    // simulasi peringatan
    $('#btnTest').addEventListener('click', () => {
      const pool = swimmers.filter(s => s.status !== 'bad');
      if (!pool.length) { toast('Semua perenang sudah berstatus Bahaya'); return; }
      const s = pool[Math.floor(Math.random() * pool.length)];
      s.f = settings.danger + 3;
      evaluate(s);
      s.hist.push(noisy(s.f)); s.hist.shift();
      ui.selected = s.idx;
      refreshAll();
      toast(`Simulasi peringatan: ${s.name}`);
    });

    // lonceng
    $('#btnBell').addEventListener('click', () => {
      ui.unread = 0;
      renderBell();
      $('.col-notif').scrollTo({ top: 0, behavior: 'smooth' });
      $('#notifList').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    // jeda
    $('#btnPause').addEventListener('click', e => {
      ui.paused = !ui.paused;
      e.currentTarget.textContent = ui.paused ? 'Lanjutkan pemantauan' : 'Jeda pemantauan';
      toast(ui.paused ? 'Pemantauan dijeda' : 'Pemantauan dilanjutkan');
    });

    // riwayat
    $$('.tab[data-hfilter]').forEach(t => t.addEventListener('click', () => {
      ui.histFilter = t.dataset.hfilter;
      $$('.tab[data-hfilter]').forEach(x => x.classList.toggle('active', x === t));
      renderHistory();
    }));
    $('#btnCsv').addEventListener('click', downloadCsv);

    // pengaturan
    const warn = $('#setWarn');
    const danger = $('#setDanger');
    warn.addEventListener('input', () => {
      let v = +warn.value;
      if (v > settings.danger - 5) { v = settings.danger - 5; warn.value = v; }
      settings.warn = v;
      $('#outWarn').textContent = v;
      swimmers.forEach(s => (s.status = statusOf(s.f)));
      refreshAll();
    });
    danger.addEventListener('input', () => {
      let v = +danger.value;
      if (v < settings.warn + 5) { v = settings.warn + 5; danger.value = v; }
      settings.danger = v;
      $('#outDanger').textContent = v;
      swimmers.forEach(s => (s.status = statusOf(s.f)));
      refreshAll();
    });
    $('#setVib').addEventListener('change', e => (settings.vibration = e.target.checked));
    $('#setAco').addEventListener('change', e => (settings.acoustic = e.target.checked));

    // ubah ukuran
    let rz;
    window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(drawChart); });
  }

  /* ==========================================================
     INISIALISASI
     ========================================================== */
  function init() {
    $('#today').textContent = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    seedData();
    fillSelect();
    renderNotifs();
    renderBell();
    renderList();
    renderHistory();
    refreshAll();
    bind();
    setInterval(tick, 1000);
  }

  init();
})();
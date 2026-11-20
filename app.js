(function () {
  'use strict';
  const S = window.GolfStats;
  const STORAGE_KEY = 'golf-tracker:v1';
  const view = document.getElementById('view');

  // ---------- storage ----------
  function emptyData() {
    return { version: 1, courses: [], rounds: [] };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyData();
      const d = JSON.parse(raw);
      if (!d || !Array.isArray(d.courses) || !Array.isArray(d.rounds)) return emptyData();
      return d;
    } catch (e) {
      return emptyData();
    }
  }
  let data = load();
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not save', e);
    }
  }

  // ---------- helpers ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const pct = (v) => (v == null ? '—' : Math.round(v * 100) + '%');
  const num = (v, digits = 1) => (v == null ? '—' : v.toFixed(digits));
  const toParClass = (n) => (n < 0 ? 'under' : n > 0 ? 'over' : '');
  const findRound = (id) => data.rounds.find((r) => r.id === id);
  const findCourse = (id) => data.courses.find((c) => c.id === id);
  const sortedRounds = () => data.rounds.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const parseNum = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

  // ---------- routing ----------
  function route() {
    const [name, id] = (location.hash.slice(1) || 'rounds').split('/');
    const tab = { round: 'rounds', edit: 'new', course: 'courses' }[name] || name;
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    const render = { rounds: renderRounds, new: renderNew, edit: renderEdit, round: renderRound, courses: renderCourses, course: renderCourse, stats: renderStats }[name] || renderRounds;
    render(id);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  const go = (hash) => {
    if (location.hash === '#' + hash) route();
    else location.hash = hash;
  };

  // ---------- rounds list ----------
  function renderRounds() {
    const rounds = sortedRounds();
    if (!rounds.length) {
      view.innerHTML = `<div class="empty card"><p>No rounds yet.</p><button class="primary" data-go="new">Record your first round</button></div>`;
      return;
    }
    view.innerHTML = `
      <h2>Rounds</h2>
      <ul class="round-list">
        ${rounds
          .map((r) => {
            const t = S.roundTotals(r);
            const incomplete = t.holesPlayed < r.holes.length;
            return `<li><a class="round-item" href="#round/${r.id}">
              <div><strong>${esc(r.courseName)}</strong>
                <div class="sub">${fmtDate(r.date)} · ${r.holes.length} holes${incomplete ? ` · ${t.holesPlayed} entered` : ''}</div></div>
              <div class="score">${t.holesPlayed ? t.strokes : '–'}
                <div class="sub topar ${toParClass(t.toPar)}">${t.holesPlayed ? S.formatToPar(t.toPar) : ''}</div></div>
            </a></li>`;
          })
          .join('')}
      </ul>`;
  }

  // ---------- new round ----------
  function renderNew() {
    const courses = data.courses.slice().sort((a, b) => a.name.localeCompare(b.name));
    view.innerHTML = `
      <h2>New round</h2>
      <form class="card" id="new-form">
        <div class="row">
          <label class="field">Course
            <select name="course" required>
              ${courses.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.holes.length}, par ${c.holes.reduce((a, b) => a + b, 0)})</option>`).join('')}
              <option value="__quick18">Quick: 18 holes, par 72</option>
              <option value="__quick9">Quick: 9 holes, par 36</option>
            </select>
          </label>
          <label class="field">Date<input type="date" name="date" value="${today()}" required></label>
        </div>
        <div class="actions">
          <button class="primary" type="submit">Start scoring</button>
          <button type="button" data-go="course/new">Add a course</button>
        </div>
      </form>`;
    view.querySelector('#new-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const cid = f.get('course');
      let course;
      if (cid === '__quick18') course = { id: null, name: 'Unnamed course', holes: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5] };
      else if (cid === '__quick9') course = { id: null, name: 'Unnamed course', holes: [4, 4, 3, 4, 5, 4, 3, 4, 5] };
      else course = findCourse(cid);
      const round = {
        id: uid(),
        courseId: course.id,
        courseName: course.name,
        date: f.get('date') || today(),
        rating: course.rating ?? null,
        slope: course.slope ?? null,
        notes: '',
        holes: course.holes.map((par) => ({ par, strokes: null, putts: null, fairway: null })),
      };
      data.rounds.push(round);
      save();
      go('edit/' + round.id);
    });
  }

  // ---------- score entry ----------
  function renderEdit(id) {
    const r = findRound(id);
    if (!r) return go('rounds');
    view.innerHTML = `
      <h2>${esc(r.courseName)} <span class="muted">· ${fmtDate(r.date)}</span></h2>
      <p class="muted">Changes save automatically. Tap − / + to enter strokes and putts.</p>
      <div class="holes">${r.holes.map((h, i) => holeCard(h, i)).join('')}</div>
      <div class="summary-bar" id="summary"></div>`;
    updateSummary(r);

    view.querySelector('.holes').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const i = Number(btn.closest('.hole').dataset.i);
      const h = r.holes[i];
      const { field, delta, fw } = btn.dataset;
      if (field) {
        const start = field === 'strokes' ? h.par : 2;
        let v = h[field] == null ? start : h[field] + Number(delta);
        if (h[field] == null && Number(delta) < 0) v = start - 1;
        h[field] = Math.max(field === 'strokes' ? 1 : 0, Math.min(15, v));
        if (field === 'putts' && h.strokes != null && h.putts > h.strokes) h.putts = h.strokes;
        if (field === 'strokes' && h.putts != null && h.putts > h.strokes) h.putts = h.strokes;
      } else if (fw) {
        const val = fw === 'hit';
        h.fairway = h.fairway === val ? null : val;
      } else if (btn.dataset.clear != null) {
        Object.assign(h, { strokes: null, putts: null, fairway: null });
      } else return;
      save();
      btn.closest('.hole').outerHTML = holeCard(h, i);
      updateSummary(r);
    });
  }

  function holeCard(h, i) {
    const cls = h.strokes != null ? S.scoreName(h.strokes, h.par) : '';
    const stepper = (field, label) => `
      <div class="stepper"><span class="lbl">${label}</span>
        <button type="button" data-field="${field}" data-delta="-1" aria-label="${label} minus, hole ${i + 1}">−</button>
        <output>${h[field] == null ? '–' : h[field]}</output>
        <button type="button" data-field="${field}" data-delta="1" aria-label="${label} plus, hole ${i + 1}">+</button>
      </div>`;
    const fwRow =
      h.par >= 4
        ? `<div class="fw"><button type="button" data-fw="hit" aria-pressed="${h.fairway === true}">Fairway ✓</button>
             <button type="button" data-fw="miss" aria-pressed="${h.fairway === false}">Missed</button></div>`
        : `<div class="fw muted" style="font-size:.8rem;justify-content:center">Par 3 – no fairway</div>`;
    return `<div class="hole ${cls}" data-i="${i}">
      <div class="hole-head"><span>Hole ${i + 1}</span><span class="par">Par ${h.par}</span></div>
      ${stepper('strokes', 'Strokes')}${stepper('putts', 'Putts')}${fwRow}
      ${h.strokes != null ? `<button type="button" class="link muted" data-clear style="font-size:.75rem">clear</button>` : ''}
    </div>`;
  }

  function updateSummary(r) {
    const t = S.roundTotals(r);
    view.querySelector('#summary').innerHTML = `
      <span><strong>${t.strokes || '–'}</strong> <span class="topar ${toParClass(t.toPar)}">${t.holesPlayed ? S.formatToPar(t.toPar) : ''}</span></span>
      <span class="muted">${t.holesPlayed}/${r.holes.length} holes</span>
      <span class="muted">Putts ${t.putts ?? '–'}</span>
      <span class="grow"></span>
      <button class="primary" data-go="round/${r.id}">Done</button>`;
  }

  // ---------- round detail ----------
  function renderRound(id) {
    const r = findRound(id);
    if (!r) return go('rounds');
    const t = S.roundTotals(r);
    const diff = S.differential(r);
    const halves = r.holes.length === 18 ? [[0, 9, 'Out'], [9, 18, 'In']] : [[0, r.holes.length, 'Tot']];
    const cells = (fn) =>
      halves
        .map(([a, b, label]) => {
          const hs = r.holes.slice(a, b);
          return hs.map((h, j) => fn(h, a + j)).join('') + `<th>${fn.total ? fn.total(hs) : ''}</th>`;
        })
        .join('') + (halves.length > 1 ? `<th>${fn.total ? fn.total(r.holes) : ''}</th>` : '');
    const sumOf = (k) => (hs) => {
      const v = hs.filter((h) => h[k] != null);
      return v.length ? v.reduce((a, h) => a + h[k], 0) : '';
    };
    const holeNum = (h, i) => `<th>${i + 1}</th>`;
    holeNum.total = null;
    const parCell = (h) => `<td>${h.par}</td>`;
    parCell.total = sumOf('par');
    const scoreCell = (h) => `<td class="${h.strokes != null ? S.scoreName(h.strokes, h.par) : ''}">${h.strokes ?? ''}</td>`;
    scoreCell.total = sumOf('strokes');
    const puttCell = (h) => `<td>${h.putts ?? ''}</td>`;
    puttCell.total = sumOf('putts');
    const fwCell = (h) => `<td>${h.par < 4 ? '' : h.fairway === true ? '✓' : h.fairway === false ? '✗' : ''}</td>`;
    const girCell = (h) => `<td>${h.putts != null && h.strokes != null ? (S.isGir(h) ? '●' : '○') : ''}</td>`;
    const headLabels = halves.map(([, , l]) => l).concat(halves.length > 1 ? ['Tot'] : []);
    let holeRow = cells(holeNum);
    // replace empty total headers with labels
    let k = 0;
    holeRow = holeRow.replace(/<th><\/th>/g, () => `<th>${headLabels[k++]}</th>`);

    view.innerHTML = `
      <h2>${esc(r.courseName)} <span class="muted">· ${fmtDate(r.date)}</span></h2>
      <div class="tiles">
        <div class="tile"><div class="v">${t.strokes || '–'} <span class="topar ${toParClass(t.toPar)}" style="font-size:1rem">${t.holesPlayed ? S.formatToPar(t.toPar) : ''}</span></div><div class="k">Score (${t.holesPlayed}/${r.holes.length} holes)</div></div>
        <div class="tile"><div class="v">${t.putts ?? '–'}</div><div class="k">Putts</div></div>
        <div class="tile"><div class="v">${t.fairwayChances ? `${t.fairwaysHit}/${t.fairwayChances}` : '–'}</div><div class="k">Fairways hit</div></div>
        <div class="tile"><div class="v">${t.girChances ? `${t.gir}/${t.girChances}` : '–'}</div><div class="k">Greens in regulation</div></div>
        <div class="tile"><div class="v">${diff ?? '–'}</div><div class="k">Score differential</div></div>
      </div>
      <div class="card table-wrap">
        <table class="scorecard">
          <tr><th>Hole</th>${holeRow}</tr>
          <tr><th>Par</th>${cells(parCell)}</tr>
          <tr><th>Score</th>${cells(scoreCell)}</tr>
          <tr><th>Putts</th>${cells(puttCell)}</tr>
          <tr><th>FW</th>${cells(fwCell)}</tr>
          <tr><th>GIR</th>${cells(girCell)}</tr>
        </table>
      </div>
      <form class="card" id="meta-form">
        <div class="row">
          <label class="field">Course name<input name="courseName" value="${esc(r.courseName)}" required></label>
          <label class="field">Date<input type="date" name="date" value="${r.date}" required></label>
          <label class="field">Course rating<input type="number" step="0.1" name="rating" value="${r.rating ?? ''}" placeholder="${r.holes.reduce((a, h) => a + h.par, 0)}"></label>
          <label class="field">Slope<input type="number" name="slope" min="55" max="155" value="${r.slope ?? ''}" placeholder="113"></label>
        </div>
        <label class="field" style="margin-top:12px">Notes<input name="notes" value="${esc(r.notes)}" placeholder="Weather, partners, what to work on…"></label>
        <div class="actions">
          <button class="primary" type="submit">Save details</button>
          <button type="button" data-go="edit/${r.id}">Edit scores</button>
          <button type="button" class="danger" id="del-round">Delete round</button>
        </div>
      </form>`;

    view.querySelector('#meta-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      r.courseName = String(f.get('courseName')).trim() || r.courseName;
      r.date = f.get('date') || r.date;
      r.rating = parseNum(f.get('rating'));
      r.slope = parseNum(f.get('slope'));
      r.notes = String(f.get('notes'));
      save();
      renderRound(r.id);
    });
    view.querySelector('#del-round').addEventListener('click', () => {
      if (!confirm('Delete this round? This cannot be undone.')) return;
      data.rounds = data.rounds.filter((x) => x.id !== r.id);
      save();
      go('rounds');
    });
  }

  // ---------- courses ----------
  function renderCourses() {
    const courses = data.courses.slice().sort((a, b) => a.name.localeCompare(b.name));
    view.innerHTML = `
      <h2>Courses</h2>
      ${
        courses.length
          ? `<ul class="round-list">${courses
              .map((c) => {
                const played = data.rounds.filter((r) => r.courseId === c.id).length;
                return `<li><a class="round-item" href="#course/${c.id}">
                  <div><strong>${esc(c.name)}</strong><div class="sub">${c.holes.length} holes${c.rating ? ` · ${c.rating}/${c.slope ?? 113}` : ''} · ${played} round${played === 1 ? '' : 's'}</div></div>
                  <div class="score">${c.holes.reduce((a, b) => a + b, 0)}<div class="sub">par</div></div>
                </a></li>`;
              })
              .join('')}</ul>`
          : `<div class="empty card"><p>Save the courses you play so par is filled in for you.</p></div>`
      }
      <button class="primary" data-go="course/new">Add course</button>`;
  }

  function renderCourse(id) {
    const existing = id && id !== 'new' ? findCourse(id) : null;
    if (id && id !== 'new' && !existing) return go('courses');
    const c = existing || { name: '', holes: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5], rating: null, slope: null };
    const draft = c.holes.slice();
    view.innerHTML = `
      <h2>${existing ? 'Edit course' : 'Add course'}</h2>
      <form class="card" id="course-form">
        <div class="row">
          <label class="field">Name<input name="name" value="${esc(c.name)}" required></label>
          <label class="field">Holes
            <select name="count"><option ${draft.length === 18 ? 'selected' : ''}>18</option><option ${draft.length === 9 ? 'selected' : ''}>9</option></select>
          </label>
          <label class="field">Course rating<input type="number" step="0.1" name="rating" value="${c.rating ?? ''}" placeholder="optional"></label>
          <label class="field">Slope<input type="number" name="slope" min="55" max="155" value="${c.slope ?? ''}" placeholder="113"></label>
        </div>
        <h3 style="font-size:1rem;margin:16px 0 8px">Par by hole <span class="muted" id="par-total"></span></h3>
        <div class="par-grid" id="par-grid"></div>
        <div class="actions">
          <button class="primary" type="submit">Save course</button>
          <button type="button" data-go="courses">Cancel</button>
          ${existing ? `<button type="button" class="danger" id="del-course">Delete course</button>` : ''}
        </div>
      </form>`;
    const grid = view.querySelector('#par-grid');
    const drawGrid = () => {
      grid.innerHTML = draft
        .map((p, i) => `<label>#${i + 1}<select data-i="${i}">${[3, 4, 5, 6].map((v) => `<option ${v === p ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`)
        .join('');
      view.querySelector('#par-total').textContent = '· total ' + draft.reduce((a, b) => a + b, 0);
    };
    drawGrid();
    grid.addEventListener('change', (e) => {
      draft[Number(e.target.dataset.i)] = Number(e.target.value);
      drawGrid();
    });
    const form = view.querySelector('#course-form');
    form.count.addEventListener('change', (e) => {
      const n = Number(e.target.value);
      if (n < draft.length) draft.length = n;
      else while (draft.length < n) draft.push([4, 4, 3, 4, 5, 4, 3, 4, 5][draft.length % 9]);
      drawGrid();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const rec = existing || { id: uid() };
      Object.assign(rec, { name: String(f.get('name')).trim(), holes: draft.slice(), rating: parseNum(f.get('rating')), slope: parseNum(f.get('slope')) });
      if (!existing) data.courses.push(rec);
      save();
      go('courses');
    });
    const del = view.querySelector('#del-course');
    if (del)
      del.addEventListener('click', () => {
        if (!confirm('Delete this course? Rounds played there are kept.')) return;
        data.courses = data.courses.filter((x) => x.id !== existing.id);
        save();
        go('courses');
      });
  }

  // ---------- stats ----------
  function renderStats() {
    const st = S.overallStats(data.rounds);
    if (!st.rounds) {
      view.innerHTML = `<h2>Stats</h2><div class="empty card"><p>Stats appear once you record a round.</p></div>`;
      return;
    }
    const distRows = [['ace', 'Ace'], ['eagle', 'Eagle'], ['birdie', 'Birdie'], ['par', 'Par'], ['bogey', 'Bogey'], ['double+', 'Double+']];
    const maxD = Math.max(1, ...Object.values(st.distribution));
    view.innerHTML = `
      <h2>Stats</h2>
      <div class="tiles">
        <div class="tile"><div class="v">${st.handicap ?? '—'}</div><div class="k">Handicap index (est.)${st.handicap == null ? ' – needs 3 full rounds' : ''}</div></div>
        <div class="tile"><div class="v">${num(st.scoringAvg18)}</div><div class="k">Scoring avg (18 holes)</div></div>
        <div class="tile"><div class="v">${st.best18 ?? '—'}</div><div class="k">Best 18</div></div>
        <div class="tile"><div class="v">${num(st.puttsPerRound)}</div><div class="k">Putts / 18 holes</div></div>
        <div class="tile"><div class="v">${pct(st.fairwayPct)}</div><div class="k">Fairways hit</div></div>
        <div class="tile"><div class="v">${pct(st.girPct)}</div><div class="k">Greens in regulation</div></div>
        <div class="tile"><div class="v">${st.rounds}</div><div class="k">Rounds · ${st.holes} holes</div></div>
      </div>
      <div class="card"><h3 style="margin:0 0 10px;font-size:1rem">Recent 18-hole scores</h3>${trendChart()}</div>
      <div class="card"><h3 style="margin:0 0 10px;font-size:1rem">Score distribution</h3>
        <div class="bars">${distRows
          .map(([k, label]) => {
            const n = st.distribution[k];
            return `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${(n / maxD) * 100}%"></div></div><span class="n">${n} · ${Math.round((n / st.holes) * 100)}%</span></div>`;
          })
          .join('')}</div>
      </div>
      <p class="muted" style="font-size:.8rem">Handicap is an estimate following World Handicap System averaging (best differentials of your last 20 complete rounds), with each hole capped at double bogey. Enter course rating and slope for accuracy.</p>`;
  }

  function trendChart() {
    const pts = data.rounds
      .filter((r) => r.holes.length === 18 && S.roundTotals(r).holesPlayed === 18)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-20)
      .map((r) => ({ date: r.date, score: S.roundTotals(r).strokes }));
    if (pts.length < 2) return `<p class="muted">Record at least two complete 18-hole rounds to see a trend.</p>`;
    const W = 600, H = 160, pad = 28;
    const lo = Math.min(...pts.map((p) => p.score)) - 2;
    const hi = Math.max(...pts.map((p) => p.score)) + 2;
    const x = (i) => pad + (i * (W - pad * 2)) / (pts.length - 1);
    const y = (s) => H - pad + 8 - ((s - lo) / (hi - lo)) * (H - pad * 2);
    return `<svg class="trend" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score trend">
      <line x1="${pad}" x2="${W - pad}" y1="${y(lo)}" y2="${y(lo)}"/>
      <text x="2" y="${y(hi) + 4}">${hi}</text><text x="2" y="${y(lo) + 4}">${lo}</text>
      <polyline points="${pts.map((p, i) => `${x(i)},${y(p.score)}`).join(' ')}"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.score)}" r="3.5"><title>${fmtDate(p.date)}: ${p.score}</title></circle>`).join('')}
    </svg>`;
  }

  // ---------- global handlers ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go]');
    if (el) {
      e.preventDefault();
      go(el.dataset.go);
    }
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `golf-tracker-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.getElementById('import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.courses) || !Array.isArray(d.rounds)) throw new Error('Not a Golf Tracker export');
      if (!confirm(`Replace current data with ${d.rounds.length} rounds and ${d.courses.length} courses from this file?`)) return;
      data = { version: 1, courses: d.courses, rounds: d.rounds };
      save();
      go('rounds');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  });

  route();
})();

(function () {
  'use strict';
  const S = window.GolfStats;
  const G = window.GolfSync;
  const STORAGE_KEY = 'golf-tracker:v1';
  const SYNC_KEY = 'golf-tracker:sync';
  const PREFS_KEY = 'golf-tracker:prefs';
  const view = document.getElementById('view');

  // ---------- storage ----------
  function load() {
    let d;
    try {
      d = G.normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch (e) {
      d = G.normalize(null);
    }
    // Rounds saved before "Finish round" existed count as finished.
    d.rounds.forEach((r) => {
      if (r.finished === undefined) r.finished = true;
    });
    return d;
  }
  let data = load();
  const saveState = { ok: true, at: null };

  function writeLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      saveState.ok = true;
      saveState.at = Date.now();
    } catch (e) {
      saveState.ok = false;
    }
    showSaveStatus();
    return saveState.ok;
  }
  function save() {
    const ok = writeLocal();
    scheduleSync(1500);
    return ok;
  }
  const touch = (rec) => (rec.updatedAt = Date.now());
  const tombstone = (id) => (data.deleted[id] = Date.now());

  function loadPrefs() {
    try {
      return Object.assign({ entry: 'shots' }, JSON.parse(localStorage.getItem(PREFS_KEY)));
    } catch (e) {
      return { entry: 'shots' };
    }
  }
  let prefs = loadPrefs();
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* preference just won't stick */
    }
  }
  const bag = () => (data.bag && data.bag.clubs.length ? data.bag.clubs : S.DEFAULT_BAG);

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
  const fmtTime = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const pct = (v) => (v == null ? '—' : Math.round(v * 100) + '%');
  const num = (v, digits = 1) => (v == null ? '—' : v.toFixed(digits));
  const toParClass = (n) => (n < 0 ? 'under' : n > 0 ? 'over' : '');
  const findRound = (id) => data.rounds.find((r) => r.id === id);
  const findCourse = (id) => data.courses.find((c) => c.id === id);
  const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.updatedAt || 0) - (a.updatedAt || 0));
  const sortedRounds = () => data.rounds.slice().sort(byDateDesc);
  const parseNum = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const sumPar = (holes) => holes.reduce((a, h) => a + (typeof h === 'number' ? h : h.par), 0);
  const firstOpenHole = (r) => {
    const i = r.holes.findIndex((h) => !S.isHoled(h));
    return i === -1 ? r.holes.length : i + 1;
  };
  const allHoled = (r) => r.holes.every((h) => S.isHoled(h));
  const inProgress = () => sortedRounds().filter((r) => !r.finished);
  const resultLabel = (res) => ({ drop: 'Penalty drop', sd: 'OB / lost' }[res] || S.RESULTS[res] || res);

  // ---------- routing ----------
  function route(keepScroll) {
    const parts = (location.hash.slice(1) || 'rounds').split('/');
    const name = parts[0];
    const tab = { round: 'rounds', new: 'play', play: 'play', course: 'more', courses: 'more', bag: 'more', sync: 'more', backup: 'more' }[name] || name;
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    const open = inProgress()[0];
    document.getElementById('tab-play').href = open ? `#play/${open.id}/${firstOpenHole(open)}` : '#new';
    const render = {
      rounds: renderRounds,
      new: renderNew,
      play: renderPlay,
      round: renderRound,
      stats: renderStats,
      more: renderMore,
      courses: renderCourses,
      course: renderCourse,
      bag: renderBag,
      sync: renderSync,
      backup: renderBackup,
    }[name] || renderRounds;
    render(parts[1], parts[2]);
    if (!keepScroll) window.scrollTo(0, 0);
  }
  function rerender() {
    const a = document.activeElement;
    if (a && view.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    route(true);
  }
  window.addEventListener('hashchange', () => route());
  const go = (hash) => {
    if (location.hash === '#' + hash) route();
    else location.hash = hash;
  };

  // ---------- rounds (home) ----------
  function roundItem(r) {
    const t = S.roundTotals(r);
    return `<li><a class="list-item" href="#round/${r.id}">
      <div><strong>${esc(r.courseName)}</strong>
        <div class="sub">${fmtDate(r.date)} · ${r.holes.length} holes${t.holesPlayed < r.holes.length ? ` · thru ${t.holesPlayed}` : ''}</div></div>
      <div class="score">${t.holesPlayed ? t.strokes : '–'}
        <div class="sub topar ${toParClass(t.toPar)}">${t.holesPlayed ? S.formatToPar(t.toPar) : ''}</div></div>
    </a></li>`;
  }
  function renderRounds() {
    const open = inProgress();
    const done = sortedRounds().filter((r) => r.finished);
    view.innerHTML = `
      ${open
        .map((r) => {
          const t = S.roundTotals(r);
          const n = firstOpenHole(r);
          return `<div class="card resume">
            <div><div class="eyebrow">Round in progress</div><strong>${esc(r.courseName)}</strong>
              <div class="sub">${fmtDate(r.date)} · ${t.holesPlayed ? `${t.strokes} (${S.formatToPar(t.toPar)}) thru ${t.holesPlayed}` : 'not started'}</div></div>
            <a class="btn primary big" href="#play/${r.id}/${n}">${allHoled(r) ? 'Review &amp; finish' : `Continue · hole ${n}`}</a>
          </div>`;
        })
        .join('')}
      ${
        !data.rounds.length
          ? `<div class="empty card"><div class="empty-icon">⛳</div><p>No rounds yet.</p><a class="btn primary big" href="#new">Start a round</a></div>`
          : `<div class="section-head"><h2>Rounds</h2><a class="btn" href="#new">+ New round</a></div>
             ${done.length ? `<ul class="list">${done.map(roundItem).join('')}</ul>` : '<p class="muted">Finished rounds will show here.</p>'}`
      }`;
  }

  // ---------- new round ----------
  function renderNew() {
    const courses = data.courses.slice().sort((a, b) => a.name.localeCompare(b.name));
    view.innerHTML = `
      <h2>New round</h2>
      <form class="card" id="new-form">
        <label class="field">Course
          <select name="course" required>
            ${courses.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.holes.length} holes, par ${sumPar(c.holes)})</option>`).join('')}
            <option value="__quick18">Other course – 18 holes, par 72</option>
            <option value="__quick9">Other course – 9 holes, par 36</option>
          </select>
        </label>
        <label class="field">Date<input type="date" name="date" value="${today()}" required></label>
        <fieldset class="field seg-field">
          <legend>Scoring</legend>
          <div class="seg">
            <label><input type="radio" name="entry" value="shots" ${prefs.entry === 'shots' ? 'checked' : ''}><span>Shot by shot<small>club + result each shot</small></span></label>
            <label><input type="radio" name="entry" value="quick" ${prefs.entry === 'quick' ? 'checked' : ''}><span>Quick score<small>strokes &amp; putts per hole</small></span></label>
          </div>
        </fieldset>
        <button class="primary big block" type="submit">Tee off</button>
        <p class="muted center small">Playing somewhere new? <a href="#course/new">Add the course</a> first so par is right.</p>
      </form>`;
    view.querySelector('#new-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      prefs.entry = f.get('entry') || 'shots';
      savePrefs();
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
        finished: false,
        holes: course.holes.map((par) => ({ par, strokes: null, putts: null, fairway: null, penalties: [], shots: [] })),
        updatedAt: Date.now(),
      };
      data.rounds.push(round);
      save();
      go(`play/${round.id}/1`);
    });
  }

  // ---------- play: one hole at a time ----------
  // UI-only state for the hole on screen.
  const play = { key: null, club: null, edit: null, mode: {}, extra: {} };

  function holeMode(r, i) {
    const h = r.holes[i];
    const k = r.id + ':' + i;
    if (S.shotsOf(h).length) return 'shots';
    if (play.mode[k]) return play.mode[k];
    if (h.strokes != null) return 'quick';
    return prefs.entry;
  }

  function renderPlay(id, n) {
    const r = findRound(id);
    if (!r) return go('rounds');
    const hn = Math.min(Math.max(1, Number(n) || 1), r.holes.length);
    const i = hn - 1;
    const h = r.holes[i];
    const key = r.id + ':' + i;
    if (play.key !== key) Object.assign(play, { key, club: null, edit: null, extra: {} });
    const t = S.roundTotals(r);
    const mode = holeMode(r, i);
    const last = hn === r.holes.length;

    view.innerHTML = `
      <div class="play-head">
        <div>
          <div class="eyebrow">${esc(r.courseName)} · ${fmtDate(r.date)}</div>
          <div class="hole-title">Hole ${hn} <span>Par ${h.par}</span></div>
        </div>
        <div class="running ${toParClass(t.toPar)}">${t.holesPlayed ? S.formatToPar(t.toPar) : 'E'}<small>${t.holesPlayed ? `${t.strokes} thru ${t.holesPlayed}` : 'not started'}</small></div>
      </div>
      <nav class="strip" aria-label="Holes">
        ${r.holes
          .map((x, j) => {
            const live = S.shotsOf(x).length && !S.isHoled(x);
            const cls = live ? 'live' : x.strokes != null ? S.scoreName(x.strokes, x.par) : '';
            return `<a href="#play/${r.id}/${j + 1}" class="${cls} ${j === i ? 'current' : ''}" aria-label="Hole ${j + 1}${x.strokes != null ? ', ' + x.strokes : ''}"><b>${j + 1}</b><span>${x.strokes ?? '·'}</span></a>`;
          })
          .join('')}
      </nav>
      <section class="card hole-card" id="hole-body">${mode === 'shots' ? shotPanel(h) : quickPanel(h)}</section>
      <div class="savebar">
        <div class="savebar-btns">
          <button type="button" class="nav-btn" id="prev" ${hn === 1 ? 'disabled' : ''} aria-label="Previous hole">‹ ${hn > 1 ? hn - 1 : ''}</button>
          <button type="button" class="primary save-btn" id="save-btn">Save</button>
          ${
            last
              ? `<button type="button" class="nav-btn finish" id="finish">${r.finished ? 'Done' : 'Finish round'}</button>`
              : `<button type="button" class="nav-btn" id="next" aria-label="Next hole">${hn + 1} ›</button>`
          }
        </div>
        <div class="save-status" id="save-status"></div>
      </div>`;
    showSaveStatus();
    const cur = view.querySelector('.strip .current');
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });

    const changed = () => {
      S.applyShots(h);
      touch(r);
      save();
      renderPlay(r.id, hn);
    };

    view.querySelector('#hole-body').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      const shots = (h.shots = S.shotsOf(h));
      if (d.mode) {
        play.mode[key] = d.mode;
        return renderPlay(r.id, hn);
      }
      // --- shot entry ---
      if (d.club !== undefined) {
        if (play.edit != null) {
          shots[play.edit].club = d.club || null;
          return changed();
        }
        play.club = d.club;
        return renderPlay(r.id, hn);
      }
      if (d.x) {
        // optional strike / direction / pace detail: tap again to clear
        const [field, val] = d.x.split(':');
        const target = play.edit != null ? shots[play.edit] : play.extra;
        if (target[field] === val) delete target[field];
        else target[field] = val;
        return play.edit != null ? changed() : renderPlay(r.id, hn);
      }
      if (d.result) {
        if (play.edit != null) shots[play.edit].result = d.result;
        else {
          const shot = { club: play.club || null, result: d.result };
          // a holed putt needs no pace/line
          if (!(play.club === 'Putter' && d.result === 'holed')) Object.assign(shot, play.extra);
          shots.push(shot);
          play.club = null;
          play.extra = {};
        }
        return changed();
      }
      if (d.cancel != null) {
        play.club = null;
        play.edit = null;
        play.extra = {};
        return renderPlay(r.id, hn);
      }
      if (d.editShot != null) {
        play.edit = Number(d.editShot);
        play.club = null;
        return renderPlay(r.id, hn);
      }
      if (d.deleteShot != null || d.undo != null) {
        shots.splice(d.undo != null ? shots.length - 1 : play.edit, 1);
        play.edit = null;
        if (!shots.length) Object.assign(h, { strokes: null, putts: null, fairway: null, penalties: [] });
        return changed();
      }
      // --- quick entry ---
      if (d.field) {
        const start = d.field === 'strokes' ? h.par : 2;
        const delta = Number(d.delta);
        const v = h[d.field] == null ? (delta < 0 ? start - 1 : start) : h[d.field] + delta;
        h[d.field] = Math.max(d.field === 'strokes' ? 1 : 0, Math.min(15, v));
        if (h.putts != null && h.strokes != null && h.putts > h.strokes) h.putts = h.strokes;
        return changed();
      }
      if (d.fw) {
        const val = d.fw === 'hit';
        h.fairway = h.fairway === val ? null : val;
        return changed();
      }
      if (d.pen) {
        h.penalties = S.penaltiesOf(h).concat({ type: d.pen });
        h.strokes = h.strokes == null ? h.par + 1 : Math.min(15, h.strokes + 1);
        return changed();
      }
      if (d.unpen != null) {
        h.penalties = S.penaltiesOf(h).filter((_, k) => k !== Number(d.unpen));
        if (h.strokes != null) h.strokes = Math.max(1, h.strokes - 1);
        return changed();
      }
      if (d.clear != null) {
        Object.assign(h, { strokes: null, putts: null, fairway: null, penalties: [], shots: [] });
        return changed();
      }
    });

    const saveNow = (btn) => {
      const ok = save();
      runSync();
      if (btn) {
        btn.textContent = ok ? 'Saved ✓' : 'Not saved!';
        btn.classList.toggle('flash', ok);
        setTimeout(() => {
          if (btn.isConnected) {
            btn.textContent = 'Save';
            btn.classList.remove('flash');
          }
        }, 1500);
      }
      return ok;
    };
    view.querySelector('#save-btn').addEventListener('click', (e) => saveNow(e.currentTarget));
    view.querySelector('#prev').addEventListener('click', () => {
      saveNow();
      go(`play/${r.id}/${hn - 1}`);
    });
    const next = view.querySelector('#next');
    if (next)
      next.addEventListener('click', () => {
        saveNow();
        go(`play/${r.id}/${hn + 1}`);
      });
    const fin = view.querySelector('#finish');
    if (fin)
      fin.addEventListener('click', () => {
        const missing = r.holes.filter((x) => x.strokes == null).length;
        if (!r.finished && missing && !confirm(`${missing} hole${missing > 1 ? 's have' : ' has'} no score yet. Finish the round anyway?`)) return;
        r.finished = true;
        touch(r);
        saveNow();
        go('round/' + r.id);
      });
  }

  function shotPanel(h) {
    const shots = S.shotsOf(h);
    const nums = S.strokeNumbers(shots);
    const holed = shots.length && S.isHoled(h);
    const lastRes = shots.length ? shots[shots.length - 1].result : null;
    const list = shots.length
      ? `<ol class="shots">${shots
          .map((s, k) => {
            const pen = s.result === 'drop' || s.result === 'sd';
            return `<li><button type="button" class="shot ${play.edit === k ? 'editing' : ''}" data-edit-shot="${k}" aria-label="Edit shot ${nums[k]}">
              <span class="no">${nums[k]}</span><span class="club">${esc(s.club || '—')}</span>
              <span class="res res-${s.result}">${resultLabel(s.result)}${pen ? ' <em>+1</em>' : ''}${shotTags(s) ? `<small class="tags">${shotTags(s)}</small>` : ''}</span><span class="pencil" aria-hidden="true">✎</span></button></li>`;
          })
          .join('')}</ol>`
      : '';

    let panel;
    if (play.edit != null && shots[play.edit]) {
      const s = shots[play.edit];
      panel = `<div class="panel">
        <div class="panel-title">Edit shot ${nums[play.edit]}</div>
        ${clubGrid(s.club, false, true)}
        ${resultGrid(s.club, s.result)}
        ${extrasGrid(s.club, s)}
        <div class="row-btns"><button type="button" class="danger" data-delete-shot>Delete shot</button><button type="button" class="primary" data-cancel>Done</button></div>
      </div>`;
    } else if (holed) {
      panel = `<div class="holed">✓ Holed out in <strong>${h.strokes}</strong> <span class="topar ${toParClass(h.strokes - h.par)}">(${S.scoreName(h.strokes, h.par)})</span>
        <div class="muted small">Tap a shot above to change it.</div></div>`;
    } else if (!play.club) {
      const n = shots.length ? nums[shots.length - 1] + (lastRes === 'drop' || lastRes === 'sd' ? 2 : 1) : 1;
      const where = !shots.length ? 'off the tee' : lastRes === 'green' ? 'on the green' : lastRes === 'sd' ? 'replaying from the same spot' : lastRes === 'drop' ? 'after the drop' : `from the ${resultLabel(lastRes).toLowerCase()}`;
      panel = `<div class="panel">
        <div class="panel-title">Shot ${n} <span class="muted">· ${where}</span></div>
        <div class="panel-sub">Which club?</div>
        ${clubGrid(null, lastRes === 'green', false)}
      </div>`;
    } else {
      panel = `<div class="panel">
        <div class="panel-title">${esc(play.club || 'Shot')} <span class="muted">· how did it go?</span></div>
        ${extrasGrid(play.club, play.extra)}
        <div class="panel-sub" style="margin:12px 0 0">Where did it finish? <span class="muted">(saves the shot)</span></div>
        ${resultGrid(play.club, null)}
        <button type="button" class="link small" data-cancel>‹ Change club</button>
      </div>`;
    }
    return `${list}${panel}
      <div class="hole-foot">
        ${shots.length && play.edit == null ? '<button type="button" class="link small" data-undo>↶ Undo last shot</button>' : '<span></span>'}
        ${shots.length ? '' : '<button type="button" class="link small" data-mode="quick">Just enter the score</button>'}
      </div>`;
  }

  function clubGrid(selected, onGreen, editing) {
    let clubs = bag().slice();
    if (onGreen && clubs.includes('Putter')) clubs = ['Putter'].concat(clubs.filter((c) => c !== 'Putter'));
    return `<div class="clubs">${clubs
      .map((c) => `<button type="button" class="${c === selected ? 'sel' : ''} ${onGreen && c === 'Putter' ? 'suggest' : ''}" data-club="${esc(c)}">${esc(c)}</button>`)
      .join('')}<button type="button" class="unknown ${editing && !selected ? 'sel' : ''}" data-club="">Not sure</button></div>`;
  }

  function extrasGrid(club, v) {
    const row = (label, field, opts) => `<div class="xrow"><span class="xlbl">${label}</span><div class="xchips">${Object.entries(opts)
      .map(([k, l]) => `<button type="button" class="xchip ${v[field] === k ? 'sel' : ''} ${k === 'good' || k === 'S' ? 'ok' : ''}" data-x="${field}:${k}" aria-pressed="${v[field] === k}">${l}</button>`)
      .join('')}</div></div>`;
    const rows =
      club === 'Putter'
        ? row('Pace', 'pace', S.PUTT_PACE) + row('Line', 'dir', S.PUTT_LINE)
        : row('Strike', 'strike', S.STRIKES) + row('Direction', 'dir', { L: '← Left', S: 'Straight', R: 'Right →' });
    return `<div class="extras">${rows}<div class="muted small">Optional – leave blank if you're not sure.</div></div>`;
  }

  function shotTags(s) {
    const t = [];
    if (s.club === 'Putter') {
      if (S.PUTT_PACE[s.pace]) t.push(S.PUTT_PACE[s.pace]);
      if (S.PUTT_LINE[s.dir]) t.push(S.PUTT_LINE[s.dir]);
    } else {
      if (S.STRIKES[s.strike]) t.push(s.strike === 'good' ? 'Good strike' : S.STRIKES[s.strike]);
      if (S.DIRS[s.dir]) t.push(S.DIRS[s.dir]);
    }
    return t.join(', ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  }

  function resultGrid(club, selected) {
    const keys = club === 'Putter' ? ['holed', 'green', 'rough'] : ['fairway', 'green', 'holed', 'rough', 'bunker', 'recovery', 'drop', 'sd'];
    const label = (k) => (club === 'Putter' ? { holed: 'Holed', green: 'Missed', rough: 'Off the green' }[k] : S.RESULTS[k]);
    return `<div class="results">${keys
      .map((k) => `<button type="button" class="res-btn res-${k} ${k === selected ? 'sel' : ''}" data-result="${k}">${label(k)}${k === 'drop' || k === 'sd' ? '<small>+1 penalty stroke</small>' : ''}</button>`)
      .join('')}</div>`;
  }

  function quickPanel(h) {
    const stepper = (field, label) => `
      <div class="stepper big"><span class="lbl">${label}</span>
        <button type="button" data-field="${field}" data-delta="-1" aria-label="${label} minus">−</button>
        <output>${h[field] == null ? '–' : h[field]}</output>
        <button type="button" data-field="${field}" data-delta="1" aria-label="${label} plus">+</button>
      </div>`;
    const pens = S.penaltiesOf(h);
    return `
      <div class="quick">
        ${stepper('strokes', 'Strokes')}
        ${stepper('putts', 'Putts')}
        ${
          h.par >= 4
            ? `<div class="fw"><span class="lbl">Tee shot</span><button type="button" data-fw="hit" aria-pressed="${h.fairway === true}">Fairway ✓</button><button type="button" data-fw="miss" aria-pressed="${h.fairway === false}">Missed</button></div>`
            : ''
        }
        <div class="pen">
          <span class="lbl">Penalty shots${pens.length ? ` (${pens.length})` : ''} – each adds a stroke</span>
          ${pens.map((p, k) => `<button type="button" class="chip" data-unpen="${k}" aria-label="Remove ${S.PENALTY_TYPES[p.type]} penalty">${p.type === 'sd' ? 'Stroke &amp; dist.' : 'Drop'} ×</button>`).join('')}
          <div class="pen-add">
            <button type="button" data-pen="drop">+ Drop</button>
            <button type="button" data-pen="sd">+ Stroke &amp; distance</button>
          </div>
        </div>
      </div>
      <div class="hole-foot">
        ${h.strokes != null ? '<button type="button" class="link small" data-clear>Clear hole</button>' : '<span></span>'}
        <button type="button" class="link small" data-mode="shots">Track shots &amp; clubs instead</button>
      </div>`;
  }

  function showSaveStatus() {
    const el = document.getElementById('save-status');
    if (!el) return;
    if (!saveState.ok) {
      el.innerHTML = `<span class="err">⚠ Couldn't save on this phone (storage full or blocked). Don't close the app – try Save again.</span>`;
      return;
    }
    const local = saveState.at ? `✓ Saved on this phone at ${fmtTime(saveState.at)}` : '✓ Every tap is saved automatically';
    el.innerHTML = `${local}${syncCfg ? ` · ${syncState.busy ? 'syncing…' : syncState.error ? '<span class="err">sync failed</span>' : 'synced'}` : ''}`;
  }

  // ---------- round detail ----------
  function renderRound(id) {
    const r = findRound(id);
    if (!r) return go('rounds');
    const t = S.roundTotals(r);
    const diff = S.differential(r);
    const halves = r.holes.length === 18 ? [[0, 9, 'Out'], [9, 18, 'In']] : [[0, r.holes.length, 'Tot']];
    const row = (label, cell, total) =>
      `<tr><th>${label}</th>${halves
        .map(([a, b, l]) => r.holes.slice(a, b).map((h, j) => cell(h, a + j)).join('') + `<th>${total ? total(r.holes.slice(a, b)) : l}</th>`)
        .join('')}${halves.length > 1 ? `<th>${total ? total(r.holes) : 'Tot'}</th>` : ''}</tr>`;
    const sumOf = (k) => (hs) => {
      const v = hs.filter((h) => h[k] != null);
      return v.length ? v.reduce((a, h) => a + h[k], 0) : '';
    };
    const anyShots = r.holes.some((h) => S.shotsOf(h).length);

    view.innerHTML = `
      <div class="section-head"><h2>${esc(r.courseName)}</h2>${r.finished ? '' : '<span class="badge">In progress</span>'}</div>
      <p class="muted" style="margin-top:-8px">${fmtDate(r.date)}</p>
      <div class="tiles">
        <div class="tile"><div class="v">${t.strokes || '–'} <span class="topar ${toParClass(t.toPar)}" style="font-size:1rem">${t.holesPlayed ? S.formatToPar(t.toPar) : ''}</span></div><div class="k">Score (${t.holesPlayed}/${r.holes.length} holes)</div></div>
        <div class="tile"><div class="v">${t.putts ?? '–'}</div><div class="k">Putts</div></div>
        <div class="tile"><div class="v">${t.fairwayChances ? `${t.fairwaysHit}/${t.fairwayChances}` : '–'}</div><div class="k">Fairways hit</div></div>
        <div class="tile"><div class="v">${t.girChances ? `${t.gir}/${t.girChances}` : '–'}</div><div class="k">Greens in regulation</div></div>
        <div class="tile"><div class="v">${t.penalties}</div><div class="k">Penalty strokes${t.penalties ? ` · ${t.penaltiesDrop} drop, ${t.penaltiesSD} S&amp;D` : ''}</div></div>
        <div class="tile"><div class="v">${diff ?? '–'}</div><div class="k">Score differential</div></div>
      </div>
      <div class="actions" style="margin:0 0 12px">
        <a class="btn primary" href="#play/${r.id}/${r.finished ? 1 : firstOpenHole(r)}">${r.finished ? 'Edit scores' : 'Continue round'}</a>
      </div>
      <div class="card table-wrap">
        <table class="scorecard">
          ${row('Hole', (h, i) => `<th>${i + 1}</th>`)}
          ${row('Par', (h) => `<td>${h.par}</td>`, sumOf('par'))}
          ${row('Score', (h) => `<td class="${h.strokes != null ? S.scoreName(h.strokes, h.par) : ''}">${h.strokes ?? ''}</td>`, sumOf('strokes'))}
          ${row('Putts', (h) => `<td>${h.putts ?? ''}</td>`, sumOf('putts'))}
          ${row('FW', (h) => `<td>${h.par < 4 ? '' : h.fairway === true ? '✓' : h.fairway === false ? '✗' : ''}</td>`, () => '')}
          ${row('GIR', (h) => `<td>${h.putts != null && h.strokes != null ? (S.isGir(h) ? '●' : '○') : ''}</td>`, () => '')}
          ${row('Pen', (h) => `<td>${S.penaltiesOf(h).map((p) => (p.type === 'sd' ? 'S' : 'D')).join(' ')}</td>`, (hs) => hs.reduce((a, h) => a + S.penaltiesOf(h).length, 0) || '')}
        </table>
        <p class="muted small" style="margin:8px 0 0">Pen: D = drop, S = stroke &amp; distance. Penalty strokes are included in the score.</p>
      </div>
      ${
        anyShots
          ? `<details class="card shots-detail"><summary>Shot by shot</summary>${r.holes
              .map((h, i) => {
                const shots = S.shotsOf(h);
                if (!shots.length) return '';
                const nums = S.strokeNumbers(shots);
                return `<div class="shot-line"><strong>${i + 1}</strong> <span class="muted">par ${h.par} · ${h.strokes}</span><div>${shots
                  .map((s, k) => `<span class="pill">${nums[k]}. ${esc(s.club || '?')} → ${resultLabel(s.result)}${shotTags(s) ? ` <span class="muted">(${shotTags(s).toLowerCase()})</span>` : ''}</span>`)
                  .join(' ')}</div></div>`;
              })
              .join('')}</details>`
          : ''
      }
      <form class="card" id="meta-form">
        <div class="row">
          <label class="field">Course name<input name="courseName" value="${esc(r.courseName)}" required></label>
          <label class="field">Date<input type="date" name="date" value="${r.date}" required></label>
          <label class="field">Course rating<input type="number" step="0.1" name="rating" value="${r.rating ?? ''}" placeholder="${sumPar(r.holes)}"></label>
          <label class="field">Slope<input type="number" name="slope" min="55" max="155" value="${r.slope ?? ''}" placeholder="113"></label>
        </div>
        <label class="field" style="margin-top:12px">Notes<input name="notes" value="${esc(r.notes)}" placeholder="Weather, partners, what to work on…"></label>
        <div class="actions">
          <button class="primary" type="submit">Save details</button>
          <button type="button" class="danger" id="del-round">Delete round</button>
        </div>
      </form>`;

    view.querySelector('#meta-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const cur = findRound(id);
      if (!cur) return alert('This round was deleted on another device.');
      cur.courseName = String(f.get('courseName')).trim() || cur.courseName;
      cur.date = f.get('date') || cur.date;
      cur.rating = parseNum(f.get('rating'));
      cur.slope = parseNum(f.get('slope'));
      cur.notes = String(f.get('notes'));
      touch(cur);
      save();
      renderRound(id);
    });
    view.querySelector('#del-round').addEventListener('click', () => {
      if (!confirm('Delete this round? This cannot be undone.')) return;
      data.rounds = data.rounds.filter((x) => x.id !== r.id);
      tombstone(r.id);
      save();
      go('rounds');
    });
  }

  // ---------- more ----------
  function renderMore() {
    view.innerHTML = `
      <h2>More</h2>
      <ul class="list">
        <li><a class="list-item" href="#courses"><div><strong>Courses</strong><div class="sub">${data.courses.length} saved</div></div><span class="chev">›</span></a></li>
        <li><a class="list-item" href="#bag"><div><strong>My bag</strong><div class="sub">${bag().length} clubs</div></div><span class="chev">›</span></a></li>
        <li><a class="list-item" href="#sync"><div><strong>Sync between devices</strong><div class="sub">${syncCfg ? 'On' : 'Off'}</div></div><span class="chev">›</span></a></li>
        <li><a class="list-item" href="#backup"><div><strong>Backup</strong><div class="sub">Export or import a file</div></div><span class="chev">›</span></a></li>
      </ul>
      <div class="card">
        <strong>Default scoring</strong>
        <div class="seg" style="margin-top:8px">
          <label><input type="radio" name="entry" value="shots" ${prefs.entry === 'shots' ? 'checked' : ''}><span>Shot by shot</span></label>
          <label><input type="radio" name="entry" value="quick" ${prefs.entry === 'quick' ? 'checked' : ''}><span>Quick score</span></label>
        </div>
      </div>`;
    view.querySelectorAll('input[name=entry]').forEach((el) =>
      el.addEventListener('change', () => {
        prefs.entry = el.value;
        savePrefs();
      })
    );
  }

  function renderBag() {
    const current = new Set(bag());
    view.innerHTML = `
      <div class="section-head"><h2>My bag</h2><a class="btn" href="#more">Done</a></div>
      <p class="muted">Tap the clubs you carry. They're the buttons you'll see when recording shots.</p>
      <div class="card"><div class="clubs bag-edit">${S.ALL_CLUBS.map((c) => `<button type="button" class="${current.has(c) ? 'sel' : ''}" data-c="${c}" aria-pressed="${current.has(c)}">${c}</button>`).join('')}</div>
        <p class="small ${current.size > 14 ? 'err' : 'muted'}" style="margin-bottom:0">${current.size} clubs${current.size > 14 ? ' – the rules allow 14' : ''}</p></div>`;
    view.querySelector('.bag-edit').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (current.has(b.dataset.c)) current.delete(b.dataset.c);
      else current.add(b.dataset.c);
      data.bag = { clubs: S.ALL_CLUBS.filter((c) => current.has(c)), updatedAt: Date.now() };
      save();
      renderBag();
    });
  }

  function renderBackup() {
    view.innerHTML = `
      <div class="section-head"><h2>Backup</h2><a class="btn" href="#more">Done</a></div>
      <div class="card">
        <p style="margin-top:0">Download all your rounds, courses and bag as a file, or load one back in. Importing adds to what's already here.</p>
        <div class="actions">
          <button class="primary" id="export-btn">Export file</button>
          <label class="btn">Import file<input type="file" id="import-input" accept="application/json" hidden></label>
        </div>
      </div>`;
    view.querySelector('#export-btn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `golf-tracker-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    view.querySelector('#import-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const d = JSON.parse(await file.text());
        if (!Array.isArray(d.courses) || !Array.isArray(d.rounds)) throw new Error('Not a Golf Tracker export');
        if (!confirm(`Add ${d.rounds.length} rounds and ${d.courses.length} courses from this file? Matching records are replaced by the file's version.`)) return;
        const now = Date.now();
        const incoming = G.normalize({ courses: d.courses, rounds: d.rounds, bag: d.bag });
        incoming.courses.concat(incoming.rounds).forEach((x) => {
          x.updatedAt = now;
          if (x.holes && x.finished === undefined) x.finished = true;
        });
        if (incoming.bag) incoming.bag.updatedAt = now;
        data = G.mergeData(incoming, data, now);
        save();
        go('rounds');
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    });
  }

  // ---------- courses ----------
  function renderCourses() {
    const courses = data.courses.slice().sort((a, b) => a.name.localeCompare(b.name));
    view.innerHTML = `
      <div class="section-head"><h2>Courses</h2><a class="btn" href="#course/new">+ Add course</a></div>
      ${
        courses.length
          ? `<ul class="list">${courses
              .map((c) => {
                const played = data.rounds.filter((r) => r.courseId === c.id).length;
                return `<li><a class="list-item" href="#course/${c.id}">
                  <div><strong>${esc(c.name)}</strong><div class="sub">${c.holes.length} holes${c.rating ? ` · ${c.rating}/${c.slope ?? 113}` : ''} · ${played} round${played === 1 ? '' : 's'}</div></div>
                  <div class="score">${sumPar(c.holes)}<div class="sub">par</div></div>
                </a></li>`;
              })
              .join('')}</ul>`
          : `<div class="empty card"><p>Save the courses you play so par is filled in for you.</p></div>`
      }`;
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
        <h3 class="h3">Par by hole <span class="muted" id="par-total"></span></h3>
        <div class="par-grid" id="par-grid"></div>
        <div class="actions">
          <button class="primary" type="submit">Save course</button>
          <a class="btn" href="#courses">Cancel</a>
          ${existing ? `<button type="button" class="danger" id="del-course">Delete course</button>` : ''}
        </div>
      </form>`;
    const grid = view.querySelector('#par-grid');
    const drawGrid = () => {
      grid.innerHTML = draft
        .map((p, i) => `<label>#${i + 1}<select data-i="${i}">${[3, 4, 5, 6].map((v) => `<option ${v === p ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`)
        .join('');
      view.querySelector('#par-total').textContent = '· total ' + sumPar(draft);
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
      let rec = existing && findCourse(existing.id);
      if (!rec) {
        rec = { id: existing ? existing.id : uid() };
        data.courses.push(rec);
      }
      Object.assign(rec, { name: String(f.get('name')).trim(), holes: draft.slice(), rating: parseNum(f.get('rating')), slope: parseNum(f.get('slope')) });
      touch(rec);
      save();
      go('courses');
    });
    const del = view.querySelector('#del-course');
    if (del)
      del.addEventListener('click', () => {
        if (!confirm('Delete this course? Rounds played there are kept.')) return;
        data.courses = data.courses.filter((x) => x.id !== existing.id);
        tombstone(existing.id);
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
        <div class="tile"><div class="v">${num(st.penaltiesPerRound)}</div><div class="k">Penalty strokes / round</div></div>
        <div class="tile"><div class="v">${st.rounds}</div><div class="k">Rounds · ${st.holes} holes</div></div>
      </div>
      <div class="card"><h3 class="h3 first">Recent 18-hole scores</h3>${trendChart()}</div>
      ${strikingCard()}
      ${clubsCard()}
      ${puttingCard()}
      <div class="card"><h3 class="h3 first">Score distribution</h3>
        <div class="bars">${distRows
          .map(([k, label]) => {
            const n = st.distribution[k];
            return `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${(n / maxD) * 100}%"></div></div><span class="n">${n} · ${Math.round((n / st.holes) * 100)}%</span></div>`;
          })
          .join('')}</div>
      </div>
      <div class="card"><h3 class="h3 first">Penalties</h3>
        ${
          st.penaltiesDrop + st.penaltiesSD
            ? `<div class="bars">${[['Drop', st.penaltiesDrop], ['Stroke &amp; dist.', st.penaltiesSD]]
                .map(([label, n]) => `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${(n / Math.max(st.penaltiesDrop, st.penaltiesSD)) * 100}%"></div></div><span class="n">${n}</span></div>`)
                .join('')}</div>`
            : `<p class="muted" style="margin:0">No penalty strokes recorded. Nice.</p>`
        }
      </div>
      <p class="muted small">Handicap is an estimate following World Handicap System averaging (best differentials of your last 20 complete rounds), with each hole capped at double bogey. Enter course rating and slope for accuracy.</p>`;
  }

  const pctOf = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
  const barRow = (label, n, max, right) =>
    `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${max ? (n / max) * 100 : 0}%"></div></div><span class="n">${right}</span></div>`;
  // Left / straight / right as one stacked bar.
  function dirBar(d, n) {
    if (!n) return '';
    return `<div class="dirbar" role="img" aria-label="Left ${pctOf(d.L, n)}, straight ${pctOf(d.S, n)}, right ${pctOf(d.R, n)}">${['L', 'S', 'R']
      .map((k) => (d[k] ? `<span class="d-${k}" style="flex-grow:${d[k]}">${pctOf(d[k], n)}</span>` : ''))
      .join('')}</div><div class="dirlegend"><span>◀ Left</span><span>Straight</span><span>Right ▶</span></div>`;
  }

  function strikingCard() {
    const st = S.strikeSummary(data.rounds);
    if (!st.n && !st.dirN)
      return `<div class="card"><h3 class="h3 first">Ball striking</h3><p class="muted" style="margin:0">When recording a shot, tap <strong>Strike</strong> (Good, Topped, Fat, Thin) and <strong>Direction</strong> to see how well you're really hitting it – not just where it ended up.</p></div>`;
    const max = Math.max(...Object.values(st.counts));
    const recent = st.perRound.slice(-10);
    return `<div class="card"><h3 class="h3 first">Ball striking</h3>
      ${st.n ? `<div class="bigstat"><b>${pctOf(st.counts.good, st.n)}</b> good strikes <span class="muted">(${st.counts.good} of ${st.n} full shots)</span></div>
      <div class="bars">${Object.entries(S.STRIKES).map(([k, l]) => barRow(l, st.counts[k], max, `${st.counts[k]} · ${pctOf(st.counts[k], st.n)}`)).join('')}</div>` : ''}
      ${st.dirN ? `<h4 class="h4">Direction <span class="muted">(${st.dirN} shots)</span></h4>${dirBar(st.dirs, st.dirN)}` : ''}
      ${st.n ? `<div class="luck">
        <div><b>${st.unlucky}</b><span>Hit it well, still ended in trouble</span></div>
        <div><b>${st.lucky}</b><span>Mishit, but got away with it</span></div>
      </div>` : ''}
      ${recent.length > 1 ? `<h4 class="h4">Good strikes by round</h4><div class="bars">${recent
        .map((r) => barRow(new Date(r.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), r.good, r.n, pctOf(r.good, r.n)))
        .join('')}</div>` : ''}
    </div>`;
  }

  function clubsCard() {
    const clubs = S.clubStats(data.rounds);
    if (!clubs.length)
      return `<div class="card"><h3 class="h3 first">Clubs</h3><p class="muted" style="margin:0">Record rounds shot by shot to see how each club performs.</p></div>`;
    return `<div class="card"><h3 class="h3 first">Clubs</h3>${clubs
      .map((c) => {
        const lines = [];
        if (c.struck) {
          const misses = ['topped', 'fat', 'thin'].filter((k) => c.strikes[k]).map((k) => `${c.strikes[k]} ${k}`);
          lines.push(`<div><span class="k">Strike</span><b>${pctOf(c.strikes.good, c.struck)}</b> good${misses.length ? ` · ${misses.join(' · ')}` : ''}</div>`);
        }
        if (c.teeShots) {
          lines.push(`<div><span class="k">Off the tee</span><b>${pctOf(c.teeFairways, c.teeShots)}</b> fairways${c.teeStruck ? ` · <b>${pctOf(c.teeGoodFairways, c.teeStruck)}</b> well-struck fairways` : ''}</div>`);
        }
        if (c.approach) lines.push(`<div><span class="k">Found green</span><b>${pctOf(c.toGreen, c.approach)}</b> <span class="muted">(${c.toGreen}/${c.approach})</span></div>`);
        if (c.penalties) lines.push(`<div><span class="k">Penalties</span>${c.penalties}</div>`);
        return `<div class="clubrow"><div class="cr-head"><strong>${esc(c.club)}</strong><span class="muted">${c.uses} shot${c.uses === 1 ? '' : 's'}</span></div>
          <div class="cr-lines">${lines.join('')}</div>${c.club !== 'Putter' ? dirBar(c.dirs, c.aimed) : ''}</div>`;
      })
      .join('')}
      <p class="muted small" style="margin:8px 0 0">Well-struck fairways: tee shots on par 4s and 5s that found the fairway <em>and</em> were marked as a good strike. Found green: shots from off the green that finished on it or in the hole.</p>
    </div>`;
  }

  function puttingCard() {
    const p = S.puttSummary(data.rounds);
    if (!p.n) return '';
    const max = Math.max(1, ...['short', 'good', 'long'].flatMap((k) => ['L', 'S', 'R'].map((l) => p.grid[k][l])));
    return `<div class="card"><h3 class="h3 first">Putting misses <span class="muted">(${p.n} missed putts)</span></h3>
      <table class="puttgrid">
        <tr><th></th><th>Left</th><th>On target</th><th>Right</th></tr>
        ${['long', 'good', 'short']
          .map((k) => `<tr><th>${S.PUTT_PACE[k]}</th>${['L', 'S', 'R'].map((l) => `<td style="--heat:${p.grid[k][l] / max}">${p.grid[k][l] || ''}</td>`).join('')}</tr>`)
          .join('')}
      </table>
      <p class="small" style="margin:10px 0 0">${p.paceN ? `Pace: <b>${pctOf(p.pace.short, p.paceN)}</b> short · <b>${pctOf(p.pace.good, p.paceN)}</b> good · <b>${pctOf(p.pace.long, p.paceN)}</b> long` : ''}${p.paceN && p.lineN ? '<br>' : ''}${p.lineN ? `Line: <b>${pctOf(p.line.L, p.lineN)}</b> left · <b>${pctOf(p.line.S, p.lineN)}</b> on target · <b>${pctOf(p.line.R, p.lineN)}</b> right` : ''}</p>
      <p class="muted small" style="margin:6px 0 0">The grid counts misses where both pace and line were recorded.</p>
    </div>`;
  }

  function trendChart() {
    const pts = data.rounds
      .filter((r) => r.holes.length === 18 && S.roundTotals(r).holesPlayed === 18)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-20)
      .map((r) => ({ date: r.date, score: S.roundTotals(r).strokes }));
    if (pts.length < 2) return `<p class="muted" style="margin:0">Record at least two complete 18-hole rounds to see a trend.</p>`;
    const W = 600, H = 160, pad = 28;
    const lo = Math.min(...pts.map((p) => p.score)) - 2;
    const hi = Math.max(...pts.map((p) => p.score)) + 2;
    const x = (i) => pad + (i * (W - pad * 2)) / (pts.length - 1);
    const y = (s) => H - pad + 8 - ((s - lo) / (hi - lo)) * (H - pad * 2);
    return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score trend">
      <line x1="${pad}" x2="${W - pad}" y1="${y(lo)}" y2="${y(lo)}"/>
      <text x="2" y="${y(hi) + 4}">${hi}</text><text x="2" y="${y(lo) + 4}">${lo}</text>
      <polyline points="${pts.map((p, i) => `${x(i)},${y(p.score)}`).join(' ')}"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.score)}" r="4"><title>${fmtDate(p.date)}: ${p.score}</title></circle>`).join('')}
    </svg>`;
  }

  // ---------- sync ----------
  function loadSyncCfg() {
    try {
      return JSON.parse(localStorage.getItem(SYNC_KEY)) || null;
    } catch (e) {
      return null;
    }
  }
  function saveSyncCfg(cfg) {
    try {
      if (cfg) localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
      else localStorage.removeItem(SYNC_KEY);
    } catch (e) {
      /* sync settings just won't persist */
    }
  }
  let syncCfg = loadSyncCfg(); // { token, gistId, lastSync }
  const syncState = { busy: false, again: false, error: null, timer: null };

  function timeAgo(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(t).toLocaleDateString();
  }
  function setSyncStatus() {
    const dot = document.getElementById('sync-dot');
    let text = 'Sync off';
    let cls = 'off';
    if (syncCfg) {
      if (syncState.busy) (text = 'Syncing…'), (cls = 'busy');
      else if (syncState.error) (text = 'Sync error'), (cls = 'err');
      else if (!navigator.onLine) (text = 'Offline'), (cls = 'off');
      else (text = 'Synced' + (syncCfg.lastSync ? ' ' + timeAgo(syncCfg.lastSync) : '')), (cls = 'ok');
    }
    dot.className = 'sync-dot ' + cls;
    dot.querySelector('span').textContent = text;
    const box = document.getElementById('sync-status');
    if (box) box.textContent = syncState.error ? 'Last attempt failed: ' + syncState.error : text;
    showSaveStatus();
  }

  function scheduleSync(delay) {
    if (!syncCfg) return;
    clearTimeout(syncState.timer);
    syncState.timer = setTimeout(runSync, delay);
  }

  async function runSync() {
    if (!syncCfg || !navigator.onLine) return setSyncStatus();
    if (syncState.busy) {
      syncState.again = true;
      return;
    }
    syncState.busy = true;
    setSyncStatus();
    try {
      const client = new G.GistClient(syncCfg.token);
      const remote = await client.pull(syncCfg.gistId);
      const before = G.fingerprint(data);
      const merged = G.mergeData(data, remote);
      if (G.fingerprint(merged) !== G.fingerprint(remote)) await client.push(syncCfg.gistId, merged);
      // Edits made while we were on the network are picked up by a follow-up sync.
      if (G.fingerprint(data) !== before) syncState.again = true;
      else if (G.fingerprint(merged) !== before) {
        data = merged;
        writeLocal();
        rerender();
      }
      syncCfg.lastSync = Date.now();
      saveSyncCfg(syncCfg);
      syncState.error = null;
    } catch (e) {
      syncState.error = e.message || String(e);
    } finally {
      syncState.busy = false;
      setSyncStatus();
      if (syncState.again) {
        syncState.again = false;
        scheduleSync(500);
      }
    }
  }

  async function connectSync(token) {
    const client = new G.GistClient(token);
    let gistId = await client.find();
    if (!gistId) gistId = await client.create(data);
    syncCfg = { token, gistId, lastSync: null };
    saveSyncCfg(syncCfg);
    syncState.error = null;
    await runSync();
  }

  function renderSync() {
    if (syncCfg) {
      view.innerHTML = `
        <div class="section-head"><h2>Sync</h2><a class="btn" href="#more">Done</a></div>
        <div class="card">
          <p style="margin-top:0"><strong>Connected.</strong> Rounds, courses and your bag sync automatically to a private GitHub Gist whenever you make a change, open the app, or come back to it.</p>
          <p class="muted" id="sync-status"></p>
          <div class="actions">
            <button class="primary" id="sync-now">Sync now</button>
            <a class="btn" href="https://gist.github.com/${esc(syncCfg.gistId)}" target="_blank" rel="noopener">View gist</a>
            <button class="danger" id="sync-off">Disconnect this device</button>
          </div>
        </div>
        <p class="muted small">To add another device, open the tracker there, go to More → Sync, and paste the same token (or a new one with gist access). It will find this data automatically.</p>`;
      setSyncStatus();
      view.querySelector('#sync-now').addEventListener('click', runSync);
      view.querySelector('#sync-off').addEventListener('click', () => {
        if (!confirm('Stop syncing on this device? Your data stays here and on GitHub.')) return;
        syncCfg = null;
        saveSyncCfg(null);
        syncState.error = null;
        setSyncStatus();
        renderSync();
      });
      return;
    }
    view.innerHTML = `
      <div class="section-head"><h2>Sync between devices</h2><a class="btn" href="#more">Back</a></div>
      <div class="card">
        <p style="margin-top:0">Your data is kept in a <strong>private GitHub Gist</strong> in your own GitHub account, and every device you connect stays in step. Edits made on different devices are merged rather than overwritten.</p>
        <ol style="padding-left:1.2rem">
          <li><a href="https://github.com/settings/tokens/new?scopes=gist&amp;description=Golf%20Tracker" target="_blank" rel="noopener">Create a GitHub token</a> with only the <strong>gist</strong> scope (the link pre-selects it). Choose an expiry you're happy with.</li>
          <li>Paste it below and connect. Do the same on each device. Using the same token is fine.</li>
        </ol>
        <form id="sync-form" class="row">
          <label class="field" style="flex:1;min-width:220px">GitHub token
            <input name="token" type="password" autocomplete="off" required placeholder="ghp_…" style="width:100%">
          </label>
          <button class="primary" type="submit">Connect</button>
        </form>
        <p class="muted" id="sync-msg" style="margin-bottom:0"></p>
      </div>
      <p class="muted small">The token is stored only in this browser and is sent only to GitHub. It can read and write your gists, nothing else. You can revoke it any time in GitHub settings.</p>`;
    view.querySelector('#sync-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = view.querySelector('#sync-msg');
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      msg.textContent = 'Connecting…';
      try {
        await connectSync(String(new FormData(e.target).get('token')).trim());
        if (syncState.error) throw new Error(syncState.error);
        renderSync();
      } catch (err) {
        syncCfg = null;
        saveSyncCfg(null);
        msg.textContent = 'Could not connect: ' + err.message;
        btn.disabled = false;
        setSyncStatus();
      }
    });
  }

  window.addEventListener('online', () => scheduleSync(0));
  window.addEventListener('offline', setSyncStatus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0);
  });
  // Another tab/window of the app saved: merge its data in so neither copy
  // overwrites the other's changes.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      data = G.mergeData(data, JSON.parse(e.newValue));
      rerender();
    } catch (err) {
      /* ignore unreadable data */
    }
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') scheduleSync(0);
    else setSyncStatus();
  }, 60000);

  route();
  setSyncStatus();
  scheduleSync(0);
})();

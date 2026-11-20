// Pure scoring/statistics helpers. Loaded in the browser as a plain script
// (exposes window.GolfStats) and in Node for tests (module.exports).
(function (root) {
  'use strict';

  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // A hole counts once its score is entered, or, when it's being recorded
  // shot by shot, once the ball is holed (so a half-played hole doesn't skew
  // the running score).
  function playedHoles(round) {
    return round.holes.filter((h) => isNum(h.strokes) && h.strokes > 0 && (!shotsOf(h).length || isHoled(h)));
  }

  // Penalty types: 'drop' (1 stroke: penalty area, unplayable, etc.) and
  // 'sd' (stroke and distance: OB, lost ball, replay from previous spot).
  const PENALTY_TYPES = { drop: 'Drop', sd: 'Stroke & distance' };
  const penaltiesOf = (h) => (Array.isArray(h.penalties) ? h.penalties : []);

  // ---- Clubs and shot-by-shot entry ----
  const ALL_CLUBS = ['Driver', '3W', '5W', '7W', '2H', '3H', '4H', '5H', '2i', '3i', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW', 'Putter'];
  const DEFAULT_BAG = ['Driver', '3W', '5W', '4H', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW', 'Putter'];
  // Where a shot finished. drop / sd also add a penalty stroke.
  const RESULTS = {
    fairway: 'Fairway',
    rough: 'Rough',
    green: 'Green',
    holed: 'Holed',
    bunker: 'Bunker',
    recovery: 'Trees / other',
    drop: 'Penalty area (drop)',
    sd: 'OB / lost (stroke & distance)',
  };
  // Optional detail per shot. Full shots: strike + direction. Putts: pace + line.
  const STRIKES = { good: 'Good', topped: 'Topped', fat: 'Fat', thin: 'Thin' };
  const DIRS = { L: 'Left', S: 'Straight', R: 'Right' };
  const PUTT_PACE = { short: 'Short', good: 'Good pace', long: 'Long' };
  const PUTT_LINE = { L: 'Left', S: 'On target', R: 'Right' };
  const GOOD_OUTCOME = { fairway: 1, green: 1, holed: 1 };
  const shotsOf = (h) => (Array.isArray(h.shots) ? h.shots : []);
  const isPutter = (club) => club === 'Putter';

  // Holes entered shot by shot get their score, putts, fairway and penalties
  // derived from the shots. Holes with no shots keep whatever was typed in.
  function applyShots(h) {
    const shots = shotsOf(h);
    if (!shots.length) return h;
    h.penalties = shots.filter((s) => s.result === 'drop' || s.result === 'sd').map((s) => ({ type: s.result }));
    h.strokes = shots.length + h.penalties.length;
    h.putts = shots.filter((s) => isPutter(s.club)).length;
    const tee = shots[0].result;
    h.fairway = h.par < 4 ? null : tee === 'fairway' || tee === 'green' || tee === 'holed';
    return h;
  }

  // Stroke number each shot was played as (penalty strokes count too).
  function strokeNumbers(shots) {
    let n = 0;
    return shots.map((s) => {
      const here = ++n;
      if (s.result === 'drop' || s.result === 'sd') n++;
      return here;
    });
  }

  const isHoled = (h) => {
    const shots = shotsOf(h);
    return shots.length ? shots[shots.length - 1].result === 'holed' : isNum(h.strokes) && h.strokes > 0;
  };

  function clubStats(rounds) {
    const by = {};
    const get = (c) =>
      (by[c] = by[c] || {
        club: c, uses: 0, teeShots: 0, teeFairways: 0, teeStruck: 0, teeGoodFairways: 0, approach: 0, toGreen: 0, penalties: 0,
        struck: 0, strikes: { good: 0, topped: 0, fat: 0, thin: 0 }, aimed: 0, dirs: { L: 0, S: 0, R: 0 },
      });
    rounds.forEach((r) =>
      r.holes.forEach((h) => {
        // Where each shot was played from: stroke & distance replays from the
        // same spot, otherwise from wherever the last shot finished.
        let lie = 'tee';
        shotsOf(h).forEach((s) => {
          const from = lie;
          if (s.result !== 'sd') lie = s.result;
          if (!s.club) return;
          const c = get(s.club);
          c.uses++;
          if (s.result === 'drop' || s.result === 'sd') c.penalties++;
          if (!isPutter(s.club)) {
            if (STRIKES[s.strike]) (c.struck++, c.strikes[s.strike]++);
            if (DIRS[s.dir]) (c.aimed++, c.dirs[s.dir]++);
          }
          const teeOnLongHole = from === 'tee' && h.par >= 4;
          if (teeOnLongHole) {
            c.teeShots++;
            const fw = s.result === 'fairway' || s.result === 'green' || s.result === 'holed';
            if (fw) c.teeFairways++;
            // "Well-struck fairway": found the fairway AND hit it well.
            if (STRIKES[s.strike]) {
              c.teeStruck++;
              if (fw && s.strike === 'good') c.teeGoodFairways++;
            }
          }
          // Tee shots on par 4s/5s aren't trying to find the green.
          if (!isPutter(s.club) && from !== 'green' && !teeOnLongHole) {
            c.approach++;
            if (s.result === 'green' || s.result === 'holed') c.toGreen++;
          }
        });
      })
    );
    const order = (c) => (ALL_CLUBS.indexOf(c) === -1 ? 99 : ALL_CLUBS.indexOf(c));
    return Object.values(by).sort((a, b) => order(a.club) - order(b.club));
  }

  // Ball striking across full shots (not putts) where a strike was recorded.
  function strikeSummary(rounds) {
    const out = { n: 0, counts: { good: 0, topped: 0, fat: 0, thin: 0 }, dirN: 0, dirs: { L: 0, S: 0, R: 0 }, unlucky: 0, lucky: 0, perRound: [] };
    rounds
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .forEach((r) => {
        let n = 0;
        let good = 0;
        r.holes.forEach((h) =>
          shotsOf(h).forEach((s) => {
            if (isPutter(s.club)) return;
            if (DIRS[s.dir]) (out.dirN++, out.dirs[s.dir]++);
            if (!STRIKES[s.strike]) return;
            n++;
            out.counts[s.strike]++;
            const goodOutcome = !!GOOD_OUTCOME[s.result];
            if (s.strike === 'good') {
              good++;
              if (!goodOutcome) out.unlucky++; // hit it well, still ended up in trouble
            } else if (goodOutcome) out.lucky++; // mishit, got away with it
          })
        );
        if (n) out.perRound.push({ id: r.id, date: r.date, courseName: r.courseName, n, good });
        out.n += n;
      });
    out.goodPct = out.n ? out.counts.good / out.n : null;
    return out;
  }

  // Missed putts by pace and line, e.g. grid.short.S = short but on target.
  function puttSummary(rounds) {
    const grid = { short: { L: 0, S: 0, R: 0 }, good: { L: 0, S: 0, R: 0 }, long: { L: 0, S: 0, R: 0 } };
    const pace = { short: 0, good: 0, long: 0 };
    const line = { L: 0, S: 0, R: 0 };
    let n = 0;
    let paceN = 0;
    let lineN = 0;
    rounds.forEach((r) =>
      r.holes.forEach((h) =>
        shotsOf(h).forEach((s) => {
          if (!isPutter(s.club) || s.result === 'holed') return;
          const p = PUTT_PACE[s.pace] ? s.pace : null;
          const l = PUTT_LINE[s.dir] ? s.dir : null;
          if (!p && !l) return;
          n++;
          if (p) (paceN++, pace[p]++);
          if (l) (lineN++, line[l]++);
          if (p && l) grid[p][l]++;
        })
      )
    );
    return { n, paceN, lineN, pace, line, grid };
  }

  function roundTotals(round) {
    const holes = playedHoles(round);
    const strokes = sum(holes.map((h) => h.strokes));
    const par = sum(holes.map((h) => h.par));
    const puttHoles = holes.filter((h) => isNum(h.putts));
    const fwHoles = holes.filter((h) => h.par >= 4 && (h.fairway === true || h.fairway === false));
    const girHoles = holes.filter((h) => isNum(h.putts));
    return {
      holesPlayed: holes.length,
      strokes,
      par,
      toPar: strokes - par,
      putts: puttHoles.length ? sum(puttHoles.map((h) => h.putts)) : null,
      fairwaysHit: fwHoles.filter((h) => h.fairway).length,
      fairwayChances: fwHoles.length,
      gir: girHoles.filter(isGir).length,
      girChances: girHoles.length,
      penalties: sum(holes.map((h) => penaltiesOf(h).length)),
      penaltiesDrop: sum(holes.map((h) => penaltiesOf(h).filter((p) => p.type === 'drop').length)),
      penaltiesSD: sum(holes.map((h) => penaltiesOf(h).filter((p) => p.type === 'sd').length)),
    };
  }

  // Green in regulation: reached the green in (par - 2) strokes or fewer.
  function isGir(hole) {
    if (!isNum(hole.strokes) || !isNum(hole.putts)) return false;
    return hole.strokes - hole.putts <= hole.par - 2;
  }

  function scoreName(strokes, par) {
    const d = strokes - par;
    if (strokes === 1) return 'ace';
    if (d <= -2) return 'eagle';
    if (d === -1) return 'birdie';
    if (d === 0) return 'par';
    if (d === 1) return 'bogey';
    return 'double+';
  }

  function formatToPar(n) {
    if (n === 0) return 'E';
    return n > 0 ? '+' + n : String(n);
  }

  // Score differential per WHS: (113 / slope) * (adjusted gross - course rating).
  // Uses net double bogey cap without handicap strokes (par + 2) as a simple
  // adjustment. Only complete rounds (all holes entered) count.
  function differential(round) {
    const holes = round.holes;
    if (playedHoles(round).length !== holes.length) return null;
    const adjusted = sum(holes.map((h) => Math.min(h.strokes, h.par + 2)));
    const par = sum(holes.map((h) => h.par));
    const rating = isNum(round.rating) ? round.rating : par;
    const slope = isNum(round.slope) ? round.slope : 113;
    let diff = (113 / slope) * (adjusted - rating);
    if (holes.length === 9) diff *= 2; // crude 9-hole → 18-hole scaling
    return Math.round(diff * 10) / 10;
  }

  // WHS table: number of lowest differentials used for 3..20 rounds.
  const WHS_COUNT = [null, null, null, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8];
  const WHS_ADJ = { 3: -2, 4: -1, 6: -1 };

  // rounds: newest-first or any order; we sort by date and use the latest 20.
  function handicapIndex(rounds) {
    const diffs = rounds
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map(differential)
      .filter(isNum)
      .slice(0, 20);
    if (diffs.length < 3) return null;
    const n = WHS_COUNT[diffs.length];
    const best = diffs.slice().sort((a, b) => a - b).slice(0, n);
    const avg = sum(best) / n + (WHS_ADJ[diffs.length] || 0);
    return Math.floor(avg * 10) / 10;
  }

  function overallStats(rounds) {
    const totals = rounds.map(roundTotals).filter((t) => t.holesPlayed > 0);
    const full18 = rounds
      .filter((r) => r.holes.length === 18 && playedHoles(r).length === 18)
      .map(roundTotals);
    const dist = { ace: 0, eagle: 0, birdie: 0, par: 0, bogey: 0, 'double+': 0 };
    let holeCount = 0;
    rounds.forEach((r) =>
      playedHoles(r).forEach((h) => {
        dist[scoreName(h.strokes, h.par)]++;
        holeCount++;
      })
    );
    const puttHoles = totals.reduce((a, t) => a + (t.putts === null ? 0 : t.girChances), 0);
    const puttSum = totals.reduce((a, t) => a + (t.putts || 0), 0);
    const fw = totals.reduce((a, t) => [a[0] + t.fairwaysHit, a[1] + t.fairwayChances], [0, 0]);
    const gir = totals.reduce((a, t) => [a[0] + t.gir, a[1] + t.girChances], [0, 0]);
    return {
      rounds: totals.length,
      holes: holeCount,
      scoringAvg18: full18.length ? sum(full18.map((t) => t.strokes)) / full18.length : null,
      best18: full18.length ? Math.min(...full18.map((t) => t.strokes)) : null,
      puttsPerHole: puttHoles ? puttSum / puttHoles : null,
      puttsPerRound: puttHoles ? (puttSum / puttHoles) * 18 : null,
      fairwayPct: fw[1] ? fw[0] / fw[1] : null,
      girPct: gir[1] ? gir[0] / gir[1] : null,
      distribution: dist,
      penaltiesPerRound: totals.length ? sum(totals.map((t) => t.penalties)) / totals.length : null,
      penaltiesDrop: sum(totals.map((t) => t.penaltiesDrop)),
      penaltiesSD: sum(totals.map((t) => t.penaltiesSD)),
      handicap: handicapIndex(rounds),
    };
  }

  const api = { STRIKES, DIRS, PUTT_PACE, PUTT_LINE, strikeSummary, puttSummary, ALL_CLUBS, DEFAULT_BAG, RESULTS, shotsOf, applyShots, strokeNumbers, isHoled, clubStats, PENALTY_TYPES, penaltiesOf, roundTotals, isGir, scoreName, formatToPar, differential, handicapIndex, overallStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GolfStats = api;
})(typeof window !== 'undefined' ? window : globalThis);

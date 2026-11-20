// Pure scoring/statistics helpers. Loaded in the browser as a plain script
// (exposes window.GolfStats) and in Node for tests (module.exports).
(function (root) {
  'use strict';

  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // A hole is "played" once strokes are entered.
  function playedHoles(round) {
    return round.holes.filter((h) => isNum(h.strokes) && h.strokes > 0);
  }

  // Penalty types: 'drop' (1 stroke: penalty area, unplayable, etc.) and
  // 'sd' (stroke and distance: OB, lost ball, replay from previous spot).
  const PENALTY_TYPES = { drop: 'Drop', sd: 'Stroke & distance' };
  const penaltiesOf = (h) => (Array.isArray(h.penalties) ? h.penalties : []);

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

  const api = { PENALTY_TYPES, penaltiesOf, roundTotals, isGir, scoreName, formatToPar, differential, handicapIndex, overallStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GolfStats = api;
})(typeof window !== 'undefined' ? window : globalThis);

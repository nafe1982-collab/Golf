const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../stats.js');

const pars18 = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5];
const mkRound = (date, strokes, extra = {}) => ({
  date,
  holes: pars18.map((par, i) => ({ par, strokes: strokes[i] ?? null, putts: 2, fairway: par >= 4 ? i % 2 === 0 : null })),
  ...extra,
});
const evenPar = (date, plus = 0) => mkRound(date, pars18.map((p, i) => p + (i < plus ? 1 : 0)));

test('roundTotals sums strokes, par, putts, fairways, GIR', () => {
  const t = S.roundTotals(evenPar('2026-01-01'));
  assert.equal(t.strokes, 72);
  assert.equal(t.toPar, 0);
  assert.equal(t.putts, 36);
  assert.equal(t.gir, 18); // par with 2 putts is always GIR
  assert.equal(t.fairwayChances, 14);
});

test('partial rounds only count entered holes', () => {
  const r = mkRound('2026-01-01', [5, 4, 3]);
  const t = S.roundTotals(r);
  assert.equal(t.holesPlayed, 3);
  assert.equal(t.toPar, 1);
  assert.equal(S.differential(r), null);
});

test('scoreName', () => {
  assert.equal(S.scoreName(1, 3), 'ace');
  assert.equal(S.scoreName(3, 5), 'eagle');
  assert.equal(S.scoreName(3, 4), 'birdie');
  assert.equal(S.scoreName(6, 4), 'double+');
  assert.equal(S.formatToPar(0), 'E');
  assert.equal(S.formatToPar(3), '+3');
});

test('differential caps holes at double bogey and uses rating/slope', () => {
  const r = evenPar('2026-01-01');
  r.holes[0].strokes = 10; // capped to 6 → +2
  assert.equal(S.differential(r), 2);
  r.rating = 70.0; r.slope = 130;
  assert.equal(S.differential(r), Math.round((113 / 130) * (74 - 70) * 10) / 10);
});

test('handicapIndex needs 3 rounds and applies WHS adjustment', () => {
  assert.equal(S.handicapIndex([evenPar('2026-01-01', 10), evenPar('2026-01-02', 12)]), null);
  // 3 rounds: lowest 1 differential minus 2
  const rounds = [evenPar('2026-01-01', 10), evenPar('2026-01-02', 12), evenPar('2026-01-03', 8)];
  assert.equal(S.handicapIndex(rounds), 6);
});

test('overallStats aggregates', () => {
  const st = S.overallStats([evenPar('2026-01-01', 10), evenPar('2026-01-02', 12), evenPar('2026-01-03', 8)]);
  assert.equal(st.rounds, 3);
  assert.equal(st.best18, 80);
  assert.equal(st.scoringAvg18, 82);
  assert.equal(st.distribution.bogey, 30);
  assert.equal(st.distribution.par, 24);
});

test('penalties are counted by type', () => {
  const r = evenPar('2026-01-01');
  r.holes[0].penalties = [{ type: 'sd' }, { type: 'drop' }];
  r.holes[5].penalties = [{ type: 'drop' }];
  const t = S.roundTotals(r);
  assert.deepEqual([t.penalties, t.penaltiesDrop, t.penaltiesSD], [3, 2, 1]);
  const st = S.overallStats([r, evenPar('2026-01-02')]);
  assert.equal(st.penaltiesPerRound, 1.5);
  assert.equal(st.penaltiesSD, 1);
});

test('rounds saved before penalties existed still work', () => {
  const r = evenPar('2026-01-01');
  r.holes.forEach((h) => delete h.penalties);
  assert.equal(S.roundTotals(r).penalties, 0);
});

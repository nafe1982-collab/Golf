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

test('shot-by-shot holes derive score, putts, fairway and penalties', () => {
  const h = { par: 4, shots: [
    { club: 'Driver', result: 'sd' },     // stroke 1, +1 penalty
    { club: 'Driver', result: 'fairway' },// stroke 3
    { club: '7i', result: 'green' },      // stroke 4
    { club: 'Putter', result: 'green' },  // 5
    { club: 'Putter', result: 'holed' },  // 6
  ] };
  S.applyShots(h);
  assert.equal(h.strokes, 6);
  assert.equal(h.putts, 2);
  assert.equal(h.fairway, false);
  assert.deepEqual(h.penalties, [{ type: 'sd' }]);
  assert.deepEqual(S.strokeNumbers(h.shots), [1, 3, 4, 5, 6]);
  assert.ok(S.isHoled(h));
  const p3 = S.applyShots({ par: 3, shots: [{ club: '7i', result: 'holed' }] });
  assert.equal(p3.strokes, 1);
  assert.equal(p3.fairway, null);
  assert.equal(p3.putts, 0);
});

test('quick-entry holes are left alone by applyShots', () => {
  const h = { par: 4, strokes: 5, putts: 2, fairway: true, penalties: [] };
  assert.deepEqual(S.applyShots({ ...h }), h);
});

test('clubStats counts tee fairways and greens hit per club', () => {
  const round = { holes: [
    { par: 4, shots: [{ club: 'Driver', result: 'fairway' }, { club: '8i', result: 'green' }, { club: 'Putter', result: 'holed' }] },
    { par: 4, shots: [{ club: 'Driver', result: 'rough' }, { club: '8i', result: 'bunker' }, { club: 'SW', result: 'green' }, { club: 'Putter', result: 'holed' }] },
  ] };
  const st = Object.fromEntries(S.clubStats([round]).map((c) => [c.club, c]));
  assert.equal(st.Driver.teeShots, 2);
  assert.equal(st.Driver.teeFairways, 1);
  assert.equal(st['8i'].approach, 2);
  assert.equal(st['8i'].toGreen, 1);
  assert.equal(st.Putter.uses, 2);
  assert.equal(S.clubStats([round])[0].club, 'Driver');
});

test('tee shots on par 4s are not counted as missed greens', () => {
  const round = { holes: [
    { par: 4, shots: [{ club: 'Driver', result: 'fairway' }, { club: '8i', result: 'green' }] },
    { par: 3, shots: [{ club: 'Driver', result: 'green' }] },
  ] };
  const d = S.clubStats([round]).find((c) => c.club === 'Driver');
  assert.equal(d.approach, 1);
  assert.equal(d.toGreen, 1);
});

test('replayed tee shot after OB still counts as a tee shot', () => {
  const round = { holes: [{ par: 4, shots: [{ club: 'Driver', result: 'sd' }, { club: 'Driver', result: 'fairway' }, { club: '9i', result: 'green' }] }] };
  const d = S.clubStats([round]).find((c) => c.club === 'Driver');
  assert.deepEqual([d.teeShots, d.teeFairways, d.approach, d.penalties], [2, 1, 0, 1]);
});

test('a hole being played shot by shot only counts once holed', () => {
  const r = { holes: [
    { par: 4, strokes: 4, putts: 2 },
    S.applyShots({ par: 4, shots: [{ club: 'Driver', result: 'sd' }] }),
  ] };
  assert.equal(S.roundTotals(r).holesPlayed, 1);
  assert.equal(S.roundTotals(r).strokes, 4);
});

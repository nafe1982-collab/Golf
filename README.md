# Golf Tracker

A simple golf round tracker that runs entirely in the browser. You don't need to install or build anything.

## Features

- **Score entry, hole by hole.** Tap − / + to enter strokes and putts, and mark whether each fairway was hit. Greens in regulation are worked out for you, and changes save as you go.
- **Courses.** Save each course's par for every hole, plus its course rating and slope, so they're filled in when you start a round. There's also a quick 9- or 18-hole option for courses you haven't saved.
- **Scorecard view.** See each round with front-nine and back-nine totals, putts, fairways and GIR, and add notes.
- **Stats.** See your estimated handicap index (World Handicap System style), scoring average, best round, putts per round, fairway % and GIR %, how often you make each score (birdie, par, bogey and so on), and a chart of your scores over time.
- **Export / import.** Back up your data as JSON or move it to another device.

Your data is stored only in your browser (`localStorage`). Export it now and then to keep a backup.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
npm start        # serves the folder on http://localhost:3000
```

It can also be hosted as-is on GitHub Pages.

## Tests

```sh
npm test
```

## Files

| File        | Purpose                                         |
|-------------|-------------------------------------------------|
| `index.html`| Page shell                                      |
| `app.js`    | UI, routing, storage                            |
| `stats.js`  | Scoring, statistics and handicap maths (tested) |
| `styles.css`| Styles (light and dark)                         |

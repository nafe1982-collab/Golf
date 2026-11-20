# Golf Tracker

A simple golf round tracker that runs entirely in the browser. You don't need to install or build anything.

## Features

- **Score entry, hole by hole.** Tap − / + to enter strokes and putts, and mark whether each fairway was hit. Greens in regulation are worked out for you, and changes save as you go.
- **Courses.** Save each course's par for every hole, plus its course rating and slope, so they're filled in when you start a round. There's also a quick 9- or 18-hole option for courses you haven't saved.
- **Penalty shots.** Each hole has **+ Drop** (1-stroke penalty with a drop: penalty area, unplayable lie…) and **+ Stroke & distance** (replay from the previous spot: out of bounds, lost ball…). Each penalty adds a stroke to the hole score, and you can tap a penalty to remove it. Penalties appear on the scorecard and in your stats, split by type.
- **Scorecard view.** See each round with front-nine and back-nine totals, putts, fairways and GIR, and add notes.
- **Stats.** See your estimated handicap index (World Handicap System style), scoring average, best round, putts per round, fairway % and GIR %, how often you make each score (birdie, par, bogey and so on), and a chart of your scores over time.
- **Sync between devices.** Keeps your phone, tablet and computer in step through a private GitHub Gist in your own account (see below).
- **Export / import.** Back up your data as JSON. Importing merges the file into your existing data.

## Put it on your phone

1. Host it with GitHub Pages: in the repo, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, then choose this branch and the `/ (root)` folder. The app will be at `https://<user>.github.io/Golf/`.
2. Open that address on your phone and add it to your home screen:
   - **iPhone (Safari):** tap Share, then **Add to Home Screen**.
   - **Android (Chrome):** tap ⋮, then **Add to Home screen** or **Install app**.

It opens full-screen like a normal app and still loads with no signal.

## Syncing

1. On any device, open **Sync** (link at the bottom of the page).
2. [Create a GitHub token](https://github.com/settings/tokens/new?scopes=gist&description=Golf%20Tracker) with only the **gist** scope, then paste it in and click **Connect**. The first device creates a private gist named `golf-tracker.json`.
3. Do the same on every other device. Each one finds the same gist automatically.

After that, the app syncs whenever you make a change, open the app or switch back to it, and once a minute while it's open. Rounds and courses are merged record by record, so if two devices change different things, both changes are kept. If both devices edit the same round, the newest edit wins. Deleting a round on one device deletes it everywhere. If you're offline, the app keeps working and syncs when you're back online.

The token is saved only in that browser and is sent only to GitHub.

Without sync, your data lives only in that browser (`localStorage`).

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
| `sync.js`   | Merge logic and GitHub Gist client (tested)     |
| `styles.css`| Styles (light and dark)                         |

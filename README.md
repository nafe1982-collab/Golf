# Golf Tracker

A simple golf round tracker that runs entirely in the browser. You don't need to install or build anything.

## Features

- **Play one hole at a time.** You see a big hole header, your running score, and a strip of every hole to jump between.
- **Shot by shot with clubs.** For each shot, tap the club and then where it finished: Fairway, Rough, Green, Holed, Bunker, Trees/other, **Penalty area (drop)** or **OB/lost (stroke & distance)**. Your score, putts, fairway hit, greens in regulation and penalties are all worked out from your shots, with penalty strokes counted in the shot numbers. When you're on the green, the putter is suggested first. You can tap any shot to change or delete it, or use **Undo last shot**.
- **Quick score** for days you just want numbers: strokes, putts, fairway, plus **+ Drop** / **+ Stroke & distance** penalties. You can switch any hole between the two modes.
- **Saving you can see.** Every tap is saved on the phone straight away. There's also a big **Save** button, a "Saved at 10:42" status, and a warning if saving ever fails. Rounds stay *In progress* until you tap **Finish round**, and the **Play** tab takes you back to where you left off, even after closing the app.
- **My bag.** Choose the clubs you carry. They become the buttons you tap when recording shots.
- **Courses.** Save each course's par for every hole, plus its course rating and slope.
- **Scorecard.** See front-nine and back-nine totals, putts, fairways, greens in regulation and penalties, plus a shot-by-shot list for every hole.
- **Stats.** See your estimated handicap index, scoring average, best round, putts per round, fairway %, greens in regulation %, penalties, how often you make each score, a chart of your scores over time, and a **club table**: shots hit, fairways off the tee and greens found with each club.
- **Sync between devices** through a private GitHub Gist (see below), and **Export / import** a backup file.

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

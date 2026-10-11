# Fellow Neighbors

A first-person 3D neighbourhood slasher that runs in the browser. Story mode has 70 chapters on each side (victim and killer). Online has two co-op stories and a survival mode with up to 2 killers and 5 survivors.

## Run it locally

```
npm install
npm run build
npm start
```

Then open http://localhost:3000. Open it in two browser windows, pick Online, and use the same mode and room code in both to play together.

## Put it online with Render

1. Sign in at https://dashboard.render.com with your GitHub account.
2. New → Blueprint, pick this repository, and press Apply. Render reads `render.yaml` and sets everything up.
3. When the deploy finishes, Render gives you an address like `https://fellow-neighbors.onrender.com`. Send that to your friends.

If you would rather set it up by hand: New → Web Service, pick this repository, Runtime `Node`, Build Command `npm install && npm run build`, Start Command `npm start`, Instance Type `Free`.

On the free plan the server sleeps when nobody has used it for a while, so the first visit after a quiet spell takes about a minute to load.

## How online works

`server.js` serves the files in `public/` and runs a small WebSocket relay at `/ws`. Each player sends their position and progress a few times a second and the server passes it to everyone else in the same room. Nothing is stored; a room disappears when the last player leaves.

## Where things are

- `src/game.js` is the whole game.
- `src/page.html` is the menus, HUD and styles.
- `public/stalker-model.js` holds the character models and animations.
- `build.js` joins the two source files into `public/index.html`.
- `server.js` is the web server and the online relay.

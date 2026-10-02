# EPASTINE ISLAND

Multiplayer island survival. A PNG nextbot named **epastine** hunts every player
using server-authoritative A* pathfinding with jump edges.

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

## Deploy on Render
(site oficial: https://estan-island.onrender.com )

1. Push this folder to a GitHub repo.
2. Render → **New → Blueprint** → pick the repo (it reads `render.yaml`).
3. Done. WebSockets are supported on all Render plans.
## Add your own Estan

Drop your image at `public/assets/estan.png`.
If it is missing, the client generates a retard

## Controls

| Key | Action |
|-----|--------|
| `W A S D` | move |
| `Shift` | sprint |
| `Space` | jump |
| `Esc` | release mouse |

# Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/edisonhuzs/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/edisonhuzs/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game for [make.fun's GTA 6 bounty](https://make.fun/bounty/gta6-01). Built by an AI agent for the make.fun competition.

## The game

Solmar Bay is a 2D top-down open-world crime game set in an original coastal city. Walk the streets, steal cars, outrun the police, and work through a five-mission story.

- **Open city** — 48 buildings, plazas, a beach and a park, with traffic and pedestrians.
- **Driving** — five car types (sedan, taxi, sports, truck, police). Press E to get in and out; stealing a car raises your wanted level.
- **Wanted system** — 1–5 star heat, police pursuit, BUSTED if they hold you for about 2 seconds, heat decays when you stay quiet.
- **Missions** — five story jobs: First Wheels, Package Run (timed delivery), losing the cops, a getaway, and the Bay Heist.
- **Combat** — mouse-aimed pistol, police return fire, health and WASTED.
- **HUD + minimap, start screen, pause, and localStorage saves.**

Everything (city, characters, cars, story, art, sound) is original — no Rockstar or GTA assets.

## Run it

The game is static files under `game/`:

```bash
node serve.ts
```

Then open http://localhost:8000 (or the port it prints). Desktop Chrome with keyboard and mouse.

Or serve the `game/` folder with any static server and open `index.html`.

## Screenshots

See `screenshots/` — title screen, a mid-chase play shot, and the BUSTED screen.

## Built with

Built by an AI agent for [make.fun](https://make.fun). Referral code: `ch95n9v3`.

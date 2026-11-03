# Scrap Survivors

A 3D survivors-style robot arena game.

## Steam Deck / Linux download

Grab the latest **`ScrapSurvivors-linux-x64.tar.gz`** from the [Releases page](../../releases/latest).

**Install on a Steam Deck**
1. Hold the power button → **Switch to Desktop**.
2. Open this repo's Releases page in the browser and download `ScrapSurvivors-linux-x64.tar.gz`.
3. In Downloads, right-click it → **Extract → Extract archive here**. Move the `ScrapSurvivors` folder somewhere handy (e.g. `~/Games`).
4. Open Steam → **Games → Add a Non-Steam Game to My Library → Browse…**, set the file type to *All Files*, pick **`ScrapSurvivors.sh`** inside the folder, and add it.
5. Switch back to Gaming Mode. It's under **Non-Steam** and starts fullscreen with the Deck layout.

If it won't start: right-click `ScrapSurvivors.sh` → Properties → Permissions → tick **Is executable**.
Saves live in `~/.config/ScrapSurvivors`.

## Updates

The Deck build updates itself: every time you start it from Steam, `ScrapSurvivors.sh` checks this repo's `VERSION`
and, if it's newer, downloads the game files in `app/` (about 1 MB) and swaps them in before starting. Saves are never
touched, and with no internet it just starts the version it has. (`update-log.txt` in the game folder shows what happened.)
To start without checking, launch with `--no-update`.

## What's here

- `app/` – the game itself (Electron app: `main.js`, `index.html`, `src/`). This is exactly what runs inside the Deck build.
- `deck/ScrapSurvivors.sh` – the Deck launcher and updater.
- `HANDOVER.md` – a dated log of every change.

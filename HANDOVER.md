# Scrap Survivors: Handover


> **Working folder (important):** the game lives in `C:\Users\LukeM\Documents\ScrapSurvivors` (it has `main.js`, `node_modules`, `Play.bat`, `SteamDeck`, `art`, `models`). Deliver ALL changes there. A stray `Documents\Scrapfall` folder (src/index.html only, no launcher) was created by mistake in earlier sessions and is obsolete; it can be deleted.

A 3D survivors-like robot arena game. You build a robot from parts in the hangar, drop from the sky into a
blocky arena, survive swarms, level up, open cases, beat the Warden and move to the next stage.

This file tracks every change, with dates, plus what anyone picking the project up needs to know.
**Add an entry to the change log for every change.**

---

## Vital information

| | |
|---|---|
| **Name** | Scrap Survivors (formerly *Scrapfall*; folder `ScrapSurvivors`, package `scrapsurvivors`) |
| **Version** | 0.43.19 · BUILD NOV 6|
| **Build system** | **V2 (lower half + torso)**, switched by `BUILD_V2` in `src/config.js`. To go back: set it to `false`, or check out the GitHub branch `pre-build-revamp` (0.25.1). |
| **Owner's folder** | `C:\Users\LukeM\Documents\Scrapfall`. The rename to `Documents\ScrapSurvivors` is pending: run `Documents\Rename to ScrapSurvivors.bat` with the game closed. |
| **Run it** | `Play.bat` (installs three.js, Rapier and Electron on first run, then `npm start`) |
| **Tech** | Electron 33, three.js r128, Rapier 0.14 (WASM physics), WebAudio. No build step. |
| **Errors log** | `scrapsurvivors-log.txt` next to the game (unpackaged) or in `%APPDATA%\ScrapSurvivors` |
| **Saves** | `%APPDATA%\ScrapSurvivors` (Electron userData; copied from the old `scrapfall` folder on first launch) |

### Architecture
- **Scripts:** classic `<script>` files sharing **one global scope**, so watch for name clashes. A later `function x()` silently replaces an earlier one, and a duplicate `const` breaks the whole page. Load order, from `index.html`:
  `three.min.js, config, gfx, post, data, symbols, shapes, terrain, robot, cosmetics, input, player, combat, weaponfx, weaponmodels, ragdoll, inventory, ui, music, shop, wcase, title, vendor/rapier, physics, props, worlddetail, game, devtest, windows`
- **CSP:** `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'`. No CDNs or external files. Every texture, sound and model is **generated in code**.
- **Modes:** `S.mode` is one of `title`, `custom`, `hangar`, `inv`, `countdown`, `drop`, `play`, `pause`, `levelup`, `perk`, `shop`, `roulette`, `wcase`, `devpanel`, `dying`, `over`.
- **Loop:** fixed 60 Hz simulation `simStep()` inside `frame()` (`src/game.js`). Rendering goes through `renderFrame()` (HDR, bloom, ACES) in `src/post.js`.
- **Performance model:**
  - Enemies are drawn **instanced**: each enemy carries a bare transform (`e.mesh`); `updateEnemyBatches()` pours them into one InstancedMesh per piece.
  - Debris, particles, pickups, bullets and flames are batched by `batchFx()`. Particles must use **shared** materials (`B()`/`M()` caches, or `shareMat()` in `weaponfx.js`) to batch.
  - Fading rings and blasts use pooled stepped-opacity materials (`fadeMat`).
  - World debris and ArUco stickers are each one merged mesh.
- **Audio:**
  - `sfx(kind, vol)` in `src/inventory.js`: generated tones and noise. Gunshots get layers from `GUN_LAYERS`, big bangs echo via `TAILS`, and `SFX_PITCH` shifts the pitch of the next sound.
  - Music: `src/music.js`, a generative score whose intensity follows enemies and health, plus the frenzy song.
- **localStorage keys:**
  - `scrapsurvivors.settings`: options
  - `scrapsurvivors.custom`: colours, patches, stickers and cosmetics
  - `scrapsurvivors.layout`: window positions
  - `scrapsurvivors.meta`: circuits

  The old `scrapfall.*` keys are read as a fallback.
- **Developer mode** (Options):
  - hangar limits lifted
  - all parts available in the field
  - **Test range** button in the hangar: F1 dev panel, V spawns enemies at the crosshair, G blasts at the crosshair
  - performance readout (fps, draw calls)

### Testing approach used so far
- Syntax-check every file with `node --check`.
- Headless Chromium (Playwright + SwiftShader) loads `index.html` from a copy with `node_modules/three` and `@dimforge` present, and drives the game through its globals (`startTestRange()`, `devSpawn()`, `simStep()`...).
- Use **low** graphics for screenshots. Medium or high can crash the software renderer, and long real-time waits are slow, so stop `requestAnimationFrame` and step the simulation manually.
- Draw-call checks: `renderer.info.render.calls` with `renderer.info.autoReset = false`.
- Real-GPU feel, sound balance and performance still need checking on the owner's PC.

### File map (main responsibilities)
| File | What lives there |
|---|---|
| `config.js` | CFG tuning, SETTINGS, CUSTOM (colours, patches, stickers, cosmetics), META (circuits), the bright accent colour helper |
| `gfx.js` / `post.js` | renderer, materials (`M`, `B`, `SM`, `bx`), graphics presets, shadows, bloom, part preview viewer |
| `data.js` | parts (LEGS, ARMS, WEAPONS, MODULES, BLOCKS, GEMS), gem combos, rarity, XP and marks, enemy types (`ETYPES`), icons |
| `symbols.js` | stat, ability and perk symbols, `sym()` and `wsym()`, the hover label |
| `terrain.js` | heightmap stage generation, terrain meshes, pads, collision helpers, palette |
| `robot.js` | robot building, stickers and patches, misplaced-leg marking, secondary colour |
| `cosmetics.js` | Santa hat, pumpkin, police badge, the secret cigarette |
| `player.js` | stats, movement (coyote time, jump buffer, wall kick, scamper, slide, dash), visuals, camera |
| `combat.js` | enemies, spawning, damage, shots, explosions, drops, gems, frenzy, kill streak, instancing, effects |
| `weaponfx.js` | per-weapon looks, sounds and impacts |
| `ink.js` | SCRAP INK art-style post pass (dev-only, off by default), presets and sliders |
| `logo3d.js`, `logodata.js` | 3D title logo: slow turn, click pieces off (5 each, 15 total), physics, respawn after 10 s |
| `cinematic.js` | MK III reveal cinematic (own scene, `S.mode='cine'`), queue, skip, replay |
| `weaponmodels.js` | MK I/II/III weapon models by level, tier-up unfold, MK III hook |
| `inventory.js` | workbench / hangar, parts list, tooltips, `sfx()`, twirl and spark helpers |
| `ui.js` | HUD, level-up, perks, game over and stats, options, UI scale |
| `music.js` | dynamic music and the frenzy song |
| `shop.js` / `wcase.js` | store, slot machine, locked-case roulette / weapon cases |
| `title.js` | title screen, customize (tabs, patches, stickers, cosmetics, peeling), gun rain |
| `worlddetail.js` | weathering shader, corner debris, ArUco wall stickers |
| `devtest.js` | test range, dev panel, performance readout |
| `windows.js` | draggable, resizable, saved menu windows |
| `game.js` | run and stage flow, drop intro (QR), frame loop, world clear |

---

## Change log

### 0.35.0 — Chunk 10: Nineteen gem combinations
- 19 new combos (COMBOS now 55): Bloodshot, Bloodhound, Vampiric Halo, Life Conduit, Blood Burst, Leech Swarm, Blood Furnace, Cryostasis, Blood Bank, Contagion, Patient Zero, Toxic Halo, Neurotoxin, Toxic Burst, Viral Spread, Toxic Combustion, Septic Frost, Superstrain, Parasitic Infection. All 36 originals untouched.
- New code in `src/gemfx.js`: `comboHit/comboJump/comboBounceGem/comboTickGem/comboBoomGem/gemKill/comboHurt/gemComboTick`; `stats.combos` (player.js) lets world effects (kill, hurt) know which combos are equipped.
- Limits: combo heals share a 6 HP/s pool on top of the arm cap; every proc has a per-second budget (`procOK`); spread poison carries `gen:1` and never spreads again (no chains); bosses keep their stack caps and ignore Neurotoxin stagger; Septic Frost slow is capped (45% / 25% on bosses); Blood Bank shield capped at 10+5×level and decays after 8 s; Cryostasis has a 12 s cooldown.
- Lower-half gems unchanged (combos are arm-only).
- Tested: all 55 combos fire 4 s against 12 enemies with no errors, max 52 live shots, 0.84 ms/step.

### 0.36.0 — Chunk 11: Arena and gameplay polish
- **Spectators** (`src/arena.js`, new, loaded after gemfx.js): ~60 low-detail booths in the inner face of the four outer walls (28 m up; skipped where terrain rises near them). Each = dark frame, back panel, 2–4 little robots (body, head, eye bar) and a semi-transparent glass pane. All instanced: 6 draw calls, 180 robots. They only bob and turn their heads (limited to ±1.1 rad) toward you; eyes turn red in overtime; they hop when you die. No AI, no physics, no collision, so arena navigation and spawn access are unchanged. Booths beyond 140 m freeze; updates run every other frame (~0.06 ms avg, 0.3 ms worst).
- **Death celebration:** `gameOver()` calls `startCelebration()`: the 12 nearest survivors (within 70 m; not bosses, held/attached or NPC enemies) hop (flyers bob) and play a mechanical `chirp`; everyone else stops and watches. Chirps are capped at 5 per second. Only runs during the 'dying' phase; the game-over UI is untouched.
- **Overtime fire:** clock flames 11→17 with 14 embers, a pulsing glow on the clock box, plus an `#ovfire` layer at the bottom of the screen (14 blurred flame blobs and a red edge glow), all CSS compositor animation, hidden outside overtime.
- **Movement weight:** non-heavy frames now get a soft `land` thump on hard landings (heavy frames keep `thud`); footsteps already existed.
- Tested: booth counts on all four walls, no scene leak over repeated stages, head turn, celebration caps (12 hoppers, 5 chirps/s), overtime flags, 55 combos unaffected.

### 0.37.0 — Chunk 12: Stability and performance
- **Level-up cursor/focus bug (fixed):** pointer lock is asynchronous, so a lock requested just before a queued level-up opened could be granted after the menu was up, hiding the cursor and swallowing clicks. `input.js` now tracks `LOCK_WANT`; a lock that arrives while a menu mode is up (`NO_CAPTURE`) is released at once, `lockPointer()` refuses to grab the mouse in menu modes or with a level-up queued, `unlockPointer()` clears mouse-look/fire/zoom flags and stale focus, and a level-up card ignores a second click (double click / held Enter) and re-arms its lock for the next chained level-up. Tested with three chained level-ups and double-clicks.
- **Audio slowdown/cutouts:** `sfx()` is now a gate in front of `sfxPlay()`: every sound has a priority (low: hits, ticks, pickups, steps, chirps; mid; high: damage, big bangs, level-ups) and a rough length; when too many are alive low-priority ones are dropped first (caps 14 / 26 / 40 live), and the 3-echo tail is only added when fewer than 10 are alive. Noise bursts use 3 cached buffers per length instead of filling a new random buffer per call. `SFXV` reports played/dropped.
- **Hordes:** enemy-vs-enemy collision (was ~41% of a step at 600 enemies) now uses one relaxation pass above 300 enemies and collides far enemies (past `LOD_FAR`) every other step: ~30% faster. Shots skip enemies outside their path with a cheap x/z reject before the segment test.
- **Projectile budget:** Split + Homing (and Explode + Split) could put 1,500 shots in the air (57 ms/step). `shotRoom()`: bursts shrink past 160 live shots and stop past 280 (the parent keeps flying as one shot).
- **Effect budget:** sparks, dust and lightning arcs are skipped past `FX_MAX` = 2,500 live effects (Orbit + Lightning had 20,000).
- **Pickup budget:** XP shards and bolts are capped at 220 loose each; extras fold into the nearest loose one (value kept). Gem pulling no longer allocates vectors every frame.
- **Save migration checked:** old `scrapfall.*` keys, garbage JSON, unknown extra fields, Pogo Spring discovery key removal, `migrateLvl` (75→5, 35→4, 12→3, 6→2), items with out-of-range levels, all 10 gem types create. No errors.
- **Boss-down mass kill:** killing a boss killed every enemy in one call (300+ enemies = a 3 s freeze here, 11 s in the long run). Survivors now go down in a quick wave, 12 per step (`CULL`/`cullTick`), harmless meanwhile: worst step 3,086 ms → 99 ms.
- **Measurements** (headless Chromium, SwiftShader, so absolute numbers are pessimistic; compare before→after): 500–600 enemies, plain: 11.0 → 7.1 ms/step; Twin Arm 6.1 → 4.0; Lightning+Lightning 6.2 → 4.0; Poison+Poison 6.8 → 3.3; Lifesteal+Poison 5.3 → 5.8 (noise); Explode+Bounce 9.3 → 7.3; Split+Homing 57 → 20 (shots 1,525 → 420); Fire+Ice 7.7 → 6.3; Orbit+Poison 10.0 → 5.2; boss + 500 horde 6.2 → 4.8. Staged late game (jumps to 0/150/300/450 s, boss at 510 s, overtime from 620 s, then a boss kill): avg 1.6 → 3.4 → 4.4 → 8.2 → 8.0 → 12.5 ms/step with up to 644 enemies; heap flat at 29 MB, scene children stay bounded (390–1,445), no errors. 55 combos still fire cleanly; spectators 0.06 ms.
- **Remaining issues:** occasional 40–80 ms `updateShots` steps with Lightning + Poison and fast guns (chain arcs); an overtime horde of 640 enemies costs ~12 ms/step here (fine on a real GPU/CPU, still worth a check on your PC); the dupcheck script only catches duplicate functions, so a duplicate top-level `const` slipped in once (caught by the page test). Not touched (visual redesign later): full sound mixing/ducking rework.

### 0.38.0 — Chunk 13: Retro UI and HUD
- Retro-futuristic industrial diagnostics theme (`src/retro.css`): charcoal panels, sharp corners, mono type, thin outlines, restrained hazard stripes, optional CRT overlay (Options → CRT effect). Emoji removed.
- Secondary robot colour drives a contrast-safe accent (`accentSafe`, ≥4.5:1, auto black/white on-accent text).
- HUD per spec: health/shield/bolts top-left, stage/timer/next event top-centre, heading-up minimap top-right, crosshair + compact per-weapon reload rows, slim full-width XP bar with level at the end. Permanent ability bar removed.
- Central icon registry `src/icons.js` (16/24/32/48 px): weapons, parts, gems (distinct marks), power-ups, status effects, stats.
- Hangar: robot auto-centred/framed on pedestal for any size; socket summary; owned (×N) and ORB tags.
- Death: skippable jingle, YOU DIED fade, stats screen (time, stage, level, kills, bolts, etc.).
- Reroll 50 bolts and terminal 100 bolts shown.

### 0.39.0 — Chunk 14: Three-tier weapon models
- New `src/weaponmodels.js` (loaded after `weaponfx.js`): every weapon's `model()` is wrapped; the **tier comes from the part level only** (`wmTier`): **MK I L1-2** = the original crude model (L2 adds a small brass/steel detail), **MK II L3-4** armored (L4 adds extra rivets/band), **MK III L5** overengineered. Visual only: `fire()`/stats untouched, so extra barrels NEVER add shots (shotgun pellets still 6/9/16 by level).
- Designs: Pistol small box -> revolver -> triple-barrel hand cannon · Autogun single -> twin drum -> four-barrel belt-fed · Shotgun double -> quad -> eight-barrel breacher with recoil pistons · Sniper slim scope -> heavy -> giant rail rifle · Rocket single -> twin -> four-tube · Arc Caster coils -> capacitors/rings -> six-coil Tesla · Flamethrower pipe -> triple nozzle+tanks -> giant furnace · Gatling six-barrel -> heavy drum -> TWIN rotating banks (second bank counter-rotates via `userData.spinMesh2`, player.js) · Katana simple -> segmented -> giant actuated blade · Chainsaw small -> geared -> double-chain shredder · Knife improvised -> serrated -> oscillating motorized cleaver · Gravity Gun 2 -> 4 -> 6 prongs + floating sphere · Forcefield small emitter -> 3 antennae -> rotating concentric rings · Missile Pod module 3 -> 6 -> 12 honeycomb tubes (the rear gem socket stays clear and always shown).
- Muzzles, bases, spin/saw/exhaust hooks and the mount offset (Twin/Sentry/chest sockets) are returned exactly like the originals, so aiming, gem sockets and previews keep working. Models reuse the shared `bx`/`M` caches and one cached cylinder geometry per size; max mesh count per weapon is 21-77 (chainsaw L5), whole-robot triangles with two L5 guns about +3% against L1.
- **L2 -> L3 unfold** (`wmMaybeUnfold`, `weaponModelTick(dt)` called from the frame loop): MK II armor panels (`userData.panels`) slide/scale into place over `WMOD.UNFOLD = 1.0` s with sparks and the new `'unfold'` sound (motor whir and clanks, `tink` per panel). It is triggered by a wrapped `upgradeItem` that records a one-shot `WMOD.pending` entry (a WeakMap, so nothing reaches the save file).
- **L5 hook only (no cinematic yet):** reaching MK III calls every function in `WMOD.hooks.mk3` with the item (chunk 15 pushes its reveal here).
- Tests: every weapon x level builds with valid muzzle/base/spin/saw; pods tubes 3/6/12 and one gem slot at every level; unfold ramps 0.04 -> 1.0 and finishes; no unfold for L1->L2 or L4->L5; hook fires with L5; all 13 weapons fired at L1 and L5 in a run with no errors; hangar screenshot with L5 Gatling and Shotgun.

### 0.40.0 — Chunk 15: MK III cinematic reveal
- New `src/cinematic.js` (loaded after `hud.js`; DOM `#cine` in index.html, styles at the end of retro.css). Plugs into `WMOD.hooks.mk3` (weaponmodels.js), which fires from the wrapped `upgradeItem` when a weapon (or the Missile Pod module) reaches L5 through ANY route (merge, orb, auto-upgrade). Loading a save, equipping or shop/case rolls never trigger it.
- **Queue:** the upgrade only queues `{item,type,first}`; `cineTick(dt)` (called at the top of the frame loop in game.js) starts it ~0.45 s later, only in `play`, `inv` or `hangar`, and not while a drag or the gem-slot dialog is up. Starting sets `S.mode = 'cine'`, so `simStep` never runs: gameplay, enemies, the stage clock, XP and bolts all stand still. On exit the previous mode is restored and the pointer re-locked when returning to play.
- **Full reveal (first L5 of each weapon TYPE, ~9 s):** 0-1.5 isolated weapon on a gold-ringed platform, dim, slow zoom, drone + soft ticking, APEX CONFIGURATION DETECTED · 1.5-3.5 rising pad and soft percussion, golden emissive seams (cloned materials, shared caches untouched), rays, parts fly apart and lock back one by one with sparks and clicks · 3.5-5 gold flash, impact, `MK III — APEX` + the weapon name · 5-7.5 cut to the REAL current robot (`buildRobot(L,{stand:true})`: frame, colours, patches, stickers, other weapons), low three-quarter camera, the weapon's arm raises it toward the camera and a ~1 s cosmetic demo plays (pistol shots, autogun burst, shotgun blast, sniper beam, rocket, arc discharge, flame stream, gatling spin + burst, katana slashes, chainsaw rev + sparks, knife slashes, gravity pulse ring, forcefield shell pulse, missile-pod salvo) · 7.5-9 hero shot with rays, resolution chord, the REAL L5 stats (`partInfo`) and MAXIMUM UPGRADE ACHIEVED. A weapon that is only in storage hovers beside the robot instead.
- **Cosmetic only:** demo shots are meshes/particles inside the cinematic scene (no `bullet()`/`explode()`, no ammo, cooldown, damage, XP or bolts). Sound reuses the weapons' existing sfx names.
- **Repeat L5 of the same type:** a ~1.5 s version (weapon assembles, flash, title, stats-free sting).
- **Saves:** `META.mk3Seen[type]` is written on start (so skipping counts as seen). **Settings:** Options → "MK III reveal: full / short / off" (`SETTINGS.cine`). `prefers-reduced-motion` plays the short version without flashes or shake. **Replay:** a gold `MK III ▶` tag on L5 weapon/pod rows in the parts list (storage/shelf) queues the full reveal again.
- **Skip:** any key (Esc included, captured so it doesn't open the pause menu), mouse, touch, or any controller button (ignored for the first 0.3 s so the button that caused the upgrade can't skip it); a 0.25 s dip to black then back to the game.
- **Audio:** soft synthesised pads, drone, kicks, bells and a chord stab (no harsh beeps), routed through one gain node that is faded and every oscillator stopped on exit; the music is ducked to 12% during the scene. Asset hook: set `CINE_MUSIC_URL` (cinematic.js) to a licensed track to replace the synth bed.
- **Resources:** own geometries/materials/textures and the cloned weapon materials are disposed on exit; the scene is emptied; rays are one 16-triangle mesh, particles are two `Points` draw calls; no volumetrics.

### 0.41.0 — Chunk 16: SCRAP INK shader (final chunk)
- New `src/ink.js` (loaded last) + a 2-line hook at the end of `renderFrame` (post.js). Pipeline: scene -> HDR -> bloom -> tone-map (`MAT_OUT`) -> **ink pass** -> screen. When Ink is off, `MAT_OUT` draws straight to the screen exactly as before (no extra pass, no extra target). The HUD is DOM, so text stays sharp.
- The shader (`MAT_INK`), one full-screen pass on the tone-mapped image: luminance **posterisation** into cel bands (hue kept, 4 bands in SCRAP INK), **ordered 4x4 dithering** only in the shadows, **contrast** (+12%, reduced in the darks), thin dark **outlines** (Roberts cross on luminance, faded in dark areas so dark robots aren't crushed, capped at 80% so hordes don't become black soup), optional **pixelation**, subtle **CRT scanlines**, and a **master intensity** mix.
- Protected on purpose: very bright pixels and bright saturated effects bypass the banding (flames, glows, bloom, golden gold), the MK III cinematic is never inked (`S.mode==='cine'`), the part-viewer canvases are separate, the player accent colour keeps its hue (banding changes brightness only).
- Presets (Options -> Developer): Off, SCRAP INK (bands 4, outline 35%, dither 15%, contrast +12%, pixel 0%, scanlines 5%, intensity 100%), Light, Heavy, Custom (seven sliders; touching one switches to Custom). Saved in `SETTINGS.ink` (preset + custom values). **Defaults OFF; Developer mode first**: the controls only show and the effect only runs while Developer mode is on (`INK_PUBLIC = true` in ink.js opens it to everyone).
- Outlines are colour/luminance based, with NO extra depth or normal pass (that would mean rendering the scene a second time). Geometric depth/normal outlines are the documented upgrade path if the look needs them. It is a style filter, not new geometry or hand-painted scratches.
- Tests: page loads without errors; every preset renders in combat and with a boss; dev gating (off when dev is off), cinematic bypass, custom slider -> saved settings, label/UI sync, default off. Same-frame comparison screenshots (Off / SCRAP INK / Light / Heavy) reviewed. Software-renderer frame cost (headless, so only a rough guide): the extra pass was within measurement noise for SCRAP INK (about 3.4 -> 3.6 ms per frame at 960x540) and about +1 ms for Heavy; real GPU timings should be checked on the Deck.

### 2026-11-07: 0.42.0 3D title logo + hangar merge fix
- **3D title logo (logo3d.js, logodata.js).** The new logo model replaces the text logo on the title screen (the old h1 stays invisible only to hold the layout). It turns very slowly. Click a piece 5 times and it drops off with physics (private Rapier world, ballistic fallback), lies for 10 s, then flies back. 15 clicks in total drop every piece still on. The count restarts once everything is home. Source model in art/, packed by tools/logo_pack.py (regenerate logodata.js with it).
- **Hangar merge fix.** The hangar stock limit (2 weapons/arms) counted merged parts, so after one merge you were stuck at L2. Only Lv 1 parts now use up stock, so merges can continue up the levels. `hangarCount` in inventory.js; tighten there if you want a hangar level cap.

### 2026-11-07: 0.42.1 merge rule: any level
- **Merging is no longer same-level only** (user decision). Two parts of the same kind and type merge at any levels into one level above the higher of the two (L2 + L1 -> L3, L4 + L1 -> L5), never past the cap. `canCombine` / `combineInto` in inventory.js (`sameTypePair`, `higherOf`). Applies everywhere: hangar, storage, auto-upgrade, gems. `sameLevelPair` in data.js is no longer used by merging. The hangar stock limit still counts only Lv 1 parts, so a hangar part can be pushed to L5.

### 2026-11-07: 0.42.2 fix: body turns invisible after an MK III reveal
- **Fixed:** the MK III cinematic (cinematic.js) built a full copy of your robot to show off the weapon, then on exit disposed every geometry in its own scene — including the shared, cached block/leg/arm geometry your real robot (and everyone else's) draws with everywhere in the game. That could leave your robot's body invisible for the rest of the run. `cineEnd` now only disposes what the cinematic built new for itself (platform, rays, sparks — tracked in `CINE.disp`); the borrowed robot/weapon preview geometry is left to the shared caches that own it.

### 2026-11-07: 0.43.0 modeled parts (preview) + limbs flattened to 3 levels

- **New selectable parts, hangar-pickable, nothing default touched:** Luke's modeled Blender pieces are in as alternate
  options alongside the existing procedural ones — "Frame Arm (Mesh)" (arm), "Frame Torso (Mesh)" (torso), "Walker Legs
  (Mesh)" and "Chicken Legs" (lower half, the latter with reversed/digitigrade knees). Same stats as the part each sits
  beside; pick them from the normal hangar shelf like anything else.
- **Armor reveal at max level:** each modeled part's armor plate (shoulder, thigh, shin) is built in but held back until
  the part hits its max level, with a small spark + sfx the first time it bolts on — the same idea as the weapons' MK
  III reveal, scaled down for something that can happen on every limb.
- **Optimized for framerate:** meshes are packed as binary (quantized normals, 16-bit indices) instead of raw OBJ text,
  and mirrored parts (arms, legs) ship only one side's geometry — the other side is a runtime flip, not doubled data.
  ~75KB total for all four new parts.
- **Balance change, game-wide:** arms, legs and lower-halves (old and new) now cap at level 3 instead of 5, and no
  longer scale stats with level at all — leveling one up only earns it gem slots. Weapons, modules, adapters and gems
  are unaffected.
- `LEGS.chicken`'s hip shell currently reuses the Walker Legs disc (mounts/gem spots) rather than a bespoke one — say
  the word and I'll pack Luke's own "Waist" shell piece for it.

### 2026-11-07: 0.43.1 pulled the modeled parts preview

- Pulled the four new modeled parts (Frame Arm/Torso/Legs (Mesh), Chicken Legs) from 0.43.0 — they didn't look or work
  right yet. The files are still on disk in case we pick them back up, just not wired into the hangar anymore.
- Kept the level-3/gem-only balance change for arms, legs and lower-halves — that part stands.

### 2026-11-07: 0.43.2 fix: 3D logo spelled "SCARP"

- The modeled 3D title logo had its R and A swapped, spelling "SCARP SURVIVOR" instead of "SCRAP SURVIVOR". Moved
  those two letter pieces to their correct slots (same shapes, same clickable/physics behavior, just the right order).

### 2026-11-07: 0.43.3 logo hazard stripe follows your secondary color

- The dashed hazard stripe in the 3D title logo now matches your chosen secondary (accent) color, the same color
  applied to the robot's sockets/trim — change it in Customize and the logo updates right away.

- Store weapons always offer at Level 1
- Removed the CRT filter; Scrap Ink: Light is now the default look for every player, with a simple on/off switch in Options → Graphics (the full tuning panel moved to Options → Developer Tools)
- Reorganized the Options menu into Graphics and Developer Tools submenus
- Fixed missing icons for the Muzzle Velocity and Long Barrel level-up stats
- Bigger, more readable damage numbers
- Explosive (bomber) enemies no longer take fall damage from hard landings
- The You Died screen's stat tiles, combat breakdown, and loadout icons now show text labels

- Arm-to-Module and Module-to-Arm adapters now run straight out of the socket they plug into (they used to bend 90° to face forward); their sockets face the same way the torso socket does

- Weapon crates: upgraded weapons are much rarer and now scale with your luck stat (upgraded weapon chance ~8% at 0 luck, ~16% at 20, ~34% at 60; was ~49% at base). Arms from crates are always Lv1
- Sniper Rifle: removed the camera jolt on firing and the zoom punch on kills

- Title screen: the robot stands closer to the centre (about 65% across the screen instead of ~82%)

- New terminal/ASCII UI skin across every menu: a bundled pixel terminal font (Silkscreen, SIL OFL licensed), dashed ASCII-rule borders on panels/buttons/cards, and a "> " prompt prefix on button hover
- Every slider (Options, Scrap Ink tuning, sticker bomb amount) now renders as a block-segmented ASCII progress bar, like a terminal loading bar
- Health, shield, XP, boss, berserk, kill-streak and death-screen stat bars all draw with the same ASCII block-segment texture
- Added an ASCII "glyph wipe" transition between menus (Options and its Graphics/Developer Tools submenus, Customize, Catalog) -- gameplay pause/resume stays instant, unaffected
- Tightened row spacing in the Options menu and its submenus so everything still fits on screen with the new, slightly taller font

### 2026-11-07: 0.43.9 playtest batch: loot leveling, mass-kill lag, forcefield reload, gem colors, armor reveal, GLB export, fullscreen logo fix, hit reactions

- **World-dropped modules roll a rarity-based level** like everything else, luck-scaled, instead of always landing at Lv 1 (`rollWorldLoot`, data.js). Store, case and terminal modules already did this — now the field drops match.
- **Equipped parts are a little more likely to drop**: `rollLoot`'s pool now gives a part type a modest weight bump (×1.35) when you currently have that same part equipped (data.js).
- **Big lag spike fixed on the red launch pad's landing and on the Nuke power-up.** Both kill a whole crowd of enemies in one tick; each kill used to spawn full particle bursts, debris stains and a kill sound, which could mean hundreds of new effect meshes in a single frame. A `MASS_KILL` flag (combat.js) now trims those per-kill effects during a mass-kill loop — the big flash/ring/blast at the impact point still plays, loot still drops, kills still count.
- **Forcefield now reloads**: on for a few seconds, then a cooldown before it switches back on, both scaling with level (`WEAPONS.field.onDur`/`.reload`, data.js; cycle in `fieldTick`, combat.js). It used to just run forever.
- **Magnet power-up no longer pulls in bolts/coins** — only XP. Coins still have to be walked over (`usePower('vacuum')`, combat.js). The passive Magnet Coil stat was already correct (bolts never used its range) and is unchanged.
- **Rocket projectiles now recolor to match an equipped attribute gem**, same as every other bullet — they were the one shot type excluded from the gem recolor (`bullet()`, combat.js).
- **Hit sparks now match the enemy they hit** instead of always being orange, so stage 2's blue-tinted enemies no longer throw orange/red sparks (`spark(s.pos, e.color...)`, combat.js).
- **Overtime-buffed enemies drain toward black or white** (picked per enemy, so the swarm is a mix of both), deeper the longer overtime runs (`spawnEnemy`, combat.js).
- Confirmed already correct, no change needed: opening a weapon case with full storage already drops the pick on the ground with a "storage full" banner.

- **Armor reveal is back**, reimplemented on the *current* arms and legs (the original modeled-part files that first had this are gone from the project). Every arm gets a shoulder plate, every leg gets thigh + shin plates, built automatically from the part's own shape — folded away until the part hits its max level (Lv 3), then bolts on with a spark and a sound, the same idea as the weapons' MK III reveal (new `src/armorplate.js`).
- **Exported a GLB part library** for remodeling: every current Limb, Chest, Waist and Leg as its own `.glb`, with a README on scale, origin/pivot and facing direction. Delivered separately (see message) and dropped into `art/export/` alongside the other source art.

- **Fixed: the title screen's 3D logo could vanish entirely on a large/4K fullscreen window.** Its on-screen size is capped by the UI font size, but the window's pixel height isn't — on a big enough window the math placed it past the title camera's far clip plane. Raised the title camera's far plane and capped the logo's placement depth so this can't happen at any resolution (`title.js`, `logo3d.js`).
- **Player now flinches and flails when hit**: taking damage kicks the existing body-sway spring (so the frame snaps back and wobbles, same system that reacts to acceleration) and throws the arms into a brief thrash instead of their normal aim, easing back out over a third of a second or so (`hurt()` in combat.js, arm-aim loop in player.js).

### 2026-11-08: 0.43.10 music variety, smoother track transitions, pause muffle filter, dire boss/elite track

- **Three distinct music tracks now exist** — calm, drive (busier/faster, kicks in once the fight gets hot) and dire (tense, minor, for boss/elite fights) — instead of one progression used everywhere. Each has its own chord progression and tempo (`TRACKS`, `PROG_CALM`/`PROG_DRIVE`/`PROG_DIRE` in `music.js`).
- **Smoother transitions**: the game now only switches which track is playing on a 2-bar phrase boundary (the same point the harmony was already changing at), so a track swap always lands cleanly instead of cutting in mid-phrase.
- **Dire track kicks in near a boss or elite**: gets held for 2.5s after the threat leaves range/dies so it doesn't flicker in and out as you dodge around; falls back to the busier "drive" track while the fight's still hot, or calm otherwise.
- **Pause/build menu now muffles the music** — a lowpass filter gradually closes when you open pause, inventory, the shop, or a terminal (same screens that already ducked the volume), and opens back up smoothly when you return to the game, like music heard through a door.

### 2026-11-08: 0.43.11 unlock system, back-wall window crowd, title-screen entrance

- **Basic chest now has a 2nd module socket on its back** (Scout Torso: 2 arms + top module + back module, up from 1 module) (`data.js`).

- **New unlock system.** You start with only the basics: Pistol, Frame Arm, Walker Legs and the Scout Torso. Everything else opens up by playing:
  - **Weapons unlock in a chain**, each after 100 kills with the one before it: Pistol → Shotgun → Autogun → Knife → Flamethrower → Arc Caster → Sniper Rifle → Katana → Chainsaw → Gatling Gun → Gravity Gun → Forcefield → Rocket Launcher.
  - **Katana, Chainsaw, Gatling, Gravity Gun, Forcefield and the Rocket Launcher** also can't drop in the world, the store, a case or the terminal until they're unlocked for the hangar — every other weapon in the chain drops freely from the start even while still locked for building.
  - **Each weapon starts with a 1-copy hangar limit**; take it to max level in any run and it's mastered forever, raising its limit to 2.
  - **Sentry Arm** unlocks the first time any arm or lower half is taken to its max level (Lv 3) in any run. **Twin Arm** unlocks after 50 lifetime elite kills.
  - **Chests and legs unlock from bosses**, once each, forever: Warden → Brawler Torso + Spider Legs, Magnetron → Carrier Torso, Smelter → Tread Base, Hive Mother → Wheel Base. (The Golden Pig is a rare event, not a boss — it doesn't gate anything.)
  - All of it is saved between runs (alongside circuits). The dev panel (F1) has new **Unlock all** / **Reset all unlocks** buttons for testing, plus a status line showing current progress.

- **Main menu scene rework**: the raised stage/pedestal under the showcase robot is gone — it now stands on the plain floor grid. A back wall with a lit window went in behind it, with five little onlooker robots watching through the glass. They laugh when the falling pile of weapons bonks the robot, and cheer when it blows up. After an explosion, the replacement robot now walks in from off-screen on the right instead of dropping from the sky (the very first robot on launch still drops in) (`title.js`).

### 2026-11-08: shareable builds + Deck updater fix (0.43.12)

- **Builds** (`Documents\ScrapSurvivors\Builds\`): `ScrapSurvivors-0.43.12-Windows.zip` (portable: Electron 33.2.1 win32-x64, `electron.exe` renamed `ScrapSurvivors.exe`, game in `resources/app`, `default_app.asar` removed; no updater, unsigned so SmartScreen warns) and `ScrapSurvivors-0.43.12-SteamDeck-linux.tar.gz` (same with linux-x64 + `ScrapSurvivors.sh`). Delivered as 20 MB pieces + `Join builds.bat` (copy /b + certutil SHA256 check) + `README-BUILDS.txt`. Built in-session: download `electron-v33.2.1-<plat>.zip` from GitHub releases (checksums verified against SHASUMS256.txt), unzip, drop the app in. The Linux build was smoke-tested under xvfb (loads the game, no errors in its log). electron-builder is not needed.
- **Deck updater never worked**: the repo dethdonald/ScrapSurvivors is PRIVATE, so the launcher's anonymous `raw.githubusercontent.com` check failed silently and the Deck kept its old version. `deck/ScrapSurvivors.sh` now reads an optional `github-token.txt` next to it (fine-grained, this repo only, Contents read-only) and then uses the GitHub API (`contents/VERSION` raw + `tarball/main`). Tested against the real repo: no token -> starts old version; token -> 0.43.8 updated to 0.43.12. Never ship the token in a shared copy.
- **Windows updater** (`tools/bootstrap.js`): the Windows build's `resources/app` = `package.json` (main: bootstrap.js) + `bootstrap.js` + `game/` (bundled copy). At start it promotes `%APPDATA%\ScrapSurvivors\game-files\pending` -> `current`, runs whichever of bundled / current has the higher VERSION, then 3 s after ready checks GitHub in the background (`net.fetch`, so it follows the PC's proxy settings; optional `github-token.txt` next to the exe; extracts only `<top>/app/` from the tarball with a tiny ustar/pax reader) and stages a newer version in `pending` for the NEXT launch. Log: `%APPDATA%\ScrapSurvivors\update-log.txt`. Tested over 3 launches against a local mirror of the real repo tarball (this sandbox's proxy blocks Chromium's own networking): 0.43.11 bundled -> downloaded -> switched to 0.43.12 -> no-op. Rebuild the Windows package only when Electron changes.
- **Publishing (Luke's rule, 2026-11-08): ASK Luke after each delivery whether to publish that version to GitHub; only run `/home/claude/publish.sh` when he says yes.** Publishing is what pushes the update to installed Windows/Deck builds. The builds only need repackaging when Electron itself changes. Releases can't be created from Claude sessions (HTTP 403); Luke uploads release assets himself.

### 2026-11-08: 0.43.12 title screen polish: window crowd, logo, walking turns

- **Logo visible again**: the 3D logo used to sit 15-30 m deep (depending on window size), behind the new back wall. It's now held in front of the wall (max 12 m) and scaled down by the same ratio, so it covers exactly the same pixels; falling-piece physics scale with it (`logo3d.js`).
- **Window crowd fixed**: the onlookers were standing in front of the window and floating above it (their idle bob doubled the group's height offset). The window is now a real opening (four trim bars instead of a solid pane) with a small dim room behind it, and the crowd stands behind the glass.
- **Back wall**: darker grey, narrower, rivet corner brackets and faint rust streaks.
- **Stage floor back, flat**: one solid floor surface across the whole view (fading into the fog), with the grid drawn on it; no raised pedestal.
- **Robot turns on its feet**: no more turntable glide. It turns in bursts and the legs step it round (alternating, planted feet, step thumps); walk-ins step too, wheels roll; the walked-in robot keeps its heading instead of snapping forward.
- Removed the hazard-stripe bar above the title menu (`style.css`).

### 2026-11-08: 0.43.13 update status on the title screen, Steam Deck Gaming Mode launch fix

- **Update status on the title screen** (after the version number; packaged builds only, the Play.bat dev copy shows nothing): UP TO DATE · UPDATE x AVAILABLE · DOWNLOADING… (Windows, polls every 5 s for up to a minute) · UPDATE x DOWNLOADED + a RESTART TO UPDATE button (Windows) · RESTART THE GAME TO INSTALL (Deck/Linux, the launcher updates on start) · CAN'T CHECK (NO ACCESS) when the private repo has no token · COULDN'T CHECK when offline. `main.js` `update-status` (IPC, `net.fetch`, same `github-token.txt` next to the exe / launcher, cached 1 min) and `restart`; `preload.js` exposes `desktop.updateStatus()` / `desktop.restart()`; UI in `title.js` `checkUpdate()`, styles `.tupd`. The Windows "downloaded" state reads `%APPDATA%\ScrapSurvivors\game-files\pending\VERSION` directly, so the already-shipped Windows build gets it through a normal update. All six states tested in a packaged build against a mock GitHub.
- **Steam Deck endless loading screen on launch** (resolved): first try unset `LD_PRELOAD` (Steam's overlay) -> the game then sat on Steam's endless loading screen in Gaming Mode, because the overlay library is how gamescope recognises the game's window. REVERTED: keep the overlay. The launcher still passes `--ozone-platform=x11`, logs every launch (env + output) to `launch-log.txt` next to it, and if the game dies within 10 s it retries once with `--disable-gpu-sandbox --in-process-gpu`. Separately, the same endless-loading symptom showed up again in Desktop Mode - turned out Steam's non-Steam-game shortcut was pointed at the `ScrapSurvivors` binary directly instead of `ScrapSurvivors.sh`. Skipping the launcher script means no update check, no logging, and none of the launch flags above, which is also why Steam can't detect the window properly. **The Steam shortcut's Target must be `ScrapSurvivors.sh`, never the raw binary.**

### 2026-11-08: 0.43.14 Steam Deck launcher: keep Steam's overlay

- `deck/ScrapSurvivors.sh`: no longer unsets `LD_PRELOAD`. Gaming Mode needs Steam's overlay library to recognise the game's window; without it Steam showed an endless loading screen. The launcher still logs every start to `launch-log.txt` (now including LD_PRELOAD) and retries once with `--disable-gpu-sandbox --in-process-gpu` if the game dies within 10 s. Version bumped so installed Decks pick the launcher up (they only update when VERSION changes).

### 2026-11-08: fixed - Deck's "restart to update" button didn't actually update
On Linux/Steam Deck, all the real update logic (checking GitHub, downloading, swapping in the new files)
lives in `deck/ScrapSurvivors.sh` - it does that *before* launching the game binary, then waits for the
binary to exit. The in-game "RESTART TO UPDATE" button called `app.relaunch()`, which just respawned the
raw game binary directly, skipping the wrapper script entirely. So clicking restart never ran an update -
you got the exact same files back every time, no matter how many times you restarted.

Fixed `main.js`'s restart handler: on Linux it now re-launches `ScrapSurvivors.sh` (sitting next to the
game binary) instead of the binary itself, so the script's update check actually runs before the game
comes back up. Windows is unaffected - its updater (`tools/bootstrap.js`) already handles this inside the
Electron process itself, so a plain relaunch was always correct there.

Also added `deck/Update.sh`: a standalone updater that does the same GitHub check/download as
`ScrapSurvivors.sh` but **without opening the game**, and prints what happened (up to date / updated to
X / offline / failed + why) instead of only writing it to `update-log.txt`. Useful both for manually
forcing an update and for diagnosing a stuck one. The shared logic moved into `deck/update-lib.sh`
(sourced by both scripts) so there's one copy of the actual update code, not two. All three files
(`ScrapSurvivors.sh`, `Update.sh`, `update-lib.sh`) now travel together — the self-update step copies all
three down, and `publish.sh` pushes all three.

### 2026-11-08: fixed - Steam Deck launch hang, now mode-aware (0.43.16)
Conflicting real-world results: Gaming Mode needs Steam's overlay library (LD_PRELOAD) kept, or gamescope
can't recognise the window and Steam loads forever (0.43.13/14). But Desktop Mode showed the OPPOSITE -
Steam hung loading WITH the overlay preloaded, and only booted once LD_PRELOAD was cleared via Launch
Options. One fixed behavior can't satisfy both, so `deck/ScrapSurvivors.sh` now detects which mode it's
actually running under (Gaming Mode's session reports `XDG_CURRENT_DESKTOP`/`XDG_SESSION_DESKTOP` as
"gamescope") and only keeps LD_PRELOAD there - it's cleared everywhere else (Desktop Mode, or running
outside Steam entirely). The detection result and LD_PRELOAD's final state are now logged to
`launch-log.txt` for every launch. If this guess about gamescope's env var is wrong, that log line will
show it.

Also: confirmed and documented a separate pitfall - a non-Steam-game shortcut pointed at the raw
`ScrapSurvivors` binary instead of `ScrapSurvivors.sh` skips the launcher (no update check, no logging,
no launch flags) and can show the same symptom. The Steam shortcut's Target must be `ScrapSurvivors.sh`.

### 2026-11-08: fixed - title menu unusable with a controller, Deck LD_PRELOAD flip, restart button (0.43.17)
- **Title menu had NO gamepad navigation at all.** `focusables()` only ever looked inside `.overlay`
  sections, but the title screen (and its Customize/Catalog subpanels) aren't `.overlay` elements - they're
  the base screen and plain nested panels - so the gamepad code always found zero focusable buttons there.
  Gave `focusables()` explicit containers for `title`/`custom`/`catalog` so Start/Customize/Catalog/Store/
  Options/Quit (and the Customize and Catalog panels) are now reachable with a controller.
- **Found and fixed a second, real bug while verifying that**: `navMove()` scored candidates by
  center-to-center distance, which breaks for a left-aligned column of variable-width buttons (title's
  menu) - a longer label drags a button's center further right, which could out-score the very next item
  below and make Down skip over it entirely (verified: Down from Start jumped straight to Store, skipping
  Customize and Catalog). Changed the cross-axis penalty to an edge-overlap gap (0 when two elements'
  ranges overlap on the perpendicular axis) instead of raw center distance - traversal is now a clean
  Start -> Customize -> Catalog -> Store -> Options -> Quit in order.
- **The update-restart button was also missing the `nav` class** gamepad focus requires, so even with the
  above fixes it still wouldn't have been reachable. Added it. Also: Linux/Deck never showed a button at
  all for its "available" state (only Windows' "ready" state did, since Linux's actual download happens in
  the shell launcher, not in-app) - it now shows a real RESTART TO UPDATE button there too; clicking it
  just restarts, since on Linux a restart re-runs the launcher script, which is what does the update.
- **Steam Deck LD_PRELOAD flip-flop, resolved with real data**: a 0.43.13 Gaming Mode test once suggested
  keeping Steam's overlay preload was required there. Direct testing on 0.43.15/16 showed the opposite in
  BOTH Gaming Mode and Desktop Mode - the game only boots once LD_PRELOAD is cleared (confirmed via the
  LD_PRELOAD="" %command% Launch Option override in both modes; disabling Steam's overlay setting did NOT
  have the same effect). `ScrapSurvivors.sh` now always clears LD_PRELOAD unconditionally - no more mode
  detection. The Launch Options override can be removed.

### 2026-11-08: hardened restart-to-update, awaiting diagnosis (0.43.18)
In-game restart-to-update on Linux still isn't landing the update even though running `Update.sh` by hand
does - same `update()` logic either way, so something about going through the game/Steam specifically is
different. Hardened `main.js`'s restart handler in the meantime: it now runs `ScrapSurvivors.sh` via an
explicit `/bin/bash <script>` instead of exec'ing the script file directly (removes any dependency on the
executable bit surviving however the file got there), and logs the attempt/any spawn error to
`scrapsurvivors-log.txt`. Not a confirmed fix - gathering `update-log.txt` from a real restart attempt vs.
a manual `Update.sh` run to find the actual cause (leading theory: Steam may run non-Steam games inside a
sandboxed runtime container whose filesystem writes don't persist, which a manually-run script would be
outside of).

### 2026-11-08: title screen part-preview box moved to top-right (0.43.19)
It used to sit centred over the robot itself (the thing it's describing), which is exactly where you'd
rather be looking. Moved to the top-right corner, clear of the robot and the menu; the line connecting it
to the highlighted part still follows the part as the robot turns.

### 2026-11-06: 0.34.0 — Chunk 09/16, Lifesteal and Poison gems (src/gemfx.js)
- Two new gems, **Lifesteal** (crimson `#d6204a`) and **Poison** (green `#58d62a`), levels I-V. They are normal `ATTRS` entries so they appear in gem drops, cases, the store, the terminal pool and the catalog. The original eight gems and all 36 combos are untouched; **no new combos yet** (Chunk 10), so a pair with a new gem just gives both plain effects.
- **Arm Lifesteal**: heals 1/1.5/2/2.5/3 % of the damage a shot really dealt (`HIT_DEALT`, overkill excluded), shared cap 1/1.5/2/2.5/3 HP per second **per arm** (`arm.ls` one-second window), never overheals. Poison ticks and burn bypass `damage()`, so they never heal; no recursion.
- **Arm Poison**: each direct hit adds a stack worth 2/3/4/5/6 % of the hit's original damage per second. Normal max stacks 3/4/5/6/7, bosses 2/2/3/3/4 (a full pile replaces its weakest stack only with a stronger one). 4 s duration, every hit refreshes it, 4 ticks per second as direct HP loss (`poisonTick`), ticks never apply poison.
- **Lower-half Lifesteal**: heals 1/1.5/2/2.5/3 HP per 20 m of travel with an enemy within 12 m, at least 2 s between heals, stored distance capped at 40 m. Travel is credited only when you move 5 m away from an anchor point, so wobbling in place earns nothing; a jump of more than 40 m (teleport) is ignored; the game clock does not run while paused.
- **Lower-half Poison**: a patch every 3 m of travel (same anchor rule, grounded only), 3 s life, max 12, shared geometry, no physics; contact is checked 3 times a second and a patch poisons one enemy at most once per second.
- Small fixes: shots now remember their arm (`s.arm`, `CUR_ARM`); gem tier text uses `GEM_MAX`.
- Tests: t65 (definitions, pct/cap per level, overkill, no overheal, stack caps incl. bosses, tick damage, expiry, refresh, poison does not heal, shot path, lower lifesteal slow/fast/wobble/teleport/stored cap/no-enemy, lower poison patch count/expiry/wobble/contact cadence, 0.024 ms per tick with 12 patches and 500 enemies).
- Save notes: gems are run state; nothing persisted changes. New discovery keys (`gem:lifesteal`, `gem:poison`) are added on first sight.

### 2026-11-06: 0.33.0 — Chunk 08/16, Five bosses (src/bosses.js)
- **Rotation**: `BOSS_POOL` (combat.js) picks one boss at 8:30 on any stage, weighted: Warden, Magnetron, Smelter, Hive Mother 1 each, Golden Pig 0.12 (about 3%). All scale with `spawnBoss` (`ETYPES hp x (1 + 0.9 x (stage-1)) x clock factor`; damage via scalingBase). Overtime ignores the Pig (it is an optional bonus boss).
- **Bosses resist** knockback (x0.1, no lift, no spin), stun is forced to 0 every frame, freeze and flinch already excluded.
- **Warden** gained GRAB (every 11-14 s when >=3 ordinary enemies are within 15 m): yellow ring + flashing for 1.3 s (telegraph), grabs up to 8 (`e.held`, orbiting overhead and shootable), holds 2.4 s, then throws the survivors at you in a +-16 degree spread (30 m/s, `e.thrown`; a hit deals 80% of the Warden's damage and the thrown enemy is consumed). Damage >= 5% of its max HP during wind/hold INTERRUPTS: held enemies drop, 1.8 s stagger. It no longer needs a gate breach.
- **Magnetron** (new, approved): hovering disc with 3 pylons. 1.5 s blue-ring telegraph, then 1.7 s pull (9.5 m/s toward it, only with line of sight, within 26 m), then red-ring shockwave slam (radius 10). Slow 5-orb spread every ~5 s. Counter: run, dash, jet or break line of sight behind terrain.
- **Smelter** (new, approved): slag lands on 3 red circles (1.2 s warning, radius 3.4) and leaves 4 s fire pools (`HAZ`, hazardTick, contact tick every 0.5 s). Vents every 12 s for 4 s: x2 damage taken while open.
- **Hive Mother** (new, approved): 3 separate `sac` enemies ride on its back (`e.attach`), each flashes then spawns a drone/splitling wave every ~9 s until destroyed; when all are down it enrages. Acid spread every 5 s.
- **Golden Pig**: passive and harmless; exit opens at once. First valid hit starts an 18 s escape timer and captures `cap = casePrice()`; later hits pay `ceil(cap/12)` bolts at most once per 0.3 s, never beyond the cap; if killed the unpaid rest spills out (total still <= cap); at 0 s it leaps away.
- Catalog entries and notes added for all five bosses and the sac. Tests: t63/t64 (rotation odds, scaling at stage 1 and 3, overtime, knock resist, grab phases wind/hold/throw with 8 held and 8 thrown, interruption, pig cap 30/30 under 2000 spam hits, pig kill 64/64, magnetron pull with and without line of sight, smelter hazards and vent x2, hive sacs; 4.7 ms per sim step with 300 enemies plus a boss).
- Boss art is simple procedural blocks (instanced, static pose); polish can come with the UI/art chunks.

### 2026-11-06: 0.32.0 — Chunk 07/16, Economy, store reroll and Service Terminal
- **Bolt income about -20%**: kill drop 9% to 7%, target-box drop 35% to 28%, elites 4 to 3 bolts, brute minis 6 to 5.
- **Temporary power-ups rarer**: vacuum, berserk, coin frenzy about -35%; **Nuke about 70% rarer** (the rarest). `powerActive(kind)` stops an identical power-up dropping while it is active or still lying on the field (`dropPower(p, kind, true)` forces, used by the dev panel).
- **Store reroll**: a *Reroll parts* card, fixed `SHOP_REROLL = 50` bolts (ignores the per-deal price rise, does not count as a deal).
- **Service Terminal** (`src/terminal.js`, overlay `#terminal`): rare orange console. Deposit one STORAGE part (weapon, arm, lower half, gem, module) and pay a fixed `TERMINAL_COST = 100` for a random replacement of the SAME level in any of those five categories (never the identical type, never an adapter/orb/torso). Parts holding gems, guns or attachments are refused. Explicit Confirm / Cancel (Cancel and Esc cost nothing). The swap happens in the same storage slot, so nothing is lost or duplicated. One terminal at a time, removed on success, min `TERMINAL_GAP = 60` s between spawns (checked every 10 s, 5% chance, not before 0:45), placed only on flat ground (+-2.5 m height within 0.8) away from the store and gate. Run state is not saved, so no save data is touched.
- Tests: t62 (3000 rolls keep level/category, refusals, poor/cancel/confirm transaction, min gap 60.6 s, duplicate power-ups, reroll price).
- Equipped parts cannot be deposited directly (take them off first); easy to extend later.

### 2026-11-06: 0.31.0 — Chunk 06/16, Ten-minute stages
- **Clock**: `STAGE_LEN=600`, `BOSS_AT=510`, `TIME_K=1.5` (combat.js). `S.t` only advances in `play` (verified for inventory, level-up, case, shop, roulette, pause, dev panel, perk: 0 drift), so build time is unlimited.
- **Boss**: one boss at 8:30 via `pickBoss()` from `BOSS_POOL` (only the Warden for now; Chunk 08 adds the Golden Pig). The gate appears with the boss (sealed) and becomes the exit when it dies. **The gate-breach early Warden summon and the 5:00 gate are removed.**
- **Overtime** (`overtime()`): only from 10:00 while the boss lives; no failure, no despawn, no second boss. It ends when the boss dies. The clock fire follows `overtime()`.
- **Enemy progression** runs on `oldT() = S.t*1.5` (scaling, unlock times, horde size, Warden hp), so the order is preserved but compressed. Hordes at ~1:40/4:40/7:20 then every ~100-133 s; brute minis at 3:20 and 6:40 (none after 8:10).
- **Density**: `densityMul()` = 1.12 mean x slow start (50% to 100% over 90 s) x +/-20% wave (70 s period).
- **Rewards** (model from rew.py, kill-everything upper bound, vs old 15:00): kills 75%, cases 74%, level-ups 75% (41.0 vs 54.4). Level-up XP curve is x1.6 (`XP_K`, `xpNeed()` in data.js); XP per kill unchanged. Hordes are 75% size. Calibrate from real runs (`S.level`, `S.caseCount`).
- Tests: t61 (exact timing: boss at 510, none at 509; overtime at 600 with boss alive, none after kill; one boss only; pause in 8 modes), t58-t60, t57 regression.
- Open: `CFG.unlimitedParts` still on.

### 2026-11-06: 0.30.0 — Chunk 05/16, Combat and player stats
- **Twin Arm** fires both guns at the same time. Each gun keeps its own ammo, reload and cooldown (melee guns have their own swing timer). Firing both adds a spread cone (`TWIN_SPREAD_DEG`, 9 degrees at L1 down to 5 at L5, never zero).
- **Natural spread**: Autogun (0.022 rad on the first round) and Rocket (0.018) now spread a little; precision weapons stay accurate.
- **Range** (arm range x the new *Long Barrel* stat) now scales projectile life, explosion radius, orbit radius and orbit hit size, lightning search radius, flamer reach, gravity radius and the force field radius. `CUR_RANGE` in combat.js is set around each shot.
- **Projectile Speed** (*Muzzle Velocity* stat card, `stats.projSpeed`): travelling projectiles only, no hitscan. Life is divided by the speed so the distance stays the same.
- **Extra Shot (multi)** nerfed: card values 0/3/5/8/11/16 %, chance capped at 35 %, at most one extra shot, at 60 % damage, never on guns with a cooldown under 0.2 s.
- **Sentry** turns faster (3.4) and fires once its barrel is within `SENTRY_TOL_DEG` (22 degrees at L1 down to 9 at L5); the shot gets a matching aim error instead of perfect tracking.
- **Kill streaks** harder: window 1.5 s (was 2.2), tiers 15/40/90/180/350, payout starts at 20 kills.
- **Magnet** pulls XP only. Bolts, loot and other pickups use a fixed 4 m pull (`BASE_PULL`).
- **Arc Caster** visuals reduced (power 0.5 + 0.9 x curve, was 0.9 + 1.6 x).
- **Pogo Spring removed**: module, hop physics, spring model, symbol, hangar chip. `module:pogo` is deleted from `META.disc` on load. Pogo never appeared in the persisted saves apart from that key.
- Tests: t58-t60 (stats, twin fire, magnet, sentry), plus regression t50-t57.
- Still open: `CFG.unlimitedParts` is on (needs a defined starting shelf).

### 2026-11-06: 0.29.0 — Chunk 04/16, Universal Upgrade Orb, case loot and inventory
- **Orb:** new item kind `orb` (`ORBS.universal`, data.js). 5% per weapon case, rolled ONCE in `rollCase()` (wcase.js) and it replaces one random of the 3 choices (never two). Rerolling a slot re-rolls normally (no second orb roll). It lives in storage like any part. Use: drag it onto a mounted part (or onto a stored part's row in the Parts list); eligible targets are highlighted (socket halos / gold outline on rows) and the toast previews the change (`orbPreview`). It goes through the shared `upgradeItem` via `useOrb(orb, target)`: the orb is consumed ONLY when the upgrade succeeds, otherwise it returns to storage. Normal max L5, adapters L2 (via `it.maxLvl`). Torsos/orbs are not targets.
- **Ordinary module drops** from the world are always L1 (`rollWorldLoot`, used for target drops). Store/case/terminal rewards still roll rarity-based levels.
- **Case contents** (`CASE_KIND_ODDS`): weapon 50%, gem 18%, module 14%, arm 12% (limbs occasional), adapter 6%. `CASE_DUP_BIAS` 35%: a weapon/arm slot picks a type you already have equipped, so duplicates come up more often (measured about 40% of weapon slots) while all 13 weapons still appear.
- **Honest roulette:** `caseTease` and all near-miss flickers removed; the flicker only shows cards drawn from the real odds.
- **Indicators:** case cards show OWNED x n and AUTO-UPGRADES (when an owned duplicate with auto-upgrade could absorb it); orb cards show +1 LEVEL.
- **Full storage:** `awardPart()` drops the chosen case reward beside the robot as a normal pickup (never lost); pickups wait on the ground until there is room, but a full-storage pickup that an auto-upgrade part would absorb is taken. The taken reward banner/colours use `partColor`.
- **Module auto-upgrade:** new setting `SETTINGS.autoUpMods` (default ON, persisted via saveSettings; a saved choice wins). New modules get `autoUp = true` at creation (`mkItem`). Option row added in Options. Per-item right-click toggle unchanged.
- Tests (t57): orb rate 4.98% over 20000 cases, never more than one per case, always 3 cards; world modules 1668/1668 L1; transaction on weapon/arm/module/lower/gem/adapter, refusals at max, adapter L2 cap, torso/orb targets rejected, single use; inventory commit consumes, failed commit returns the orb; full-storage drop; setting survives reload; case UI renders with indicators.

### 2026-11-06: 0.28.1 — adapter sockets auto-orient forward
- `buildAdapter` (robot.js) now builds a short stub along the torso socket's direction, then a head whose sockets always face forward (+z) whatever socket it plugs into (back sockets lift the head up to clear the torso). Arms/modules inside adapters therefore point forward instead of up/sideways. Socket rules, merging and tests unchanged (t52/t53 pass).

### 2026-11-06: 0.28.0 — Chunk 03/16, robot construction and adapters
- **Adapters** (new item kind `adapter`, table `ADAPTERS` in data.js): `arm2mod` plugs into a torso ARM socket (sphere) and turns it into a MODULE socket; `mod2arm` plugs into a MODULE socket (cube) and turns it into an ARM socket. L1 = 1 socket, L2 = 2 independent sockets in the same original torso socket. `maxLvl = 2`, so `levelCap`/`upgradeItem` refuse above it. Two identical L1 adapters merge into an L2 (contents of both move into the new sockets, nothing lost). Adapters hold only their `to` kind: never another adapter, a gem, a weapon, or the wrong socket type (`refAccepts`). Torso sockets accept the matching adapter as well as their normal kind.
- Adapter sockets are plain `slots` on the adapter item, so `childrenOf`, `mountedItems`, `allItems`, store, scrap value and stats all see parts inside adapters. Model: `buildAdapter` in robot.js (blue collar = makes arm sockets, copper = makes module sockets); arms on a top-mounted adapter point up (cosmetic).
- Adapters drop from loot at L1 (weight 0.5, V2 only), appear in the catalog Parts tab, and are hangar-limited to 0 unless dev mode is on (`HANGAR_RULES.adapter`). Discovery key `adapter:<type>` persists in META.disc.
- **Independent removal:** pulling the lower half off the stand in the workbench (`pullOff`) now sets the torso, with everything attached, down beside it instead of dragging it along; either can be re-mounted. `buildProblems` (lower half, torso, an arm) gates `launchRun`, `closeInventory`, dev test range, and now `newRun()` itself (returns early with a "Needs:" message).
- **Missile Pod rear gem socket:** pods now name their own gem socket (`gemSock` from the model): rear face of the launcher box (side face when the pod itself is mounted on the back), clear of the missile tubes. Mounting, accepting only gems, and gem effects on the missiles verified.
- **Spider legs:** `stepLegs` scamper branch: for `spider` legs each claw is staggered up the wall and probes along the wall direction with `groundAt` to plant just short of the surface, with a small grit spark. Other legs unchanged.
- Save/reload: nothing but settings/meta/custom/layout is persisted. Tested JSON round trip of a torso with adapters, and that `adapter:*` discovery keys survive a page reload.
- Tests: /tmp t52 (socket rules matrix, construction, merge L1->L2, max cap, no-loss, JSON round trip), t53 (hangar render + lower removal keeps 14/14 items, launch refused while incomplete, re-mount), t54 (pod socket + firing), t55 (spider claw contact), t56 (reload). Regression t50/t51 still pass; no duplicate globals.
- Not done here (belongs to later chunks): Universal Upgrade Orb for adapters (Chunk 04), Twin spread/Sentry tracking (05). `CFG.unlimitedParts` still on at the user's request.

### 2026-11-06: 0.27.0 — Chunk 02/16, unified component levelling (user approved AUDIT_01 tables and answers 1-5)
- Every upgradeable part (weapon, arm, module, lower half, legacy leg, upgradable block, gem) is now **Level 1..5**; level = rarity (L1 Common ... L5 Legendary). `MAX_LVL=5`, `TIER_START=[0,1,2,3,4,5]`, `GEM_MAX=5`.
- **Stat tables:** formulas stay written on the old 1..100 scale; `LEGACY_LV=[0,1,10,30,60,100]` maps L1..5 onto them. `wrapLevelStats()` (end of data.js) wraps every one-arg `lvl =>` function in WEAPONS/MODULES/BLOCKS so callers keep passing the real level. Direct `lvlCurve(...)` uses on raw levels must call `sLv(lvl)` first.
- **Gem slots:** arms and lowers 0/1/1/2/2 (`SLOT_SCHEDULE`), legacy legs max 1, Blades 0/0/1/2/2, Missile Pod 1.
- **Arms:** per level +5% damage (`armDmgMul`), +2.5% fire rate, +8% turn. **Lowers:** hull x[1,1.16,1.32,1.5,1.7], shield x[1,1.4,1.8,2.2,2.8] (`lowerHp/lowerShield`), wheels +2.5% speed/level, spider +6.25% wall scamper/level. Twin spread and Sentry tracking values from the audit are NOT implemented yet (Chunk 05).
- **Removed usage XP** from parts: `xpNeedOf/addXP/mergeXP/xpFrac/partUseTick/creditDamage/XP_RATE` gone; XP bars replaced by level text/pips. Player XP untouched.
- **One upgrade path:** `upgradeCheck(it)`, `upgradeItem(it, by)` in data.js (respects `it.maxLvl` for later adapters, adds gem slots, refuses at cap and changes nothing). `canCombine`/`combineInto` (inventory.js) require same kind, same type, SAME level and use it; a refused merge hands the duplicate back. Auto-upgrade uses the same rule. Later orbs must call `upgradeItem`, then `partLeveled(it)` when in a run.
- **Migration:** `migrateLvl(old)` maps old levels (1-4 -> L1, 5-9 -> L2, 10-29 -> L3, 30-59 -> L4, 60+ -> L5). Nothing persisted holds parts (loadout/inventory/shelf are not saved), so only dev-shelf/dev copies could carry old levels; stale `.xp` is ignored.
- Dev panel "max levels" now sets L5. **`CFG.unlimitedParts` left ON on purpose:** the user approved turning it off, but no starting shelf exists anywhere (`INV.shelf` is reset to `[]` in game.js and never filled), so switching it off now would leave the hangar empty and the game unplayable. Needs a defined starting shelf first (proposed for Chunk 07 or earlier on request).
- Tests: /tmp scripts t50/t51 (all 13 weapons + 8 modules at L1..5 match old formulas at mapped levels, merge chain L1->L5, same-level-only rule, max rejection for every kind, gem chain, arm merge keeps guns, auto-upgrade, stats with L5 lower/arms, inventory renders, no page errors).

### 2026-11-06: Chunk 01/16 audit (no code change)
- Wrote `AUDIT_01.md`: code map, Level 1-5 tables, usage-XP migration, build order, 10-minute reward analysis, boss gaps. Awaiting user approval before Chunk 02.

> Dates are the owner's local dates (America/New_York). Items before 2026-11-02 evening were made earlier in the
> project; their exact dates weren't recorded, so they're grouped as "Earlier".

### Earlier (before 2026-11-02 evening): foundations and feature batches
- Core game: Electron app, three.js arena, Rapier physics body, modular robot builder (bodies, legs, arms, weapons, modules), survivors-style run (5:00 gate, 15:00 Warden), stages, perks, level-up cards, shop, locked cases.
- Gems: forearm gem slots; Ice gem; leg gems (one slot each, on the outer thigh) with movement effects; misplaced legs shown in red with a big penalty; gem tiers I–IV; **all 36 gem combos**; gems take storage space; rarer gems, magnet and nuke.
- Drop and sky: mega-jump landing area attack; scattered sky coins (5s blue, 10s red); red launch pads with a bonus drop; pickup ring while falling; QR match-cut drop intro.
- Weapons: Gravity Gun; Arc Caster made dramatic; missile pods fire 3 or more and get a gem slot; homing shots arc and split at their peak; digital forcefield shader; bigger, exaggerated gun kick; reticle bloom.
- Enemies: ragdolls with less height, fall damage and bouncing spheres; knocked around more; many more with 45% health; squeak on hit; splitter makes 10 bouncy splitlings; tough enemies drop weapons and arms; persistent darker ground stains.
- Movement: wall scamper (legs only); scamper animation; Pogo Spring module.
- Building and progression: default starter robot; removed Slot Brick, Spin Gear and Slot Plate; arms Mk I–III and legs Mk I–II (gem slots earned per mark) with a gem-slot dialog; auto-upgrade toggle; storage wipe animation; bolts fly out of the recycle bin; Whirl Core and Blade Ring modules; a unique icon for every part.
- UI: developer mode (default off); build checklist / ready check next to the robot; yellow (!) for weapons not held by a hand; bolts and weapon level by the crosshair; crosshair style options; build-menu section separators; store sections; spinning 3D part preview in tooltips; locked-case price hologram; reusable store with 3 offers.
- Customize: drag to turn the robot; sticker bomb and patch library (save, new, duplicate, delete, clear); draggable stickers; randomize button on the title screen.
- Sound: hurt noise; "whoopsies" when a gem bounces off.

### 2026-11-02 (evening)
- **Dynamic music:** a generative ambient score that builds with nearby enemies (arpeggio, bass, hats, kick, snare, tempo up) and adds a heartbeat and tension drone at low health. Music volume slider.
- **Silence on death:** the music cuts to silence when you die and returns in the hangar. The sequencer was hardened against bad values and stalls.
- **Test range (dev mode):** no drop, no timer, no automatic spawns. F1 dev panel: spawn any enemy type and count, god mode, enemies stand still, difficulty stage, kill or remove all, heal, bolts, level up, max or reset parts, drop any part or pickup.
- **Game over stats screen:** time, stage, level, kills, bolts; damage dealt and taken, shield blocks, peak enemies, distance, parts and gems found; kills by type; damage by part; final frame.
- **Rename to Scrap Survivors** throughout (title, logo, package, app id, Play.bat, log). Saves migrated, plus a rename script for the folder.
- **QR intro:** the code now looks like a real QR (finder eyes, timing lines, alignment squares, format and version bits, dithered heights).
- **Twice as many enemies** at the same toughness. Enemy detail meshes stopped casting shadows. Developer performance readout.
- **Customize:**
  - Five quick clicks gives a draggable cigarette with smoke; five more removes it.
  - Cosmetics shelf (Santa hat, pumpkin, police badge) that sticks anywhere and follows that part on every frame.
- **Hazard stripes** on menus in the secondary colour.
- **Hangar:** gems hidden from the build list unless dev mode is on.
- **UI scaling:** auto modes (standard, high-res, Steam Deck, small window) plus a UI scale slider. Larger crosshair area on high-res and Deck.
- **Reload animations:** arms drop to the waist; bolted-on and twin-arm guns tip forward 45°.
- **Auto reload** after 1.6 s without firing.
- **Leveling:** a new mark only adds gem slots. XP is much bigger (arm Mk II = 12,000 damage dealt, Mk III = 45,000; legs 10 XP per metre, Mk II = 15,000).
- **Splitlings** burst out and act immediately.
- **Part level bar** along the top of the screen (icons and level bars, either side of the timer).
- **Right-click a part** to toggle auto-upgrade (AUTO tag shown).
- **Weapon cases:**
  - First version: replaced loose part drops; a 3-slot roulette of parts with 3 rerolls per stage.
  - Revised the same evening: cases give **level-up reward choices**. Shot targets drop parts and gems again.
- **Customize peeling:** cosmetics and stickers (including the patch) peel off with resistance and can be thrown away. Reshuffle puts stickers back.
- **Customize layout:** reorganized into tabs with Done always on screen (also fixed the scaled panel running off screen).
- **Optimizations:** instanced enemy rendering, batched debris, pickups and particles, distance detail culling.
- **Gravity gun** area reduced (3.5 to 5 m).
- **Roulettes** (cases, slot machine, prize strip): whirring spin sound, spark-burst sound and visual on landing.
- **Menus use symbols** instead of words (stats, abilities, perks, weapons) with hover labels. Abilities became chips, and the shop, game over and part rows were trimmed.
- **Feel update:**
  - crit "tink", directional enemy flinch, muzzle flash with real light, weighty bullet streaks
  - speed FOV, subtle directional camera kicks, delayed landing camera dip
  - coyote time and jump buffer tuned; wall kick (up to 3 per jump)
  - weight-based handling
  - layered gunshots with pitch variation; echo tails
- **Flying enemies** crash as tumbling, smoking wrecks with a jammed thruster and a small impact blast.
- **All interface orange** follows the secondary colour; secondary choices are always bright.
- **Draggable windows:** the hazard-stripe bar moves them, the corner grip resizes them, the layout is saved, and Options has a reset.
- **Drop rework:**
  - The robot is already falling when the camera pulls out of the QR shot.
  - Faster steering with a gentle pull toward bolts and rings.
  - Coin rings collect the whole ring when you fly through the middle.
  - Subtler bolt suction with gold motes.
- **Coin frenzy pickup:** 15 s of guaranteed bolt drops, bolts raining down, coins popping off the XP bar and its own upbeat song. Half the uncollected bolts vanish when it ends.
- **Bosses:** Warden 5,000 to 16,000 base health; Brute 900 to 2,400.
- **Title screen:** gun piles occasionally fall on the robot, bounce off with bonks, and the robot flinches with its arms over its head.

### 2026-11-03 (late): 0.26.0
- **0.26.1, Luke's shapes on the V2 parts:**
  - **Source:** `beveled_sketch_shapes_all.glb` (5 parts, from ChatGPT). The meshes were 19k–36k triangles each in a dense even triangulation, and the tapered part had stepped sides. So each shape is **rebuilt in code** with the same proportions, as bevelled extrusions of 24–1,100 triangles (robot.js: `bevelSolid`, `prismMesh`, `LOWER_SHELLS`).
  - **Connectors:**
    - The ring (part_1) is the **arm socket**: `femaleArm()`. A **ball on a neck** (`maleArm()`) sits in it.
    - The block with a square recess (part_2) is the **module socket**: `femaleModule()`. A **cube plug with a flange** (`maleModule()`) goes in it.
    - The male halves are added in `mount()` whenever the anchor has `accepts` set.
    - Spacing: `ARM_LEN` 0.24 and `MOD_LEN` 0.28 out from the torso face.
  - **Lower halves:**
    - Walker = the disc (part_5).
    - Spider = the tapered block (part_4), wider at the back, with 3 legs on each slanted side.
    - Wheels = the slab (part_3), 4 corner wheels.
    - Treads = a new triangle in the same style: the wide back edge carries 2 treads and the point 1.
    - The hips stay at the old body centre, so legs still reach the ground. The top has an orange-ringed hole for the torso, and gem sockets are on the front.
    - The recesses on the undersides of parts 4 and 5 were left out.
  - **Torso:** Luke's earlier hull (shape_example_2.obj) with the round bores removed and capped flush with the recess floor (`HULL_PLAIN_*`, `getHullPlainGeo()` in shapes.js; `makeBlock(..., 'plain')`).
  - **Exported** as OBJ+MTL (metres) to `Documents\Scrapfall\models\`.
- **Build revamp (V2), behind `BUILD_V2` in config.js.**
  - **Revert:** `BUILD_V2 = false` brings back the old cube bodies, loose legs and leg/brick drops (the old code paths are all still there). For a full code revert, use the GitHub branch `pre-build-revamp` (commit 67cc251, version 0.25.1).
  - **Lower half** (`kind: 'lower'`, table `LOWERS` in data.js): a body-sized block with its legs built in. Four kinds:
    - Walker Legs (2 legs).
    - Spider Legs (3 a side).
    - Tread Base (2 at the back, 1 at the front).
    - Wheel Base (4 corners). Wheels were kept as a 4th lower.
  - **How the lower half works:**
    - The built-in legs are real leg models (`lowerLegItems(it)`, a hidden `_legs` array), so walking IK, grounding and leg stats all still work.
    - They have no socket ref, so grabbing one in the workbench picks up the whole lower half.
    - All its legs together count as one pair for carry and speed (`lk = 2 / legs`).
    - Its only socket is the top hole, which takes the torso.
    - It levels like an arm, Mk I → III (xp 15,000 / 40,000, earned by walking). Each mark opens a shared gem slot: 0 → 1 → 2, on the front face. Those gems act as leg gems (`s.legGems`, `legWithGem`).
    - Lower halves never drop (rollLoot skips legs and bricks under V2). You pick one in the hangar (max 1).
  - **Torsos** (`BLOCKS.upper_*`, `upper: true`, with a `sockets` list): one sits on the lower half.
    - Scout: 2 arms + 1 module, light, +0.3 speed.
    - Brawler: 4 arms.
    - Carrier: 2 arms + 3 modules (top, back, chest).
    - Arm sockets are a **ball** connector and take only arms. Module sockets are a **square collar** and take only modules. Weapons go on arm wrists.
  - **Models:** `buildLower` / `buildUpper` in robot.js (`anchorOn` helper). Both halves use a 'plain' hull: dark recesses that aren't sockets. The lower half's top hole has an orange ring.
  - **Rules:**
    - `refAccepts` V2 branch; `firstFree` and `openSockets` handle lowers.
    - `blockOpenFaces` returns one slot per torso socket.
    - Hangar stock: 1 lower, 1 torso, 2 arms (basic/sentry), 2 weapons.
    - The ready check reads Legs · Torso · Arm · Weapon?.
    - `buildProblems` V2; `COMBINABLE` gets 'lower'.
  - **Elsewhere:** the starter frame is Walker Legs + Scout Torso + 2 arms with pistols. Title-screen robots pick random lowers and torsos. The catalog lists lowers and torsos instead of legs and bricks.
- **Gatling** (`gatling`): 20 shots/s, 120+ magazine, 6 s reload. The barrel cluster spins.
- **Katana** (`katana`): a swing hits everything in a cone. The arc is 90° at Lv 1, widening to 180° at Lv 60 (`katanaSweep`, `slashArc`).
- **Chainsaw** (`chainsaw`): a long forward blade, 1.4 m reaching 4 m at Lv 60. It hits every 0.12 s along a capsule (`sawTick`). It always vibrates (harder when revving) and puffs exhaust smoke.
- **Berserk power-up:** ×2 fire rate and no reloading or ammo use for 7 s (`berserkMul()`, `#bzBar`, red vignette).
  - It only drops with 180+ enemies alive, at a 0.12% chance per kill, and at most once every 75 s, so it stays rare.
- **Catalog:** new Power-ups tab (vacuum, nuke, frenzy, berserk, health, case), using the same models as the drops (`powerMesh`). Power-ups are discovered on pickup.
- **RoboVac** (`ETYPES.robovac`, `npc: true`): a robot vacuum that wanders to the nearest stain and wipes it.
  - It never attacks and shows no health bar. It has 320 hp, about a brute's toughness.
  - It drops 12 xp per kill and takes no fall damage.
  - Lock-on, auto-aim and chaining all skip it.
  - There are always 3 per stage (`vacTick`). A kill drops a new one from the sky at an off-screen spot.
- **Stability:**
  - The robot squash spring used `P.sqV` before it was set, which made the model scale NaN. Fixed.
  - NaN guards were added in enemy updates and the collision grid; a NaN position had looped the grid's lists.

### 2026-11-03
- **Kill streak multiplier** on the right of the screen: kills within 2.2 s build it. It grows, glows hotter through colour tiers, shakes and sparks at 10, 25, 50, 100 and 200.
- **Circuits,** a second currency kept between runs:
  - Earned when a streak of 10 or more ends.
  - Shown in the HUD and the game over stats, with the best streak.
  - The **Store** button on the main menu is greyed out with an "Under Construction" tape.
- **Customize:** patches and stickers merged into one **Stickers** tab. Peeling a sticker lowers the sticker bomb bar live, and dragging the bar puts them all back.
- **ArUco stickers:** generated fiducial markers stuck on arena walls (one merged mesh).
- **World detail** (Options toggle):
  - **Weathering in the terrain shaders:** grime where floor meets wall, worn ledge lips, rust streaks down walls, height tint, grunge, speckles, scratches, riveted wall panels.
  - **Corner debris:** plates, nuts, pipes, cables, blocks, barrels and piles at wall bases, in one merged mesh (450 / 900 / 1,400 pieces by graphics setting).
  - About 2 extra draw calls in total.
  - The terrain is instanced (no per-vertex colours), so weathering is done in the shader by sampling a height texture.
- **Weapon personalities** (`weaponfx.js`):
  - Pistol: snap tracer, dent stains, kill pop.
  - Autogun: orange tracers with every 4th bright, barrel heat glow and pitch, hiss.
  - Shotgun: fat pellets, hanging smoke, huge flash, pump sound and animation, point-blank blowback.
  - Sniper: lingering tracer with a smoke trail, dust ring, pierce bursts, kill slow-mo and zoom punch, bolt cycling.
  - Rocket: exhaust flame, thick trail, backblast, fireball, shockwave, scorch, chunks, whistle.
  - Arc Caster: re-forking bolts, chain snaps rising in pitch, twitching enemies, idle coil sparks.
  - Flamethrower: colour-aging flames, embers, blue pilot light, burning ground patches, fwoomp, burnt husk stains.
  - Gravity Gun: accretion ring, ripple, spiralling debris, stretched enemies, implosion, a beat of silence, then a thoom, plus a rising hum.
  - Missile Pods: staggered pop launches, curly trails, whistling dives.
  - Shared: impact light and per-class hit sounds.
  - Draw-call increase while firing at 50 enemies measured at about +7 to +13.
- **Batching:** flames, bullets, rings and blasts now batch too.
- **This handover file** (`HANDOVER.md`).
- **Fix:** some ArUco wall stickers were stretched across the terrain. The merged mesh was built from an indexed quad but drawn unindexed, so triangles joined up between stickers. The quads are now unindexed, and the merge helper converts any indexed shape automatically.
- **Paid (locked) cases:** the prize strip now rolls 1, 2 or 3 **upgrades** instead of parts. The case pops out that many glowing upgrade chips, rarity-coloured with a beam, and walking into one grants a random level-up upgrade. The occasional bonus gem was removed.
- **0.25.1, Steam Deck self-update:**
  - **Repo layout** (dethdonald/ScrapSurvivors): `app/` holds exactly what the Deck build runs (main.js, preload.js, index.html, package.json, src/, node_modules/three/build/three.min.js, `VERSION`). There's also a root `VERSION`, `deck/ScrapSurvivors.sh`, README and HANDOVER.
  - **Publishing:** `/home/claude/publish.sh` (session helper) copies the current game in and pushes. **Ask Luke before running it** (see the 2026-11-08 publishing rule). The version comes from `VERSION` in title.js.
  - **Launcher** (`deck/ScrapSurvivors.sh`):
    - On each start it fetches `raw.githubusercontent.com/.../main/VERSION`. If that differs from `resources/app/VERSION`, it downloads the codeload tarball of main and swaps `app/` in atomically (app.new → app). It also updates itself.
    - Activity is logged to `update-log.txt`. It skips silently when offline, and `--no-update` skips the check.
    - Tested with a simulated download: it swapped to a byte-identical `app/`.
  - **Needs the repo PUBLIC** (Luke chose public). This session can't change repo settings (403), so Luke flips it himself. While it's private the updater just skips.
  - The Deck tarball was rebuilt with the updater (6 parts in SteamDeck\).
- **GitHub:** private repo **dethdonald/ScrapSurvivors**. It has a README with Steam Deck install steps (commit bb26dff). This session type can push commits but **cannot create Releases** (HTTP 403), so Luke uploads the Deck build `.tar.gz` to a Release himself. The source isn't in the repo yet.
- **Steam Deck / Linux build (v0.25.0):**
  - **What it is:** Electron 33.2.1 for linux-x64 (`electron-v33.2.1-linux-x64.zip`, downloaded from GitHub releases), with the game copied into `resources/app`. The `default_app.asar` was removed and the binary renamed `ScrapSurvivors`.
  - **Launcher:** `ScrapSurvivors.sh` adds `--no-sandbox`, because Chromium's sandbox helper needs root permissions that an extracted folder doesn't have. main.js already starts fullscreen with the Deck layout when Steam launches it (`SteamAppId` / `SteamDeck` env).
  - **Checked:** it boots and loads `index.html` under Xvfb at 1280x800 with no JS errors.
  - **Delivery:**
    - Shipped as `ScrapSurvivors-linux-x64.tar.gz` (108 MB), split into 6 × 18 MB pieces in `Documents\Scrapfall\SteamDeck\`. The PC transfer rejects files over about 25 MB and more than 100 MB per call.
    - `Join Steam Deck build.bat` rejoins them with `copy /b`. `README-STEAM-DECK.txt` has the install steps (Desktop Mode → extract → Steam → Add a Non-Steam Game → ScrapSurvivors.sh).
  - **Rebuilding:** repeat the steps above with the current files (no electron-builder needed).
- **0.25.0, catalog, FPS work, red-pad launch:**
  - **Catalog** (new `src/catalog.js`, loaded after title.js; main menu button `#tCatalog`; panel `#catalog`; mode `'catalog'`):
    - Six tabs: Limbs, Weapons, Parts (blocks and modules), Gems, Combos, Enemies (including bosses). There are 79 entries in all.
    - Each card is a rendered 3D thumbnail. Thumbnails are made once by a small offscreen renderer and cached as data URLs (`catThumb`). Undiscovered entries are a flat grey silhouette with a "?" and a hint for how to find them.
    - The side panel shows the description and base stats (`partInfo` at level 1 for parts; stage-1 base hp/speed/damage/size and specials for enemies).
    - **Discovery is saved in `META.disc`:**
      - Parts are discovered through `receiveItem`, and by launching with them mounted (`discoverLoadout` in `launchRun`).
      - Combos are discovered when an arm holds that gem pair (`refreshLoadout` in a run, or at launch).
      - Enemies are discovered on their first kill. The Warden and the Brute are discovered when they first appear.
      - New finds pop a small "NEW · Catalog" reward pop-up during a run.
    - Esc or B closes the catalog. Title tooltips don't show while it's open.
  - **FPS:**
    - **Catch-up steps:** at most 3 logic steps per frame (`MAX_CATCHUP`, was 8). Very heavy moments now run slightly slow-motion instead of spiralling.
    - **Far enemies:** enemies more than `LOD_FAR` = 50 m away (not bosses or brutes) think every other step with a double time step (`e.lodOdd`, `e.lodDt`, `e.ldt`). Their pose is skipped on the off steps.
    - **Allocations:** the hot loops (nearest enemy, auto-aim, shot hits, melee, whirl and blades, crosshair hit test, gamepad aim assist) use `aimPtT(e)`, a shared vector, instead of `aimPt(e)`, which creates a new one. The pose spin/roll and the player-push collisions no longer allocate either.
    - **Bloom:** the chain now starts at **quarter** resolution (was half), with 5 levels. The bright pass uses 1-pixel bilinear taps, so it still covers the whole block.
  - **Damage numbers** (and the squeak sound) only show for damage you dealt. Damage inside `envDmg()` shows none.
  - **Red launch pad:**
    - The camera freezes where it is (`cam.launchHold`) and tilts up slightly while the frame rockets out of shot.
    - At 55 m altitude (was 75) it cuts to the fall with a white flash and a whistle.
  - **Benchmarks:** the container is now very noisy (the same build measured 7.7–19.7 ms), so these changes couldn't be measured reliably here. Use the dev perf readout on a real PC.
- **0.24.1, weapon names are back:** weapons in the build menu's part list (`partRow`) and the store's part cards now show their name next to their drawing, with a little gap after the icon.
- **0.24.0, batch of tweaks:**
  - **Customize:** the robot holds still in a neutral stance (no pose cycling, sway or breathing) so cosmetics are easy to place. It's the `still` flag in `updateTitleRobot`.
  - **Kill streak counts only your kills.** Damage that isn't yours runs inside `envDmg(fn)` (combat.js, `ENV_DMG` counter), and those kills skip `streakKill`. That covers bomber blasts, bomber fuse self-kills, hard-landing (fall) damage, drone-wreck crashes, and falling sky barrels squashing enemies. An explosive barrel only counts if *you* set it off (`p.byPlayer`, set in `hurtProp` / `propsBlast` from `!ENV_DMG`), so chains from your own explosion still count.
  - **Spider legs** scramble up walls for 2.2 s (was 0.65; other walking legs 0.34). That's about 13 m of wall.
  - **Limbs always drop at level 1** from every source: loot, cases, store offers, slot jackpot (`isLimb()` in data.js).
  - **Overtime spawns** stop banking past the 640 cap, so there's no burst afterwards.
  - **Store relocates:**
    - After any deal (buy, slots, gem) the store spins and shrinks away. It reappears somewhere else **30 s** later, growing back in with an overshoot (`SHOP_MOVE_T`, `S.shopAwayT`, `sh.leaving` / `sh.grow`).
    - Every deal this run raises all store prices by **12%** (`SHOP_PRICE_UP`, `S.shopBuys`, `shopCost()` / `offerPrice()`).
    - The store no longer restocks in place.
- **0.23.0, no exit rewards, overtime and a flaming clock:**
  - **Exit:** going through the exit goes straight to the next stage via `nextStage()` in game.js, with no perk or Frame Body pick. `openPerk` and `PERKS` still exist but are no longer called.
  - **Overtime (15:00+):** `OVERTIME_T = 900`. `overtimeMul()` scales every new non-boss enemy: hp ×(2 + s/30), dmg ×(1.5 + s/90), speed ×(1.1 + s/600, max 1.35), where s = seconds past 15:00. Spawn rate is ×(1.8 + s/25) and no longer drops while the Warden is alive. So one minute into overtime, enemies have about 4× hp and spawn about 4× as fast. The Warden is exempt (`scalingBase()`). The 640-enemy cap still applies.
  - **Run clock heat** (`clockHeat(dt)` in ui.js, run from updateHUD):
    - `--heat` = (t/15:00)^1.6 tints the time red and grows a red glow and border.
    - From 35% heat the time pulses with a heartbeat that speeds up toward 15:00.
    - At 15:00 the box **catches fire**: 11 CSS flames and 8 embers (`.clockfire`) behind the box, a dark-red ember background, white-hot digits, a jitter shake, an OVERTIME banner, and fwoomp + thoom sounds with a camera shake.
    - None of this runs in the test range.
- **0.22.0, near-misses, instant case rewards, stacking level-ups:**
  - **Locked-case roulette near-miss:** when you don't hit 3 upgrades, 60% of the time a 3-UPGRADES tile sits right beside the winning one. The strip creeps (a longer, slower ease) to a stop 48–56 px from the edge, then shows **SO CLOSE!** and the missed tile pulses (`.rtile.almost`).
  - **Shop slot near-miss:** a pair now always lands on the first two reels. The third reel slow-crawls, shows the matching symbol glowing (`.reel.tease`), then lands one past it. 30% of losses also tease.
  - **Weapon-case near-miss:** in each slot, 55% of the time the flicker right before landing is a top-level weapon or a module (`caseTease()`), and it hangs on it for a beat before landing on the real part.
  - **Locked-case rewards** now go **straight to you**: there are no chips on the ground any more (`grantUpgrades(n, at)` in shop.js). A small **reward pop-up** (`rewardPop(rows, title)` in ui.js, `#rewardPop`) lists each upgrade with its symbol, value and name, plus `×N` when there's more than one. It can be reused for any other reward.
  - **Stacking level-ups:** when several level-ups arrive at once, the LEVEL UP badge counts up **×2 → ×3 → …** with rising ticks and a spark burst at the end (`luBadge(total, fresh)`). It counts back down as you pick.
  - Enemy loot drops are instant, so they have no near-miss.
- **0.21.0, swarm performance and climbing:**
  - **Speed:** in the headless benchmark (600 enemies, CPU only), enemy frame time went from **13.5 ms to 7.7 ms**:
    - `collideEnemies` now uses a 2.5 m spatial grid (`CG`, `cgBuild`, `collidePair`) instead of the x-sorted sweep: 5.0 ms → 1.6 ms. Big enemies (r > 1.2) are tested against everyone separately.
    - The second terrain push-out now only runs for enemies that were actually shoved (`e.shoved`).
    - No more per-step allocations in collisions.
  - **Shadows:** enemy bodies outside the sun's shadow box (`SHADOW_REACH = 38` m from the player) are drawn in a separate no-shadow instanced mesh (`b.ns`), so the shadow pass only draws nearby enemies.
  - **Direct chase:** 85% of enemies (`e.direct`) head straight at you instead of following the flow-field paths. When they press into a wall, they climb it.
  - **Climbing:** climb speed is 75% of walk speed (`CLIMB_MUL`), and elites climb a bit slower again. Non-spherical enemies turn so their flat underside is against the wall, head up (`_cb*` basis in `poseEnemy`); spheres still roll.
  - **Climb test:** with 40 crawlers 14 m out around a 15 m mesa, 24 reached the top within 12 s, and 94% of climbing samples were flat against the wall.
  - **Speed readout removed** from the HUD (`#speedo`).
  - **Dev tip:** clashing global names break the whole page. `_cn` already existed in player.js, which is why the new one is `_cgN`. Check for clashes before delivering.
- **0.20.1, windows no longer move or resize:** this didn't feel good, so it was turned off. `makeWin` now only adds the hazard stripe along the top, as decoration that can't be clicked (`.winbar.static`). The drag code is still there behind `WINDOWS_MOVABLE = false` (`makeWinMovable`). Any layout saved by older builds is wiped on load, and the Reset windows option was removed. The bench stats eyebrow now sits above the stripe.
- **0.20.0, UI pass (much less wordy):**
  - **Banners:** one short title plus a value or nothing at all, e.g. `BRUTE`, `COIN FRENZY · 15s`, `HORDE · NORTH · 6s`, `CRIT CHANCE · +5%`. An empty subtitle line is hidden. Pickup, shop and auto-upgrade banners say just `Lv N` (plus `· storage full` when that applies).
  - **Prompts:** `[E] Store`, `[E] Exit`, `[E] Breach ⚠ Warden`, `⚠ Sealed`. A locked case shows `[E] 🔒 24 ⚙`, with the price in red and no key hint when you can't afford it.
  - **"No" feedback:** new `denyFx(el)` in ui.js gives a quick shake and a red glow instead of an explanatory banner. It's used on the case prompt, shop cards you can't afford, rerolls and the pause Inventory button. The shake uses the CSS `translate` property, so it doesn't fight existing transforms.
  - **Level-up:** the header is just `LEVEL UP` with a `×N` badge (`#luQueue`) when more level-ups are waiting.
  - **Headers:** eyebrows were removed or shortened: WEAPON CASE, LOCKED CASE, PICK A PERK, STORE (bolts shown as a symbol).
  - **Objective line:** `Gate 3:12`, `Warden 9:40`, `Kill the Warden`, `Exit open`.
  - **Options:** each row is a label plus a switch (on/off) or a value, via `optRow(sel, label, value, tip)`. Labels are shorter (Aim assist, Reset windows, Skip +1:00, Fullscreen [F11]).
  - **Game over:** four big tiles (time, kills, level, bolts) and a `Stage N` line. Everything else is folded under a **Details** toggle (`#overDetails`). The button now says `Hangar`.
  - **Workbench:**
    - Labels shortened: eyebrow `Hangar` / `Workbench · Stage N`, a short hint line, `Launch` / `Fight` / `Main menu`, `Empty` slots, `⚠ Over by N`, hangar counts `0/2`.
    - Messages cut to a few words (`Needs: …`, `Recycled · +4 bolts`, `X ▲ Lv 3`).
  - **Hover compare:** a spare part's tooltip stats show green ▲ / red ▼ against the mounted part of the same kind (less weight counts as better). New: `compareTo()` and `statDelta()` in inventory.js.
  - **Part tooltips:** text trimmed (gem slots `1/2`, `Mark II/III`, gem `Tier II/IV`), and the long explanation lines were removed.
  - **Customize:** subtitles were removed, and the hints are now 2–4 words.
  - **New symbol:** `lock` in SYM.
- **0.19.3, weapon cases give parts again:** dropped weapon cases (wcase.js) roll a 3-slot roulette of **parts**: limbs (38%), weapons (30%), gems (18%) and modules (14%, the rare one), with +6 luck. You pick one and it goes to storage. Rerolls and the +6 bolt skip are unchanged. Locked cases you pay bolts for still give level-up upgrades. New: `rollCasePart()`, `partCardHTML()`, `partTip()`.
- **0.19.2, level-up cards name themselves:** each upgrade card (on level-up, in weapon cases and in the case roulette) now shows a plain label under its symbol, e.g. HEALTH, FIRE RATE, CRIT CHANCE. The labels come from `STAT_PLAIN` in symbols.js.
- **Version 0.19.1:** the title screen now reads `VERSION 0.19.1 · BUILD NOV 3`, so it's easy to tell which build is running. Bump this on every delivery.
- **Delivery note:** two earlier copies to the PC silently wrote stale files: the sticker fix (worlddetail.js), paid-case upgrades (shop.js/combat.js) and the pause menu. Everything was re-sent from a fresh staging folder, and the PC folder was checked file by file. **Always stage into a new, uniquely named folder for each delivery, then re-stage from the PC and compare.**
- **Pause menu cleaned up:** the pause menu now only has Resume, Inventory, Options, Dev panel (dev mode only), Abandon run and Quit to desktop. All settings moved to a new **Options** page (`#optMenu`) with grouped sections (Controls, Audio, Display, Crosshair & HUD, Developer), a scrolling body and Back pinned at the bottom. The title screen's Options button opens this page directly. Esc or B on Options goes back to the pause menu (or to the title). New functions in ui.js: `showOptions(on)`, `optionsOpen()`, `pauseBack()`. The window id changed to `options2`, so old saved positions don't apply.

---

## Known issues and to check on real hardware
- The owner still needs to run the folder rename script (deliveries go to `Documents\Scrapfall` until then).
- Sound balance (layers, echoes, frenzy song, roulette whirr) has not been heard by the developer: check by ear.
- Window resizing works in code but the grip wasn't exercised by the automated test.
- On the High preset, very busy scenes haven't been measured on a real GPU. Use the dev performance readout.
- Leveling XP numbers (12,000 / 45,000 / 15,000) are first guesses: tune from the game over "damage by part" and distance stats.

## Ideas discussed, not built yet
- Hit-stop on heavy kills, bolt pickup pitch climb, near-miss roulette reveals, pity timer, double-or-nothing, Warden wagers, mystery shop item, cursed cases, gold "jackpot" crawler, milestone bonus wheel.
- Overkill gibs, armour plates on tough enemies, stacking damage numbers, stagger and launch juggling, chain-reaction bonus.
- Android port (Capacitor wrap, touch controls, mobile graphics preset).
- Online co-op (host-authoritative) or local co-op first.
- A 30-second trailer (rendered offline, or an in-game trailer mode recorded on the owner's PC).
- Circuits store (the button exists and is under construction).

## 0.44.0 — performance pass (Nov 11)
Goal: 2–3× the enemies. Measured on the headless bench (`/home/claude/bench`, software GL, slow 2-core VM — compare runs relative to each other only).
- **Enemy object shape** (`spawnEnemy`): every per-enemy field is declared up front in one fixed order. Before, ~100 different hidden layouts made every `e.x` in the hot loops a slow lookup and churned hundreds of MB of garbage. **Add any new per-enemy field there.** `ETYPES` records are normalised to one shape too (end of the table in data.js).
- **Enemy grid** `EG` (`egBuild/egBox/egNear`) for shots, explosions, `nearestEnemy`. **Collision grid** `CG` 1.4 m cells, each pair found from its bigger member; one pass above 300 enemies; far enemies collide every 2nd (or 3rd, past 45 m in a 900+ crowd) step.
- **Sim LOD**: full rate inside 14–30 m (shrinks with crowd size), then every 2nd / 3rd / 4th step, with per-enemy phase and drawn-position extrapolation (`lodAcc`). `poseEnemy` skips facing/squash for enemies off screen last frame (`e.seen`).
- **Drawing**: frustum culling, box LOD for heavy hulls past 20 m, shadow-only box proxy, shadow reach and eye/trim distance shrink with crowd size. Player model instanced by `rigbatch.js`.
- **Particles**: `ParticlePool` (`PFX.glow/lit/add`) for sparks, bursts, dust, smoke, motes.
- **DOM/HUD**: diffed HUD writes, kill-streak UI once per frame, cached `$('#id')`, minimap colour cached, META saves debounced (`flushMeta` on quit/pause/game over).
- **Caps raised**: run spawn cap `ENEMY_CAP` 640 → 1300; shot caps 160/280 → 320/560; dev counts 500 and 1000.
- **Stress test**: dev panel → “Run the horde stress test” (or `electron . --stress`, writes `stress-result.json`). Mixed horde 200 → 4000, reports enemies held at 60 and 30 fps on that machine.

## 0.44.1 — stutter fixes (Nov 13)
- **Shader warm-up** `warmRender()` (combat.js), called from `startStage()`: builds every enemy kind's template and instanced batches (non-boss batches pre-sized to the next power of two above `ENEMY_CAP` + 64, so they never reallocate mid-fight), adds throwaway meshes for each effect material combination (Basic/Standard/Lambert × side × toneMapped × transparent/additive × plain/instanced/instance-colour), then `renderer.compile(scene, camera)`. `WARM_INFO` = {ms, progs}.
- **Hitch log** `hitchCheck()` (game.js): any in-run frame over 70 ms is `console.warn`ed (→ scrapsurvivors-log.txt) with new shader count/names/keys and enemy count; last 50 in `HITCH.list`.
- **Stress test**: XP frozen during the test (a level-up screen was being timed as one multi-second frame — that was the "low 0" rows), paused time not counted, finer steps (100 apart from 1000 to 1600), reports stalls over 100 ms.
- **Enemy cap** fixed at `ENEMY_CAP = 1500` on every machine (no per-device scaling).

## 0.45.0 — legs, stomp and dust (Nov 13)
All in player.js unless noted. Tunable live from the dev panel ("Legs & stomp"); values in `GAIT` {stride, stepTime, lift, stomp, dust, prints}, saved to localStorage `scrapsurvivors.gait`.
- **Gait** (`stepLegs`): a step never takes less than 0.17 s (0.24 s heavy frames, 0.085 s spider legs); it used to shrink to 0.06 s. At speed the planted foot runs out of reach and lifts anyway → a bounding run with both feet off the ground. Longer reach, foot lift peaks late then slams down (`pow(t, 1.5)`).
- **Body follows the legs** (`updatePlayerVisual`): `P.gaitRoll` (hips roll onto the planted foot, chest counter-rolls), `P.runCrouch` (hips drop up to 0.11 m at a run — this is what lengthens the stride), `P.runLean`.
- **Footfall**: stronger dip/camera bob/sway, thud sound at speed or on heavy frames, slight shake for heavy frames. Spider legs: light skitter, small puffs.
- **Dust**: `footDust` (every step, ground-tinted via the tile colour), `landDust` (ring, scales with impact, from impact > 4), skid cloud on hard stops/reversals, wheel/tread trails above 4 m/s. All pooled (`PFX.lit`).
- **Footprints**: `footPrint/footTick/clearFootprints`, one 160-instance quad mesh, prints shrink away after 14 s.

## 0.46.0 — quality pass + in-app Deck updater (Nov 13)
**Bugs fixed** (found by linting all scripts as one program — `eslint` with `no-redeclare`/`no-undef` on the concatenated files in index.html order — plus the PC's `scrapsurvivors-log.txt`):
- **Duplicate global function names** (classic scripts share one scope; the later file silently wins):
  - `thrownTick` existed in bosses.js (enemy hurled by the Warden) and title.js (title-screen toys). The title one won, so hurled enemies never hit the player and stayed flagged `thrown` forever. Title's is now `titleThrownTick`.
  - `addPatch` existed in robot.js (the player's custom patch sticker on the hull) and gemfx.js (poison ground patch). The gem one won: the hull patch never appeared and each robot rebuild added a junk poison patch. Robot's is now `addBodyPatch`.
  - **Before adding any top-level name, grep for it across src/.**
- `rollLootOf(kinds)` re-rolled 40 times and returned the last roll even if it was the wrong kind (arms ~3% of the time, adapters ~47%). `rollCasePart` then built e.g. `mkItem('arm', 'pistol')` → "Cannot read properties of undefined (reading 'name')" in `itemName`. Now `rollLoot(luck, kinds)` filters the pool. (Adapters now really are 6% of case parts.)
- "S is not defined" spam at start-up: input handlers fired before game.js had loaded. `booted()` guard in input.js (`playing`), inventory.js (`benchActive`), title.js.
- Used-up weapons were never greyed in the hangar list (0.45.1). Duplicate `unfold` key in `sfxGap`.
- **Dead code removed**: `lob`, `FIXED_CONE`, `AUTO_ALIGN`, `predictReceive`, `upgradeText`, `deathSting`, `fitArray`, `dropUpgrade`, `moveBody`, `openPerk`, `ownedTypes`, `migrateLvl`, `sameLevelPair`, `ATTR_CHANCE`, `overCustPanel`, `renderXhLeft` timer.

**Deck updater**
- `updater.js` (new, plain Node: fs/zlib + a small tar reader): downloads the repo tarball with Electron's `net.fetch`, unpacks `app/` to `resources/app.new`, swaps folders, copies `deck/*.sh` next to the binary. main.js `update-apply` IPC (Linux packaged only) sends `update-progress` {stage: connect/download/unpack/install/done}. If main.js/preload.js/package.json/updater.js are unchanged the window just reloads (no program restart); otherwise `app.relaunch()`.
- Title screen: "UPDATE NOW" button with live progress; on failure shows the reason + the old "RESTART TO UPDATE".
- `deck/update-lib.sh`: curl/tar run via `clean()` (`env -u LD_PRELOAD -u LD_LIBRARY_PATH`), and curl failures are logged with their message (it used to report "offline" silently). Suspected cause of Gaming Mode not updating — **unconfirmed**, needs the Deck's update-log.txt.
- publish.sh now also copies `updater.js`.

## 0.46.2 — cosmetics fix + secret unlocks (Nov 13)
- **Cosmetic placement on other frames** (`cosmeticAuto` in cosmetics.js): a cosmetic stores the part it was stuck to on the title robot (a random build). On a frame without that part it was dropped at a fixed point that is usually inside the torso (the "cigarette clips into the player" bug). Now a ray is cast at the finished model (down from above for `up` cosmetics, at the upper front — the robot faces **-Z** — otherwise) and it is placed where that lands.
- **Secret cosmetics**: `COSMETICS[k].secret` + `clicks`. Clicking the robot in Customize (each click within 1.2 s of the last): 5th → cigarette, 15th → joint (replaces the cigarette). `unlockCosmetic` adds to `CUSTOM.cosUnlocked` (saved with the other custom data); unlocked ones appear in the Cosmetics shelf (`cosUnlocked(k)`). `titleToast()` announces a first unlock.

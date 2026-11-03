# Scrap Survivors: Handover

A 3D survivors-like robot arena game. You build a robot from parts in the hangar, drop from the sky into a
blocky arena, survive swarms, level up, open cases, beat the Warden and move to the next stage.

This file tracks every change, with dates, plus what anyone picking the project up needs to know.
**Add an entry to the change log for every change.**

---

## Vital information

| | |
|---|---|
| **Name** | Scrap Survivors (formerly *Scrapfall*; folder `ScrapSurvivors`, package `scrapsurvivors`) |
| **Version** | 0.26.0 (`VERSION` in `src/title.js`) |
| **Build system** | **V2 (lower half + torso)**, switched by `BUILD_V2` in `src/config.js`. To go back: set it to `false`, or check out the GitHub branch `pre-build-revamp` (0.25.1). |
| **Owner's folder** | `C:\Users\LukeM\Documents\Scrapfall`. The rename to `Documents\ScrapSurvivors` is pending: run `Documents\Rename to ScrapSurvivors.bat` with the game closed. |
| **Run it** | `Play.bat` (installs three.js, Rapier and Electron on first run, then `npm start`) |
| **Tech** | Electron 33, three.js r128, Rapier 0.14 (WASM physics), WebAudio. No build step. |
| **Errors log** | `scrapsurvivors-log.txt` next to the game (unpackaged) or in `%APPDATA%\ScrapSurvivors` |
| **Saves** | `%APPDATA%\ScrapSurvivors` (Electron userData; copied from the old `scrapfall` folder on first launch) |

### Architecture
- **Scripts:** classic `<script>` files sharing **one global scope**, so watch for name clashes. A later `function x()` silently replaces an earlier one, and a duplicate `const` breaks the whole page. Load order, from `index.html`:
  `three.min.js, config, gfx, post, data, symbols, shapes, terrain, robot, cosmetics, input, player, combat, weaponfx, ragdoll, inventory, ui, music, shop, wcase, title, vendor/rapier, physics, props, worlddetail, game, devtest, windows`
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
  - **Publishing:** `/home/claude/publish.sh` (session helper) copies the current game in and pushes. **Run it after every delivery** so the Deck picks up the change. The version comes from `VERSION` in title.js.
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

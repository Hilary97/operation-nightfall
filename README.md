# Operation Nightfall — 1944

A World War II first-person shooter that runs in the browser, built with **HTML, CSS and JavaScript** on top of [Three.js](https://threejs.org/).
The soldiers use a rigged, animated glTF character (`assets/models/soldier.glb`, see [Credits](#credits)). Everything else is generated in code at runtime: there are no image or audio files, and every texture, vehicle, building, prop and sound is built by the scripts.
The game's interface, dialogue and subtitles are in Spanish.

**Play it:** https://operation-nightfall-cyan.vercel.app

**Play with infinite health and ammo:** https://operation-nightfall-cyan.vercel.app/?god&ammo

## The story

> Normandy, June 6, 1944 — 01:14 hours.

1. **The drop.** You ride a C-47 with your paratrooper squad. Flak lights up the windows, the plane is hit, an engine catches fire and you are thrown out into the night sky.
2. **Lost.** You wake up alone in a forest, with no idea where you are. There is no map and no objective marker. Fire glows through the trees: the wreck of your plane. A compass lies next to you, and the crash site holds a supply crate.
3. **The discovery.** A dirt trail leads away from the wreck. Follow it and you find a sign, *"Achtung! Sperrgebiet"*, and then searchlights. It is a **secret enemy rocket base**.
4. **Clear the base.** Eliminate all 19 soldiers: tower riflemen, patrols, gate guards and officers. Stay out of the searchlights. If you get spotted, the alarm goes off and the whole base hunts you.
5. **The intel.** Search the command bunker for the documents. They hold the rocket launch schedules and a map back to friendly lines.
6. **Go home.** Steal the Kübelwagen in the motor pool and drive down the road (watch out for the roadblock) to **Allied HQ**, which fires green flares.

## Controls

| Action | Key |
| --- | --- |
| Move / sprint / crouch / jump | `W A S D` / `Shift` / `C` / `Space` |
| Aim / fire / aim down sights | Mouse / left click / right click or hold `F` |
| Hold breath (scoped only) | `Shift` while scoped |
| Change scope magnification (sniper, while scoped) | Mouse wheel |
| Reload / switch weapon | `R` / `1` `2` `3` `4` or mouse wheel |
| Grenade / knife (silent kill on unaware enemies) | `G` / `V` |
| Interact, pick up, enter or exit vehicle | `E` |
| Drive | `W S` throttle, `A D` steer, `Space` brake |
| Pause | `Esc` |

### Sights

Each weapon has its own working sights, aligned with the exact bullet path:

- **M1911:** rear notch and front post with three white dots; line up the dots.
- **Thompson M1A1:** rear peep ring with a front blade; put the blade tip in the centre of the ring.
- **Kar98k:** iron sights: a tangent rear V-notch and a hooded front post; sit the post tip in the notch.
- **Springfield M1903A4 (sniper):** a long scope with a mil-dot reticle and two magnifications (8x and 12x). The mouse wheel switches between them while you are scoped; the current level is shown next to the lens. The rifle drifts noticeably while scoped (less when crouched, more when moving); hold `Shift` to steady it for a few seconds. Running out of breath makes the drift worse until you recover.

Mouse sensitivity scales with the zoom, and aiming through the sights shrinks the bullet spread. Firing the rifles from the hip is inaccurate.

### Phones and tablets

The game detects touch screens and shows on-screen controls. Play in landscape (a reminder appears in portrait). Tapping **Iniciar misión** goes fullscreen where the browser allows it. On iPhone, use *Share → Add to Home Screen* for a fullscreen experience.

| Action | Touch |
| --- | --- |
| Move / sprint | Left thumb anywhere on the left side (floating joystick); push to the edge to sprint |
| Look | Drag with the right thumb |
| Fire | **FUEGO**; drag it to keep aiming while you shoot. While aiming (any weapon) it moves under the left thumb, so the right thumb stays free to look |
| Sights / crouch | **MIRA** and **AGACHAR** (toggles) |
| Reload / jump / grenade / knife | **RECARGA**, **SALTO**, **GRANADA**, **CUCHILLO** |
| Pick up, enter or exit vehicle | **USAR** (lights up when something is in reach) |
| Switch weapon (or change sniper zoom while scoped) | Tap the weapon panel (top right) |
| Drive | Joystick: up/down throttle, left/right steer |
| Pause | **❚❚** (also pauses when you leave the app) |

Touch devices start on **Low** (*Bajos*) graphics (no grass, lighter shadows and resolution). You can raise it from the menu on powerful phones. Add `?touch` to the URL to force the touch controls on a desktop.

Weapons: **M1911** pistol, **Thompson M1A1** (from the crash site crate), a **Springfield M1903A4** sniper rifle (in the same supply crate area, a few metres from the Thompson) and a **Kar98k** rifle (at the foot of the north-west watchtower).

## Graphics and tech

- **Rendering:** Three.js WebGL with ACES tone mapping, soft shadows (PCF) from moonlight, exponential fog and HDR lighting.
- **Post-processing:** Unreal bloom plus a custom film shader with grain, vignette, chromatic aberration, a sepia grade, film scratches, a red damage vignette and the concussion blur when you wake up.
- **World:** 900 × 900 m procedural terrain (fractal noise), about 2,000 instanced pines, 16,000 grass tufts, rocks and bushes.
- **Lighting:** a moon with shadows, flickering fire lights, sweeping searchlights with volumetric beams, warm lamps and green signal flares.
- **Effects:** pooled particle systems (fire, smoke, embers, sparks, blood, debris, explosions), travelling bullet tracers and muzzle flashes that light up the scene.
- **Characters:** a rigged glTF soldier (skeleton and animation clips) dressed per faction in code: recoloured uniforms, Stahlhelm and M1 helmets, and rifle, SMG or pistol in hand. Mixer-driven idle, walk, run, aim, hit reaction and death animations; the paratroopers are seated in the C-47 and the HQ allies idle.
- **AI:** patrol, suspicion, combat and search states. Enemies use line-of-sight checks against a spatial-hash collision grid, react to gunfire and explosions, raise the alarm and take cover behind obstacles they bump into.
- **Audio:** fully synthesized with the Web Audio API: gunshots, explosions, flak, a plane engine, wind, a siren, footsteps, a heartbeat, tinnitus, a music pad and a victory fanfare, with stereo panning and generated reverb.

## Project structure

```
index.html        Page, HUD and menus
css/style.css     1940s dossier-style UI
js/main.js        Bootstrapping, render loop, post-processing, input, game states
js/world.js       Terrain, forest, enemy base, crash site, roads, Allied HQ
js/intro.js       C-47 opening cinematic and the fall
js/player.js      Movement, weapons, first-person viewmodels, grenades, knife, driving
js/enemies.js     Soldier AI and the spawn table
js/entities.js    Items, explosive barrels, grenades, drivable Kübelwagen
js/mission.js     Objectives, checkpoints, alarm, explosions, victory
js/models.js      Procedural vehicles, C-47, V-2 rocket, trees, helmets and weapon geometry
js/soldiers.js    glTF soldier loader, faction dressing, weapons and animation controller
assets/models/    soldier.glb and its CC0 license
js/textures.js    Canvas-painted textures
js/fx.js          Particles, tracers, flash lights, film shader, searchlight beams
js/audio.js       Web Audio synthesis
js/collision.js   Spatial-hash grid, raycasts, line of sight
js/touch.js       On-screen joystick and buttons for phones and tablets
```

## Run locally

It is a static site with no build step. ES modules need an HTTP server, so serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Three.js loads from the jsDelivr CDN through an import map.

Debug shortcuts for testing: `?debug=play` (skip the intro at the wake point), `?debug=base` (at the breach in the west wall), `?debug=gate` (in front of the main gate), `?debug=intro`.

Cheats: `?god` (the player takes no damage) and `?ammo` (the magazine never empties). They combine with each other and with debug, e.g. `?god&ammo` or `?debug=play&god`.

## Credits

- **Soldier model and animations:** the figure from the [Low-poly Squad Kit](https://toolbenchdev.com/gamedev/cc0-game-assets/low-poly-squad-kit/) by Toolbench, released under **CC0 1.0** (public domain). The file in `assets/models/soldier.glb` is a trimmed copy; the license text is in `assets/models/LICENSE.txt`.

## Deploy

The site deploys to Vercel as a static project (no framework, no build):

```bash
vercel deploy --prod
```

## Requirements

A browser with WebGL 2: desktop (Chrome, Edge, Firefox, Safari or Brave) with mouse and keyboard, or a recent phone or tablet with touch controls. If the frame rate drops, choose **Gráficos: Medios** or **Bajos** in the menu.

# Operation Nightfall — 1944

A World War II first-person shooter that runs in the browser, built with **HTML, CSS and JavaScript** on top of [Three.js](https://threejs.org/).
There are no image, model or audio files: every texture, model, animation and sound is generated in code at runtime.

**Play it:** https://operation-nightfall.vercel.app

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
| Aim / fire / aim down sights | Mouse / left click / right click |
| Reload / switch weapon | `R` / `1` `2` `3` or mouse wheel |
| Grenade / knife (silent kill on unaware enemies) | `G` / `V` |
| Interact, pick up, enter or exit vehicle | `E` |
| Drive | `W S` throttle, `A D` steer, `Space` brake |
| Pause | `Esc` |

Weapons: **M1911** pistol, **Thompson M1A1** (from the crash site crate) and a **Kar98k** rifle (at the foot of the north-west watchtower).

## Graphics and tech

- **Rendering:** Three.js WebGL with ACES tone mapping, soft shadows (PCF) from moonlight, exponential fog and HDR lighting.
- **Post-processing:** Unreal bloom plus a custom film shader with grain, vignette, chromatic aberration, a sepia grade, film scratches, a red damage vignette and the concussion blur when you wake up.
- **World:** 900 × 900 m procedural terrain (fractal noise), about 2,000 instanced pines, 16,000 grass tufts, rocks and bushes.
- **Lighting:** a moon with shadows, flickering fire lights, sweeping searchlights with volumetric beams, warm lamps and green signal flares.
- **Effects:** pooled particle systems (fire, smoke, embers, sparks, blood, debris, explosions), travelling bullet tracers and muzzle flashes that light up the scene.
- **Characters:** procedurally built and animated soldiers (Stahlhelm and M1 helmets, uniforms, weapons) with walking, aiming, flinching and dying animations.
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
js/models.js      Procedural soldiers, vehicles, C-47, V-2 rocket, trees
js/textures.js    Canvas-painted textures
js/fx.js          Particles, tracers, flash lights, film shader, searchlight beams
js/audio.js       Web Audio synthesis
js/collision.js   Spatial-hash grid, raycasts, line of sight
```

## Run locally

It is a static site with no build step. ES modules need an HTTP server, so serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Three.js loads from the jsDelivr CDN through an import map.

Debug shortcuts for testing: `?debug=play` (skip the intro at the wake point), `?debug=base` (at the breach in the west wall), `?debug=gate` (in front of the main gate), `?debug=intro`.

## Deploy

The site deploys to Vercel as a static project (no framework, no build):

```bash
vercel deploy --prod
```

## Requirements

A desktop browser with WebGL 2 (Chrome, Edge, Firefox, Safari or Brave), plus a mouse and keyboard. If the frame rate drops, choose **Graphics: Medium or Low** in the menu.

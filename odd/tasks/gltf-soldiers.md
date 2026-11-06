Feature: replace the procedural box soldiers with a rigged, animated glTF character.
Branch: feat/gltf-soldiers. Asset: Toolbench "Low-poly Squad Kit" figure.glb (CC0 1.0), 22 bones, 53 clips.
Game: Three.js r0.169 static site, ES modules in js/, CDN importmap, no bundler.

## Specs

- S1 (user, verbatim, option A that was chosen): "Modelos glTF reales (packs CC0 como Quaternius o Kenney) con esqueleto y animaciones de caminar, apuntar y morir."
- S2 Enemy soldiers (26, js/enemies.js) use the glTF character with mixer-driven animation: idle, walk, run by `move` speed; aim blended by `aim` 0..1 on the upper body while legs keep walking; a hit reaction on damage (replaces flinch); the `die` clip once, clamped, on death (replaces the root tip-over).
- S3 WWII look per faction from the existing palette (`PAL` in js/models.js: axis, officer, allied): every figure material recoloured (coat, pants, boots, gear, skin), the existing Stahlhelm / M1 / officer cap geometry attached to the head so it hides the figure's cap, and the existing per-weapon gun geometry (rifle, smg, pistol) held in the right hand socket, with a `muzzle` Object3D at the barrel tip used by `Enemy.fire`.
- S4 Gameplay contracts unchanged: analytic hitboxes in `Enemy.rayHit` (head sphere at +1.7, body cylinder to +1.52), origin at the feet, height about 1.8 m, `this.s.muzzle` world position for tracers, flash and audio.
- S5 Intro (js/intro.js): 10 allied paratroopers seated in the C-47 cabin, head shake, then stand up when `standUp` is set. HQ allies (js/world.js, 5) play an idle with the rifle instead of the static T-pose.
- S6 The model loads during the loading screen (setLoad stage) before enemies, the intro and the world allies are created; a load failure shows the existing "Error: ..." text.
- S7 Performance: skinned figures with shared geometry, shared per-faction materials, `SkeletonUtils.clone` per soldier; no regression in the headless FPS check versus before; GTAO keeps working with skinned meshes.
- S8 Docs: README says models are no longer all generated in code and credits the CC0 asset; LICENSE text for the asset lives next to it.

## Tasks

- T1 [S1,S3,S4,S6,S7,S8] Vendor the trimmed asset (assets/models/soldier.glb + LICENSE), add js/soldiers.js (loader, faction dressing, weapon and muzzle, animation controller), load it in main.js. Route: worker. Commit: 750f857 [done]
- T2 [S2,S4] Wire enemies.js to the controller (locomotion, aim layer, hit, death, muzzle). Route: worker. Commit: 1ecd4f0 [done]
- T3 [S5] Intro seated troops and stand-up, HQ allies idle. Route: worker. Commit: 71c8e38 [done]
- T4 [S7,S8] Remove the dead box builder and poseSoldier, README, visual and FPS verification. Route: worker + parent check. Commit: ae1db39 [done]

## Log

- L1 (user): "vamos con el A" — answering the choice between A (glTF real models, CC0 packs, skeleton and walk/aim/death animations) and B (improve the procedural models).
- L2 (evidence): exploration map: hit detection is analytic and does not depend on meshes; createSoldier callers are enemies.js, intro.js:60-70, world.js:654-662; muzzle used in enemies.js fire(); about 30 meshes per box soldier.
- L3 (decision): asset is the Toolbench Low-poly Squad Kit figure (CC0, rifle and sidearm grip clips, Socket_Hand_R / Socket_Head / Socket_Back). Materials: TeamColour, mE7C9A4 (skin), m2A3A44, m3D4750, m57646E. Height 1.8 m, origin at the feet. Clip durations: idle_rifle 2.4 s, walk_rifle 1.07 s, aim_rifle 1.6 s, die 2.33 s.
- L4 (evidence, T1): soldier.glb 1,846,968 -> 325,036 bytes, 14 clips. Material map: TeamColour = cap/torso/upper arms/thighs (coat), mE7C9A4 = skin, m2A3A44 = goggles (dark), m3D4750 = straps/cuffs/boots, m57646E = forearms/shins (pants). Socket_Hand_R barrel axis is +X; aim/fire clips yaw the hips -34 deg, so split() folds the hips rotation into the spine for the upper-body layer. Preview checked by the parent: helmets seated, guns in hand, aim and walk+aim, die pose.
- L5 (evidence, T2): base/gate screenshots show patrol, aim in combat, tracers from the gun, clamped corpse, reset stands again. Muzzle at aim 1 (height/forward/side m): rifle 1.21/0.94/0.01, smg 1.23/0.74/-0.03, officer pistol 1.40/0.68/-0.12. FPS play/base/gate 71/67/68 vs 77/70/69 baseline (headless, noisy).
- L6 (evidence, T3): seated pose via applySeat bone slerp (thigh Euler [-1.45, 0, PI], shin [-1.5, 0, 0]), rifle across the lap, stand-up seat ramp 1.4 s smoothstep; HQ allies idle, mixers updated within 120 m. Parent viewed the seated cabin and HQ screenshots. FPS 64/68/70.
- L7 (evidence, T4): box builder removed (grep proof: no caller left), README credits. All debug modes boot without page errors. GTAO with skinned meshes: mean 0.976, 3.3 % below 0.7. Load failure shows "Error: No se pudo cargar el modelo de soldado (assets/models/soldier.glb): Failed to fetch", no retry loop. FPS 90/89/89 vs 77/70/69 baseline (headless, noisy). rayHit/damage unchanged in the diff since 4d69105. Verdicts S1-S8 met.

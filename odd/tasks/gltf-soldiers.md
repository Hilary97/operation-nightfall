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

- T1 [S1,S3,S4,S6,S7,S8] Vendor the trimmed asset (assets/models/soldier.glb + LICENSE), add js/soldiers.js (loader, faction dressing, weapon and muzzle, animation controller), load it in main.js. Route: worker. Commit: -
- T2 [S2,S4] Wire enemies.js to the controller (locomotion, aim layer, hit, death, muzzle). Route: worker. Commit: -
- T3 [S5] Intro seated troops and stand-up, HQ allies idle. Route: worker. Commit: -
- T4 [S7,S8] Remove the dead box builder and poseSoldier, README, visual and FPS verification. Route: worker + parent check. Commit: -

## Log

- L1 (user): "vamos con el A" — answering the choice between A (glTF real models, CC0 packs, skeleton and walk/aim/death animations) and B (improve the procedural models).
- L2 (evidence): exploration map: hit detection is analytic and does not depend on meshes; createSoldier callers are enemies.js, intro.js:60-70, world.js:654-662; muzzle used in enemies.js fire(); about 30 meshes per box soldier.
- L3 (decision): asset is the Toolbench Low-poly Squad Kit figure (CC0, rifle and sidearm grip clips, Socket_Hand_R / Socket_Head / Socket_Back). Materials: TeamColour, mE7C9A4 (skin), m2A3A44, m3D4750, m57646E. Height 1.8 m, origin at the feet. Clip durations: idle_rifle 2.4 s, walk_rifle 1.07 s, aim_rifle 1.6 s, die 2.33 s.

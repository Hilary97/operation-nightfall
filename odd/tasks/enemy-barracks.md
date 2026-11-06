# Feature: enemy barracks (Kaserne), tanks, bazooka, minigun, motorcycle
Branch `feat/enemy-barracks` off `main` 7c6c631. Static Three.js game, no test runner.
Workers read until `## Log`.

## Specs
- S1. A new enemy barracks ("nuevo cuartel") exists in the world, separate from the rocket base and from Allied HQ, reachable by road.
- S2. The barracks holds "más soldados" (a new group of enemy soldiers, more than a token few) and "tanques de guerra".
- S3. Tanks are enemies that shoot (user answer: "Enemigos que disparan"): they patrol or guard, turn their turret to the player, fire cannon shells that explode, and can only be destroyed with explosives (rockets do full damage; grenades a little; bullets none).
- S4. Inside the barracks there are places where the player can find "lanza, misiles" and "metralletas mini" — user answer: "Bazooka + minigun". Bazooka fires a visible rocket projectile that explodes; minigun is a belt-fed, spin-up rapid-fire weapon. Both become weapon slots 5 and 6.
- S5. Story order (user answer: "Enemigo, después de los documentos"): after taking the documents, the objective sends the player to the barracks; after the barracks, back to Allied HQ ("lo asaltás y después volvés al Cuartel Aliado en el carro").
- S6. Travel: "para trasladarse, pues moverte en moto y después en el carro" — user answer: "Moto nueva, después el Kübelwagen". A drivable motorcycle with sidecar (BMW R75) waits at the rocket base motor pool for the first leg; the Kübelwagen waits at the barracks for the second leg.
- S7. The game UI stays in Spanish; controls help, README and debug start updated for the new weapons, vehicle and area.

## Tasks
- T1 [S4, S7] Heavy weapons: bazooka + minigun (WDEF, viewmodels, rocket projectile, sounds, Digit5/6, HUD). Route: inline. Commit: bdc9b1b
- T2 [S3] Tanks: model, turret AI, cannon shells, explosion-only damage, wreck. Route: inline. Commit: 41b5b25
- T3 [S1, S2, S4] Barracks world: layout, roads, soldiers, tank placement, weapon pickups. Route: inline. Commit: 8b78e48
- T4 [S5, S6, S7] Motorcycle vehicle, Kübelwagen moved to the barracks, mission flow, HUD vehicle name, help/README/debug spot. Route: inline. Commit: a711e2b
- T5 [all] Headless smoke run + independent verify (Risk: item 6). Route: verify. Commit: evidence only (L7)

## Log
- L1 (user, verbatim): "vamos a agregar nueva funcionalidad en el juego. Necesito que haya un nuevo cuartel en ese cuartel, va a haber más soldados tanques de guer donde en el cuartel, va a haber lugares donde puedas encontrar lanza, misiles y metralletas mini ningún en ese cuartel te necesitas encontrar La ubicación del cuartel que ya está implementado, pero para trasladarse, pues moverte en moto y después en el carro."
- L2 (user answers): Cuartel = "Enemigo, después de los documentos"; Vehículos = "Moto nueva, después el Kübelwagen"; Armas = "Bazooka + minigun"; Tanques = "Enemigos que disparan".
- L3 (decision): the motorcycle replaces the Kübelwagen in the rocket base motor pool; the Kübelwagen moves to the barracks. Leaving the barracks requires destroying its tanks; soldiers there are optional. The minigun is anachronistic for 1944; the user chose it knowingly.
- L4 (evidence): The worker was unavailable ("Writer repository preparation was unavailable"), so T1 and T2 were done inline. Headless Brave runs the game loop at about 0.04 game seconds per real second, so the smoke tests step the updates by hand.
  - T1: 6 weapons and 6 viewmodels. The rocket flies 32 m and explodes. The minigun spin reaches 0.45, 0.91, then 1, fires only once spun up, and drops to 0 when released. No console errors.
  - T2: bullets leave a tank at 520 HP. A tank enters combat and fires a shell at 2.4 s, its turret error is 0 and the shell explodes. A tank's own shell does no damage to it. A grenade takes it to 482 HP, one rocket to 230 HP, and a second rocket destroys it. No console errors.
- L5 (evidence): T3 smoke test.
  - KASERNE_Y is 4.48 and the compound is flat (height range 0). The maximum slope per 2 m step is 0.19 on ROAD2 and 0.11 on ROAD3.
  - There are 15 'kaserne' soldiers and 3 tanks at yard height, and none of them is stuck in a collider.
  - The patrol tank drove 94 m in 60 s and completed its loop.
  - The pickups gave bazooka 1/4 and minigun 200/400.
  - Screenshots of the west gate and the yard looked right. No console errors.
  - The Kübelwagen move is deferred to T4, together with the motorcycle, so every commit stays playable.
- L6 (evidence): T4 flow smoke test with `?debug=ride`.
  - Vehicles: the moto is at (40,40) and the Kübelwagen at (225,66).
  - The prompt reads "[E] Conducir la moto con sidecar". The moto reaches a top speed of 27, and the HUD shows "BMW R75".
  - At the barracks the phase goes ride → kaserne. Destroying the 3 tanks moves it to return, with the flares on.
  - The prompt reads "[E] Conducir el Kübelwagen". Reaching Allied HQ ends the mission (done/victory).
  - Screenshots of the moto in the motor pool and the Kübelwagen at the south gate looked right. No console errors.
  - The debug ride spot was moved to (38,42.2) because the moto was out of the 3.4 m interact reach.
- L7 (independent verify): PASS on S1-S7.
  - Regression checks against main, with deterministic Math.random: hitscan damage for the 4 old weapons, grenade and barrel explosions, the base alarm, the roadblock, Kübelwagen physics and Allied HQ victory are all identical.
  - Terrain: at 24,497 points far from the Kaserne and ROAD2/3 the largest height difference is 7e-15 m.
  - Advisory: ROAD3, like main's ROAD, grazes an HQ sandbag. Victory needs driving round to the south opening or walking in. This was there before the feature.
  - Advisory: tank shells damage other tanks at full strength. Rare.

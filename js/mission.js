import * as THREE from 'three';
import { G } from './state.js';
import { H, ALLIED, BASE, baseDist, WRECK, KASERNE, KASERNE_Y } from './world.js';
import { dropLoot } from './entities.js';
import { rand } from './util.js';

// Mission flow: wake -> explore -> base -> escape -> ride -> kaserne -> return -> done
const KASERNE_POS = new THREE.Vector3(KASERNE.x, KASERNE_Y, KASERNE.z);
const ARMOURY_POS = new THREE.Vector3(198, KASERNE_Y, 62);
export const mission = {
  phase: 'intro',
  checkpoint: null,
  hintT: 0,
  saw: {},

  tanksLeft() {
    return G.tanks.filter((t) => !t.dead).length;
  },

  baseLeft() {
    return G.enemies.filter((e) => e.group === 'base' && !e.dead).length;
  },

  setCheckpoint() {
    const P = G.player;
    this.checkpoint = { x: P.pos.x, z: P.pos.z, yaw: P.yaw };
  },

  startWake() {
    this.phase = 'wake';
    this.hintT = 0;
    G.hud.setObjective('???');
  },

  endWake() {
    this.phase = 'explore';
    this.setCheckpoint();
    G.hud.setObjective('Averigua dónde estás');
    G.hud.subtitle('El avión... se estrelló. Hay fuego allá — tal vez alguien sobrevivió.', 6);
  },

  onThompson() {
    G.hud.notice('THOMPSON M1A1', 'Totalmente automática — equipada');
    setTimeout(() => G.hud.subtitle('No hay sobrevivientes... Ese humo atraerá patrullas. Tengo que moverme — y averiguar dónde demonios estoy.', 7), 2500);
  },

  update(dt) {
    const P = G.player;
    if (G.flags.alarmT > 0) {
      G.flags.alarmT -= dt;
      if (G.flags.alarmT <= 0 && this.baseLeft() > 0) this.triggerAlarm();
    }
    if (G.flags.alarm && G.flags.alarmTime !== undefined) {
      G.flags.alarmTime -= dt;
      if (G.flags.alarmTime <= 0) { G.audio.stopLoop('siren', 3); G.flags.alarmTime = undefined; }
    }
    if (this.phase === 'explore') {
      this.hintT += dt;
      if (!this.saw.sign && P.pos.distanceTo(G.world.signPos) < 9) {
        this.saw.sign = true;
        G.hud.subtitle('"Achtung — Sperrgebiet"... Una zona militar restringida. Sea lo que sea que esconden, está cerca.', 7);
      }
      if (baseDist(P.pos.x, P.pos.z) < 38) this.discoverBase();
      if (this.hintT > 120 && !this.saw.hint) {
        this.saw.hint = true;
        G.hud.subtitle('Reflectores entre los árboles... Había un camino de tierra que salía del lugar del accidente.', 7);
      }
    }
    if (this.phase === 'ride' && Math.hypot(P.pos.x - KASERNE.x, P.pos.z - KASERNE.z) < 75) this.discoverKaserne();
    if (this.phase === 'kaserne' && this.saw.armoury !== true && P.weapons[4].owned) { this.saw.armoury = true; G.hud.setMarker(null); this.updateObjective(); }
    if (this.phase === 'return' && Math.hypot(P.pos.x - ALLIED.x, P.pos.z - ALLIED.z) < 22) this.victory();
  },

  discoverBase() {
    if (this.phase !== 'explore' && this.phase !== 'wake') return;
    this.phase = 'base';
    this.setCheckpoint();
    G.hud.notice('BASE SECRETA ENEMIGA DESCUBIERTA', 'Punto de control alcanzado');
    G.hud.subtitle('Una base de cohetes oculta... Nadie puede saber que estoy aquí. Tengo que acabar con todos ellos.', 8);
    this.updateObjective();
    G.hud.setEnemyCount(this.baseLeft());
    G.audio.startMusic();
  },

  updateObjective() {
    if (this.phase === 'base') G.hud.setObjective(`Elimina a todos los soldados enemigos de la base — quedan ${this.baseLeft()}`);
    if (this.phase === 'kaserne') {
      const left = this.tanksLeft();
      const hint = G.player.weapons[4].owned ? '' : ' · Busca armas pesadas en el depósito (oeste)';
      G.hud.setObjective(`Destruye los tanques del cuartel — quedan ${left}${hint}`);
    }
  },

  discoverKaserne() {
    if (this.phase !== 'ride') return;
    this.phase = 'kaserne';
    this.setCheckpoint();
    G.hud.notice('CUARTEL ENEMIGO', 'Punto de control alcanzado');
    G.hud.subtitle('Panzers... Las balas no les harán nada. Tiene que haber armas pesadas en ese depósito.', 8);
    if (this.tanksLeft() === 0) { this.kaserneCleared(); return; }
    G.hud.setMarker(G.player.weapons[4].owned ? null : ARMOURY_POS);
    this.updateObjective();
  },

  onTankAlert(tk) {
    if (this.phase === 'ride') this.discoverKaserne();
    this.alertTanks(tk.pos, 60);
  },

  // Tanks near a disturbance turn their guns onto the player's last position
  alertTanks(pos, radius) {
    for (const tk of G.tanks) {
      if (tk.dead || tk.state === 'combat' || tk.pos.distanceTo(pos) > radius) continue;
      tk.lastKnown.copy(G.player.aimPoint);
      tk.lastSeenT = G.time;
      tk.state = 'combat';
    }
  },

  onTankDestroyed() {
    G.stats.kills++;
    G.hud.killfeed('Tanque destruido');
    G.hud.notice('TANQUE DESTRUIDO', this.tanksLeft() ? `Quedan ${this.tanksLeft()}` : '');
    if (this.phase === 'ride') this.discoverKaserne();
    if (this.phase === 'kaserne') {
      this.updateObjective();
      if (this.tanksLeft() === 0) this.kaserneCleared();
    }
  },

  kaserneCleared() {
    this.phase = 'return';
    G.hud.notice('BLINDADOS DESTRUIDOS', 'Punto de control alcanzado');
    G.hud.setObjective('Toma el Kübelwagen junto a la puerta sur del cuartel y regresa al cuartel general aliado');
    G.hud.subtitle('Esos Panzers ya no aplastarán a nadie. Hay un Kübelwagen en la puerta sur — el cuartel aliado está al sur por ese camino. Lanzarán bengalas verdes.', 9);
    G.hud.setMarker(ALLIED);
    G.world.flaresOn = true;
    this.setCheckpoint();
  },

  onEnemyAlert(e) {
    for (const o of G.enemies) {
      if (o.dead || o === e || o.state === 'combat' || o.group !== e.group) continue;
      if (o.pos.distanceTo(e.pos) < 35) {
        o.setLast(G.player.aimPoint);
        o.state = 'search';
        o.searchT = 15;
        o.alert = Math.max(o.alert, 0.6);
      }
    }
    if (e.group === 'kaserne') {
      if (this.phase === 'ride') this.discoverKaserne();
      this.alertTanks(e.pos, 60);
    }
    if (e.group === 'base') {
      if (this.phase === 'explore') this.discoverBase();
      if (!G.flags.alarm && G.flags.alarmT <= 0) G.flags.alarmT = 3.5;
    }
  },

  triggerAlarm() {
    if (G.flags.alarm) return;
    G.flags.alarm = true;
    G.flags.alarmTime = 40;
    G.audio.startSiren();
    G.hud.notice('ALARMA', 'Toda la base está en alerta');
    for (const o of G.enemies) {
      if (o.dead || o.group !== 'base' || o.state === 'combat') continue;
      o.setLast(new THREE.Vector3(G.player.pos.x + rand(-8, 8), 0, G.player.pos.z + rand(-8, 8)));
      o.state = 'search';
      o.searchT = 25;
      o.alert = 0.8;
    }
  },

  noise(pos, radius) {
    for (const o of G.enemies) {
      if (o.dead || o.state === 'combat') continue;
      if (Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) < radius) {
        if (o.group === 'kaserne') this.alertTanks(o.pos, 60);
        o.setLast(new THREE.Vector3(pos.x + rand(-5, 5), pos.y, pos.z + rand(-5, 5)));
        o.state = 'search';
        o.searchT = 14;
        o.alert = Math.max(o.alert, 0.7);
      }
    }
  },

  onEnemyKilled(e, head) {
    const S = G.stats;
    S.kills++;
    if (head) S.headshots++;
    const silent = e.state !== 'combat' && e.state !== 'search';
    if (silent) S.silent++;
    G.hud.killfeed(head ? 'TIRO A LA CABEZA' : silent ? 'Enemigo eliminado (desprevenido)' : 'Enemigo eliminado');
    dropLoot(e.pos);
    if (e.group === 'base') {
      if (this.phase === 'explore' || this.phase === 'wake') this.discoverBase();
      const left = this.baseLeft();
      G.hud.setEnemyCount(left);
      this.updateObjective();
      if (left === 0 && this.phase === 'base') this.baseCleared();
    }
  },

  baseCleared() {
    this.phase = 'escape';
    G.audio.stopLoop('siren', 2);
    G.hud.setEnemyCount(null);
    G.hud.notice('BASE DESPEJADA', 'Punto de control alcanzado');
    G.hud.setObjective('Registra el búnker de mando (lado este) en busca de información');
    G.hud.subtitle('Ese era el último. Su búnker de mando debe tener algo que le sirva al Alto Mando.', 7);
    G.intel.hidden = false;
    G.intel.root.visible = true;
    G.hud.setMarker(G.intel.pos);
    this.setCheckpoint();
  },

  takeIntel() {
    this.phase = 'ride';
    G.hud.notice('INFORMACIÓN ASEGURADA', 'Horarios de lanzamiento de cohetes y un mapa de la región');
    G.hud.setObjective('Toma la moto del parque de vehículos y dirígete al cuartel enemigo, al este por el camino');
    G.hud.subtitle('Un mapa... Hay un cuartel blindado al este, sobre el camino. Si sus tanques siguen ahí, aplastarán el avance aliado. En el parque de vehículos hay una moto.', 9);
    G.player.hasCompass = true;
    G.hud.showCompass(true);
    G.hud.setMarker(KASERNE_POS);
    this.setCheckpoint();
  },

  explode(pos, radius, dmg, { antiTank = false, source = null } = {}) {
    const fx = G.fx;
    fx.emit('boom', pos, { size: radius / 8 });
    fx.emit('fire', pos, { count: 22, spread: radius * 0.25, speed: 7, up: 1.5, size: 2.2 });
    fx.emit('bigsmoke', pos, { count: 8, spread: radius * 0.3, speed: 2, up: 1 });
    fx.emit('spark', pos, { count: 26, speed: 18, up: 1 });
    fx.emit('debris', pos, { count: 16, speed: 13, up: 1.5 });
    G.flash.flash(pos, 0xff9a40, 600, 0.6, 70);
    G.audio.explosion(pos);
    const P = G.player;
    const dp = P.pos.distanceTo(pos);
    P.shake = Math.max(P.shake, Math.max(0, 1.3 - dp / 35));
    if (dp < radius && P.alive) P.damage(dmg * (1 - dp / radius) * 0.75, pos, true);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = e.pos.distanceTo(pos);
      if (d < radius) e.damage(dmg * (1 - d / radius) * 1.4, false);
    }
    // Armour shrugs off grenades; rockets and shells do full damage
    for (const tk of G.tanks) {
      if (tk.dead || tk === source) continue;
      const d = tk.distTo(pos);
      if (d < radius) tk.damage(dmg * (1 - d / radius) * (antiTank ? 1 : 0.2));
    }
    this.noise(pos, 90);
    for (const b of G.barrels) {
      if (!b.dead && b.pos.distanceTo(pos) < radius * 0.8) setTimeout(() => b.damage(100), 160 + Math.random() * 200);
    }
  },

  playerDied() {
    G.state = 'dead';
    G.audio.stopLoop('siren', 1);
    setTimeout(() => {
      document.exitPointerLock?.();
      G.hud.showScreen('dead');
    }, 2200);
  },

  respawn() {
    const c = this.checkpoint || { x: G.player.pos.x, z: G.player.pos.z, yaw: 0 };
    G.flags.alarm = false;
    G.flags.alarmT = 0;
    for (const e of G.enemies) if (!e.dead) e.reset();
    for (const tk of G.tanks) tk.reset();
    for (const g of G.grenades) G.scene.remove(g.mesh);
    G.grenades.length = 0;
    for (const p of G.projectiles) G.scene.remove(p.mesh);
    G.projectiles.length = 0;
    G.player.respawn(c.x, c.z, c.yaw);
    if (this.phase === 'base') { this.updateObjective(); G.hud.setEnemyCount(this.baseLeft()); }
    if (this.phase === 'kaserne') this.updateObjective();
  },

  victory() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    G.state = 'victory';
    G.audio.stopLoop('music', 2);
    G.audio.stopLoop('engine', 1);
    G.audio.fanfare();
    const S = G.stats;
    const secs = Math.round((performance.now() - S.startTime) / 1000);
    G.hud.showVictory({
      time: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      kills: S.kills,
      accuracy: S.shots ? Math.round((S.hits / S.shots) * 100) + '%' : '—',
      headshots: S.headshots,
      silent: S.silent,
    });
    document.exitPointerLock?.();
  },
};

G.mission = mission;
export { H, BASE, WRECK };

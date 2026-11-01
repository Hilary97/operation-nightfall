import * as THREE from 'three';
import { G } from './state.js';
import { H, ALLIED, BASE, baseDist, WRECK } from './world.js';
import { dropLoot } from './entities.js';
import { rand } from './util.js';

// Mission flow: wake -> explore -> base -> escape -> return -> done
export const mission = {
  phase: 'intro',
  checkpoint: null,
  hintT: 0,
  saw: {},

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
    G.hud.setObjective('Find out where you are');
    G.hud.subtitle('The plane... it went down. Fire over there — maybe someone survived.', 6);
  },

  onThompson() {
    G.hud.notice('THOMPSON M1A1', 'Fully automatic — equipped');
    setTimeout(() => G.hud.subtitle('No survivors... That smoke will draw patrols. I need to move — and find out where the hell I am.', 7), 2500);
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
        G.hud.subtitle('"Achtung — Sperrgebiet"... A restricted military zone. Whatever they are hiding, it is close.', 7);
      }
      if (baseDist(P.pos.x, P.pos.z) < 38) this.discoverBase();
      if (this.hintT > 120 && !this.saw.hint) {
        this.saw.hint = true;
        G.hud.subtitle('Searchlights through the trees... There was a dirt trail leaving the crash site.', 7);
      }
    }
    if (this.phase === 'return' && Math.hypot(P.pos.x - ALLIED.x, P.pos.z - ALLIED.z) < 22) this.victory();
  },

  discoverBase() {
    if (this.phase !== 'explore' && this.phase !== 'wake') return;
    this.phase = 'base';
    this.setCheckpoint();
    G.hud.notice('ENEMY SECRET BASE DISCOVERED', 'Checkpoint reached');
    G.hud.subtitle('A hidden rocket base... Nobody can know I am here. I have to take every one of them down.', 8);
    this.updateObjective();
    G.hud.setEnemyCount(this.baseLeft());
    G.audio.startMusic();
  },

  updateObjective() {
    if (this.phase === 'base') G.hud.setObjective(`Eliminate all enemy soldiers in the base — ${this.baseLeft()} remaining`);
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
    G.hud.notice('ALARM', 'The whole base is on alert');
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
    G.hud.killfeed(head ? 'HEADSHOT' : silent ? 'Enemy eliminated (unaware)' : 'Enemy eliminated');
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
    G.hud.notice('BASE CLEARED', 'Checkpoint reached');
    G.hud.setObjective('Search the command bunker (east side) for intel');
    G.hud.subtitle('That was the last of them. Their command bunker must have something Command can use.', 7);
    G.intel.hidden = false;
    G.intel.root.visible = true;
    G.hud.setMarker(G.intel.pos);
    this.setCheckpoint();
  },

  takeIntel() {
    this.phase = 'return';
    G.hud.notice('INTEL SECURED', 'Rocket launch schedules and a map of the region');
    G.hud.setObjective('Steal the Kübelwagen in the motor pool and return to Allied HQ');
    G.hud.subtitle('A map... Allied HQ is south-east of here, down the road. They will fire green flares. Time to go home.', 8);
    G.player.hasCompass = true;
    G.hud.showCompass(true);
    G.hud.setMarker(ALLIED);
    G.world.flaresOn = true;
    this.setCheckpoint();
  },

  explode(pos, radius, dmg) {
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
    for (const g of G.grenades) G.scene.remove(g.mesh);
    G.grenades.length = 0;
    G.player.respawn(c.x, c.z, c.yaw);
    if (this.phase === 'base') { this.updateObjective(); G.hud.setEnemyCount(this.baseLeft()); }
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

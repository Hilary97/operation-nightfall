import { G } from './state.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), obj: $('obj-text'), healthFill: $('health-fill'), healthNum: $('health-num'),
      wname: $('weapon-name'), mag: $('ammo-mag'), res: $('ammo-res'), nades: $('grenades'),
      feed: $('killfeed'), prompt: $('prompt'), sub: $('subtitle'), notice: $('notice'),
      count: $('enemy-count'), hit: $('hitmarker'), cross: $('crosshair'), compass: $('compass'),
      dmg: $('damage-indicators'), cine: $('cine'), caption: $('caption'), fade: $('fade'),
    };
    this.compassCanvas = $('compass-canvas');
    this.cctx = this.compassCanvas.getContext('2d');
    this.marker = null;
    this.subT = 0;
    this.noticeT = 0;
    this.hitT = 0;
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  setObjective(t) {
    this.el.obj.textContent = t;
    this.el.obj.parentElement.classList.remove('flash');
    void this.el.obj.offsetWidth;
    this.el.obj.parentElement.classList.add('flash');
  }

  subtitle(t, dur = 5) {
    this.el.sub.textContent = t;
    this.el.sub.classList.add('on');
    this.subT = dur;
    G.audio.radio();
  }

  caption(t) {
    this.el.caption.innerHTML = t || '';
    this.el.caption.classList.toggle('on', !!t);
  }

  cinema(on) { this.el.cine.classList.toggle('on', on); }

  fade(v, ms = 1000) {
    this.el.fade.style.transition = `opacity ${ms}ms ease`;
    this.el.fade.style.opacity = v;
  }

  notice(title, sub = '') {
    this.el.notice.innerHTML = `<div class="n-title">${title}</div>${sub ? `<div class="n-sub">${sub}</div>` : ''}`;
    this.el.notice.classList.remove('on');
    void this.el.notice.offsetWidth;
    this.el.notice.classList.add('on');
    this.noticeT = 4;
  }

  killfeed(t) {
    const d = document.createElement('div');
    d.textContent = t;
    this.el.feed.prepend(d);
    setTimeout(() => d.classList.add('out'), 2500);
    setTimeout(() => d.remove(), 3200);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
  }

  prompt(t) {
    if (this._prompt === t) return;
    this._prompt = t;
    if (t && G.touch) t = 'USE ▸ ' + t.replace(/^\[E\]\s*/, '').split('·')[0].trim();
    this.el.prompt.textContent = t || '';
    this.el.prompt.classList.toggle('on', !!t);
  }

  hitmarker(head, kill) {
    const h = this.el.hit;
    h.className = '';
    void h.offsetWidth;
    h.className = 'on' + (head ? ' head' : '') + (kill ? ' kill' : '');
  }

  setEnemyCount(n) {
    this.el.count.classList.toggle('on', n !== null && n !== undefined);
    if (n !== null && n !== undefined) this.el.count.innerHTML = `<span>${n}</span> HOSTILES`;
  }

  showCompass(on) { this.el.compass.classList.toggle('hidden', !on); }

  setMarker(v) { this.marker = v ? v.clone() : null; }

  damageFrom(deg) {
    const d = document.createElement('div');
    d.className = 'dmg-arc';
    d.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  showScreen(id) {
    for (const s of ['menu', 'pause', 'dead', 'victory', 'awaken']) $(s).classList.toggle('hidden', s !== id);
  }

  hideScreens() { this.showScreen(null); }

  showVictory(s) {
    $('v-time').textContent = s.time;
    $('v-kills').textContent = s.kills;
    $('v-acc').textContent = s.accuracy;
    $('v-head').textContent = s.headshots;
    $('v-silent').textContent = s.silent;
    setTimeout(() => { this.show(false); this.subT = 0; this.el.sub.classList.remove('on'); this.showScreen('victory'); }, 2500);
  }

  update(dt) {
    const P = G.player;
    const hp = Math.max(0, Math.round(P.hp));
    this.el.healthFill.style.width = hp + '%';
    this.el.healthFill.classList.toggle('low', hp < 35);
    this.el.healthNum.textContent = hp;
    const w = P.w;
    this.el.wname.textContent = P.inVehicle ? 'KÜBELWAGEN' : w.name;
    this.el.mag.textContent = P.inVehicle ? '—' : w.mag;
    this.el.res.textContent = P.inVehicle ? '' : w.reserve;
    document.getElementById('ammo').classList.toggle('hidden', !!P.inVehicle);
    this.el.mag.classList.toggle('empty', !P.inVehicle && w.mag === 0);
    this.el.nades.innerHTML = '●'.repeat(P.grenades) + '<small> GRENADES [G]</small>';
    this.el.cross.classList.toggle('hidden', P.ads > 0.6 || !!P.inVehicle);
    const spread = (P.moving ? 22 : 12) * (P.crouching ? 0.8 : 1) * (1 - P.ads) + (P.w.id === 'smg' ? 6 : 0);
    this.el.cross.style.setProperty('--gap', spread.toFixed(1) + 'px');
    this.tick(dt);
    if (!this.el.compass.classList.contains('hidden')) this.drawCompass(P);
  }

  tick(dt) {
    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) this.el.sub.classList.remove('on');
    }
  }

  drawCompass(P) {
    const c = this.cctx, W = this.compassCanvas.width, Hh = this.compassCanvas.height;
    c.clearRect(0, 0, W, Hh);
    const heading = ((-P.yaw * 180) / Math.PI % 360 + 360) % 360;
    const pxPerDeg = W / 180;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = Math.floor((heading - 90) / 5) * 5; d <= heading + 90; d += 5) {
      const x = W / 2 + (d - heading) * pxPerDeg;
      const dd = ((d % 360) + 360) % 360;
      const fade = 1 - Math.abs(d - heading) / 90;
      c.globalAlpha = Math.max(0, fade);
      if (labels[dd] !== undefined) {
        c.fillStyle = dd === 0 ? '#ff6a4a' : '#efe6cc';
        c.font = `bold ${dd % 90 === 0 ? 17 : 12}px Oswald, sans-serif`;
        c.fillText(labels[dd], x, Hh / 2 + 3);
      } else {
        c.fillStyle = '#d8ceb0';
        c.fillRect(x - 0.5, dd % 15 === 0 ? 6 : 10, 1, dd % 15 === 0 ? 10 : 6);
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = '#efe6cc';
    c.fillRect(W / 2 - 1, 0, 2, 7);
    if (this.marker) {
      const b = ((Math.atan2(this.marker.x - P.pos.x, -(this.marker.z - P.pos.z)) * 180) / Math.PI + 360) % 360;
      let delta = b - heading;
      delta = ((delta + 540) % 360) - 180;
      const x = W / 2 + Math.max(-88, Math.min(88, delta)) * pxPerDeg;
      c.fillStyle = '#7dff5a';
      c.beginPath();
      c.moveTo(x, Hh - 2);
      c.lineTo(x - 7, Hh - 12);
      c.lineTo(x + 7, Hh - 12);
      c.fill();
      const dist = Math.round(Math.hypot(this.marker.x - P.pos.x, this.marker.z - P.pos.z));
      $('compass-dist').textContent = dist + ' m';
    } else $('compass-dist').textContent = '';
  }
}

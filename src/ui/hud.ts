// The fight HUD as DOM over the canvas (sharp text at any size, spec 3.1): health bars with a
// trailing damage bar, round pips, the 99-second clock, the 3-bar super meter, the Wahala
// indicator, round/fight/KO banners, combo counters with their damage, COUNTER / PUNISH / TECH!
// call-outs and the super's name when one starts.

import { FPS, INTRO_FRAMES, METER_BAR, WAHALA } from '../sim/constants';
import { character } from '../sim/data/characters';
import type { SimEvent, SimState } from '../sim/types';

function el(tag: string, cls: string, parent: HTMLElement, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  parent.appendChild(e);
  return e;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly sides: HTMLElement[] = [];
  private readonly bars: HTMLElement[] = [];
  private readonly trails: HTMLElement[] = [];
  private readonly pips: HTMLElement[][] = [];
  private readonly combos: HTMLElement[] = [];
  private readonly meters: HTMLElement[][] = [];
  private readonly meterNums: HTMLElement[] = [];
  private readonly wahalas: HTMLElement[] = [];
  private readonly wahalaFills: HTMLElement[] = [];
  private readonly callouts: HTMLElement[] = [];
  private readonly timer: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly superName: HTMLElement;
  private readonly trail = [1, 1];
  private readonly lastCombo = [{ hits: 0, damage: 0, until: 0 }, { hits: 0, damage: 0, until: 0 }];
  private bannerUntil = 0;
  private p2Label = 'P2';

  constructor(parent: HTMLElement, ids: [string, string]) {
    this.root = el('div', 'hud', parent);
    const top = el('div', 'hud-top', this.root);
    const bottom = el('div', 'hud-bottom', this.root);
    ids.forEach((id, i) => {
      const side = el('div', `hud-side hud-side-${i}`, top);
      this.sides.push(side);
      el('div', 'hud-name', side, character(id).name.toUpperCase());
      const frame = el('div', 'hud-bar', side);
      this.trails.push(el('div', 'hud-bar-trail', frame));
      this.bars.push(el('div', 'hud-bar-fill', frame));
      const pips = el('div', 'hud-pips', side);
      this.pips.push([el('span', 'hud-pip', pips), el('span', 'hud-pip', pips)]);
      const w = el('div', 'hud-wahala', side, 'WAHALA!');
      this.wahalas.push(w);
      this.wahalaFills.push(el('div', 'hud-wahala-fill', w));
      this.combos.push(el('div', `hud-combo hud-combo-${i}`, this.root));
      this.callouts.push(el('div', `hud-callout hud-callout-${i}`, this.root));
      if (i === 0) el('div', 'hud-timer', top, '99');

      const meter = el('div', `hud-meter hud-meter-${i}`, bottom);
      const num = el('div', 'hud-meter-num', meter, '0');
      const segs = el('div', 'hud-meter-segs', meter);
      this.meterNums.push(num);
      this.meters.push([0, 1, 2].map(() => el('div', 'hud-meter-fill', el('div', 'hud-meter-seg', segs))));
    });
    this.timer = top.querySelector('.hud-timer') as HTMLElement;
    // the banner and its line beneath stack, so a title that wraps pushes the line down instead of covering it
    const announce = el('div', 'hud-announce', this.root);
    this.banner = el('div', 'hud-banner', announce);
    this.sub = el('div', 'hud-sub', announce);
    this.superName = el('div', 'hud-super', this.root);
  }

  /** What the win screen calls player 2 in a mirror match: "CPU" or "P2". */
  setP2Label(label: string): void {
    this.p2Label = label;
  }

  /** Show a banner for a while (in sim frames). */
  private say(text: string, sub: string, frames: number, now: number): void {
    this.banner.textContent = text;
    this.sub.textContent = sub;
    this.bannerUntil = now + frames;
  }

  /** The winner by character, or by player in a mirror match, where the name alone says nothing. */
  private winnerName(s: SimState): string {
    if (s.matchWinner === null) return '';
    const [a, b] = s.fighters;
    if (a.charId === b.charId) return s.matchWinner === 0 ? 'P1' : this.p2Label;
    return character(s.fighters[s.matchWinner].charId).name.toUpperCase();
  }

  private callout(side: number, text: string, cls: string): void {
    const c = this.callouts[side];
    c.textContent = text;
    c.className = `hud-callout hud-callout-${side} ${cls}`;
    // restart the pop animation
    void c.offsetWidth;
    c.classList.add('show');
  }

  onEvents(events: SimEvent[], s: SimState): void {
    for (const e of events) {
      const att = e.side === 0 ? 1 : 0;
      switch (e.type) {
        case 'round_start': this.say(`ROUND ${s.round}`, '', INTRO_FRAMES - 8, s.frame); break;
        case 'fight': this.say('FIGHT!', '', 45, s.frame); break;
        case 'ko': this.say('K.O.', '', 120, s.frame); break;
        case 'timeout': this.say('TIME', '', 120, s.frame); break;
        case 'match_end': {
          this.say(`${this.winnerName(s)} WINS`, 'Enter: rematch', 100000, s.frame);
          break;
        }
        case 'hit':
          if (e.counter) this.callout(att, 'COUNTER', 'counter');
          else if (e.punish) this.callout(att, 'PUNISH', 'punish');
          break;
        case 'tech': this.callout(e.side, 'TECH!', 'tech'); break;
        case 'flipout': this.callout(e.side, 'FLIP OUT', 'tech'); break;
        case 'armor': this.callout(e.side, 'ARMOUR', 'punish'); break;
        case 'wahala': this.callout(e.side, 'WAHALA MODE!', 'wahala'); break;
        case 'wahala_ready': this.callout(e.side, 'WAHALA!', 'wahala'); break;
        case 'super': {
          const m = character(s.fighters[e.side].charId).moves.find((mv) => mv.id === e.moveId);
          this.superName.textContent = m ? m.name.toUpperCase() : '';
          this.superName.className = `hud-super hud-super-${e.side}`;
          void this.superName.offsetWidth;
          this.superName.classList.add('show');
          break;
        }
        default: break;
      }
    }
  }

  update(s: SimState): void {
    if (s.phase === 'intro' && s.phaseFrame < 4 && s.round === 1 && this.bannerUntil < s.frame) this.say('ROUND 1', '', INTRO_FRAMES - 8, s.frame);
    s.fighters.forEach((f, i) => {
      const share = Math.max(0, f.health / character(f.charId).health);
      this.bars[i].style.width = `${share * 100}%`;
      this.trail[i] = Math.max(share, this.trail[i] - 0.004);
      if (this.trail[i] < share) this.trail[i] = share;
      this.trails[i].style.width = `${this.trail[i] * 100}%`;
      this.pips[i].forEach((p, k) => p.classList.toggle('won', s.wins[i] > k));

      // the combo stays up a moment after it ends, showing its damage
      const c = s.combo[i];
      const shown = this.lastCombo[i];
      if (c.hits >= 2) { shown.hits = c.hits; shown.damage = c.damage; shown.until = s.frame + 50; }
      this.combos[i].textContent = shown.hits >= 2 && s.frame < shown.until ? `${shown.hits} HITS\n${shown.damage} DMG` : '';

      const meter = s.meter[i];
      this.meters[i].forEach((fill, k) => {
        const part = Math.max(0, Math.min(1, (meter - k * METER_BAR) / METER_BAR));
        fill.style.width = `${part * 100}%`;
        fill.classList.toggle('full', part >= 1);
      });
      this.meterNums[i].textContent = String(Math.floor(meter / METER_BAR));

      const w = s.wahala[i];
      const box = this.wahalas[i];
      box.classList.toggle('ready', w.available);
      box.classList.toggle('active', w.active > 0);
      this.wahalaFills[i].style.width = w.active > 0 ? `${(w.active / (WAHALA.flashFrames + WAHALA.durationFrames)) * 100}%` : '0%';
      this.sides[i].classList.toggle('low', w.available);
    });
    this.timer.textContent = String(Math.ceil(s.timer / FPS));
    const showing = s.frame < this.bannerUntil;
    this.banner.style.opacity = showing ? '1' : '0';
    this.sub.style.opacity = showing ? '1' : '0';
  }

  resetBanner(): void {
    this.bannerUntil = 0;
  }
}

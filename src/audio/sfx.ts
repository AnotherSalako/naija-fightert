// Placeholder sound (spec 5.8, 10): every sound is synthesised with Web Audio, so there are no files
// to download. Real recordings replace these later (AUDIO_TODO.md) without touching callers: the
// game only ever says "this event happened". Audio starts on the first key, click or touch, as
// browsers require.

import type { SimEvent } from '../sim/types';

const STRENGTH_LEVEL: Record<string, number> = { light: 0, medium: 1, heavy: 2, special: 2, super: 1 };

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Call from a user gesture. Safe to call many times. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private ready(): AudioContext | null {
    return this.ctx && this.master && !this.muted ? this.ctx : null;
  }

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseBurst(filter: BiquadFilterType, f0: number, f1: number, peak: number, dur: number, delay = 0): void {
    const ctx = this.ready();
    if (!ctx || !this.noise || !this.master) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = 1.2;
    const g = ctx.createGain();
    this.env(g, t, peak, 0.005, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, peak: number, dur: number, delay = 0): void {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.004, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  whoosh(strength = 'light'): void {
    const k = STRENGTH_LEVEL[strength] ?? 0;
    this.noiseBurst('bandpass', 700 + k * 150, 2600, 0.12 + k * 0.05, 0.08 + k * 0.04);
  }

  hit(strength = 'light', counter = false): void {
    const k = STRENGTH_LEVEL[strength] ?? 0;
    this.noiseBurst('lowpass', 2600, 500, 0.35 + k * 0.12, 0.07 + k * 0.05);
    this.tone('sine', 160 - k * 25, 50, 0.45 + k * 0.15, 0.12 + k * 0.08);
    if (counter) {
      this.tone('square', 1250, 900, 0.12, 0.18);
      this.tone('square', 1660, 1200, 0.08, 0.18, 0.02);
    }
  }

  block(): void {
    this.noiseBurst('highpass', 3200, 2400, 0.22, 0.05);
    this.tone('triangle', 900, 700, 0.14, 0.07);
  }

  throwGrab(): void {
    this.noiseBurst('lowpass', 900, 300, 0.3, 0.1);
  }

  tech(): void {
    this.tone('square', 660, 640, 0.14, 0.25);
    this.tone('square', 990, 960, 0.1, 0.25, 0.01);
  }

  ko(): void {
    this.tone('sine', 110, 30, 0.8, 1.1);
    this.noiseBurst('lowpass', 1500, 120, 0.5, 0.6);
  }

  superStart(): void {
    this.tone('sawtooth', 180, 900, 0.18, 0.55);
    this.tone('sine', 360, 1400, 0.12, 0.55, 0.05);
  }

  /** Park Rush: a danfo horn, two notes together. */
  horn(): void {
    this.tone('square', 440, 430, 0.09, 0.22);
    this.tone('square', 554, 545, 0.07, 0.22);
  }

  wahala(): void {
    this.tone('sawtooth', 70, 65, 0.25, 0.9);
    this.tone('sawtooth', 105, 98, 0.18, 0.9);
    this.noiseBurst('bandpass', 400, 4000, 0.2, 0.4);
  }

  step(): void {
    this.noiseBurst('lowpass', 600, 200, 0.12, 0.06);
  }

  bell(): void {
    this.tone('triangle', 1320, 1300, 0.2, 0.6);
    this.tone('sine', 660, 655, 0.15, 0.6);
  }

  /** Play whatever the sim's events this frame call for. `sfxOf` names a move's sound, if it has one. */
  onEvents(events: SimEvent[], sfxOf: (side: number, moveId: string) => string): void {
    if (!this.ready()) return;
    for (const e of events) {
      switch (e.type) {
        case 'whiff':
          if (e.moveId && sfxOf(e.side, e.moveId) === 'horn') this.horn();
          this.whoosh(e.strength);
          break;
        case 'hit': this.hit(e.strength, e.counter || e.punish); break;
        case 'block': this.block(); break;
        case 'armor': this.block(); this.tone('sine', 200, 120, 0.3, 0.15); break;
        case 'throw': this.throwGrab(); break;
        case 'tech': this.tech(); break;
        case 'ko': this.ko(); break;
        case 'super': this.superStart(); break;
        case 'wahala': this.wahala(); break;
        case 'wahala_ready': this.tone('triangle', 520, 780, 0.15, 0.3); break;
        case 'taunt': this.tone('square', 880, 1200, 0.07, 0.08); this.tone('square', 1200, 880, 0.07, 0.08, 0.1); break;
        case 'jump': case 'land': case 'dash': this.step(); break;
        case 'knockdown': this.noiseBurst('lowpass', 800, 100, 0.35, 0.25); break;
        case 'wallbounce': this.hit('heavy'); break;
        case 'fight': this.bell(); break;
        default: break;
      }
    }
  }
}

/** Lightweight Web Audio cues — starts only after user gesture. */

export class AudioCues {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private lastLock = 0;
  private lastStandby = 0;

  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  lockOn(): void {
    const now = performance.now();
    if (now - this.lastLock < 800) return;
    this.lastLock = now;
    this.beep(880, 0.06, 0.04);
    this.beep(1320, 0.05, 0.03, 0.07);
  }

  overdrive(): void {
    this.sweep(200, 900, 0.35, 0.08);
  }

  standby(): void {
    const now = performance.now();
    if (now - this.lastStandby < 2000) return;
    this.lastStandby = now;
    this.beep(220, 0.12, 0.03);
  }

  private beep(
    freq: number,
    duration: number,
    gain: number,
    delay = 0,
  ): void {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private sweep(
    from: number,
    to: number,
    duration: number,
    gain: number,
  ): void {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
}

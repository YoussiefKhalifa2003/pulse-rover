export type BootPhase = 'welcome' | 'loading' | 'error' | 'hidden';

export class BootOverlay {
  readonly root: HTMLElement;
  private btnEl: HTMLButtonElement;
  private statusEl: HTMLElement;
  private onEngage: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'boot-overlay';
    this.root.innerHTML = `
      <div class="boot-panel">
        <div class="boot-brand">PULSE-ROVER</div>
        <p class="boot-tagline">AR desk proving ground</p>
        <p class="boot-help">Draw <strong>one path</strong> first (index finger or mouse). The rover waits and watches. When you finish, it analyzes the nodes (circles on the tether) and drives. Press <strong>C</strong> to clear.</p>
        <p class="boot-status" data-status></p>
        <button type="button" class="boot-cta" data-cta>Engage</button>
        <p class="boot-note">Webcam · Chrome / Edge · point index to paint · mouse drag works too · right-drag erases</p>
      </div>
    `;
    parent.appendChild(this.root);

    this.btnEl = this.root.querySelector('[data-cta]')!;
    this.statusEl = this.root.querySelector('[data-status]')!;

    this.btnEl.addEventListener('click', () => this.onEngage?.());
  }

  onEngageClick(cb: () => void): void {
    this.onEngage = cb;
  }

  setPhase(phase: BootPhase, message = ''): void {
    if (phase === 'hidden') {
      this.root.classList.add('is-hidden');
      return;
    }
    this.root.classList.remove('is-hidden');

    if (phase === 'loading') {
      this.btnEl.disabled = true;
      this.btnEl.textContent = 'Initializing…';
      this.statusEl.textContent = message || 'Starting camera & hand tracker…';
    } else if (phase === 'error') {
      this.btnEl.disabled = false;
      this.btnEl.textContent = 'Retry';
      this.statusEl.textContent = message;
    } else {
      this.btnEl.disabled = false;
      this.btnEl.textContent = 'Engage';
      this.statusEl.textContent = message;
    }
  }
}

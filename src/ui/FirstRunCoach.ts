const STORAGE_KEY = 'pulse-rover-coach-v1';

type CoachEvent = 'pad' | 'maglock' | 'ride' | 'mission';

export class FirstRunCoach {
  private root: HTMLElement;
  private step = 0;
  private dismissed = false;
  private enabled: boolean;

  constructor(parent: HTMLElement) {
    const params = new URLSearchParams(location.search);
    const coachParam = params.get('coach');
    this.enabled = coachParam !== '0' && localStorage.getItem(STORAGE_KEY) !== '1';

    this.root = document.createElement('div');
    this.root.className = 'coach-panel';
    if (!this.enabled) this.root.classList.add('is-hidden');
    parent.appendChild(this.root);
    this.render();
  }

  get active(): boolean {
    return this.enabled && !this.dismissed;
  }

  notify(event: CoachEvent | 'hover' | 'paint' | 'deploy' | 'commit'): void {
    if (!this.active) return;
    const mapped: CoachEvent =
      event === 'hover'
        ? 'pad'
        : event === 'paint' || event === 'deploy' || event === 'commit'
          ? 'mission'
          : event;
    const order: CoachEvent[] = ['pad', 'maglock', 'ride', 'mission'];
    if (order[this.step] === mapped) {
      this.step++;
      if (this.step >= order.length) this.dismiss(true);
      else this.render();
    }
  }

  dismiss(persist: boolean): void {
    this.dismissed = true;
    this.root.classList.add('is-hidden');
    if (persist) localStorage.setItem(STORAGE_KEY, '1');
  }

  private render(): void {
    const copy = [
      'Open a flat palm — MagDock landing pad',
      'Watch evaluate → hesitate → Maglock engaged',
      'Lift your hand — it rides · set down to continue',
      'Optional: pinch-paint · Deploy Core to deliver',
    ];
    this.root.innerHTML = `
      <div class="coach-card">
        <div class="coach-step">${this.step + 1} / 4</div>
        <div class="coach-text">${copy[this.step] ?? ''}</div>
        <button type="button" class="coach-skip" data-skip>Skip</button>
      </div>
    `;
    this.root.querySelector('[data-skip]')?.addEventListener('click', () =>
      this.dismiss(true),
    );
  }
}

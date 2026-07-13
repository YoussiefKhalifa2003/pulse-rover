import { CONFIG } from '../config';
import { dist } from '../utils/math';
import type { Waypoint } from './Waypoint';

export class PlasmaPath {
  private waypoints: Waypoint[] = [];
  private strokeId = 0;
  private strokeOpen = false;
  private lastStrokeEndAt = 0;
  private lastStrokeEndX = 0;
  private lastStrokeEndY = 0;
  private paintX = 0;
  private paintY = 0;
  private paintInit = false;
  /** Stroke id protected from decay while the rover is driving it. */
  private pinnedStrokeId: number | null = null;

  get points(): readonly Waypoint[] {
    return this.waypoints;
  }

  get length(): number {
    return this.waypoints.length;
  }

  clear(): void {
    this.waypoints.length = 0;
    this.strokeOpen = false;
    this.paintInit = false;
    this.pinnedStrokeId = null;
    this.strokeId++;
  }

  pinStroke(strokeId: number): void {
    this.pinnedStrokeId = strokeId;
    // Refresh ages so the ribbon looks fresh for the whole drive
    const now = performance.now();
    for (const w of this.waypoints) {
      if (w.strokeId === strokeId) w.bornAt = now;
    }
  }

  unpinStroke(): void {
    this.pinnedStrokeId = null;
  }

  get pinnedId(): number | null {
    return this.pinnedStrokeId;
  }

  endStroke(): void {
    if (!this.strokeOpen) return;
    this.strokeOpen = false;
    this.paintInit = false;
    this.pruneTinyStroke(this.strokeId);
    this.smoothStroke(this.strokeId);

    const last = this.lastOfStroke(this.strokeId);
    if (last) {
      this.lastStrokeEndAt = performance.now();
      this.lastStrokeEndX = last.x;
      this.lastStrokeEndY = last.y;
    }
  }

  beginStroke(x?: number, y?: number, now?: number): void {
    if (this.strokeOpen) return;

    // Resume previous stroke instead of forking a parallel line
    if (
      x !== undefined &&
      y !== undefined &&
      now !== undefined &&
      now - this.lastStrokeEndAt <= CONFIG.STROKE_RESUME_MS &&
      dist(x, y, this.lastStrokeEndX, this.lastStrokeEndY) <= CONFIG.STROKE_RESUME_PX
    ) {
      this.strokeOpen = true;
      this.paintInit = true;
      this.paintX = x;
      this.paintY = y;
      return;
    }

    this.strokeId++;
    this.strokeOpen = true;
    this.paintInit = false;
  }

  tryAdd(x: number, y: number, now: number): boolean {
    if (!this.strokeOpen) this.beginStroke(x, y, now);

    // Live EMA so the ribbon doesn't zig-zag with tip noise
    if (!this.paintInit) {
      this.paintX = x;
      this.paintY = y;
      this.paintInit = true;
    } else {
      const a = CONFIG.PAINT_POINT_EMA;
      this.paintX = this.paintX * (1 - a) + x * a;
      this.paintY = this.paintY * (1 - a) + y * a;
    }

    const px = this.paintX;
    const py = this.paintY;

    const last = this.lastOfStroke(this.strokeId);
    let spacing: number = CONFIG.WAYPOINT_MIN_DIST_PX;

    if (last) {
      spacing = dist(last.x, last.y, px, py);
      if (spacing < CONFIG.WAYPOINT_MIN_DIST_PX) return false;
    }

    this.waypoints.push({
      x: px,
      y: py,
      bornAt: now,
      spacingHint: Math.min(spacing, CONFIG.DENSITY_CRUISE_SPACING * 1.5),
      strokeId: this.strokeId,
    });

    while (this.waypoints.length > CONFIG.MAX_WAYPOINTS) {
      this.waypoints.shift();
    }
    return true;
  }

  eraseNear(x: number, y: number, radius: number): number {
    const before = this.waypoints.length;
    this.waypoints = this.waypoints.filter((w) => dist(x, y, w.x, w.y) > radius);
    return before - this.waypoints.length;
  }

  update(now: number): void {
    const life = CONFIG.PATH_LIFETIME_MS;
    const pinned = this.pinnedStrokeId;
    this.waypoints = this.waypoints.filter((w) => {
      if (pinned !== null && w.strokeId === pinned) return true;
      return now - w.bornAt < life;
    });
  }

  ageOf(w: Waypoint, now: number): number {
    if (this.pinnedStrokeId !== null && w.strokeId === this.pinnedStrokeId) {
      // Keep pinned route visually energetic
      return Math.min(0.25, Math.max(0, (now - w.bornAt) / CONFIG.PATH_LIFETIME_MS) * 0.15);
    }
    return Math.min(1, Math.max(0, (now - w.bornAt) / CONFIG.PATH_LIFETIME_MS));
  }

  nearest(x: number, y: number, maxDist: number): Waypoint | null {
    let best: Waypoint | null = null;
    let bestD = maxDist;
    for (const w of this.waypoints) {
      const d = dist(x, y, w.x, w.y);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  nearestIndex(x: number, y: number, maxDist: number): number {
    let best = -1;
    let bestD = maxDist;
    for (let i = 0; i < this.waypoints.length; i++) {
      const w = this.waypoints[i];
      const d = dist(x, y, w.x, w.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Prefer oldest stroke, then nearest point on it — keeps rover from thrashing. */
  pickStrokeStart(x: number, y: number, preferStrokeId: number | null): number {
    if (this.waypoints.length === 0) return -1;

    if (preferStrokeId !== null) {
      const onStroke = this.nearestIndexOnStroke(x, y, preferStrokeId, Infinity);
      if (onStroke >= 0) return onStroke;
    }

    let oldest = Infinity;
    let oldestId = -1;
    for (const w of this.waypoints) {
      if (w.bornAt < oldest) {
        oldest = w.bornAt;
        oldestId = w.strokeId;
      }
    }
    if (oldestId < 0) return this.nearestIndex(x, y, Infinity);
    return this.nearestIndexOnStroke(x, y, oldestId, Infinity);
  }

  nearestIndexOnStroke(
    x: number,
    y: number,
    strokeId: number,
    maxDist: number,
  ): number {
    let best = -1;
    let bestD = maxDist;
    for (let i = 0; i < this.waypoints.length; i++) {
      const w = this.waypoints[i];
      if (w.strokeId !== strokeId) continue;
      const d = dist(x, y, w.x, w.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  strokeStillExists(strokeId: number): boolean {
    return this.waypoints.some((w) => w.strokeId === strokeId);
  }

  /** First array index of a stroke (true path start — not nearest). */
  firstIndexOfStroke(strokeId: number): number {
    for (let i = 0; i < this.waypoints.length; i++) {
      if (this.waypoints[i].strokeId === strokeId) return i;
    }
    return -1;
  }

  /** Newest finished stroke id (last point's stroke). */
  latestStrokeId(): number | null {
    if (this.waypoints.length === 0) return null;
    return this.waypoints[this.waypoints.length - 1].strokeId;
  }

  /** Ordered copy of one stroke's points for deterministic driving. */
  copyStroke(strokeId: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const w of this.waypoints) {
      if (w.strokeId === strokeId) out.push({ x: w.x, y: w.y });
    }
    return out;
  }

  get(i: number): Waypoint | null {
    return this.waypoints[i] ?? null;
  }

  pursuitTarget(
    x: number,
    y: number,
    fromIndex: number,
    lookahead: number,
    strokeId: number | null,
  ): { point: Waypoint; index: number } | null {
    if (this.waypoints.length === 0) return null;

    let idx = fromIndex;
    if (idx < 0 || idx >= this.waypoints.length) {
      idx =
        strokeId !== null
          ? this.nearestIndexOnStroke(x, y, strokeId, Infinity)
          : this.nearestIndex(x, y, Infinity);
      if (idx < 0) return null;
    }

    // Stay on committed stroke
    if (strokeId !== null && this.waypoints[idx].strokeId !== strokeId) {
      idx = this.nearestIndexOnStroke(x, y, strokeId, Infinity);
      if (idx < 0) return null;
    }

    const stroke = this.waypoints[idx].strokeId;
    let traveled = 0;
    let prev = this.waypoints[idx];
    let i = idx;

    while (i + 1 < this.waypoints.length && this.waypoints[i + 1].strokeId === stroke) {
      const next = this.waypoints[i + 1];
      const seg = dist(prev.x, prev.y, next.x, next.y);
      if (traveled + seg >= lookahead) {
        const t = (lookahead - traveled) / Math.max(1e-6, seg);
        return {
          point: {
            x: prev.x + (next.x - prev.x) * t,
            y: prev.y + (next.y - prev.y) * t,
            bornAt: next.bornAt,
            spacingHint: next.spacingHint,
            strokeId: stroke,
          },
          index: i + 1,
        };
      }
      traveled += seg;
      prev = next;
      i++;
    }

    return { point: this.waypoints[i], index: i };
  }

  spacingNearIndex(index: number, window = 8): number {
    if (index < 0 || index >= this.waypoints.length) {
      return CONFIG.DENSITY_CRUISE_SPACING;
    }
    const stroke = this.waypoints[index].strokeId;
    let sum = 0;
    let count = 0;
    const lo = Math.max(0, index - window);
    const hi = Math.min(this.waypoints.length - 1, index + window);
    for (let i = lo; i <= hi; i++) {
      if (this.waypoints[i].strokeId !== stroke) continue;
      sum += this.waypoints[i].spacingHint;
      count++;
    }
    return count ? sum / count : CONFIG.DENSITY_CRUISE_SPACING;
  }

  /** Absorb only on the active stroke so other ribbons stay intact. */
  absorbNearOnStroke(
    x: number,
    y: number,
    radius: number,
    strokeId: number | null,
  ): number {
    const before = this.waypoints.length;
    this.waypoints = this.waypoints.filter((w) => {
      if (strokeId !== null && w.strokeId !== strokeId) return true;
      return dist(x, y, w.x, w.y) > radius;
    });
    return before - this.waypoints.length;
  }

  absorbNear(x: number, y: number, radius: number): number {
    return this.absorbNearOnStroke(x, y, radius, null);
  }

  hasPoints(): boolean {
    return this.waypoints.length > 0;
  }

  private lastOfStroke(strokeId: number): Waypoint | null {
    for (let i = this.waypoints.length - 1; i >= 0; i--) {
      if (this.waypoints[i].strokeId === strokeId) return this.waypoints[i];
    }
    return null;
  }

  private pruneTinyStroke(strokeId: number): void {
    const count = this.waypoints.filter((w) => w.strokeId === strokeId).length;
    if (count > 0 && count < CONFIG.MIN_STROKE_POINTS) {
      this.waypoints = this.waypoints.filter((w) => w.strokeId !== strokeId);
    }
  }

  private smoothStroke(strokeId: number): void {
    const iters = CONFIG.PATH_SMOOTH_ITERS;
    if (iters <= 0) return;
    const idxs: number[] = [];
    for (let i = 0; i < this.waypoints.length; i++) {
      if (this.waypoints[i].strokeId === strokeId) idxs.push(i);
    }
    if (idxs.length < 3) return;

    for (let n = 0; n < iters; n++) {
      const copy = idxs.map((i) => ({
        x: this.waypoints[i].x,
        y: this.waypoints[i].y,
      }));
      for (let k = 1; k < idxs.length - 1; k++) {
        const i = idxs[k];
        this.waypoints[i].x =
          copy[k].x * 0.4 + (copy[k - 1].x + copy[k + 1].x) * 0.3;
        this.waypoints[i].y =
          copy[k].y * 0.4 + (copy[k - 1].y + copy[k + 1].y) * 0.3;
      }
    }
  }
}

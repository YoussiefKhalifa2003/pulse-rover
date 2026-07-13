export interface Waypoint {
  x: number;
  y: number;
  bornAt: number;
  /** Distance to previous waypoint when spawned (px). */
  spacingHint: number;
  /** Same id = one continuous stroke; different ids are not drawn connected. */
  strokeId: number;
}

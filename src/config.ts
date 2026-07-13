/** Central tunables for Pulse-Rover. */

export const CONFIG = {
  CAMERA_WIDTH: 1280,
  CAMERA_HEIGHT: 720,
  CAMERA_FPS: 30,

  // Path / plasma tether — prefer one smooth ribbon
  PATH_LIFETIME_MS: 20_000,
  /** Active drive stroke never decays until the rover finishes it. */
  PIN_ACTIVE_ROUTE: true,
  WAYPOINT_MIN_DIST_PX: 18,
  MAX_WAYPOINTS: 350,
  STROKE_BREAK_PX: 80,
  /** Resume same stroke if tip reappears nearby within this window. */
  STROKE_RESUME_MS: 420,
  STROKE_RESUME_PX: 70,
  /** Drop accidental flick strokes. */
  MIN_STROKE_POINTS: 4,
  ERASE_RADIUS_PX: 44,
  PATH_SMOOTH_ITERS: 3,
  /** Live EMA toward new tip while painting (0–1). */
  PAINT_POINT_EMA: 0.38,

  // Paint gate — sticky stroke; long end debounce (draw-then-drive)
  INDEX_EXTEND_ON: 0.068,
  INDEX_EXTEND_OFF: 0.032,
  PAINT_START_HOLD_MS: 70,
  PAINT_END_HOLD_MS: 480,
  /** GameApp waits this long after paint ends before releasing the rover. */
  DRIVE_COMMIT_MS: 420,
  MIN_HAND_PRESENCE: 0.55,
  HAND_LOST_GRACE_MS: 280,

  // Tip filtering
  MEDIAN_WINDOW: 7,
  ONE_EURO_MIN_CUTOFF: 0.7,
  ONE_EURO_BETA: 0.004,
  ONE_EURO_D_CUTOFF: 1.0,
  TIP_BLEND_DIP: 0.35,
  TIP_MAX_JUMP_PX: 70,

  // Rover — constant-speed sequential waypoint drive
  LOCK_RADIUS_PX: 320,
  LOOKAHEAD_NODES: 1,
  WAYPOINT_REACH_PX: 36,
  WAYPOINT_PASS_PX: 52,
  ABSORB_RADIUS_PX: 34,
  SEEK_GAP_RADIUS_PX: 200,
  ROVER_ACCEL: 140,
  ROVER_CRUISE_SPEED: 105,
  ROVER_APPROACH_SPEED: 115,
  ROVER_MAX_SPEED: 105,
  ROVER_CRAWL_SPEED: 105,
  ROVER_TURN_RATE: 1.8,
  ROVER_TURN_SMOOTH: 5,
  ROVER_SPEED_SMOOTH: 6,
  DENSITY_CRAWL_SPACING: 16,
  DENSITY_CRUISE_SPACING: 44,
  CHARGE_PER_ABSORB: 0.04,
  CHARGE_DRAIN_IDLE: 0.008,
  EDGE_MARGIN_PX: 60,
  RECON_HOME_PULL: 0.5,
  STICKY_STROKE: true,
  /** Disable sudden overdrive while following for consistent feel. */
  OVERDRIVE_ENABLED: false,

  // States
  RECON_BURST_SPEED: 36,
  RECON_BURST_MS: 380,
  RECON_PAUSE_MS: 1800,
  STANDBY_AFTER_MS: 25_000,
  OVERDRIVE_MS: 2_800,
  OVERDRIVE_SPEED_MULT: 1.7,
  OVERDRIVE_CHARGE_THRESHOLD: 1,

  // Visuals
  UNDERGLOW_COLOR: { r: 0, g: 220, b: 255 },
  UNDERGLOW_BOOST_COLOR: { r: 255, g: 140, b: 40 },
  ROVER_SCALE: 1.15,

  CLEAN_QUERY: 'clean',
} as const;

export type Config = typeof CONFIG;

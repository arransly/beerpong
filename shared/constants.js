// All distances in metres, times in seconds unless suffixed with Ms.
// World axes: x = across the table, y = up, z = along the table (net at z = 0).
// Team 0 (Red) defends the z < 0 end, Team 1 (Blue) defends the z > 0 end.

export const TABLE = {
  length: 2.74,
  width: 1.525,
  height: 0.76,
  thickness: 0.03,
};

export const HALF_L = TABLE.length / 2;
export const HALF_W = TABLE.width / 2;

export const NET = {
  height: 0.1525,
  overhang: 0.1525,
  thickness: 0.01,
};

export const BALL = {
  radius: 0.02,
};

export const PADDLE = {
  radius: 0.085,
  hitRadius: 0.17,
  restHeight: 0.22,
  maxSpeed: 9,
};

export const GLASS = {
  radiusTop: 0.042,
  radiusBottom: 0.032,
  height: 0.15,
  wall: 0.004,
  insetX: 0.13,
  insetZ: 0.16,
};

export const SIPS_PER_GLASS = 5;
export const POINTS_PER_SIP = 1;
export const POINTS_PER_DOWN = 3;

export const PHYSICS = {
  gravity: -9.81,
  drag: 0.08,
  tableRestitution: 0.88,
  tableFriction: 0.97,
  netRestitution: 0.15,
  glassRestitution: 0.35,
  curveDecay: 1.5,
  // Slow-motion factor for the ball: shots keep the same arc and landing spot
  // but take longer to arrive. 1 = real table tennis speed.
  ballTimeScale: 0.65,
  tickRate: 60,
  substeps: 4,
  snapshotRate: 30,
};

export const ROOM = {
  maxSlots: 4,
  maxSpectators: 8,
  codeLength: 5,
  disconnectGraceMs: 15000,
  swapCountdownMs: 3000,
  pointPauseMs: 1600,
  autoServeMs: 8000,
  maxNameLength: 16,
};

export const TEAMS = [
  { id: 0, name: 'Red', color: '#ff5a36', side: -1 },
  { id: 1, name: 'Blue', color: '#2fb8ff', side: 1 },
];

// xSign: which side of the table (left/right from the centre line) the corner is on.
export const SLOTS = [
  { id: 0, team: 0, side: -1, xSign: -1 },
  { id: 1, team: 0, side: -1, xSign: 1 },
  { id: 2, team: 1, side: 1, xSign: 1 },
  { id: 3, team: 1, side: 1, xSign: -1 },
];

// Order new joiners are seated in, so two players end up as a 1v1.
export const SEAT_ORDER = [0, 2, 1, 3];

export const partnerSlot = (slot) => (slot % 2 === 0 ? slot + 1 : slot - 1);
export const teamSlots = (team) => SLOTS.filter((s) => s.team === team).map((s) => s.id);
export const sideToTeam = (side) => (side < 0 ? 0 : 1);

export function glassPosition(slot) {
  const s = SLOTS[slot];
  return {
    x: s.xSign * (HALF_W - GLASS.insetX),
    y: TABLE.height,
    z: s.side * (HALF_L - GLASS.insetZ),
  };
}

export function paddleZone(slot, partnerActive) {
  const s = SLOTS[slot];
  const reachX = HALF_W + 0.5;
  let minX = -reachX;
  let maxX = reachX;
  if (partnerActive) {
    if (s.xSign < 0) maxX = 0.15;
    else minX = -0.15;
  }
  const near = 0.25;
  const far = HALF_L + 0.9;
  const minZ = s.side < 0 ? -far : near;
  const maxZ = s.side < 0 ? -near : far;
  return { minX, maxX, minZ, maxZ };
}

export function clampToZone(x, z, zone) {
  return {
    x: Math.min(zone.maxX, Math.max(zone.minX, x)),
    z: Math.min(zone.maxZ, Math.max(zone.minZ, z)),
  };
}

// Paddle height follows the ball when it is on the paddle's half so players
// only have to steer in two dimensions.
export function autoPaddleHeight(ballPos, side) {
  const rest = TABLE.height + PADDLE.restHeight;
  if (!ballPos || Math.sign(ballPos.z) !== side) return rest;
  return Math.min(TABLE.height + 0.9, Math.max(TABLE.height + 0.04, ballPos.y));
}

export function restPaddlePosition(slot) {
  const s = SLOTS[slot];
  return {
    x: s.xSign * HALF_W * 0.5,
    y: TABLE.height + PADDLE.restHeight,
    z: s.side * (HALF_L + 0.2),
  };
}

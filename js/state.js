// Shared game context. Modules read and write through this single object
// to avoid circular import chains.
const params = new URLSearchParams(location.search);
const touch = params.has('touch') || matchMedia('(pointer: coarse)').matches;

export const G = {
  state: 'loading',
  touch,
  time: 0,
  debug: new URLSearchParams(location.search).has('debug'),
  settings: { sens: 1, quality: touch ? 'low' : 'high', difficulty: 1 },
  input: {
    keys: new Set(),
    pressed: new Set(),
    mouse: { left: false, right: false, dx: 0, dy: 0, wheel: 0, clicked: false },
    // Analog movement from the touch joystick: x = right, y = forward.
    axis: { x: 0, y: 0, sprint: false },
  },
  enemies: [],
  items: [],
  barrels: [],
  grenades: [],
  vehicles: [],
  flags: { alarm: false, alarmT: 0 },
  stats: { kills: 0, shots: 0, hits: 0, headshots: 0, silent: 0, startTime: 0 },
};

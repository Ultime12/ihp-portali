export const SNAKE_CONFIG = Object.freeze({
  columns: 20,
  rows: 24,
  scorePerFood: 50,
  defaultTargetScore: 1000,
  baseTickMs: 122,
  minTickMs: 72,
  speedStepMs: 5,
  foodsPerSpeedStep: 3,
  maxTicks: 4000,
  maxEvents: 2000
});

const SNAKE_DIRECTIONS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
});

function snakeSeededUnit(seed, index) {
  let value = (Number(seed) + Math.imul(index + 11, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}

function snakeCellKey(cell) {
  return `${cell.x}:${cell.y}`;
}

function spawnSnakeFood(state) {
  const occupied = new Set(state.body.map(snakeCellKey));
  const available = [];
  for (let y = 0; y < SNAKE_CONFIG.rows; y += 1) {
    for (let x = 0; x < SNAKE_CONFIG.columns; x += 1) {
      if (!occupied.has(`${x}:${y}`)) available.push({ x, y });
    }
  }
  if (!available.length) {
    state.alive = false;
    state.outcome = "won";
    return;
  }
  const index = Math.floor(snakeSeededUnit(state.seed, state.foodIndex) * available.length);
  state.food = available[Math.min(index, available.length - 1)];
  state.foodIndex += 1;
}

export function snakeTickDuration(foodsEaten = 0) {
  const stage = Math.floor(Math.max(0, foodsEaten) / SNAKE_CONFIG.foodsPerSpeedStep);
  return Math.max(SNAKE_CONFIG.minTickMs, SNAKE_CONFIG.baseTickMs - stage * SNAKE_CONFIG.speedStepMs);
}

export function createSnakeState(seed, targetScore = SNAKE_CONFIG.defaultTargetScore) {
  const normalizedSeed = Math.max(1, Math.min(2147483646, Math.trunc(Number(seed) || 1)));
  const normalizedTarget = Math.max(
    SNAKE_CONFIG.scorePerFood,
    Math.min(5000, Math.ceil(Number(targetScore || SNAKE_CONFIG.defaultTargetScore) / SNAKE_CONFIG.scorePerFood) * SNAKE_CONFIG.scorePerFood)
  );
  const state = {
    seed: normalizedSeed,
    targetScore: normalizedTarget,
    body: [{ x: 10, y: 12 }, { x: 9, y: 12 }, { x: 8, y: 12 }],
    direction: "right",
    food: null,
    foodIndex: 0,
    foodsEaten: 0,
    score: 0,
    tick: 0,
    elapsedMs: 0,
    eventIndex: 0,
    alive: true,
    outcome: "playing"
  };
  spawnSnakeFood(state);
  return state;
}

function snakeOpposite(first, second) {
  const a = SNAKE_DIRECTIONS[first];
  const b = SNAKE_DIRECTIONS[second];
  return a.x + b.x === 0 && a.y + b.y === 0;
}

export function normalizeSnakeEvents(values) {
  if (!Array.isArray(values) || values.length > SNAKE_CONFIG.maxEvents) return null;
  const normalized = [];
  for (const item of values) {
    const tick = Number(item?.tick);
    const direction = String(item?.direction || "");
    if (!Number.isInteger(tick) || tick < 1 || tick > SNAKE_CONFIG.maxTicks || !SNAKE_DIRECTIONS[direction]) return null;
    if (normalized.length && tick <= normalized.at(-1).tick) return null;
    normalized.push({ tick, direction });
  }
  return normalized;
}

function stepSnake(state, events) {
  if (!state.alive) return state;
  const nextTick = state.tick + 1;
  const nextEvent = events[state.eventIndex];
  if (nextEvent?.tick === nextTick) {
    if (!snakeOpposite(state.direction, nextEvent.direction)) state.direction = nextEvent.direction;
    state.eventIndex += 1;
  }

  const vector = SNAKE_DIRECTIONS[state.direction];
  const head = state.body[0];
  const nextHead = { x: head.x + vector.x, y: head.y + vector.y };
  const eating = state.food && nextHead.x === state.food.x && nextHead.y === state.food.y;
  const collisionBody = eating ? state.body : state.body.slice(0, -1);
  const wallCollision =
    nextHead.x < 0 || nextHead.x >= SNAKE_CONFIG.columns ||
    nextHead.y < 0 || nextHead.y >= SNAKE_CONFIG.rows;
  const selfCollision = collisionBody.some((cell) => cell.x === nextHead.x && cell.y === nextHead.y);

  state.elapsedMs += snakeTickDuration(state.foodsEaten);
  state.tick = nextTick;
  if (wallCollision || selfCollision) {
    state.alive = false;
    state.outcome = "crashed";
    return state;
  }

  state.body.unshift(nextHead);
  if (eating) {
    state.foodsEaten += 1;
    state.score = state.foodsEaten * SNAKE_CONFIG.scorePerFood;
    if (state.score >= state.targetScore) {
      state.alive = false;
      state.outcome = "won";
      return state;
    }
    spawnSnakeFood(state);
  } else {
    state.body.pop();
  }
  return state;
}

export function advanceSnake(state, targetTick, directionEvents = []) {
  const target = Math.max(state.tick, Math.min(SNAKE_CONFIG.maxTicks, Math.trunc(Number(targetTick) || 0)));
  while (state.alive && state.tick < target) stepSnake(state, directionEvents);
  if (state.alive && state.tick >= SNAKE_CONFIG.maxTicks) {
    state.alive = false;
    state.outcome = "timeout";
  }
  return state;
}

export function verifySnakeRun(seed, directionEvents, finalTick, targetScore) {
  const events = normalizeSnakeEvents(directionEvents);
  const tick = Number(finalTick);
  if (!events || !Number.isInteger(tick) || tick < 1 || tick > SNAKE_CONFIG.maxTicks) {
    return { valid: false, reason: "invalid_run" };
  }
  if (events.length && events.at(-1).tick > tick) return { valid: false, reason: "future_event" };

  const state = createSnakeState(seed, targetScore);
  advanceSnake(state, tick, events);
  if (state.alive || state.tick !== tick) return { valid: false, reason: "unfinished_run" };
  return {
    valid: true,
    score: state.score,
    foodsEaten: state.foodsEaten,
    eventCount: events.length,
    finalTick: state.tick,
    durationMs: state.elapsedMs,
    won: state.outcome === "won",
    outcome: state.outcome
  };
}

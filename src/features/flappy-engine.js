export const FLAPPY_CONFIG = Object.freeze({
  width: 420,
  height: 720,
  groundY: 688,
  birdX: 112,
  birdRadius: 14,
  gravity: 1500,
  flapVelocity: -455,
  pipeWidth: 66,
  baseGap: 134,
  minGap: 112,
  baseSpeed: 210,
  maxSpeed: 252,
  spawnIntervalMs: 1380,
  firstPipeAtMs: 900,
  tickMs: 1000 / 120,
  scorePerPipe: 400,
  targetScore: 10000,
  maxDurationMs: 180000,
  maxFlaps: 1200,
  minimumFlapIntervalMs: 68
});

function seededUnit(seed, index) {
  let value = (Number(seed) + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}

function difficultyFor(pipesPassed) {
  const stage = Math.floor(Math.max(0, pipesPassed) / 4);
  return {
    speed: Math.min(FLAPPY_CONFIG.maxSpeed, FLAPPY_CONFIG.baseSpeed + stage * 6),
    gap: Math.max(FLAPPY_CONFIG.minGap, FLAPPY_CONFIG.baseGap - stage * 3)
  };
}

function spawnPipe(state) {
  const { gap } = difficultyFor(state.pipesPassed);
  const edge = 74;
  const minimum = edge + gap / 2;
  const maximum = FLAPPY_CONFIG.groundY - edge - gap / 2;
  const gapY = minimum + seededUnit(state.seed, state.pipeIndex) * (maximum - minimum);
  state.pipes.push({
    index: state.pipeIndex,
    x: FLAPPY_CONFIG.width + 28,
    gapY,
    gap,
    passed: false
  });
  state.pipeIndex += 1;
  state.nextPipeAtMs += FLAPPY_CONFIG.spawnIntervalMs;
}

function collidesWithPipe(state, pipe) {
  const left = pipe.x;
  const right = pipe.x + FLAPPY_CONFIG.pipeWidth;
  const birdLeft = FLAPPY_CONFIG.birdX - FLAPPY_CONFIG.birdRadius;
  const birdRight = FLAPPY_CONFIG.birdX + FLAPPY_CONFIG.birdRadius;
  if (birdRight <= left || birdLeft >= right) return false;
  const gapTop = pipe.gapY - pipe.gap / 2;
  const gapBottom = pipe.gapY + pipe.gap / 2;
  return state.birdY - FLAPPY_CONFIG.birdRadius <= gapTop ||
    state.birdY + FLAPPY_CONFIG.birdRadius >= gapBottom;
}

export function createFlappyState(seed) {
  const normalizedSeed = Math.max(1, Math.min(2147483646, Math.trunc(Number(seed) || 1)));
  return {
    seed: normalizedSeed,
    timeMs: 0,
    birdY: FLAPPY_CONFIG.height * 0.45,
    velocityY: 0,
    rotation: 0,
    pipes: [],
    pipeIndex: 0,
    nextPipeAtMs: FLAPPY_CONFIG.firstPipeAtMs,
    pipesPassed: 0,
    score: 0,
    alive: true,
    outcome: "playing",
    flapIndex: 0
  };
}

function applyFlap(state) {
  state.velocityY = FLAPPY_CONFIG.flapVelocity;
  state.rotation = -0.45;
}

function integrate(state, deltaMs) {
  if (!state.alive || deltaMs <= 0) return;
  const deltaSeconds = deltaMs / 1000;
  const { speed } = difficultyFor(state.pipesPassed);

  state.velocityY += FLAPPY_CONFIG.gravity * deltaSeconds;
  state.birdY += state.velocityY * deltaSeconds;
  state.rotation = Math.min(1.1, state.rotation + 2.35 * deltaSeconds);
  state.pipes.forEach((pipe) => {
    pipe.x -= speed * deltaSeconds;
  });
  state.timeMs += deltaMs;

  while (state.nextPipeAtMs <= state.timeMs + 0.001) spawnPipe(state);

  for (const pipe of state.pipes) {
    if (!pipe.passed && pipe.x + FLAPPY_CONFIG.pipeWidth < FLAPPY_CONFIG.birdX) {
      pipe.passed = true;
      state.pipesPassed += 1;
      state.score = state.pipesPassed * FLAPPY_CONFIG.scorePerPipe;
      if (state.score >= FLAPPY_CONFIG.targetScore) {
        state.alive = false;
        state.outcome = "won";
        return;
      }
    }
    if (collidesWithPipe(state, pipe)) {
      state.alive = false;
      state.outcome = "crashed";
      return;
    }
  }

  state.pipes = state.pipes.filter((pipe) => pipe.x + FLAPPY_CONFIG.pipeWidth > -12);
  if (
    state.birdY - FLAPPY_CONFIG.birdRadius <= 0 ||
    state.birdY + FLAPPY_CONFIG.birdRadius >= FLAPPY_CONFIG.groundY
  ) {
    state.alive = false;
    state.outcome = "crashed";
  }
}

export function normalizeFlapTimes(values) {
  if (!Array.isArray(values) || values.length > FLAPPY_CONFIG.maxFlaps) return null;
  const normalized = [];
  for (const value of values) {
    const time = Number(value);
    if (!Number.isInteger(time) || time < 0 || time > FLAPPY_CONFIG.maxDurationMs) return null;
    if (normalized.length && time - normalized.at(-1) < FLAPPY_CONFIG.minimumFlapIntervalMs) return null;
    normalized.push(time);
  }
  return normalized;
}

export function advanceFlappy(state, targetTimeMs, flapTimes = []) {
  const target = Math.max(state.timeMs, Math.min(FLAPPY_CONFIG.maxDurationMs, Number(targetTimeMs) || 0));
  while (state.alive && state.timeMs + FLAPPY_CONFIG.tickMs <= target + 0.001) {
    const nextTick = state.timeMs + FLAPPY_CONFIG.tickMs;
    while (
      Number.isFinite(flapTimes[state.flapIndex]) &&
      flapTimes[state.flapIndex] <= nextTick + 0.001
    ) {
      applyFlap(state);
      state.flapIndex += 1;
    }
    integrate(state, FLAPPY_CONFIG.tickMs);
  }
  if (state.alive && state.timeMs >= FLAPPY_CONFIG.maxDurationMs) {
    state.alive = false;
    state.outcome = "timeout";
  }
  return state;
}

export function verifyFlappyRun(seed, flapTimes, durationMs) {
  const normalizedFlaps = normalizeFlapTimes(flapTimes);
  const duration = Number(durationMs);
  if (
    !normalizedFlaps ||
    !Number.isInteger(duration) ||
    duration < 250 ||
    duration > FLAPPY_CONFIG.maxDurationMs ||
    (normalizedFlaps.length && normalizedFlaps.at(-1) > duration)
  ) {
    return { valid: false, reason: "invalid_run" };
  }

  const state = createFlappyState(seed);
  advanceFlappy(state, duration, normalizedFlaps);
  if (state.alive) return { valid: false, reason: "unfinished_run" };
  return {
    valid: true,
    score: state.score,
    pipesPassed: state.pipesPassed,
    flapCount: normalizedFlaps.length,
    durationMs: Math.round(state.timeMs),
    won: state.outcome === "won",
    outcome: state.outcome
  };
}

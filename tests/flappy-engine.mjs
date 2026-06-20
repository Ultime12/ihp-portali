import assert from "node:assert/strict";
import {
  FLAPPY_CONFIG,
  advanceFlappy,
  createFlappyState,
  normalizeFlapTimes,
  verifyFlappyRun
} from "../src/features/flappy-engine.js";

const noFlap = verifyFlappyRun(42, [], 5000);
assert.equal(noFlap.valid, true, "A finished crash must verify");
assert.equal(noFlap.won, false);
assert.equal(noFlap.score, 0);

assert.equal(normalizeFlapTimes([0, 67]), null, "Impossible flap rate must be rejected");
assert.equal(normalizeFlapTimes([0, 68, 136])?.length, 3);
assert.equal(verifyFlappyRun(42, [0, 100], 200).valid, false, "Very short runs must be rejected");

function createBotRun(seed) {
  const state = createFlappyState(seed);
  const flapTimes = [0];
  let lastFlap = 0;
  for (let time = 16; state.alive && time <= FLAPPY_CONFIG.maxDurationMs; time += 16) {
    advanceFlappy(state, time, flapTimes);
    if (!state.alive) break;
    const nextPipe = state.pipes.find((pipe) => pipe.x + FLAPPY_CONFIG.pipeWidth >= FLAPPY_CONFIG.birdX - 10);
    const targetY = (nextPipe?.gapY ?? FLAPPY_CONFIG.height * 0.44) + 16;
    const shouldFlap = state.birdY > targetY + 14 && state.velocityY > -150;
    if (shouldFlap && time - lastFlap >= 112) {
      flapTimes.push(time);
      lastFlap = time;
    }
  }
  return { state, flapTimes };
}

const botSeed = 1;
const bot = createBotRun(botSeed);
assert.equal(bot.state.outcome, "won", "The hard game must remain achievable with sustained accurate play");
assert.equal(bot.state.score, FLAPPY_CONFIG.targetScore);
assert.equal(bot.state.pipesPassed, 25);
assert.ok(bot.state.timeMs > 30000, "The reward must require a sustained run");

const verifiedBot = verifyFlappyRun(botSeed, bot.flapTimes, Math.ceil(bot.state.timeMs));
assert.equal(verifiedBot.valid, true);
assert.equal(verifiedBot.won, true);
assert.equal(verifiedBot.score, 10000);

const alteredSeed = verifyFlappyRun(123456789, bot.flapTimes, Math.ceil(bot.state.timeMs));
assert.ok(!alteredSeed.valid || alteredSeed.score !== verifiedBot.score, "A run must be bound to its server seed");

console.log(`Flappy engine tests passed: target reached in ${(bot.state.timeMs / 1000).toFixed(1)}s with ${bot.flapTimes.length} flaps.`);

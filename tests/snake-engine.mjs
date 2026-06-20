import assert from "node:assert/strict";
import {
  SNAKE_CONFIG,
  advanceSnake,
  createSnakeState,
  normalizeSnakeEvents,
  snakeTickDuration,
  verifySnakeRun
} from "../src/features/snake-engine.js";

assert.equal(normalizeSnakeEvents([{ tick: 2, direction: "up" }]).length, 1);
assert.equal(normalizeSnakeEvents([{ tick: 2, direction: "up" }, { tick: 2, direction: "left" }]), null);
assert.equal(normalizeSnakeEvents([{ tick: 1, direction: "diagonal" }]), null);
assert.ok(snakeTickDuration(30) < snakeTickDuration(0));
assert.ok(snakeTickDuration(100) >= SNAKE_CONFIG.minTickMs);

const first = createSnakeState(41321, 1000);
const second = createSnakeState(41321, 1000);
assert.deepEqual(first.food, second.food);
advanceSnake(first, 10, []);
advanceSnake(second, 10, []);
assert.deepEqual(first, second);
assert.equal(first.outcome, "crashed");

const verifiedCrash = verifySnakeRun(41321, [], 10, 1000);
assert.equal(verifiedCrash.valid, true);
assert.equal(verifiedCrash.outcome, "crashed");
assert.equal(verifiedCrash.won, false);
assert.equal(verifySnakeRun(41321, [], 9, 1000).valid, false);
assert.equal(verifySnakeRun(41321, [{ tick: 11, direction: "up" }], 10, 1000).valid, false);

const alternate = createSnakeState(999, 1000);
assert.notDeepEqual(alternate.food, createSnakeState(41321, 1000).food);

console.log("Snake engine tests passed.");

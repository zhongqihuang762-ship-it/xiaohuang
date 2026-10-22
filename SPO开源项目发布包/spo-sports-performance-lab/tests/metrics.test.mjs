import test from "node:test";
import assert from "node:assert/strict";
import {
  angleAt,
  estimateJumpHeightCm,
  lineTilt,
  scorePosture,
  scoreReaction,
} from "../metrics.js";

test("angleAt returns a right angle", () => {
  assert.equal(Math.round(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })), 90);
});

test("lineTilt returns horizontal zero", () => {
  assert.equal(lineTilt({ x: 0, y: 10 }, { x: 20, y: 10 }), 0);
});

test("jump height uses calibrated body scale", () => {
  assert.equal(estimateJumpHeightCm({ baselineHipY: 500, peakHipY: 400, bodyPixelHeight: 1000, bodyHeightCm: 180 }), 18);
});

test("posture and reaction scores reward stable accurate performance", () => {
  assert.equal(scorePosture({ shoulderTilt: 0, hipTilt: 0, trunk: 0, kneeDifference: 0 }), 100);
  assert.ok(scoreReaction({ reactionTimes: [300, 320], correct: 2, total: 2 }) > 90);
  assert.ok(scoreReaction({ reactionTimes: [1200], correct: 1, total: 2 }) < 50);
});

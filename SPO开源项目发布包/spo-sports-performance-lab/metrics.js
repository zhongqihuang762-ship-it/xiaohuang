export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function angleAt(a, b, c) {
  if (!a || !b || !c) return null;
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const denominator = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (!denominator) return null;
  const cosine = clamp((ab.x * cb.x + ab.y * cb.y) / denominator, -1, 1);
  return Math.acos(cosine) * 180 / Math.PI;
}

export function lineTilt(a, b) {
  if (!a || !b) return null;
  let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return angle;
}

export function trunkLean(leftShoulder, rightShoulder, leftHip, rightHip) {
  if (![leftShoulder, rightShoulder, leftHip, rightHip].every(Boolean)) return null;
  const shoulder = midpoint(leftShoulder, rightShoulder);
  const hip = midpoint(leftHip, rightHip);
  const dx = shoulder.x - hip.x;
  const dy = hip.y - shoulder.y;
  return Math.atan2(dx, Math.abs(dy)) * 180 / Math.PI;
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function scorePosture({ shoulderTilt = 0, hipTilt = 0, trunk = 0, kneeDifference = 0 }) {
  const penalty = Math.abs(shoulderTilt) * 2.2 + Math.abs(hipTilt) * 2.4 + Math.abs(trunk) * 2 + Math.abs(kneeDifference) * 0.65;
  return Math.round(clamp(100 - penalty, 0, 100));
}

export function scoreReaction({ reactionTimes = [], correct = 0, total = 0 }) {
  if (!total) return 0;
  const accuracy = correct / total;
  const mean = reactionTimes.length ? average(reactionTimes) : 1600;
  const speed = clamp((1500 - mean) / 1200, 0, 1);
  return Math.round((accuracy * 0.55 + speed * 0.45) * 100);
}

export function estimateJumpHeightCm({ baselineHipY, peakHipY, bodyPixelHeight, bodyHeightCm }) {
  if (![baselineHipY, peakHipY, bodyPixelHeight, bodyHeightCm].every(Number.isFinite) || bodyPixelHeight <= 0) return null;
  return Math.max(0, (baselineHipY - peakHipY) * bodyHeightCm / bodyPixelHeight);
}

export function stateLabel(value, goodLimit, watchLimit) {
  const magnitude = Math.abs(value);
  if (magnitude <= goodLimit) return "稳定";
  if (magnitude <= watchLimit) return "需观察";
  return "差异明显";
}

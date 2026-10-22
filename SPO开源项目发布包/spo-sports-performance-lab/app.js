import {
  angleAt,
  average,
  estimateJumpHeightCm,
  lineTilt,
  median,
  scorePosture,
  scoreReaction,
  stateLabel,
  trunkLean,
} from "./metrics.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const JOINTS = {
  nose: 0,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
};

const CONNECTIONS = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
];

const vision = {
  detector: null,
  source: null,
  stream: null,
  running: false,
  lastTime: -1,
  baselineFrames: [],
  baseline: null,
  recording: false,
  jumpFrames: [],
  jumpStartedAt: null,
};

const video = $("#pose-video");
const canvas = $("#pose-canvas");
const ctx = canvas.getContext("2d");

$$('.tab').forEach((button) => button.addEventListener('click', () => {
  $$('.tab').forEach((tab) => tab.classList.remove('active'));
  $$('.module').forEach((module) => module.classList.remove('active'));
  button.classList.add('active');
  $(`#${button.dataset.tab}`).classList.add('active');
}));

async function ensureDetector() {
  if (vision.detector) return vision.detector;
  if (!window.tf || !window.poseDetection) throw new Error("开源视觉组件未加载，请检查网络后刷新页面。");
  $("#vision-status").textContent = "正在加载 MoveNet 姿态模型…";
  await tf.setBackend("webgl");
  await tf.ready();
  vision.detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING, enableSmoothing: true },
  );
  $("#vision-status").textContent = "模型已就绪。请保持全身入镜、光线充足、背景简洁。";
  return vision.detector;
}

async function startCamera() {
  try {
    stopSource();
    vision.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: false });
    video.srcObject = vision.stream;
    video.src = "";
    await video.play();
    activateVideo();
  } catch (error) {
    $("#vision-status").textContent = `摄像头启动失败：${error.message}`;
  }
}

function stopSource() {
  vision.running = false;
  if (vision.stream) vision.stream.getTracks().forEach((track) => track.stop());
  vision.stream = null;
  if (video.src && video.src.startsWith("blob:")) URL.revokeObjectURL(video.src);
  video.srcObject = null;
}

async function loadVideoFile(file) {
  if (!file) return;
  stopSource();
  video.src = URL.createObjectURL(file);
  video.controls = true;
  await video.play();
  activateVideo();
}

async function activateVideo() {
  await ensureDetector();
  $("#camera-empty").hidden = true;
  $("#calibrate-button").disabled = false;
  $("#jump-button").disabled = false;
  vision.running = true;
  vision.lastTime = -1;
  requestAnimationFrame(poseLoop);
}

async function poseLoop() {
  if (!vision.running) return;
  if (video.readyState >= 2 && video.currentTime !== vision.lastTime) {
    vision.lastTime = video.currentTime;
    resizeCanvas();
    const poses = await vision.detector.estimatePoses(video, { flipHorizontal: false });
    const pose = poses[0];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pose?.keypoints?.length) {
      drawPose(pose.keypoints);
      analyzePose(pose.keypoints, performance.now());
    }
  }
  requestAnimationFrame(poseLoop);
}

function resizeCanvas() {
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
  }
}

function visible(point) { return point && (point.score ?? 0) >= 0.25; }

function drawPose(points) {
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#f04444";
  CONNECTIONS.forEach(([a, b]) => {
    if (!visible(points[a]) || !visible(points[b])) return;
    ctx.beginPath();
    ctx.moveTo(points[a].x, points[a].y);
    ctx.lineTo(points[b].x, points[b].y);
    ctx.stroke();
  });
  points.forEach((point) => {
    if (!visible(point)) return;
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function getPoseMetrics(points) {
  const p = (name) => points[JOINTS[name]];
  const leftKnee = angleAt(p("leftHip"), p("leftKnee"), p("leftAnkle"));
  const rightKnee = angleAt(p("rightHip"), p("rightKnee"), p("rightAnkle"));
  const shoulderTilt = lineTilt(p("leftShoulder"), p("rightShoulder"));
  const hipTilt = lineTilt(p("leftHip"), p("rightHip"));
  const trunk = trunkLean(p("leftShoulder"), p("rightShoulder"), p("leftHip"), p("rightHip"));
  const hipY = average([p("leftHip")?.y, p("rightHip")?.y].filter(Number.isFinite));
  const ankleY = average([p("leftAnkle")?.y, p("rightAnkle")?.y].filter(Number.isFinite));
  const topY = p("nose")?.y;
  return {
    leftKnee, rightKnee, shoulderTilt, hipTilt, trunk, hipY, ankleY, topY,
    bodyPixelHeight: Number.isFinite(topY) && Number.isFinite(ankleY) ? ankleY - topY : null,
    kneeDifference: Number.isFinite(leftKnee) && Number.isFinite(rightKnee) ? Math.abs(leftKnee - rightKnee) : null,
  };
}

function analyzePose(points, timestamp) {
  const metrics = getPoseMetrics(points);
  updateLiveMetrics(metrics);
  updatePosture(metrics);

  if (vision.baselineFrames.length) {
    vision.baselineFrames.push(metrics);
    if (vision.baselineFrames.length >= 61) finishCalibration();
  }

  if (vision.recording && vision.baseline) {
    vision.jumpFrames.push({ ...metrics, timestamp });
    const lifted = metrics.ankleY < vision.baseline.ankleY - Math.max(8, vision.baseline.bodyPixelHeight * 0.025);
    if (lifted && !vision.jumpStartedAt) vision.jumpStartedAt = timestamp;
    if (!lifted && vision.jumpStartedAt && timestamp - vision.jumpStartedAt > 120) finishJump();
    if (vision.jumpFrames.length > 600) finishJump();
  }
}

function updateLiveMetrics(m) {
  setMetric("#left-knee-angle", m.leftKnee);
  setMetric("#right-knee-angle", m.rightKnee);
  setMetric("#trunk-lean", m.trunk, true);
  setMetric("#knee-diff", m.kneeDifference);
}

function setMetric(selector, value, absolute = false) {
  $(selector).textContent = Number.isFinite(value) ? Math.round(absolute ? Math.abs(value) : value) : "--";
}

function updatePosture(m) {
  if (![m.shoulderTilt, m.hipTilt, m.trunk, m.kneeDifference].every(Number.isFinite)) return;
  const score = scorePosture(m);
  $("#posture-score").textContent = score;
  $("#shoulder-tilt").textContent = `${Math.abs(m.shoulderTilt).toFixed(1)}°`;
  $("#hip-tilt").textContent = `${Math.abs(m.hipTilt).toFixed(1)}°`;
  $("#posture-trunk").textContent = `${Math.abs(m.trunk).toFixed(1)}°`;
  $("#posture-knee-diff").textContent = `${m.kneeDifference.toFixed(1)}°`;
  $("#shoulder-state").textContent = stateLabel(m.shoulderTilt, 2, 5);
  $("#hip-state").textContent = stateLabel(m.hipTilt, 2, 5);
  $("#trunk-state").textContent = stateLabel(m.trunk, 3, 7);
  $("#posture-knee-state").textContent = stateLabel(m.kneeDifference, 5, 12);
  const issues = [];
  if (Math.abs(m.shoulderTilt) > 5) issues.push("肩线倾斜");
  if (Math.abs(m.hipTilt) > 5) issues.push("髋线倾斜");
  if (Math.abs(m.trunk) > 7) issues.push("躯干侧向偏移");
  if (m.kneeDifference > 12) issues.push("左右膝屈伸差异");
  $("#posture-summary-text").textContent = issues.length ? `当前建议重点复核：${issues.join("、")}。请结合动作重复、疼痛反馈与教练观察判断。` : "当前正面动作对称性较稳定，建议继续完成侧面和动态动作复测。";
}

function startCalibration() {
  vision.baselineFrames = [{}];
  $("#vision-status").textContent = "标定中：请自然站立、全身入镜，保持 2 秒。";
}

function finishCalibration() {
  const valid = vision.baselineFrames.slice(1).filter((frame) => Number.isFinite(frame.hipY) && Number.isFinite(frame.ankleY));
  if (!valid.length) {
    vision.baselineFrames = [];
    $("#vision-status").textContent = "标定失败：没有稳定识别到髋和踝。";
    return;
  }
  vision.baseline = {
    hipY: median(valid.map((frame) => frame.hipY)),
    ankleY: median(valid.map((frame) => frame.ankleY)),
    bodyPixelHeight: median(valid.map((frame) => frame.bodyPixelHeight).filter(Number.isFinite)),
  };
  vision.baselineFrames = [];
  $("#vision-status").textContent = "标定完成。点击“开始跳跃记录”，再完成一次自然纵跳。";
}

function startJump() {
  if (!vision.baseline) {
    $("#vision-status").textContent = "请先完成静止标定。";
    return;
  }
  vision.recording = true;
  vision.jumpFrames = [];
  vision.jumpStartedAt = null;
  $("#jump-button").disabled = true;
  $("#vision-status").textContent = "记录中：请完成一次纵跳，落地后站稳。";
}

function finishJump() {
  vision.recording = false;
  const airborne = vision.jumpFrames.filter((frame) => frame.ankleY < vision.baseline.ankleY - Math.max(8, vision.baseline.bodyPixelHeight * 0.025));
  const peak = vision.jumpFrames.reduce((best, frame) => Number.isFinite(frame.hipY) && frame.hipY < best.hipY ? frame : best, { hipY: Infinity });
  const height = estimateJumpHeightCm({
    baselineHipY: vision.baseline.hipY,
    peakHipY: peak.hipY,
    bodyPixelHeight: vision.baseline.bodyPixelHeight,
    bodyHeightCm: Number($("#body-height").value),
  });
  const flight = airborne.length > 1 ? airborne.at(-1).timestamp - airborne[0].timestamp : 0;
  $("#jump-height").textContent = Number.isFinite(height) ? height.toFixed(1) : "--";
  $("#flight-time").textContent = flight ? Math.round(flight) : "--";
  if (vision.jumpFrames.at(-1)) updateLiveMetrics(vision.jumpFrames.at(-1));
  $("#jump-button").disabled = false;
  $("#vision-status").textContent = "本次记录完成。结果是单目视觉估算，可再次标定后复测对比。";
}

$("#camera-button").addEventListener("click", startCamera);
$("#video-file").addEventListener("change", (event) => loadVideoFile(event.target.files[0]));
$("#calibrate-button").addEventListener("click", startCalibration);
$("#jump-button").addEventListener("click", startJump);

const reaction = {
  mode: "simple",
  running: false,
  step: 0,
  total: 0,
  correct: 0,
  times: [],
  activeIndex: null,
  shownAt: null,
  timer: null,
  sequence: [],
  inputIndex: 0,
};

const grid = $("#reaction-grid");
for (let i = 0; i < 9; i += 1) {
  const cell = document.createElement("button");
  cell.className = "reaction-cell";
  cell.dataset.index = i;
  cell.setAttribute("aria-label", `反应区域 ${i + 1}`);
  cell.addEventListener("click", () => handleReactionClick(i));
  grid.appendChild(cell);
}

$$('.mode').forEach((button) => button.addEventListener('click', () => {
  if (reaction.running) return;
  $$('.mode').forEach((mode) => mode.classList.remove('active'));
  button.classList.add('active');
  reaction.mode = button.dataset.mode;
  showReactionMessage("模式已选择", button.textContent);
}));

$("#reaction-start").addEventListener("click", startReaction);

function resetReaction() {
  clearTimeout(reaction.timer);
  Object.assign(reaction, { running: true, step: 0, total: 0, correct: 0, times: [], activeIndex: null, shownAt: null, sequence: [], inputIndex: 0 });
  grid.hidden = false;
  clearGrid();
  updateReactionReport();
}

function startReaction() {
  resetReaction();
  $("#reaction-start").disabled = true;
  if (reaction.mode === "memory") startMemoryRound();
  else scheduleTarget();
}

function scheduleTarget() {
  if (reaction.step >= 10) return finishReaction();
  clearGrid();
  showReactionMessage("准备…", "看到红色目标后立即点击");
  const delay = 900 + Math.random() * 1700;
  reaction.timer = setTimeout(() => {
    $("#reaction-message").hidden = true;
    const index = reaction.mode === "simple" ? 4 : Math.floor(Math.random() * 9);
    activateCell(index, "active");
    reaction.activeIndex = index;
    reaction.shownAt = performance.now();
  }, delay);
}

function handleReactionClick(index) {
  if (!reaction.running) return;
  if (reaction.mode === "memory") return handleMemoryClick(index);
  reaction.total += 1;
  if (index === reaction.activeIndex && reaction.shownAt) {
    reaction.correct += 1;
    reaction.times.push(performance.now() - reaction.shownAt);
  }
  reaction.step += 1;
  reaction.activeIndex = null;
  reaction.shownAt = null;
  updateReactionReport();
  scheduleTarget();
}

function startMemoryRound() {
  if (reaction.step >= 5) return finishReaction();
  const length = 3 + reaction.step;
  reaction.sequence = Array.from({ length }, () => Math.floor(Math.random() * 9));
  reaction.inputIndex = 0;
  showReactionMessage("观察顺序", `记住 ${length} 个位置`);
  let cursor = 0;
  reaction.timer = setTimeout(function flash() {
    clearGrid();
    if (cursor >= reaction.sequence.length) {
      $("#reaction-message").hidden = true;
      reaction.shownAt = performance.now();
      return;
    }
    activateCell(reaction.sequence[cursor], "memory");
    cursor += 1;
    reaction.timer = setTimeout(flash, 650);
  }, 900);
}

function handleMemoryClick(index) {
  const expected = reaction.sequence[reaction.inputIndex];
  reaction.total += 1;
  if (index === expected) {
    reaction.correct += 1;
    reaction.inputIndex += 1;
    if (reaction.inputIndex === reaction.sequence.length) {
      reaction.times.push((performance.now() - reaction.shownAt) / reaction.sequence.length);
      reaction.step += 1;
      updateReactionReport();
      startMemoryRound();
    }
  } else {
    reaction.step += 1;
    updateReactionReport();
    startMemoryRound();
  }
}

function activateCell(index, className) {
  const cell = grid.children[index];
  if (cell) cell.classList.add(className);
}

function clearGrid() {
  [...grid.children].forEach((cell) => cell.className = "reaction-cell");
}

function showReactionMessage(title, subtitle) {
  $("#reaction-message").hidden = false;
  $("#reaction-message b").textContent = title;
  $("#reaction-message span").textContent = subtitle;
}

function updateReactionReport() {
  const mean = reaction.times.length ? average(reaction.times) : 0;
  const accuracy = reaction.total ? reaction.correct / reaction.total * 100 : 0;
  $("#reaction-score").textContent = reaction.total ? scoreReaction({ reactionTimes: reaction.times, correct: reaction.correct, total: reaction.total }) : "--";
  $("#mean-reaction").textContent = mean ? `${Math.round(mean)} ms` : "-- ms";
  $("#best-reaction").textContent = reaction.times.length ? `${Math.round(Math.min(...reaction.times))} ms` : "-- ms";
  $("#reaction-accuracy").textContent = `${accuracy.toFixed(1)}%`;
  $("#reaction-count").textContent = reaction.correct;
  const maxSteps = reaction.mode === "memory" ? 5 : 10;
  $("#reaction-progress").style.width = `${Math.min(100, reaction.step / maxSteps * 100)}%`;
}

function finishReaction() {
  reaction.running = false;
  $("#reaction-start").disabled = false;
  clearGrid();
  showReactionMessage("训练完成", `综合得分 ${$("#reaction-score").textContent}`);
}

$("#export-report").addEventListener("click", () => {
  const payload = {
    generatedAt: new Date().toISOString(),
    system: "SPO Neuro Reaction Training Open Demo",
    mode: reaction.mode,
    result: {
      score: scoreReaction({ reactionTimes: reaction.times, correct: reaction.correct, total: reaction.total }),
      meanReactionMs: reaction.times.length ? Math.round(average(reaction.times)) : null,
      medianReactionMs: reaction.times.length ? Math.round(median(reaction.times)) : null,
      bestReactionMs: reaction.times.length ? Math.round(Math.min(...reaction.times)) : null,
      correct: reaction.correct,
      total: reaction.total,
      accuracy: reaction.total ? Number((reaction.correct / reaction.total * 100).toFixed(1)) : 0,
    },
    disclaimer: "Training observation only; not a medical diagnosis.",
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `spo-reaction-report-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

const baselineDieEl = document.getElementById("baselineDie");
const currentDieEl = document.getElementById("currentDie");
const statusEl = document.getElementById("status");
const streakEl = document.getElementById("streak");
const startBtn = document.getElementById("startBtn");
const quitBtn = document.getElementById("quitBtn");
const predictionButtons = document.getElementById("predictionButtons");
const nextRoundBtn = document.getElementById("nextRoundBtn");
const stopBtn = document.getElementById("stopBtn");
const battlefieldEl = document.querySelector(".battlefield");
const enemyEl = document.getElementById("enemy");
const enemyNameEl = document.getElementById("enemyName");
const enemyHpEl = document.getElementById("enemyHp");
const battleEffectEl = document.getElementById("battleEffect");

const enemies = [
  { name: "ぷるぷるスライム", normal: "🟢", win: "😎", lose: "🥴" },
  { name: "ほのおドラゴン", normal: "🐲", win: "🐲🔥", lose: "🐲💫" },
  { name: "サイコロ魔王", normal: "👾", win: "👿", lose: "💥👾" },
];

let streak = 0;
let baselineValue = null;
let awaitingPrediction = false;
let audioContext = null;

// 元ゲームと同じ、1〜6を偏りなく選ぶ処理です。
function rollDie() {
  const dieFaces = 6;
  if (window.crypto && window.crypto.getRandomValues) {
    const maxRange = 0x100000000;
    const limit = maxRange - (maxRange % dieFaces);
    let randomValue;
    do {
      const buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      randomValue = buffer[0];
    } while (randomValue >= limit);
    return Math.floor((randomValue / limit) * dieFaces) + 1;
  }
  return Math.floor(Math.random() * dieFaces) + 1;
}

// 元ゲームと同じ判定：同じ目は失敗、それ以外は大小を比較します。
function evaluatePrediction(baseline, nextValue, prediction) {
  if (nextValue === baseline) return { correct: false, same: true };
  const predictedHigher = prediction === "high";
  return { correct: predictedHigher === (nextValue > baseline), same: false };
}

function setDieFace(dieEl, value) {
  dieEl.className = value === "?" ? "die face-unknown" : `die face-${value}`;
  dieEl.replaceChildren();
  dieEl.dataset.value = String(value);
  if (value === "?") return;
  for (let i = 0; i < Number(value); i += 1) {
    const pip = document.createElement("span");
    pip.className = "pip";
    dieEl.appendChild(pip);
  }
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    audioContext = new AudioContextCtor();
  }
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function playTone(frequency, duration, type = "square", volume = 0.05, delayTime = 0) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + delayTime;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function playSound(kind) {
  const sounds = {
    roll: [[500,.05],[650,.05],[800,.08]],
    hit: [[900,.08],[1250,.1],[1550,.12]],
    miss: [[260,.12],[180,.18]],
    win: [[523,.12],[659,.12],[784,.12],[1047,.3]],
  };
  (sounds[kind] || []).forEach(([note, length], index) => playTone(note, length, kind === "miss" ? "sawtooth" : "square", .045, index * .09));
}

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function animateRoll(dieEl, finalValue) {
  const delays = [45,60,75,90,110,130,150,175,200,230,260,290];
  for (const wait of delays) {
    setDieFace(dieEl, rollDie());
    await delay(wait);
  }
  setDieFace(dieEl, finalValue);
  playSound("roll");
}

function showBattleEffect(text, state) {
  battleEffectEl.classList.remove("result-stay");
  battlefieldEl.classList.remove("hit", "hurt");
  void battlefieldEl.offsetWidth;
  battleEffectEl.textContent = text;
  battlefieldEl.classList.add(state);
  window.setTimeout(() => {
    battlefieldEl.classList.remove("hit", "hurt");
    battleEffectEl.classList.add("result-stay");
  }, 700);
}

function setEnemy(index) {
  const enemy = enemies[Math.min(index, enemies.length - 1)];
  enemyNameEl.textContent = enemy.name;
  enemyEl.textContent = enemy.normal;
  enemyEl.setAttribute("aria-label", enemy.name);
  enemyHpEl.style.width = "100%";
  battlefieldEl.classList.remove("enemy-defeated", "enemy-winner", "hit", "hurt");
  battleEffectEl.classList.remove("result-stay");
  battleEffectEl.textContent = "";
}

function setEnemyResult(result) {
  const enemy = enemies[Math.min(streak, enemies.length - 1)];
  const enemyIndex = result === "lose" ? Math.max(0, streak - 1) : Math.min(streak, enemies.length - 1);
  const resultEnemy = enemies[enemyIndex];
  enemyEl.textContent = resultEnemy[result];
  enemyEl.setAttribute("aria-label", `${resultEnemy.name}の${result === "lose" ? "負けた" : "勝った"}表情`);
  battlefieldEl.classList.add(result === "lose" ? "enemy-defeated" : "enemy-winner");
}

function updateMap() {
  document.querySelectorAll(".map-node").forEach((node) => {
    const stage = Number(node.dataset.stage);
    node.classList.toggle("cleared", stage > 0 && stage <= streak);
    node.classList.toggle("active", stage === streak);
  });
  document.querySelectorAll(".map-line").forEach((line, index) => line.classList.toggle("cleared", index < streak));
}

function updateButtons() {
  predictionButtons.querySelectorAll("button[data-choice]").forEach((button) => {
    button.disabled = !awaitingPrediction || baselineValue === null;
  });
  const canContinue = streak > 0 && streak < 3 && baselineValue !== null && !awaitingPrediction;
  nextRoundBtn.disabled = !canContinue;
  stopBtn.disabled = !canContinue;
  quitBtn.disabled = baselineValue === null && streak === 0 && !awaitingPrediction;
}

function resetGame() {
  streak = 0;
  baselineValue = null;
  awaitingPrediction = false;
  startBtn.disabled = false;
  streakEl.textContent = "0";
  setDieFace(baselineDieEl, "?");
  setDieFace(currentDieEl, "?");
  setEnemy(0);
  updateMap();
  updateButtons();
  statusEl.textContent = "「冒険スタート」をおして、モンスターにちょうせんしよう！";
}

async function startNewGame() {
  streak = 0;
  baselineValue = null;
  awaitingPrediction = false;
  startBtn.disabled = true;
  quitBtn.disabled = true;
  streakEl.textContent = "0";
  setEnemy(0);
  updateMap();
  statusEl.textContent = "運命のサイコロをふっているぞ…！";
  const firstRoll = rollDie();
  baselineValue = firstRoll;
  await animateRoll(baselineDieEl, firstRoll);
  setDieFace(currentDieEl, "?");
  statusEl.textContent = `いまの目は「${baselineValue}」！ つぎは大きい？ 小さい？`;
  awaitingPrediction = true;
  startBtn.disabled = false;
  updateButtons();
}

function prepareNextRound() {
  if (baselineValue === null) return;
  setEnemy(streak);
  setDieFace(baselineDieEl, baselineValue);
  setDieFace(currentDieEl, "?");
  statusEl.textContent = `${enemies[streak].name}があらわれた！ つぎは大きい？ 小さい？`;
  awaitingPrediction = true;
  updateButtons();
}

async function resolvePrediction(choice) {
  if (!awaitingPrediction || baselineValue === null) return;
  awaitingPrediction = false;
  updateButtons();
  statusEl.textContent = `${choice === "high" ? "ハイ" : "ロー"}アタック！ サイコロよ、こたえてくれ！`;
  const nextValue = rollDie();
  await animateRoll(currentDieEl, nextValue);
  const result = evaluatePrediction(baselineValue, nextValue, choice);

  if (result.same) {
    playSound("miss");
    enemyHpEl.style.width = "100%";
    showBattleEffect("ドカーン！", "hurt");
    setEnemyResult("win");
    statusEl.textContent = `同じ「${nextValue}」だ！ 魔法がはね返されてゲームオーバー！`;
    updateButtons();
    return;
  }

  if (!result.correct) {
    playSound("miss");
    showBattleEffect("ミス！", "hurt");
    setEnemyResult("win");
    statusEl.textContent = `ざんねん！ ${baselineValue}から${nextValue}になった。もう一度ちょうせんしよう！`;
    updateButtons();
    return;
  }

  streak += 1;
  streakEl.textContent = String(streak);
  baselineValue = nextValue;
  enemyHpEl.style.width = "0%";
  playSound("hit");
  showBattleEffect("会心の一撃！", "hit");
  setEnemyResult("lose");
  updateMap();

  if (streak >= 3) {
    playSound("win");
    statusEl.textContent = "3れんぞく正解！ サイコロ魔王をたおした！ 伝説のサイコロ勇者だ！";
    updateButtons();
    return;
  }

  statusEl.textContent = `${enemies[streak - 1].name}をたおした！ つぎの敵にすすもう！`;
  updateButtons();
}

startBtn.addEventListener("click", () => void startNewGame());
quitBtn.addEventListener("click", resetGame);
predictionButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-choice]");
  if (button) void resolvePrediction(button.dataset.choice);
});
nextRoundBtn.addEventListener("click", prepareNextRound);
stopBtn.addEventListener("click", resetGame);

resetGame();

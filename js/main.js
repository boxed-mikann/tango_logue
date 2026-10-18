// ============================================================
// main.js — メインループ、画面遷移、UI制御、イベント管理
// ============================================================

import {
  DUNGEONS, ENEMIES, STYLES, ITEMS, ITEM_SLOTS_DEF,
  QUEST_CHAINS, DAMAGE_CONFIG, assignWordsToDungeons,
} from './data.js?v=2.1.2';
import {
  initBattle, getBattleState, selectNextWord, generateChoices,
  calcDamage, calcMissPenalty, checkBarrier, checkRevive, processShieldEnemy,
  processVampire, useActiveItem, onEnemyDefeated, getEffectiveTimeLimit,
  endBattle, spawnEnemy, generateLootChoices, pickLootItem,
} from './battle.js?v=2.1.2';
import {
  loadSaveData, saveSaveData, resetSaveData,
  getWordProgress, updateWordProgress, incrementStat, recordDungeonClear,
  getMasteredWordsCount, getSeenWordsCount,
} from './storage.js?v=2.1.2';
import { sound } from './audio.js?v=2.1.2';


// ─── グローバル状態 ───
let allWords = [];
let saveData = null;
let currentDungeonIdx = 0;
let currentStyleIdx = 0;
let homeChartInstance = null;
let selectedItemIdForDetail = null;
let totalWordFilterStage = 'all';

// ─── CSV読み込み ───
async function loadWordsCSV() {
  try {
    const response = await fetch('./words.csv');
    const text = await response.text();
    const lines = text.split('\n').filter(l => l.trim());
    allWords = lines.map((line, idx) => {
      const parts = parseCsvLine(line.trim());
      if (parts.length < 2) return null;

      let en, ja, stage = null;

      // パターン1: [stage, en, ja]
      if (parts.length >= 3 && /^[1-5]$/.test(parts[0])) {
        stage = parseInt(parts[0], 10);
        en = parts[1];
        ja = parts.slice(2).join(',');
      }
      // パターン2: [en, ja, stage]
      else if (parts.length >= 3 && /^[1-5]$/.test(parts[parts.length - 1])) {
        stage = parseInt(parts[parts.length - 1], 10);
        en = parts[0];
        ja = parts.slice(1, -1).join(',');
      }
      // パターン3: [en, ja]
      else {
        en = parts[0];
        ja = parts.slice(1).join(',');
      }

      return { id: idx + 1, en: en.trim(), ja: ja.trim(), stage };
    }).filter(Boolean);

    assignWordsToDungeons(allWords);
    console.log(`Loaded ${allWords.length} words across ${DUNGEONS.length} dungeons.`);
  } catch (e) {
    console.error('CSV load failed:', e);
    allWords = [
      { id: 1, en: 'agree', ja: '賛成する', stage: 1 },
      { id: 2, en: 'oppose', ja: '反対する', stage: 1 },
      { id: 3, en: 'advise', ja: '忠告する', stage: 2 },
      { id: 4, en: 'discuss', ja: '話し合う', stage: 2 },
      { id: 5, en: 'blame', ja: '責任があるとする', stage: 3 },
    ];
    assignWordsToDungeons(allWords);
  }
}

function parseCsvLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

// ─── 画面遷移の排他制御 ───
const SCREENS = ['home-screen', 'battle-screen', 'result-screen'];

function showScreen(screenId) {
  SCREENS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === screenId) {
        el.classList.remove('hidden');
        el.style.display = '';
      } else {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    }
  });
  closeAllModals();
}

// ─── モーダル制御 ───
const MODAL_IDS = [
  'word-list-modal', 'explanation-modal', 'settings-modal',
  'style-detail-modal', 'item-modal', 'style-list-modal',
  'total-word-modal', 'quest-modal', 'word-detail-modal',
  'gacha-result-modal', 'item-detail-modal', 'loot-modal',
];

function closeAllModals() {
  MODAL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function openModal(modalId) {
  closeAllModals();
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('hidden');
}

// ─── ダンジョン解放判定 ───
function isDungeonUnlocked(idx) {
  if (idx === 0) return true; // Stage 1 は常に解放
  const reqDungeon = DUNGEONS[idx].unlockCondition;
  if (!reqDungeon) return true;
  const clears = saveData.permanent.stats.dungeonClears[reqDungeon.reqDungeonId] || 0;
  return clears > 0;
}

// ─── スタイル解放判定 ───
function isStyleUnlocked(style) {
  if (!style.unlockCondition) return true;
  const seenCount = getSeenWordsCount(saveData);
  return seenCount >= style.unlockCondition.value;
}

// ─── 持ち込みスロット解放判定 ───
function isSlotUnlocked(slotIndex) {
  const def = ITEM_SLOTS_DEF[slotIndex];
  if (!def || !def.unlockCondition) return true;
  const cond = def.unlockCondition;
  if (cond.type === 'totalCorrect') {
    return (saveData.permanent.stats.totalCorrect || 0) >= cond.value;
  }
  if (cond.type === 'dungeonClear') {
    return (saveData.permanent.stats.dungeonClears[cond.value] || 0) > 0;
  }
  return false;
}

// ─── ホーム画面レンダリング ───
function renderHome() {
  const dungeon = DUNGEONS[currentDungeonIdx];
  document.getElementById('home-dungeon-name').textContent = `${dungeon.icon} ${dungeon.name}`;
  document.getElementById('home-dungeon-subtitle').textContent = dungeon.subtitle;

  // ダンジョンロック状態
  const isUnlocked = isDungeonUnlocked(currentDungeonIdx);
  const lockBadge = document.getElementById('home-dungeon-lock-badge');
  const startBtn = document.getElementById('btn-start-battle');
  const startBtnText = document.getElementById('btn-start-battle-text');

  if (isUnlocked) {
    lockBadge.classList.add('hidden');
    startBtn.disabled = false;
    startBtnText.textContent = 'ダンジョンへ出発';
  } else {
    lockBadge.classList.remove('hidden');
    lockBadge.textContent = `🔒 ${dungeon.unlockCondition.label}`;
    startBtn.disabled = true;
    startBtnText.textContent = '🔒 未解放ダンジョン';
  }

  updateHomeChart();
  updateStyleDisplay();
  updateCoinsDisplay();
  updateQuestNotifyBadge();
  sound.playBGM('home');
}

function updateCoinsDisplay() {
  const el = document.getElementById('home-coins');
  if (el) el.textContent = saveData.permanent.coins;
}

function updateHomeChart() {
  const dungeon = DUNGEONS[currentDungeonIdx];
  const dungeonWords = dungeon.wordList || (dungeon.wordRange ? allWords.slice(dungeon.wordRange.start, dungeon.wordRange.end) : allWords);

  let mastered = 0, learning = 0, unseen = 0;
  dungeonWords.forEach(w => {
    if (!w) return;
    const wp = getWordProgress(saveData, w.id);
    if (wp.lastSeenTime === null) unseen++;
    else if (wp.masteryLevel >= 2) mastered++;
    else learning++;
  });

  const total = dungeonWords.length;
  const progress = total > 0 ? Math.round((mastered / total) * 100) : 0;
  document.getElementById('home-progress-text').textContent = `${progress}%`;
  document.getElementById('home-progress-detail').textContent =
    `✅${mastered}  📝${learning}  ❓${unseen}`;

  const ctx = document.getElementById('homeChart').getContext('2d');
  if (homeChartInstance) homeChartInstance.destroy();
  homeChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['マスター', '学習中', '未出題'],
      datasets: [{
        data: [mastered, learning, unseen],
        backgroundColor: ['#22c55e', '#eab308', '#475569'],
        borderWidth: 0,
      }],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      cutout: '72%',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
    },
  });
}

function updateStyleDisplay() {
  const style = STYLES[currentStyleIdx] || STYLES[0];
  const isUnlocked = isStyleUnlocked(style);

  const nameEl = document.getElementById('home-style-name');
  const descEl = document.getElementById('home-style-desc');

  if (isUnlocked) {
    nameEl.textContent = `${style.icon} ${style.name}`;
    nameEl.className = 'font-bold text-xs text-white transition-colors';
    descEl.textContent = style.desc;
    saveData.permanent.selectedStyle = style.id;
  } else {
    nameEl.textContent = `🔒 ${style.name} (ロック中)`;
    nameEl.className = 'font-bold text-xs text-slate-400 transition-colors';
    descEl.textContent = `解放条件: ${style.unlockCondition.label}（このまま出発するとスタイルなし）`;
    saveData.permanent.selectedStyle = null; // スタイルなし出撃
  }
  saveSaveData(saveData);
}

// ─── クエスト通知バッジ ───
function updateQuestNotifyBadge() {
  const badge = document.getElementById('quest-notify-badge');
  if (!badge) return;
  const hasClaimable = hasClaimableQuests();
  if (hasClaimable) {
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function hasClaimableQuests() {
  for (const chain of QUEST_CHAINS) {
    const activeQuest = chain.find(q => !saveData.permanent.claimedQuests.includes(q.id));
    if (activeQuest && getQuestProgress(activeQuest) >= 100) {
      return true;
    }
  }
  return false;
}

// ─── ダンジョン切替 ───
function prevDungeon() {
  sound.playSE('click');
  currentDungeonIdx = (currentDungeonIdx - 1 + DUNGEONS.length) % DUNGEONS.length;
  renderHome();
}
function nextDungeon() {
  sound.playSE('click');
  currentDungeonIdx = (currentDungeonIdx + 1) % DUNGEONS.length;
  renderHome();
}

// ─── スタイル切替 ───
function changeStyle(direction) {
  sound.playSE('click');
  currentStyleIdx = (currentStyleIdx + direction + STYLES.length) % STYLES.length;
  updateStyleDisplay();
}

// ─── 音声読み上げ ───
function speakWord(slow = false) {
  const bs = getBattleState();
  const word = bs ? bs.currentWord : null;
  if (!word) return;
  speakText(word.en, slow);
}

function speakText(text, slow = false) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = slow ? 0.5 : 1.0;
  window.speechSynthesis.speak(utterance);
}

// ═══════════════════════════════════
//  ⚔️ バトル制御
// ═══════════════════════════════════

let battleTimerInterval = null;
let chameleonTimeout = null;

function startBattle() {
  sound.playSE('click');
  if (!isDungeonUnlocked(currentDungeonIdx)) return;

  // 有効な持ち込みアイテムのみ抽出（アンロック済みスロットのアイテム）
  const equippedItems = [];
  ITEM_SLOTS_DEF.forEach((slot, i) => {
    if (isSlotUnlocked(i) && saveData.permanent.equippedItems[i]) {
      equippedItems.push(saveData.permanent.equippedItems[i]);
    }
  });

  const styleId = saveData.permanent.selectedStyle;

  initBattle(currentDungeonIdx, allWords, saveData, styleId, equippedItems);
  showScreen('battle-screen');
  renderBattleUI();
  nextQuestion();
}

function renderBattleUI() {
  const bs = getBattleState();
  if (!bs) return;

  // 敵
  const e = bs.currentEnemy;
  document.getElementById('enemy-name').textContent = e.isBoss ? `👑 ${e.name}` : e.name;
  document.getElementById('enemy-sprite').textContent = e.icon;
  document.getElementById('enemy-hp-current').textContent = e.hp;
  document.getElementById('enemy-hp-max').textContent = e.maxHp;
  document.getElementById('enemy-hp-bar').style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;

  const traitBadge = document.getElementById('enemy-trait-badge');
  if (e.trait && ENEMIES[e.id]) {
    traitBadge.textContent = ENEMIES[e.id].desc;
    traitBadge.classList.remove('hidden');
  } else {
    traitBadge.classList.add('hidden');
  }

  // プレイヤー
  document.getElementById('player-hp-current').textContent = bs.player.hp;
  document.getElementById('player-hp-max').textContent = bs.player.maxHp;
  document.getElementById('player-hp-bar').style.width = `${Math.max(0, (bs.player.hp / bs.player.maxHp) * 100)}%`;
  document.getElementById('battle-barrier-badge').textContent = `🛡️ ${bs.player.barrier}`;

  // 階層情報
  document.getElementById('battle-floor-info').textContent =
    `${bs.dungeon.icon} ${bs.dungeon.name} — WAVE ${bs.waveNumber}/${bs.totalWaves}`;

  renderActiveItemButtons();
}

function renderActiveItemButtons() {
  const bs = getBattleState();
  if (!bs) return;
  const container = document.getElementById('active-items-container');
  container.innerHTML = '';

  Object.entries(bs.activeItemUses).forEach(([itemId, uses]) => {
    const item = ITEMS[itemId];
    if (!item || uses <= 0) return;

    const btn = document.createElement('button');
    btn.className = 'px-2 py-1 text-xs rounded-lg font-bold transition-all ' +
      'bg-amber-900/60 hover:bg-amber-800/80 border border-amber-600/50 text-amber-200';
    btn.textContent = `${item.icon} ${item.name} (${uses})`;
    btn.onclick = () => handleActiveItem(itemId);
    container.appendChild(btn);
  });
}

// ─── 出題 ───
function nextQuestion() {
  const bs = getBattleState();
  if (!bs) return;
  bs.isProcessing = false;

  clearInterval(battleTimerInterval);
  clearTimeout(chameleonTimeout);

  document.getElementById('cutin-overlay').classList.add('hidden');

  const word = selectNextWord();
  if (!word) return;

  document.getElementById('question-text').textContent = word.en;

  // 正答/遭遇回数バッジ
  const wp = getWordProgress(saveData, word.id);
  const totalSeen = wp.correctCount + wp.incorrectCount;
  document.getElementById('question-stats-badge').textContent =
    `✅ ${wp.correctCount} / 遭遇 ${totalSeen}`;

  // 自動読み上げ
  if (saveData.permanent.settings.autoSpeak) {
    speakWord(false);
  }

  // 枠線カラー
  const card = document.getElementById('question-card');
  card.className = 'question-card ';
  if (wp.lastSeenTime === null) card.classList.add('card-high-value');
  else if (wp.lastResult === false) card.classList.add('card-mid-value');
  else card.classList.add('card-low-value');

  // 4択生成
  const choices = generateChoices(word, allWords);
  const container = document.getElementById('choices-container');
  container.innerHTML = '';
  choices.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = text;
    btn.dataset.index = i;
    btn.onclick = () => handleAnswer(text, btn);
    container.appendChild(btn);
  });

  // タイムリミットバー
  bs.questionStartTime = Date.now();
  const timeLimit = getEffectiveTimeLimit();
  const timeBar = document.getElementById('time-limit-bar');
  timeBar.style.width = '100%';

  battleTimerInterval = setInterval(() => {
    const elapsed = (Date.now() - bs.questionStartTime) / 1000;
    const remaining = Math.max(0, timeLimit - elapsed);
    const pct = (remaining / timeLimit) * 100;
    timeBar.style.width = `${pct}%`;

    if (pct < 25) timeBar.className = 'time-bar time-bar-danger';
    else if (pct < 50) timeBar.className = 'time-bar time-bar-warning';
    else timeBar.className = 'time-bar time-bar-normal';

    if (remaining <= 0) {
      clearInterval(battleTimerInterval);
      handleTimeOut();
    }
  }, 50);

  // カメレオンジャマー
  if (bs.currentEnemy && bs.currentEnemy.trait === 'chameleon') {
    chameleonTimeout = setTimeout(() => {
      if (bs.isProcessing) return;
      const btns = Array.from(container.children);
      const texts = btns.map(b => b.textContent);
      texts.sort(() => Math.random() - 0.5);
      btns.forEach((b, i) => {
        b.textContent = texts[i];
        b.classList.add('animate-shuffle');
        setTimeout(() => b.classList.remove('animate-shuffle'), 300);
      });
    }, 1000);
  }

  // 自信度スライダー（前回の値を維持！）
  const slider = document.getElementById('confidence-slider');
  if (bs.style && bs.style.effects && bs.style.effects.minConfidence) {
    slider.min = Math.round(bs.style.effects.minConfidence * 10);
  } else {
    slider.min = 10;
  }
  const currentVal = Math.max(parseInt(slider.min, 10), saveData.permanent.stats.lastConfidence || 10);
  slider.value = currentVal;
  bs.confidenceMultiplier = currentVal / 10;
  updateConfidenceDisplay();

  renderBattleUI();
}

function updateConfidenceDisplay() {
  const bs = getBattleState();
  if (!bs) return;
  const val = bs.confidenceMultiplier.toFixed(1);
  document.getElementById('confidence-val').textContent = `${val}x`;
}

// ─── 回答判定 ───
function handleAnswer(selectedText, btnElement) {
  const bs = getBattleState();
  if (!bs || bs.isProcessing) return;
  bs.isProcessing = true;
  clearInterval(battleTimerInterval);
  clearTimeout(chameleonTimeout);

  const responseTimeMs = Date.now() - bs.questionStartTime;
  const isCorrect = (selectedText === bs.currentWord.ja);

  const container = document.getElementById('choices-container');
  Array.from(container.children).forEach(b => {
    b.disabled = true;
    if (b.textContent === bs.currentWord.ja) {
      b.classList.add('choice-correct');
    }
  });

  incrementStat(saveData, 'totalAnswers');
  updateWordProgress(saveData, bs.currentWord.id, isCorrect);

  if (isCorrect) {
    btnElement.classList.add('choice-correct');
    incrementStat(saveData, 'totalCorrect');

    if (bs.confidenceMultiplier >= 2.0) {
      incrementStat(saveData, 'highConfidenceCorrect');
    }

    const shieldBlocked = processShieldEnemy(true);
    const { damage, isCritical, isDoubleAttack } = calcDamage(bs.currentWord, responseTimeMs, bs.confidenceMultiplier);

    if (isCritical) {
      incrementStat(saveData, 'totalCriticals');
      sound.playSE('critical');
    } else {
      sound.playSE('correct');
    }

    if (shieldBlocked) {
      setTimeout(() => {
        showCutin('🛡️ SHIELD!', `シールド残り${bs.currentEnemy.shieldHits - bs.shieldHits}`, 'cutin-shield');
        setTimeout(() => nextQuestion(), 800);
      }, 300);
    } else {
      setTimeout(() => {
        sound.playSE('attack');
        showCutin(
          isCritical ? '⚡ CRITICAL!!' : (isDoubleAttack ? '⚔️ DOUBLE ATTACK!!' : '✨ GREAT!'),
          `💥 ${damage} DMG`,
          isCritical ? 'cutin-critical' : 'cutin-great'
        );

        bs.currentEnemy.hp = Math.max(0, bs.currentEnemy.hp - damage);
        renderBattleUI();

        setTimeout(() => {
          if (bs.currentEnemy.hp <= 0) {
            const nextAction = onEnemyDefeated();
            if (nextAction === 'dungeonClear') {
              handleDungeonClear();
              return;
            } else if (nextAction === 'lootDrop') {
              // 戦利品3択ピックモーダルを表示！
              showLootDropModal();
              return;
            }
          }
          nextQuestion();
        }, 700);
      }, 300);
    }
  } else {
    btnElement.classList.add('choice-incorrect');
    incrementStat(saveData, 'totalIncorrect');
    sound.playSE('miss');
    processShieldEnemy(false);
    processMistake();
  }

  saveSaveData(saveData);
}

function handleTimeOut() {
  const bs = getBattleState();
  if (!bs || bs.isProcessing) return;
  bs.isProcessing = true;

  incrementStat(saveData, 'totalAnswers');
  incrementStat(saveData, 'totalIncorrect');
  sound.playSE('miss');
  updateWordProgress(saveData, bs.currentWord.id, false);
  processShieldEnemy(false);
  processMistake();
  saveSaveData(saveData);
}

function processMistake() {
  const bs = getBattleState();
  if (!bs) return;

  setTimeout(() => {
    const hasBarrier = checkBarrier();

    if (hasBarrier) {
      showCutin('🛡️ GUARD!', 'バリアがダメージを防いだ！', 'cutin-guard');
      renderBattleUI();
      setTimeout(() => showExplanationModal(), 800);
    } else {
      const penalty = calcMissPenalty(bs.confidenceMultiplier);
      bs.player.hp = Math.max(0, bs.player.hp - penalty);
      sound.playSE('damage');

      const healed = processVampire(penalty);

      showCutin('💔 MISS...', `-${penalty} HP${healed ? ' 🧛吸血!' : ''}`, 'cutin-miss');

      const battleEl = document.getElementById('battle-screen');
      battleEl.classList.add('shake-effect');
      setTimeout(() => battleEl.classList.remove('shake-effect'), 400);

      renderBattleUI();

      setTimeout(() => {
        if (bs.player.hp <= 0) {
          // 不死鳥の羽チェック
          if (checkRevive()) {
            showCutin('🪶 REVIVE!', '不死鳥の羽で蘇った！', 'cutin-great');
            renderBattleUI();
            setTimeout(() => showExplanationModal(), 800);
          } else {
            showGameOver();
          }
        } else {
          showExplanationModal();
        }
      }, 800);
    }
  }, 300);
}

// ─── 戦利品ドロップ（3択ピック）モーダル ───
function showLootDropModal() {
  const choices = generateLootChoices();
  const container = document.getElementById('loot-choices-container');
  container.innerHTML = '';

  choices.forEach(item => {
    const card = document.createElement('div');
    card.className = `loot-card rarity-${item.rarity}`;
    card.innerHTML = `
      <div class="text-3xl">${item.icon}</div>
      <div class="flex-1 text-left">
        <div class="flex items-center justify-between">
          <span class="font-black text-sm text-white">${item.name}</span>
          <span class="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-800 text-amber-300">${item.rarity}</span>
        </div>
        <p class="text-[11px] text-slate-300 mt-0.5 leading-snug">${item.desc}</p>
      </div>
    `;
    card.onclick = () => {
      pickLootItem(item.id);
      closeAllModals();
      spawnEnemy();
      nextQuestion();
    };
    container.appendChild(card);
  });

  sound.playSE('itemDrop');
  openModal('loot-modal');
}

// ─── カットイン演出 ───
function showCutin(title, sub, className) {
  const overlay = document.getElementById('cutin-overlay');
  const titleEl = document.getElementById('cutin-text');
  const subEl = document.getElementById('damage-text');

  titleEl.textContent = title;
  titleEl.className = `cutin-title ${className}`;
  subEl.textContent = sub;

  overlay.classList.remove('hidden');
  overlay.classList.add('animate-cutin');
  setTimeout(() => overlay.classList.remove('animate-cutin'), 600);
}

// ─── 解説モーダル ───
function showExplanationModal() {
  const bs = getBattleState();
  if (!bs) return;

  document.getElementById('exp-word').textContent = bs.currentWord.en;
  document.getElementById('exp-meaning').textContent = bs.currentWord.ja;

  const itemContainer = document.getElementById('exp-active-items');
  itemContainer.innerHTML = '';

  Object.entries(bs.activeItemUses).forEach(([itemId, uses]) => {
    const item = ITEMS[itemId];
    if (!item || uses <= 0) return;
    if (itemId === 'smoke_bomb') return; // 煙幕は出題中のみ

    const btn = document.createElement('button');
    btn.className = 'px-3 py-1.5 text-xs rounded-lg font-bold transition-all ' +
      'bg-amber-900/60 hover:bg-amber-800/80 border border-amber-600/50 text-amber-200';
    btn.textContent = `${item.icon} ${item.name} (${uses})`;
    btn.onclick = () => {
      const result = useActiveItem(itemId);
      if (result) {
        if (result.action === 'heal') {
          btn.textContent = `❤️ +${result.value} HP回復!`;
          btn.disabled = true;
          renderBattleUI();
        } else if (result.action === 'seal') {
          btn.textContent = `🔮 ${result.word} を封印!`;
          btn.disabled = true;
        }
      }
    };
    itemContainer.appendChild(btn);
  });

  openModal('explanation-modal');
}

function resumeAfterExplanation() {
  sound.playSE('click');
  closeAllModals();
  nextQuestion();
}

function handleActiveItem(itemId) {
  const bs = getBattleState();
  if (!bs || bs.isProcessing) return;

  const result = useActiveItem(itemId);
  if (!result) return;

  if (result.action === 'skip') {
    bs.isProcessing = true;
    clearInterval(battleTimerInterval);
    clearTimeout(chameleonTimeout);
    showCutin('💨 SKIP!', '煙幕で問題をスキップ!', 'cutin-guard');
    setTimeout(() => {
      bs.isProcessing = false;
      nextQuestion();
    }, 600);
  } else if (result.action === 'damage') {
    renderBattleUI();
    if (bs.currentEnemy.hp <= 0) {
      const nextAction = onEnemyDefeated();
      if (nextAction === 'dungeonClear') {
        handleDungeonClear();
      } else {
        showLootDropModal();
      }
    }
  } else if (result.action === 'resetTimer') {
    showCutin('⏰ REWIND!', 'タイマー全快！', 'cutin-great');
  }
}

// ─── ダンジョンクリア ───
function handleDungeonClear() {
  const bs = getBattleState();
  if (!bs) return;

  recordDungeonClear(saveData, bs.dungeon.id);

  let coins = bs.dungeon.coinReward + bs.player.defeatedCount * 2;
  // 黄金の磁石ボーナス
  if (bs.equippedItems.includes('gold_magnet')) {
    coins = Math.round(coins * 1.5);
  }
  saveData.permanent.coins += coins;

  if (bs.player.hp >= bs.player.maxHp) {
    incrementStat(saveData, 'perfectClears');
  }

  saveSaveData(saveData);

  sound.stopBGM();
  sound.playSE('stageClear');

  const result = endBattle();
  showResultScreen(true, result, coins);
}

function showGameOver() {
  const bs = getBattleState();
  if (!bs) return;

  const coins = Math.floor(bs.player.defeatedCount);
  saveData.permanent.coins += coins;
  saveSaveData(saveData);

  sound.stopBGM();
  sound.playSE('gameOver');

  const result = endBattle();
  showResultScreen(false, result, coins);
}

function showResultScreen(isVictory, result, coins) {
  const title = document.getElementById('result-title');
  const desc = document.getElementById('result-desc');
  const stats = document.getElementById('result-stats');
  const coinsEl = document.getElementById('result-coins');

  if (isVictory) {
    title.textContent = '🎉 DUNGEON CLEAR!!';
    title.className = 'text-3xl font-black mb-2 text-emerald-400 animate-pulse';
    desc.textContent = `${result.dungeon.name}を攻略！次のダンジョンが解放！`;
  } else {
    title.textContent = '💀 GAME OVER';
    title.className = 'text-3xl font-black mb-2 text-rose-500';
    desc.textContent = 'ダンジョン攻略失敗……装備を整えて再挑戦しよう！';
  }

  coinsEl.textContent = `🪙 +${coins} コイン獲得`;
  stats.textContent = `撃破数: ${result ? result.player.defeatedCount : 0}体`;

  showScreen('result-screen');
}

function returnToHome() {
  sound.playSE('click');
  endBattle();
  clearInterval(battleTimerInterval);
  clearTimeout(chameleonTimeout);
  showScreen('home-screen');
  renderHome();
}

// ═══════════════════════════════════
//  🎒 アイテムモーダル (5スロット & グリッド)
// ═══════════════════════════════════

function openItemModal() {
  sound.playSE('click');
  renderCarrySlots();
  renderItemGrid();
  openModal('item-modal');
}

function renderCarrySlots() {
  const container = document.getElementById('carry-slots-container');
  if (!container) return;
  container.innerHTML = '';

  const equipped = saveData.permanent.equippedItems || [];

  ITEM_SLOTS_DEF.forEach((slotDef, i) => {
    const isUnlocked = isSlotUnlocked(i);
    const itemId = equipped[i];
    const item = itemId ? ITEMS[itemId] : null;

    const slotDiv = document.createElement('div');
    if (!isUnlocked) {
      slotDiv.className = 'carry-slot carry-slot-locked';
      slotDiv.innerHTML = `
        <span class="text-sm">🔒</span>
        <span class="text-[8px] text-slate-400 font-bold">${slotDef.label}</span>
      `;
      slotDiv.onclick = () => {
        sound.playSE('click');
        alert(`【${slotDef.label} の解放条件】\n${slotDef.unlockCondition.label}`);
      };
    } else if (item) {
      slotDiv.className = `carry-slot carry-slot-equipped rarity-${item.rarity}`;
      slotDiv.innerHTML = `
        <span class="text-xl">${item.icon}</span>
        <span class="text-[8px] truncate max-w-[42px] font-bold text-amber-200">${item.name}</span>
      `;
      slotDiv.onclick = () => openItemDetailModal(itemId);
    } else {
      slotDiv.className = 'carry-slot carry-slot-empty';
      slotDiv.innerHTML = `
        <span class="text-xs text-slate-500 font-bold">空き</span>
        <span class="text-[8px] text-slate-500">${slotDef.label}</span>
      `;
    }
    container.appendChild(slotDiv);
  });
}

function renderItemGrid() {
  const container = document.getElementById('item-grid-container');
  if (!container) return;
  container.innerHTML = '';

  const unlocked = saveData.permanent.unlockedItems || [];
  const equipped = saveData.permanent.equippedItems || [];

  const countEl = document.getElementById('item-unlocked-count');
  if (countEl) {
    countEl.textContent = `${unlocked.length}/${Object.keys(ITEMS).length}`;
  }


  Object.entries(ITEMS).forEach(([itemId, item]) => {
    const isUnlocked = unlocked.includes(itemId);
    const isEquipped = equipped.includes(itemId);

    const card = document.createElement('div');
    if (isUnlocked) {
      card.className = `item-grid-card rarity-${item.rarity}`;
      card.innerHTML = `
        ${isEquipped ? '<span class="absolute top-1 right-1 text-[8px] bg-amber-500 text-black px-1 rounded font-black">装備中</span>' : ''}
        <span class="text-2xl mb-0.5">${item.icon}</span>
        <span class="text-[10px] font-bold text-white truncate max-w-full">${item.name}</span>
      `;
      card.onclick = () => openItemDetailModal(itemId);
    } else {
      card.className = 'item-grid-card locked border-slate-700';
      card.innerHTML = `
        <span class="text-2xl mb-0.5">❓</span>
        <span class="text-[10px] font-bold text-slate-500">未解放</span>
      `;
      card.onclick = () => {
        sound.playSE('click');
        alert('ガチャ（30🪙）を回して解放しましょう！');
      };
    }
    container.appendChild(card);
  });
}

function openItemDetailModal(itemId) {
  sound.playSE('click');
  selectedItemIdForDetail = itemId;
  const item = ITEMS[itemId];
  if (!item) return;

  document.getElementById('item-detail-icon').textContent = item.icon;
  document.getElementById('item-detail-name').textContent = item.name;
  
  const rarityEl = document.getElementById('item-detail-rarity');
  rarityEl.textContent = `${item.rarity} | ${item.type === 'passive' ? 'パッシブ' : 'アクティブ'}`;
  rarityEl.className = `text-[10px] font-bold uppercase tracking-wider mb-2 text-${item.rarity === 'legendary' ? 'amber-400' : (item.rarity === 'epic' ? 'purple-400' : (item.rarity === 'rare' ? 'sky-400' : 'slate-400'))}`;

  document.getElementById('item-detail-desc').textContent = item.desc;

  const isEquipped = (saveData.permanent.equippedItems || []).includes(itemId);
  const equipBtn = document.getElementById('btn-equip-toggle');
  if (isEquipped) {
    equipBtn.textContent = '持ち込みから外す';
    equipBtn.className = 'flex-1 py-2 bg-rose-600 hover:bg-rose-500 font-bold rounded-xl text-xs text-white';
  } else {
    equipBtn.textContent = '持ち込みに装備';
    equipBtn.className = 'flex-1 py-2 bg-amber-600 hover:bg-amber-500 font-bold rounded-xl text-xs text-white';
  }

  equipBtn.onclick = () => toggleEquipItem(itemId);
  openModal('item-detail-modal');
}

function toggleEquipItem(itemId) {
  sound.playSE('click');
  const equipped = saveData.permanent.equippedItems || [];
  const idx = equipped.indexOf(itemId);

  if (idx !== -1) {
    // 外す
    equipped.splice(idx, 1);
  } else {
    // 装備可能スロットがあるか
    let maxSlots = 0;
    ITEM_SLOTS_DEF.forEach((s, i) => { if (isSlotUnlocked(i)) maxSlots++; });

    if (equipped.length >= maxSlots) {
      alert(`解放済みスロット（${maxSlots}枠）が一杯です。\n装備中のアイテムを外すか、条件を達成して枠を増やしてください。`);
      return;
    }
    equipped.push(itemId);
  }

  saveData.permanent.equippedItems = equipped;
  saveSaveData(saveData);
  openItemModal();
}

// ─── ガチャ ───
function doGacha() {
  sound.playSE('click');
  const cost = 30;
  if (saveData.permanent.coins < cost) {
    alert(`コインが足りません。（必要: ${cost}🪙）\nダンジョンをクリアしたりクエストを達成してコインを集めましょう！`);
    return;
  }

  const locked = Object.keys(ITEMS).filter(id => !saveData.permanent.unlockedItems.includes(id));
  if (locked.length === 0) {
    alert('🎉 すべてのアイテム（全18種）が既に解放されています！');
    return;
  }

  saveData.permanent.coins -= cost;

  // レアリティ抽選
  const rand = Math.random();
  let targetRarity = 'common';
  if (rand < 0.02) targetRarity = 'legendary';
  else if (rand < 0.12) targetRarity = 'epic';
  else if (rand < 0.40) targetRarity = 'rare';

  let candidates = locked.filter(id => ITEMS[id].rarity === targetRarity);
  if (candidates.length === 0) {
    candidates = locked;
  }

  const chosenId = candidates[Math.floor(Math.random() * candidates.length)];
  const item = ITEMS[chosenId];

  saveData.permanent.unlockedItems.push(chosenId);
  saveSaveData(saveData);

  sound.playSE('itemGet');

  document.getElementById('gacha-result-icon').textContent = item.icon;
  document.getElementById('gacha-result-text').textContent = `${item.name} を入手！`;
  document.getElementById('gacha-result-rarity').textContent = `${item.rarity} | ${item.type}`;
  document.getElementById('gacha-result-desc').textContent = item.desc;

  openModal('gacha-result-modal');
  updateCoinsDisplay();
}

// ═══════════════════════════════════
//  🛡️ スタイル ＆ 能力値モーダル
// ═══════════════════════════════════

function openStyleListModal() {
  sound.playSE('click');
  renderAvatarStats();
  renderStyleList();
  openModal('style-list-modal');
}

function renderAvatarStats() {
  const masteredCount = getMasteredWordsCount(saveData);
  const stats = saveData.permanent.avatarStats;
  const usedSP = stats.atk + stats.def + stats.hp + stats.time;
  const remainingSP = Math.max(0, masteredCount - usedSP);

  document.getElementById('avatar-sp-available').textContent = remainingSP;

  document.getElementById('stat-val-atk').textContent = stats.atk;
  document.getElementById('stat-bonus-atk').textContent = stats.atk * 2;

  document.getElementById('stat-val-def').textContent = stats.def;
  document.getElementById('stat-bonus-def').textContent = stats.def * 1;

  document.getElementById('stat-val-hp').textContent = stats.hp;
  document.getElementById('stat-bonus-hp').textContent = stats.hp * 5;

  document.getElementById('stat-val-time').textContent = stats.time;
  document.getElementById('stat-bonus-time').textContent = (stats.time * 0.3).toFixed(1);

  // ボタン有効・無効化
  document.querySelectorAll('[data-stat-plus]').forEach(btn => {
    btn.disabled = remainingSP <= 0;
  });
  document.querySelectorAll('[data-stat-minus]').forEach(btn => {
    const key = btn.dataset.statMinus;
    btn.disabled = stats[key] <= 0;
  });
}

function adjustAvatarStat(statName, delta) {
  sound.playSE('click');
  const masteredCount = getMasteredWordsCount(saveData);
  const stats = saveData.permanent.avatarStats;
  const usedSP = stats.atk + stats.def + stats.hp + stats.time;
  const remainingSP = masteredCount - usedSP;

  if (delta > 0 && remainingSP <= 0) return;
  if (delta < 0 && stats[statName] <= 0) return;

  stats[statName] += delta;
  saveSaveData(saveData);
  renderAvatarStats();
}

function resetAvatarStats() {
  sound.playSE('click');
  if (confirm('割り振ったSPをすべてリセットしますか？')) {
    saveData.permanent.avatarStats = { atk: 0, def: 0, hp: 0, time: 0 };
    saveSaveData(saveData);
    renderAvatarStats();
  }
}

function renderStyleList() {
  const body = document.getElementById('style-list-body');
  body.innerHTML = '';

  const seenCount = getSeenWordsCount(saveData);

  STYLES.forEach((style, idx) => {
    const isUnlocked = isStyleUnlocked(style);
    const isSelected = currentStyleIdx === idx;

    const div = document.createElement('div');
    div.className = `p-3 rounded-xl border transition-all ${
      isSelected ? 'border-indigo-500 bg-indigo-950/40' :
      isUnlocked ? 'border-slate-700 bg-slate-900/60 hover:bg-slate-800/60' :
      'border-slate-800 bg-slate-950/40 opacity-55'
    }`;

    div.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="font-bold text-sm text-white">${style.icon} ${style.name}</span>
        ${isSelected ? '<span class="text-xs text-indigo-400 font-bold">選択中</span>' : ''}
        ${!isUnlocked ? `<span class="text-xs text-rose-400">🔒 遭遇 ${seenCount}/${style.unlockCondition.value}語</span>` : ''}
      </div>
      <p class="text-xs text-slate-400">${style.desc}</p>
    `;

    if (!isSelected) {
      const btn = document.createElement('button');
      btn.className = `mt-2 w-full py-1.5 rounded-lg text-xs font-bold transition-all ${
        isUnlocked ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
      }`;
      btn.textContent = isUnlocked ? 'このスタイルを選ぶ' : 'ロック中（効果なしで選択）';
      btn.onclick = () => {
        sound.playSE('click');
        currentStyleIdx = idx;
        updateStyleDisplay();
        renderStyleList();
      };
      div.appendChild(btn);
    }

    body.appendChild(div);
  });
}

// ═══════════════════════════════════
//  📜 クエストモーダル
// ═══════════════════════════════════

function openQuestModal() {
  sound.playSE('click');
  renderQuestList();
  openModal('quest-modal');
}

function renderQuestList() {
  const body = document.getElementById('quest-list-body');
  body.innerHTML = '';

  QUEST_CHAINS.forEach(chain => {
    // 未受取の最初のクエストをアクティブ表示
    const activeQuest = chain.find(q => !saveData.permanent.claimedQuests.includes(q.id));
    if (!activeQuest) {
      // チェーン全クリア
      const last = chain[chain.length - 1];
      const div = document.createElement('div');
      div.className = 'p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/20';
      div.innerHTML = `
        <div class="flex justify-between items-center">
          <span class="font-bold text-sm text-emerald-400">👑 ${last.name} (完全制覇)</span>
          <span class="text-xs text-emerald-300 font-bold">ALL CLEAR</span>
        </div>
      `;
      body.appendChild(div);
      return;
    }

    const progress = getQuestProgress(activeQuest);
    const isCompleted = progress >= 100;

    const div = document.createElement('div');
    div.className = `p-3 rounded-xl border transition-all ${
      isCompleted ? 'border-amber-500 bg-amber-950/25 shadow-lg' : 'border-slate-700 bg-slate-900/60'
    }`;

    div.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="font-bold text-sm text-white">${activeQuest.name}</span>
        <span class="text-xs text-yellow-400 font-bold">🪙 +${activeQuest.reward}</span>
      </div>
      <p class="text-xs text-slate-400 mb-2">${activeQuest.desc}</p>
      
      ${isCompleted ? `
        <button class="w-full py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black rounded-lg text-xs shadow-md transition-all animate-pulse"
                data-claim-quest="${activeQuest.id}">
          🎁 報酬を受け取る (🪙+${activeQuest.reward})
        </button>
      ` : `
        <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div class="bg-indigo-500 h-full transition-all" style="width: ${progress}%"></div>
        </div>
        <div class="text-[10px] text-slate-400 text-right mt-0.5 font-mono">${progress}%</div>
      `}
    `;

    body.appendChild(div);
  });

  body.querySelectorAll('[data-claim-quest]').forEach(btn => {
    btn.onclick = () => claimQuestReward(btn.dataset.claimQuest);
  });
}

function claimQuestReward(questId) {
  let foundQuest = null;
  for (const chain of QUEST_CHAINS) {
    foundQuest = chain.find(q => q.id === questId);
    if (foundQuest) break;
  }
  if (!foundQuest) return;

  saveData.permanent.claimedQuests.push(questId);
  saveData.permanent.coins += foundQuest.reward;
  saveSaveData(saveData);

  sound.playSE('itemGet');
  updateCoinsDisplay();
  updateQuestNotifyBadge();
  renderQuestList();
}

function getQuestProgress(quest) {
  const stats = saveData.permanent.stats;
  const cond = quest.condition;

  switch (cond.type) {
    case 'dungeonClearCount': {
      const total = Object.values(stats.dungeonClears).reduce((s, v) => s + v, 0);
      return Math.min(100, Math.round((total / cond.value) * 100));
    }
    case 'defeatedTotal':
      return Math.min(100, Math.round((stats.totalDefeated / cond.value) * 100));
    case 'criticalCount':
      return Math.min(100, Math.round((stats.totalCriticals / cond.value) * 100));
    case 'masteredWords':
      return Math.min(100, Math.round((getMasteredWordsCount(saveData) / cond.value) * 100));
    case 'highConfidenceCorrect':
      return Math.min(100, Math.round((stats.highConfidenceCorrect / cond.value) * 100));
    default:
      return 0;
  }
}

// ═══════════════════════════════════
//  📖 単語モーダル群
// ═══════════════════════════════════

function openWordListModal() {
  sound.playSE('click');
  const dungeon = DUNGEONS[currentDungeonIdx];
  const body = document.getElementById('word-list-body');
  body.innerHTML = '';

  const dungeonWords = dungeon.wordList || (dungeon.wordRange ? allWords.slice(dungeon.wordRange.start, dungeon.wordRange.end) : allWords);

  dungeonWords.forEach(w => {
    if (!w) return;
    const wp = getWordProgress(saveData, w.id);
    const isSeen = wp.lastSeenTime !== null;

    const div = document.createElement('div');
    div.className = 'word-list-item';
    div.innerHTML = `
      <div class="flex-1 min-w-0">
        <span class="font-bold text-white">${isSeen ? w.en : '❓❓❓'}</span>
        <span class="text-slate-400 text-xs ml-2">${isSeen ? w.ja : ''}</span>
      </div>
      <div class="text-xs text-slate-400 shrink-0">
        ${getMasteryBadge(wp.masteryLevel)}
        <span class="ml-1 font-mono">✅${wp.correctCount} ❌${wp.incorrectCount}</span>
      </div>
    `;
    if (isSeen) {
      div.onclick = () => openWordDetailModal(w, wp);
      div.style.cursor = 'pointer';
    }
    body.appendChild(div);
  });

  openModal('word-list-modal');
}

function openTotalWordModal() {
  sound.playSE('click');
  renderTotalWordList();
  openModal('total-word-modal');
}

function renderTotalWordList() {
  const body = document.getElementById('total-word-list-body');
  body.innerHTML = '';

  let filtered = allWords;
  if (totalWordFilterStage !== 'all') {
    const stageNum = parseInt(totalWordFilterStage, 10);
    const dungeon = DUNGEONS[stageNum - 1];
    filtered = dungeon ? (dungeon.wordList || []) : [];
  }

  const mastered = getMasteredWordsCount(saveData);
  const seen = getSeenWordsCount(saveData);

  document.getElementById('total-word-stats').textContent =
    `全${allWords.length}語 — ✅マスター${mastered} | 遭遇${seen} | 表示中${filtered.length}語`;

  filtered.forEach(w => {
    const wp = getWordProgress(saveData, w.id);
    const isSeen = wp.lastSeenTime !== null;
    const stageLabel = getWordStageLabel(w);

    const div = document.createElement('div');
    div.className = 'word-list-item';
    div.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="font-bold text-white text-xs">${w.en}</span>
          <span class="text-[9px] px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 font-bold border border-indigo-800">${stageLabel}</span>
        </div>
        <div class="text-slate-400 text-xs truncate">${isSeen ? w.ja : '???'}</div>
      </div>
      <div class="text-xs text-slate-500 shrink-0">
        ${getMasteryBadge(wp.masteryLevel)}
      </div>
    `;
    if (isSeen) {
      div.onclick = () => openWordDetailModal(w, wp);
      div.style.cursor = 'pointer';
    }
    body.appendChild(div);
  });
}

function getWordStageLabel(word) {
  for (let i = 0; i < DUNGEONS.length; i++) {
    const d = DUNGEONS[i];
    if (d.wordList && d.wordList.some(item => item.id === word.id)) {
      return `Stage ${i + 1}`;
    }
  }
  return 'Stage 1';
}

function openWordDetailModal(word, wp) {
  sound.playSE('click');
  document.getElementById('detail-word-en').textContent = word.en;
  document.getElementById('detail-word-ja').textContent = word.ja;
  document.getElementById('detail-correct').textContent = wp.correctCount;
  document.getElementById('detail-incorrect').textContent = wp.incorrectCount;
  document.getElementById('detail-mastery').innerHTML = getMasteryBadge(wp.masteryLevel);
  document.getElementById('detail-stage').textContent = getWordStageLabel(word);
  document.getElementById('detail-last-seen').textContent =
    wp.lastSeenTime ? new Date(wp.lastSeenTime).toLocaleString('ja-JP') : '未出題';

  document.getElementById('detail-speak-btn').onclick = () => speakText(word.en);
  document.getElementById('detail-slow-btn').onclick = () => speakText(word.en, true);

  openModal('word-detail-modal');
}

function getMasteryBadge(level) {
  switch (level) {
    case 3: return '<span class="text-emerald-400 font-bold">★★★</span>';
    case 2: return '<span class="text-yellow-400 font-bold">★★☆</span>';
    case 1: return '<span class="text-orange-400 font-bold">★☆☆</span>';
    default: return '<span class="text-slate-600">☆☆☆</span>';
  }
}

// ═══════════════════════════════════
//  ⚙️ 設定モーダル
// ═══════════════════════════════════

function openSettingsModal() {
  sound.playSE('click');
  updateSettingsUI();
  openModal('settings-modal');
}

function updateSettingsUI() {
  const s = saveData.permanent.settings;
  const bgmBtn = document.getElementById('toggle-bgm');
  const seBtn = document.getElementById('toggle-se');
  const speakBtn = document.getElementById('toggle-autospeak');

  bgmBtn.textContent = s.bgmEnabled ? 'ON' : 'OFF';
  bgmBtn.className = `px-3 py-1 rounded-lg font-bold text-xs ${s.bgmEnabled ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-400'}`;

  seBtn.textContent = s.seEnabled ? 'ON' : 'OFF';
  seBtn.className = `px-3 py-1 rounded-lg font-bold text-xs ${s.seEnabled ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-400'}`;

  speakBtn.textContent = s.autoSpeak ? 'ON' : 'OFF';
  speakBtn.className = `px-3 py-1 rounded-lg font-bold text-xs ${s.autoSpeak ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-400'}`;
}

function handleResetData() {
  sound.playSE('click');
  if (confirm('すべての学習データとプレイヤーデータをリセットしますか？\nこの操作は取り消せません。')) {
    saveData = resetSaveData();
    sound.updateSettings(saveData.permanent.settings);
    closeAllModals();
    renderHome();
  }
}

// ═══════════════════════════════════
//  初期化
// ═══════════════════════════════════
async function init() {
  saveData = loadSaveData();
  sound.updateSettings(saveData.permanent.settings);

  await loadWordsCSV();
  renderHome();
  console.log('LEAP Rogue-Lite RPG v2.1 initialized!');
}

// ─── グローバルイベントバインド ───
window.addEventListener('DOMContentLoaded', () => {
  init();

  // ホーム画面
  document.getElementById('btn-prev-dungeon').addEventListener('click', prevDungeon);
  document.getElementById('btn-next-dungeon').addEventListener('click', nextDungeon);
  document.getElementById('btn-start-battle').addEventListener('click', startBattle);
  document.getElementById('btn-prev-style').addEventListener('click', () => changeStyle(-1));
  document.getElementById('btn-next-style').addEventListener('click', () => changeStyle(1));
  document.getElementById('btn-open-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-open-wordlist').addEventListener('click', openWordListModal);
  document.getElementById('btn-open-items').addEventListener('click', openItemModal);
  document.getElementById('btn-open-stylelist').addEventListener('click', openStyleListModal);
  document.getElementById('btn-open-totalwords').addEventListener('click', openTotalWordModal);
  document.getElementById('btn-open-quests').addEventListener('click', openQuestModal);
  document.getElementById('home-chart-area').addEventListener('click', openWordListModal);
  document.getElementById('home-style-area').addEventListener('click', openStyleListModal);

  // バトル画面
  document.getElementById('btn-retreat').addEventListener('click', returnToHome);
  document.getElementById('btn-speak').addEventListener('click', () => speakWord(false));
  document.getElementById('btn-speak-slow').addEventListener('click', () => speakWord(true));
  document.getElementById('confidence-slider').addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    saveData.permanent.stats.lastConfidence = val;
    const bs = getBattleState();
    if (bs) {
      bs.confidenceMultiplier = val / 10;
      updateConfidenceDisplay();
    }
    saveSaveData(saveData);
  });

  // 解説モーダル
  document.getElementById('btn-exp-next').addEventListener('click', resumeAfterExplanation);
  document.getElementById('btn-exp-speak').addEventListener('click', () => speakWord(false));
  document.getElementById('btn-exp-slow').addEventListener('click', () => speakWord(true));

  // リザルト画面
  document.getElementById('btn-result-home').addEventListener('click', returnToHome);

  // 設定トグル
  document.getElementById('toggle-bgm').addEventListener('click', () => {
    sound.playSE('click');
    saveData.permanent.settings.bgmEnabled = !saveData.permanent.settings.bgmEnabled;
    sound.updateSettings(saveData.permanent.settings);
    saveSaveData(saveData);
    updateSettingsUI();
  });
  document.getElementById('toggle-se').addEventListener('click', () => {
    saveData.permanent.settings.seEnabled = !saveData.permanent.settings.seEnabled;
    sound.updateSettings(saveData.permanent.settings);
    sound.playSE('click');
    saveSaveData(saveData);
    updateSettingsUI();
  });
  document.getElementById('toggle-autospeak').addEventListener('click', () => {
    sound.playSE('click');
    saveData.permanent.settings.autoSpeak = !saveData.permanent.settings.autoSpeak;
    saveSaveData(saveData);
    updateSettingsUI();
  });
  document.getElementById('btn-reset-data').addEventListener('click', handleResetData);

  // ガチャ
  document.getElementById('btn-gacha').addEventListener('click', doGacha);

  // 能力値SP調整ボタン
  document.querySelectorAll('[data-stat-plus]').forEach(btn => {
    btn.addEventListener('click', () => adjustAvatarStat(btn.dataset.statPlus, 1));
  });
  document.querySelectorAll('[data-stat-minus]').forEach(btn => {
    btn.addEventListener('click', () => adjustAvatarStat(btn.dataset.statMinus, -1));
  });
  document.getElementById('btn-reset-sp').addEventListener('click', resetAvatarStats);

  // 総単語フィルター
  document.querySelectorAll('[data-stage-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      sound.playSE('click');
      totalWordFilterStage = btn.dataset.stageFilter;
      document.querySelectorAll('[data-stage-filter]').forEach(b => {
        b.className = 'stage-filter-btn px-2 py-1 rounded bg-slate-800 text-slate-300';
      });
      btn.className = 'stage-filter-btn px-2 py-1 rounded bg-indigo-600 text-white font-bold';
      renderTotalWordList();
    });
  });

  // モーダル閉じるボタン
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      sound.playSE('click');
      closeAllModals();
    });
  });
});

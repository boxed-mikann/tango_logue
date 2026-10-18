// ============================================================
// main.js — メインループ、画面遷移、モーダル制御、イベント管理
// ============================================================

import { DUNGEONS, ENEMIES, STYLES, ITEMS, QUESTS, DAMAGE_CONFIG, assignWordsToDungeons } from './data.js';
import {
  initBattle, getBattleState, selectNextWord, generateChoices,
  calcDamage, calcMissPenalty, checkBarrier, processShieldEnemy,
  processVampire, useActiveItem, onEnemyDefeated, getEffectiveTimeLimit,
  endBattle, spawnEnemy,
} from './battle.js';
import {
  loadSaveData, saveSaveData, resetSaveData,
  getWordProgress, updateWordProgress, incrementStat, recordDungeonClear,
} from './storage.js';

// ─── グローバル状態 ───
let allWords = [];
let saveData = null;
let currentDungeonIdx = 0;
let currentStyleIdx = 0;
let homeChartInstance = null;

// ─── CSV読み込み ───
async function loadWordsCSV() {
  try {
    const response = await fetch('./words.csv');
    const text = await response.text();
    const lines = text.split('\n').filter(l => l.trim());
    allWords = lines.map((line, idx) => {
      // 引用符対応の簡易CSVトークナイザー
      const parts = parseCsvLine(line.trim());
      if (parts.length < 2) return null;

      let en, ja, stage = null;

      // パターン1: [stage, en, ja] (第1列がステージ番号1-5)
      if (parts.length >= 3 && /^[1-5]$/.test(parts[0])) {
        stage = parseInt(parts[0], 10);
        en = parts[1];
        ja = parts.slice(2).join(',');
      }
      // パターン2: [en, ja, stage] (末尾がステージ番号1-5)
      else if (parts.length >= 3 && /^[1-5]$/.test(parts[parts.length - 1])) {
        stage = parseInt(parts[parts.length - 1], 10);
        en = parts[0];
        ja = parts.slice(1, -1).join(',');
      }
      // パターン3: [en, ja] (ステージなし)
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
    // フォールバック
    allWords = [
      { id: 1, en: 'agree', ja: '賛成する' },
      { id: 2, en: 'oppose', ja: '反対する' },
      { id: 3, en: 'advise', ja: '忠告する' },
      { id: 4, en: 'discuss', ja: '話し合う' },
      { id: 5, en: 'blame', ja: '責任があるとする' },
    ];
    assignWordsToDungeons(allWords);
  }
}

// 簡易CSVパース補助
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
  'gacha-result-modal',
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

// ─── ホーム画面レンダリング ───
function renderHome() {
  const dungeon = DUNGEONS[currentDungeonIdx];
  document.getElementById('home-dungeon-name').textContent = `${dungeon.icon} ${dungeon.name}`;
  document.getElementById('home-dungeon-subtitle').textContent = dungeon.subtitle;

  // 円グラフ
  updateHomeChart();
  updateStyleDisplay();
  updateCoinsDisplay();
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
      animation: { duration: 400 },
    },
  });
}

function updateStyleDisplay() {
  const styleId = saveData.permanent.selectedStyle;
  const style = STYLES.find(s => s.id === styleId) || STYLES[0];
  currentStyleIdx = STYLES.indexOf(style);
  document.getElementById('home-style-name').textContent = `${style.icon} ${style.name}`;
  document.getElementById('home-style-desc').textContent = style.desc;
}

// ─── ダンジョン切替 ───
function prevDungeon() {
  currentDungeonIdx = (currentDungeonIdx - 1 + DUNGEONS.length) % DUNGEONS.length;
  renderHome();
}
function nextDungeon() {
  currentDungeonIdx = (currentDungeonIdx + 1) % DUNGEONS.length;
  renderHome();
}

// ─── スタイル切替 ───
function changeStyle(direction) {
  // アンロック済みスタイルのみ
  const unlocked = STYLES.filter(s =>
    !s.unlockCondition || saveData.permanent.unlockedStyles.includes(s.id)
  );
  if (unlocked.length === 0) return;

  const currentId = saveData.permanent.selectedStyle;
  let idx = unlocked.findIndex(s => s.id === currentId);
  idx = (idx + direction + unlocked.length) % unlocked.length;
  saveData.permanent.selectedStyle = unlocked[idx].id;
  saveSaveData(saveData);
  updateStyleDisplay();
}

// ─── 音声読み上げ ───
function speakWord(slow = false) {
  const bs = getBattleState();
  const word = bs ? bs.currentWord : null;
  if (!word) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word.en);
  utterance.lang = 'en-US';
  utterance.rate = slow ? 0.5 : 1.0;
  window.speechSynthesis.speak(utterance);
}

// 任意の英単語を読む（モーダル用）
function speakText(text, slow = false) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = slow ? 0.5 : 1.0;
  window.speechSynthesis.speak(utterance);
}

// ═══════════════════════════════════
//  バトル画面
// ═══════════════════════════════════

let battleTimerInterval = null;
let chameleonTimeout = null;

function startBattle() {
  const equippedItems = saveData.permanent.equippedItems || [];
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
  document.getElementById('enemy-hp-bar').style.width = `${(e.hp / e.maxHp) * 100}%`;

  // 敵特性表示
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
  document.getElementById('player-hp-bar').style.width = `${(bs.player.hp / bs.player.maxHp) * 100}%`;
  document.getElementById('battle-barrier-badge').textContent = `🛡️ ${bs.player.barrier}`;

  // 階層表示
  document.getElementById('battle-floor-info').textContent =
    `${bs.dungeon.icon} ${bs.dungeon.name} — WAVE ${bs.waveNumber}/${bs.totalWaves}`;

  // アクティブアイテムボタン
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

  // 問題カード
  document.getElementById('question-text').textContent = word.en;

  // 枠線カラー（単語価値表示）
  const wp = getWordProgress(saveData, word.id);
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

    // 色変化
    if (pct < 25) timeBar.className = 'time-bar time-bar-danger';
    else if (pct < 50) timeBar.className = 'time-bar time-bar-warning';
    else timeBar.className = 'time-bar time-bar-normal';

    if (remaining <= 0) {
      clearInterval(battleTimerInterval);
      handleTimeOut();
    }
  }, 50);

  // カメレオン: 1秒後にシャッフル
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

  // 自信度スライダーリセット
  const slider = document.getElementById('confidence-slider');
  // 狂戦士: 最低1.2x
  const style = bs.style;
  if (style.effects.minConfidence) {
    slider.min = Math.round(style.effects.minConfidence * 10);
  } else {
    slider.min = 10;
  }
  slider.value = slider.min;
  bs.confidenceMultiplier = parseFloat(slider.value) / 10;
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

  // 選択肢を全無効化
  const container = document.getElementById('choices-container');
  Array.from(container.children).forEach(b => {
    b.disabled = true;
    if (b.textContent === bs.currentWord.ja) {
      b.classList.add('choice-correct');
    }
  });

  // 統計更新
  incrementStat(saveData, 'totalAnswers');
  updateWordProgress(saveData, bs.currentWord.id, isCorrect);

  if (isCorrect) {
    btnElement.classList.add('choice-correct');
    incrementStat(saveData, 'totalCorrect');

    // 自信度2.0x以上で正解
    if (bs.confidenceMultiplier >= 2.0) {
      incrementStat(saveData, 'highConfidenceCorrect');
    }

    // シールドスライムチェック
    const shieldBlocked = processShieldEnemy(true);

    // ダメージ計算
    const { damage, isCritical } = calcDamage(bs.currentWord, responseTimeMs, bs.confidenceMultiplier);

    if (isCritical) {
      incrementStat(saveData, 'totalCriticals');
    }

    if (shieldBlocked) {
      // シールド未貫通
      setTimeout(() => {
        showCutin('🛡️ SHIELD!', `シールド残り${bs.currentEnemy.shieldHits - bs.shieldHits}`, 'cutin-shield');
        setTimeout(() => nextQuestion(), 800);
      }, 300);
    } else {
      setTimeout(() => {
        showCutin(
          isCritical ? '⚡ CRITICAL!!' : '✨ GREAT!',
          `💥 ${damage} DMG`,
          isCritical ? 'cutin-critical' : 'cutin-great'
        );

        bs.currentEnemy.hp = Math.max(0, bs.currentEnemy.hp - damage);
        renderBattleUI();

        setTimeout(() => {
          if (bs.currentEnemy.hp <= 0) {
            const result = onEnemyDefeated();
            if (result === 'dungeonClear') {
              handleDungeonClear();
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

      // ヴァンパイア処理
      const healed = processVampire(penalty);

      showCutin('💔 MISS...', `-${penalty} HP${healed ? ' 🧛吸血!' : ''}`, 'cutin-miss');

      // シェイクエフェクト
      const battleEl = document.getElementById('battle-screen');
      battleEl.classList.add('shake-effect');
      setTimeout(() => battleEl.classList.remove('shake-effect'), 400);

      renderBattleUI();

      setTimeout(() => {
        if (bs.player.hp <= 0) {
          showGameOver();
        } else {
          showExplanationModal();
        }
      }, 800);
    }
  }, 300);
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

  // 解説モーダル内のアクティブアイテム表示
  const itemContainer = document.getElementById('exp-active-items');
  itemContainer.innerHTML = '';

  Object.entries(bs.activeItemUses).forEach(([itemId, uses]) => {
    const item = ITEMS[itemId];
    if (!item || uses <= 0) return;
    if (itemId === 'smoke_bomb') return; // 煙幕は出題中専用

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
  closeAllModals();
  nextQuestion();
}

// ─── アクティブアイテム使用（出題中） ───
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
  }
}

// ─── ダンジョンクリア ───
function handleDungeonClear() {
  const bs = getBattleState();
  if (!bs) return;

  recordDungeonClear(saveData, bs.dungeon.id);
  const coins = bs.dungeon.coinReward + bs.player.defeatedCount * 2;
  saveData.permanent.coins += coins;

  // パーフェクトクリアチェック
  if (bs.player.hp >= bs.player.maxHp) {
    incrementStat(saveData, 'perfectClears');
  }

  // クエストチェック
  checkQuests();

  saveSaveData(saveData);

  const result = endBattle();
  showResultScreen(true, result, coins);
}

function showGameOver() {
  const bs = getBattleState();
  if (!bs) return;

  // 少しだけコインを付与
  const coins = Math.floor(bs.player.defeatedCount);
  saveData.permanent.coins += coins;
  saveSaveData(saveData);

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
    desc.textContent = `${result.dungeon.name}を攻略！`;
  } else {
    title.textContent = '💀 GAME OVER';
    title.className = 'text-3xl font-black mb-2 text-rose-500';
    desc.textContent = 'ダンジョン攻略失敗……次こそは！';
  }

  coinsEl.textContent = `🪙 +${coins} コイン獲得`;

  // 統計
  if (result && result.runLog) {
    const correct = result.runLog.filter(r => r.correct).length;
    const total = result.runLog.length;
    stats.textContent = `撃破: ${result.player.defeatedCount}体 | 正答率: ${total > 0 ? Math.round(correct/total*100) : 0}%`;
  } else {
    stats.textContent = `撃破: ${result ? result.player.defeatedCount : 0}体`;
  }

  showScreen('result-screen');
}

function returnToHome() {
  endBattle();
  clearInterval(battleTimerInterval);
  clearTimeout(chameleonTimeout);
  showScreen('home-screen');
  renderHome();
}

// ═══════════════════════════════════
//  モーダル群
// ═══════════════════════════════════

// ─── 設定モーダル ───
function openSettingsModal() {
  openModal('settings-modal');
}

function handleResetData() {
  if (confirm('すべての学習データとプレイヤーデータをリセットしますか？\nこの操作は取り消せません。')) {
    saveData = resetSaveData();
    closeAllModals();
    renderHome();
  }
}

// ─── 単語リストモーダル（ダンジョン別） ───
function openWordListModal() {
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
        <span class="ml-1">✅${wp.correctCount} ❌${wp.incorrectCount}</span>
      </div>
    `;
    if (isSeen) {
      div.onclick = () => openWordDetailModal(w, wp);
      div.style.cursor = 'pointer';
    }
    body.appendChild(div);
  }

  openModal('word-list-modal');
}

function getMasteryBadge(level) {
  switch (level) {
    case 3: return '<span class="text-emerald-400 font-bold">★★★</span>';
    case 2: return '<span class="text-yellow-400 font-bold">★★☆</span>';
    case 1: return '<span class="text-orange-400 font-bold">★☆☆</span>';
    default: return '<span class="text-slate-600">☆☆☆</span>';
  }
}

// ─── 単語詳細モーダル ───
function openWordDetailModal(word, wp) {
  document.getElementById('detail-word-en').textContent = word.en;
  document.getElementById('detail-word-ja').textContent = word.ja;
  document.getElementById('detail-correct').textContent = wp.correctCount;
  document.getElementById('detail-incorrect').textContent = wp.incorrectCount;
  document.getElementById('detail-mastery').innerHTML = getMasteryBadge(wp.masteryLevel);
  document.getElementById('detail-last-seen').textContent =
    wp.lastSeenTime ? new Date(wp.lastSeenTime).toLocaleString('ja-JP') : '未出題';

  // 音声ボタン
  document.getElementById('detail-speak-btn').onclick = () => speakText(word.en);
  document.getElementById('detail-slow-btn').onclick = () => speakText(word.en, true);

  openModal('word-detail-modal');
}

// ─── スタイル説明モーダル ───
function openStyleModal() {
  const style = STYLES[currentStyleIdx];
  document.getElementById('style-modal-name').textContent = `${style.icon} ${style.name}`;
  document.getElementById('style-modal-desc').textContent = style.desc;
  openModal('style-detail-modal');
}

// ─── スタイル一覧モーダル ───
function openStyleListModal() {
  const body = document.getElementById('style-list-body');
  body.innerHTML = '';

  STYLES.forEach(style => {
    const isUnlocked = !style.unlockCondition || saveData.permanent.unlockedStyles.includes(style.id);
    const isSelected = saveData.permanent.selectedStyle === style.id;

    const div = document.createElement('div');
    div.className = `p-3 rounded-xl border transition-all ${
      isSelected ? 'border-indigo-500 bg-indigo-950/40' :
      isUnlocked ? 'border-slate-600 bg-slate-800/60 hover:bg-slate-700/60' :
      'border-slate-700 bg-slate-900/40 opacity-50'
    }`;

    div.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="font-bold text-sm">${style.icon} ${style.name}</span>
        ${isSelected ? '<span class="text-xs text-indigo-400 font-bold">装備中</span>' : ''}
        ${!isUnlocked ? `<span class="text-xs text-slate-500">🔒 ${style.unlockCondition.label}</span>` : ''}
      </div>
      <p class="text-xs text-slate-400">${style.desc}</p>
    `;

    if (isUnlocked && !isSelected) {
      const btn = document.createElement('button');
      btn.className = 'mt-2 w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-all';
      btn.textContent = '装備する';
      btn.onclick = (e) => {
        e.stopPropagation();
        saveData.permanent.selectedStyle = style.id;
        saveSaveData(saveData);
        updateStyleDisplay();
        openStyleListModal(); // 再描画
      };
      div.appendChild(btn);
    }

    body.appendChild(div);
  });

  openModal('style-list-modal');
}

// ─── アイテムモーダル ───
function openItemModal() {
  const body = document.getElementById('item-list-body');
  body.innerHTML = '';

  // 持ち込み枠表示
  const slotsEl = document.getElementById('item-slots-info');
  slotsEl.textContent = `持ち込み枠: ${saveData.permanent.equippedItems.length}/${saveData.permanent.maxItemSlots}`;

  Object.entries(ITEMS).forEach(([itemId, item]) => {
    const isUnlocked = !item.unlockCondition || saveData.permanent.unlockedItems.includes(itemId);
    const isEquipped = saveData.permanent.equippedItems.includes(itemId);

    const div = document.createElement('div');
    div.className = `p-3 rounded-xl border transition-all ${
      isEquipped ? 'border-amber-500 bg-amber-950/30' :
      isUnlocked ? 'border-slate-600 bg-slate-800/60 hover:bg-slate-700/60' :
      'border-slate-700 bg-slate-900/40 opacity-50'
    }`;

    div.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="font-bold text-sm">${item.icon} ${item.name}
          <span class="text-xs text-slate-400">(${item.type === 'passive' ? 'パッシブ' : 'アクティブ'})</span>
        </span>
        ${isEquipped ? '<span class="text-xs text-amber-400 font-bold">装備中</span>' : ''}
        ${!isUnlocked ? `<span class="text-xs text-slate-500">🔒 ${item.unlockCondition.label}</span>` : ''}
      </div>
      <p class="text-xs text-slate-400">${item.desc}</p>
    `;

    if (isUnlocked) {
      const btn = document.createElement('button');
      btn.className = `mt-2 w-full py-1.5 rounded-lg text-xs font-bold transition-all ${
        isEquipped ? 'bg-rose-600 hover:bg-rose-500' : 'bg-amber-600 hover:bg-amber-500'
      }`;
      btn.textContent = isEquipped ? '外す' : '装備する';
      btn.onclick = (e) => {
        e.stopPropagation();
        if (isEquipped) {
          saveData.permanent.equippedItems = saveData.permanent.equippedItems.filter(id => id !== itemId);
        } else if (saveData.permanent.equippedItems.length < saveData.permanent.maxItemSlots) {
          saveData.permanent.equippedItems.push(itemId);
        } else {
          alert(`持ち込み枠が上限（${saveData.permanent.maxItemSlots}）です。\n他のアイテムを外してから装備してください。`);
          return;
        }
        saveSaveData(saveData);
        openItemModal(); // 再描画
      };
      div.appendChild(btn);
    }

    body.appendChild(div);
  });

  openModal('item-modal');
}

// ─── 総単語リストモーダル ───
function openTotalWordModal() {
  const body = document.getElementById('total-word-list-body');
  body.innerHTML = '';

  // 全体統計
  let totalMastered = 0, totalLearning = 0, totalUnseen = 0;
  allWords.forEach(w => {
    const wp = getWordProgress(saveData, w.id);
    if (wp.lastSeenTime === null) totalUnseen++;
    else if (wp.masteryLevel >= 2) totalMastered++;
    else totalLearning++;
  });

  document.getElementById('total-word-stats').textContent =
    `全${allWords.length}語 — ✅マスター${totalMastered}  📝学習中${totalLearning}  ❓未出題${totalUnseen}`;

  allWords.forEach(w => {
    const wp = getWordProgress(saveData, w.id);
    const isSeen = wp.lastSeenTime !== null;

    const div = document.createElement('div');
    div.className = 'word-list-item';
    div.innerHTML = `
      <div class="flex-1 min-w-0">
        <span class="font-bold text-white text-xs">${w.en}</span>
        <span class="text-slate-400 text-xs ml-1">${isSeen ? w.ja : '???'}</span>
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

  openModal('total-word-modal');
}

// ─── クエストモーダル ───
function openQuestModal() {
  const body = document.getElementById('quest-list-body');
  body.innerHTML = '';

  QUESTS.forEach(quest => {
    const isCompleted = saveData.permanent.stats.completedQuests.includes(quest.id);
    const progress = getQuestProgress(quest);

    const div = document.createElement('div');
    div.className = `p-3 rounded-xl border transition-all ${
      isCompleted ? 'border-emerald-500 bg-emerald-950/30' : 'border-slate-600 bg-slate-800/60'
    }`;

    div.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="font-bold text-sm ${isCompleted ? 'text-emerald-400' : 'text-white'}">${isCompleted ? '✅ ' : ''}${quest.name}</span>
        <span class="text-xs text-yellow-400 font-bold">🪙 ${quest.reward.coins}</span>
      </div>
      <p class="text-xs text-slate-400 mb-1">${quest.desc}</p>
      ${!isCompleted ? `
        <div class="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
          <div class="bg-indigo-500 h-full transition-all" style="width: ${progress}%"></div>
        </div>
        <div class="text-xs text-slate-500 text-right mt-0.5">${progress}%</div>
      ` : ''}
    `;

    body.appendChild(div);
  });

  openModal('quest-modal');
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
    case 'masteredWords': {
      let count = 0;
      Object.values(saveData.wordProgress).forEach(wp => { if (wp.masteryLevel >= 2) count++; });
      return Math.min(100, Math.round((count / cond.value) * 100));
    }
    case 'allDungeonsClear': {
      const cleared = DUNGEONS.filter(d => stats.dungeonClears[d.id] > 0).length;
      return Math.min(100, Math.round((cleared / DUNGEONS.length) * 100));
    }
    case 'highConfidenceCorrect':
      return Math.min(100, Math.round((stats.highConfidenceCorrect / cond.value) * 100));
    case 'perfectClear':
      return stats.perfectClears > 0 ? 100 : 0;
    case 'totalAnswers':
      return Math.min(100, Math.round((stats.totalAnswers / cond.value) * 100));
    default:
      return 0;
  }
}

function checkQuests() {
  QUESTS.forEach(quest => {
    if (saveData.permanent.stats.completedQuests.includes(quest.id)) return;
    if (getQuestProgress(quest) >= 100) {
      saveData.permanent.stats.completedQuests.push(quest.id);
      saveData.permanent.coins += quest.reward.coins;
      // アイテム解放報酬
      if (quest.reward.unlockItem && !saveData.permanent.unlockedItems.includes(quest.reward.unlockItem)) {
        saveData.permanent.unlockedItems.push(quest.reward.unlockItem);
      }
    }
  });
}

// ─── ガチャ（簡易） ───
function doGacha() {
  const cost = 30;
  if (saveData.permanent.coins < cost) {
    alert(`コインが足りません。（必要: ${cost}コイン）`);
    return;
  }

  // ロック中のアイテムからランダムに1つ解放
  const locked = Object.entries(ITEMS).filter(([id]) =>
    !saveData.permanent.unlockedItems.includes(id) && ITEMS[id].unlockCondition
  );

  if (locked.length === 0) {
    alert('全アイテムが解放済みです！');
    return;
  }

  saveData.permanent.coins -= cost;
  const [itemId, item] = locked[Math.floor(Math.random() * locked.length)];
  saveData.permanent.unlockedItems.push(itemId);
  saveSaveData(saveData);

  document.getElementById('gacha-result-text').textContent =
    `${item.icon} ${item.name} を入手！`;
  document.getElementById('gacha-result-desc').textContent = item.desc;
  openModal('gacha-result-modal');
  updateCoinsDisplay();
}

// ═══════════════════════════════════
//  初期化
// ═══════════════════════════════════
async function init() {
  saveData = loadSaveData();
  await loadWordsCSV();

  // スタイル解放チェック（条件達成済みなら自動解放）
  checkStyleUnlocks();

  renderHome();
  console.log('LEAP Rogue-Lite RPG initialized!');
}

function checkStyleUnlocks() {
  STYLES.forEach(style => {
    if (!style.unlockCondition) return;
    if (saveData.permanent.unlockedStyles.includes(style.id)) return;

    const cond = style.unlockCondition;
    let unlocked = false;

    switch (cond.type) {
      case 'defeatedTotal':
        unlocked = saveData.permanent.stats.totalDefeated >= cond.value;
        break;
      case 'coins':
        // コイン消費型は手動購入
        break;
      case 'dungeonClear':
        unlocked = (saveData.permanent.stats.dungeonClears[cond.value] || 0) > 0;
        break;
      case 'criticalCount':
        unlocked = saveData.permanent.stats.totalCriticals >= cond.value;
        break;
    }

    if (unlocked) {
      saveData.permanent.unlockedStyles.push(style.id);
      saveSaveData(saveData);
    }
  });
}

// ─── グローバルイベントバインド ───
window.addEventListener('DOMContentLoaded', () => {
  init();

  // ホーム画面イベント
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
  document.getElementById('home-style-area').addEventListener('click', openStyleModal);

  // バトル画面
  document.getElementById('btn-retreat').addEventListener('click', returnToHome);
  document.getElementById('btn-speak').addEventListener('click', () => speakWord(false));
  document.getElementById('btn-speak-slow').addEventListener('click', () => speakWord(true));
  document.getElementById('confidence-slider').addEventListener('input', (e) => {
    const bs = getBattleState();
    if (bs) {
      bs.confidenceMultiplier = parseFloat(e.target.value) / 10;
      updateConfidenceDisplay();
    }
  });

  // 解説モーダル
  document.getElementById('btn-exp-next').addEventListener('click', resumeAfterExplanation);
  document.getElementById('btn-exp-speak').addEventListener('click', () => speakWord(false));
  document.getElementById('btn-exp-slow').addEventListener('click', () => speakWord(true));

  // リザルト画面
  document.getElementById('btn-result-home').addEventListener('click', returnToHome);

  // 設定モーダル
  document.getElementById('btn-reset-data').addEventListener('click', handleResetData);

  // ガチャ
  document.getElementById('btn-gacha').addEventListener('click', doGacha);

  // モーダル閉じるボタン群
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });
});

// ============================================================
// battle.js — バトル処理（4択、自信度、クリティカル、敵ギミック）
// ============================================================

import { ENEMIES, STYLES, ITEMS, DAMAGE_CONFIG, DUNGEONS } from './data.js';
import { getWordProgress, updateWordProgress, incrementStat, saveSaveData } from './storage.js';

// ─── バトル状態 ───
let battleState = null;

export function getBattleState() { return battleState; }

// ─── バトル初期化 ───
export function initBattle(dungeonIdx, words, saveData, selectedStyleId, equippedItems) {
  const dungeon = DUNGEONS[dungeonIdx];
  const style = STYLES.find(s => s.id === selectedStyleId) || STYLES[0];

  // このダンジョンの単語を取得
  const dungeonWords = dungeon.wordList || (dungeon.wordRange ? words.slice(dungeon.wordRange.start, dungeon.wordRange.end) : words);

  // 制限時間（スタイル補正）
  let timeLimit = dungeon.timeLimit;
  if (style.effects.timeLimitMultiplier) {
    timeLimit *= style.effects.timeLimitMultiplier;
  }

  // アクティブアイテムの使用回数を初期化
  const activeItemUses = {};
  equippedItems.forEach(itemId => {
    const item = ITEMS[itemId];
    if (item && item.type === 'active') {
      activeItemUses[itemId] = item.maxUses || 0;
    }
  });

  battleState = {
    dungeonIdx,
    dungeon,
    style,
    equippedItems,
    activeItemUses,
    words: dungeonWords,
    allWords: words,
    saveData,
    player: {
      hp: dungeon.playerHp,
      maxHp: dungeon.playerHp,
      barrier: 0,
      defeatedCount: 0,
    },
    currentEnemy: null,
    currentWord: null,
    questionStartTime: 0,
    timeLimit,
    waveNumber: 0,
    totalWaves: dungeon.questionsPerRun,
    isProcessing: false,
    sealedWordIds: [],   // 封印された単語
    shieldHits: 0,       // シールドスライム用
    runLog: [],          // この Run の回答ログ
    confidenceMultiplier: 1.0,
    timerInterval: null,
  };

  // onBattleStart フック
  fireHook('onBattleStart');

  // 最初の敵を出現
  spawnEnemy();

  return battleState;
}

// ─── イベントフック ───
function fireHook(hookName, context = {}) {
  const bs = battleState;
  if (!bs) return;

  // アイテムのパッシブ効果
  bs.equippedItems.forEach(itemId => {
    const item = ITEMS[itemId];
    if (!item || item.type !== 'passive') return;
    if (item.effect.hook !== hookName) return;

    switch (item.effect.action) {
      case 'addBarrier':
        bs.player.barrier += item.effect.value;
        break;
      case 'barrierIfMissedBefore':
        if (context.word) {
          const wp = getWordProgress(bs.saveData, context.word.id);
          if (wp.incorrectCount > 0) {
            bs.player.barrier += 1;
          }
        }
        break;
      case 'bonusDamageIfClozeCritical':
        // 穴埋め＋クリティカル時のボーナスダメージは handleAnswer 内で処理
        break;
    }
  });
}

// ─── 敵出現 ───
function spawnEnemy() {
  const bs = battleState;
  bs.waveNumber++;

  let enemyId;
  let isBoss = false;

  if (bs.waveNumber >= bs.dungeon.bossAppearAt) {
    enemyId = bs.dungeon.bossId;
    isBoss = true;
  } else {
    const pool = bs.dungeon.enemyPool;
    enemyId = pool[Math.floor(Math.random() * pool.length)];
  }

  const enemyDef = ENEMIES[enemyId];
  const hpBonus = bs.dungeon.enemyHpGrowth * (bs.waveNumber - 1);
  const hp = (isBoss ? Math.round(bs.dungeon.enemyHpBase * 2.5) : bs.dungeon.enemyHpBase) + hpBonus;

  bs.currentEnemy = {
    id: enemyId,
    name: enemyDef.name,
    icon: enemyDef.icon,
    trait: enemyDef.trait,
    desc: enemyDef.desc,
    isBoss,
    hp,
    maxHp: hp,
    shieldHits: enemyDef.trait === 'shield' ? 2 : 0,
  };

  bs.shieldHits = 0;
}

export { spawnEnemy };

// ─── 出題ロジック ───
export function selectNextWord() {
  const bs = battleState;
  let candidates = bs.words.filter(w => !bs.sealedWordIds.includes(w.id));

  if (candidates.length === 0) {
    candidates = bs.words;
  }

  // 忘却の魔王: 苦手単語を優先
  if (bs.currentEnemy && bs.currentEnemy.trait === 'oblivion') {
    const weakWords = candidates.filter(w => {
      const wp = getWordProgress(bs.saveData, w.id);
      return wp.incorrectCount > 0;
    });
    if (weakWords.length > 0) candidates = weakWords;
  }

  // アナリストスタイル: 苦手単語の出題確率UP
  if (bs.style.id === 'analyst' && bs.style.effects.weakWordProbBoost) {
    const weakWords = candidates.filter(w => {
      const wp = getWordProgress(bs.saveData, w.id);
      return wp.incorrectCount > wp.correctCount;
    });
    if (weakWords.length > 0 && Math.random() < 0.6) {
      candidates = weakWords;
    }
  }

  const word = candidates[Math.floor(Math.random() * candidates.length)];
  bs.currentWord = word;

  // onQuestionStart フック（復習の仮面）
  fireHook('onQuestionStart', { word });

  return word;
}

// ─── 4択生成 ───
export function generateChoices(currentWord, allWords, isEnToJa = true) {
  const bs = battleState;
  const correctAnswer = isEnToJa ? currentWord.ja : currentWord.en;
  let choices = [correctAnswer];

  // ドッペルゲンガー: 似た選択肢
  const isDoppel = bs && bs.currentEnemy && bs.currentEnemy.trait === 'doppelganger';

  const otherWords = allWords.filter(w => w.id !== currentWord.id);

  if (isDoppel && isEnToJa) {
    // 似た選択肢を優先（文字列距離が近いものを探す簡易ロジック）
    const sorted = otherWords.sort((a, b) => {
      const distA = levenshteinLike(correctAnswer, a.ja);
      const distB = levenshteinLike(correctAnswer, b.ja);
      return distA - distB;
    });
    for (const w of sorted) {
      const answer = isEnToJa ? w.ja : w.en;
      if (!choices.includes(answer)) {
        choices.push(answer);
        if (choices.length >= 4) break;
      }
    }
  }

  // 残りをランダムで埋める
  while (choices.length < 4) {
    const w = otherWords[Math.floor(Math.random() * otherWords.length)];
    const answer = isEnToJa ? w.ja : w.en;
    if (!choices.includes(answer)) {
      choices.push(answer);
    }
  }

  // シャッフル
  choices.sort(() => Math.random() - 0.5);
  return choices;
}

// 簡易的な文字列類似度（ドッペルゲンガー用）
function levenshteinLike(a, b) {
  // 共通文字数が多いほど小さい値
  const setA = new Set(a);
  const setB = new Set(b);
  let common = 0;
  for (const c of setA) { if (setB.has(c)) common++; }
  return -(common / Math.max(setA.size, setB.size));
}

// ─── ダメージ計算 (onCalcDamage) ───
export function calcDamage(word, responseTimeMs, confidenceMultiplier) {
  const bs = battleState;
  const cfg = DAMAGE_CONFIG;
  const wp = getWordProgress(bs.saveData, word.id);

  let dmg = cfg.baseDamage;

  // 価値連動ダメージ
  if (wp.lastSeenTime === null) dmg += cfg.firstSeenBonus;
  else if (wp.lastResult === false) dmg += cfg.missedBonus;

  // 忘却曲線ボーナス
  if (wp.lastSeenTime !== null && (Date.now() - wp.lastSeenTime) > cfg.forgottenThresholdMs) {
    dmg += cfg.forgottenBonus;
  }

  // 自信度
  dmg *= confidenceMultiplier;

  // 1秒以内クリティカル
  const isCritical = responseTimeMs <= cfg.criticalTimeMs && !bs.style.effects.criticalDisabled;
  if (isCritical) {
    const critMult = bs.style.effects.criticalMultiplier || cfg.criticalMultiplier;
    dmg *= critMult;
  }

  // スタイル効果
  if (bs.style.effects.baseDamageMultiplier) {
    dmg *= bs.style.effects.baseDamageMultiplier;
  }
  // ビギナー: 初見正解ボーナス
  if (bs.style.id === 'beginner' && wp.lastSeenTime === null) {
    dmg *= bs.style.effects.firstSeenCorrectBonus;
  }
  // アナリスト: 苦手単語ダメージUP
  if (bs.style.id === 'analyst' && wp.incorrectCount > wp.correctCount) {
    dmg *= bs.style.effects.weakWordDamageMultiplier;
  }
  // ギャンブラー: ランダムダメージ
  if (bs.style.id === 'gambler') {
    const min = bs.style.effects.damageRandomMin;
    const max = bs.style.effects.damageRandomMax;
    dmg *= min + Math.random() * (max - min);
  }

  return { damage: Math.round(dmg), isCritical };
}

// ─── ミス処理 ───
export function calcMissPenalty(confidenceMultiplier) {
  const bs = battleState;
  const cfg = DAMAGE_CONFIG;
  let penalty = cfg.missBasePenalty * confidenceMultiplier;

  // ビギナー: 初見ミスの被ダメ軽減
  if (bs.style.id === 'beginner' && bs.currentWord) {
    const wp = getWordProgress(bs.saveData, bs.currentWord.id);
    if (wp.lastSeenTime === null) {
      penalty *= (1 - bs.style.effects.firstSeenMissReduction);
    }
  }

  return Math.round(penalty);
}

// ─── バリア判定 ───
export function checkBarrier() {
  const bs = battleState;
  if (bs.player.barrier > 0) {
    bs.player.barrier--;
    return true;
  }
  return false;
}

// ─── シールドスライム処理 ───
export function processShieldEnemy(isCorrect) {
  const bs = battleState;
  if (!bs.currentEnemy || bs.currentEnemy.trait !== 'shield') return false;

  if (isCorrect) {
    bs.shieldHits++;
    if (bs.shieldHits < bs.currentEnemy.shieldHits) {
      return true; // まだシールド残ってる
    }
  } else {
    bs.shieldHits = 0; // リセット
  }
  return false;
}

// ─── ヴァンパイア処理 ───
export function processVampire(penalty) {
  const bs = battleState;
  if (bs.currentEnemy && bs.currentEnemy.trait === 'vampire') {
    bs.currentEnemy.hp = Math.min(bs.currentEnemy.maxHp, bs.currentEnemy.hp + penalty);
    return true;
  }
  return false;
}

// ─── アクティブアイテム使用 ───
export function useActiveItem(itemId) {
  const bs = battleState;
  if (!bs.activeItemUses[itemId] || bs.activeItemUses[itemId] <= 0) return null;

  const item = ITEMS[itemId];
  if (!item) return null;

  bs.activeItemUses[itemId]--;

  switch (item.effect.action) {
    case 'skipQuestion':
      return { action: 'skip' };
    case 'healHp':
      const healAmount = Math.round(bs.player.maxHp * item.effect.value);
      bs.player.hp = Math.min(bs.player.maxHp, bs.player.hp + healAmount);
      return { action: 'heal', value: healAmount };
    case 'sealWord':
      if (bs.currentWord) {
        bs.sealedWordIds.push(bs.currentWord.id);
        return { action: 'seal', word: bs.currentWord.en };
      }
      return null;
    default:
      return null;
  }
}

// ─── 敵撃破後の処理 ───
export function onEnemyDefeated() {
  const bs = battleState;
  bs.player.defeatedCount++;
  incrementStat(bs.saveData, 'totalDefeated');

  // ダンジョンクリア判定
  if (bs.waveNumber >= bs.totalWaves && bs.currentEnemy.isBoss) {
    return 'dungeonClear';
  }

  // 次の敵
  spawnEnemy();
  return 'nextEnemy';
}

// ─── タイムリミット計算（敵特性込み） ───
export function getEffectiveTimeLimit() {
  const bs = battleState;
  let tl = bs.timeLimit;

  // タイムイーター: 速度1.5倍 → 実質時間2/3
  if (bs.currentEnemy && bs.currentEnemy.trait === 'timeEater') {
    tl *= (2 / 3);
  }

  return tl;
}

// ─── バトル終了 ───
export function endBattle() {
  const bs = battleState;
  if (bs && bs.timerInterval) {
    clearInterval(bs.timerInterval);
  }
  const result = bs ? { ...bs } : null;
  battleState = null;
  return result;
}

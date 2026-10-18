// ============================================================
// battle.js — バトル処理（4択、自信度、クリティカル、敵ギミック、ドロップ選択）
// ============================================================

import { ENEMIES, STYLES, ITEMS, DAMAGE_CONFIG, DUNGEONS } from './data.js?v=2.1.2';
import { getWordProgress, updateWordProgress, incrementStat, saveSaveData } from './storage.js?v=2.1.2';
import { sound } from './audio.js?v=2.1.2';


// ─── バトル状態 ───
let battleState = null;

export function getBattleState() { return battleState; }

// ─── バトル初期化 ───
export function initBattle(dungeonIdx, words, saveData, selectedStyleId, equippedItems) {
  const dungeon = DUNGEONS[dungeonIdx];
  
  // スタイルが有効（アンロック済み）かどうか判定
  const isStyleUnlocked = saveData.permanent.unlockedStyles.includes(selectedStyleId);
  const style = isStyleUnlocked ? STYLES.find(s => s.id === selectedStyleId) : null;

  // このダンジョンの単語を取得
  const dungeonWords = dungeon.wordList || (dungeon.wordRange ? words.slice(dungeon.wordRange.start, dungeon.wordRange.end) : words);

  // アバター能力値のボーナス計算
  const avatar = saveData.permanent.avatarStats || { atk: 0, def: 0, hp: 0, time: 0 };
  const maxHp = dungeon.playerHp + (avatar.hp * 5);
  let timeLimit = dungeon.timeLimit + (avatar.time * 0.3);

  // スタイル補正
  if (style && style.effects.timeLimitMultiplier) {
    timeLimit *= style.effects.timeLimitMultiplier;
  }

  // アクティブアイテムの使用回数を初期化（Run中複製可能）
  const activeItemUses = {};
  equippedItems.forEach(itemId => {
    const item = ITEMS[itemId];
    if (item && item.type === 'active') {
      activeItemUses[itemId] = (activeItemUses[itemId] || 0) + (item.maxUses || 1);
    }
  });

  // 自信度バーの前回値を復元
  const lastConf = (saveData.permanent.stats.lastConfidence || 10) / 10;

  battleState = {
    dungeonIdx,
    dungeon,
    style, // null ならスタイル効果なし
    equippedItems: [...equippedItems], // このRun中に獲得したアイテムもここに追加
    activeItemUses,
    words: dungeonWords,
    allWords: words,
    saveData,
    avatarBonus: {
      atk: avatar.atk * 2,
      def: avatar.def * 1,
    },
    player: {
      hp: maxHp,
      maxHp: maxHp,
      barrier: 0,
      defeatedCount: 0,
      hasRevived: false, // 不死鳥の羽用
    },
    currentEnemy: null,
    currentWord: null,
    questionStartTime: 0,
    timeLimit,
    baseTimeLimit: timeLimit,
    waveNumber: 0,
    totalWaves: dungeon.questionsPerRun,
    isProcessing: false,
    sealedWordIds: [],   // 封印された単語
    shieldHits: 0,       // シールドスライム用
    runLog: [],          // 回答ログ
    confidenceMultiplier: lastConf,
    timerInterval: null,
  };

  // onBattleStart フック（バリア付与、砂時計の時間追加など）
  fireHook('onBattleStart');

  // 最初の敵を出現
  spawnEnemy();

  // BGM開始
  sound.playBGM(battleState.currentEnemy.isBoss ? 'boss' : 'battle');

  return battleState;
}

// ─── イベントフック ───
export function fireHook(hookName, context = {}) {
  const bs = battleState;
  if (!bs) return;

  bs.equippedItems.forEach(itemId => {
    const item = ITEMS[itemId];
    if (!item || item.type !== 'passive') return;
    if (item.effect.hook !== hookName) return;

    switch (item.effect.action) {
      case 'addBarrier':
        bs.player.barrier += item.effect.value;
        break;
      case 'addTimer':
        bs.timeLimit += item.effect.value;
        break;
      case 'barrierIfMissedBefore':
        if (context.word) {
          const wp = getWordProgress(bs.saveData, context.word.id);
          if (wp.incorrectCount > 0) {
            bs.player.barrier += 1;
            sound.playSE('guard');
          }
        }
        break;
    }
  });
}

// ─── 敵出現 ───
export function spawnEnemy() {
  const bs = battleState;
  bs.waveNumber++;

  let enemyId;
  let isBoss = false;

  if (bs.waveNumber >= bs.dungeon.bossAppearAt) {
    enemyId = bs.dungeon.bossId;
    isBoss = true;
    sound.playSE('bossWarning');
    sound.playBGM('boss');
  } else {
    const pool = bs.dungeon.enemyPool;
    enemyId = pool[Math.floor(Math.random() * pool.length)];
    sound.playSE('enemySpawn');
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
  if (bs.style && bs.style.id === 'analyst' && bs.style.effects.weakWordProbBoost) {
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

  // onQuestionStart フック（復習の仮面など）
  fireHook('onQuestionStart', { word });

  return word;
}

// ─── 4択生成 ───
export function generateChoices(currentWord, allWords, isEnToJa = true) {
  const bs = battleState;
  const correctAnswer = isEnToJa ? currentWord.ja : currentWord.en;
  let choices = [correctAnswer];

  const isDoppel = bs && bs.currentEnemy && bs.currentEnemy.trait === 'doppelganger';
  const otherWords = allWords.filter(w => w.id !== currentWord.id);

  if (isDoppel && isEnToJa) {
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

  while (choices.length < 4) {
    const w = otherWords[Math.floor(Math.random() * otherWords.length)];
    const answer = isEnToJa ? w.ja : w.en;
    if (!choices.includes(answer)) {
      choices.push(answer);
    }
  }

  choices.sort(() => Math.random() - 0.5);
  return choices;
}

function levenshteinLike(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  let common = 0;
  for (const c of setA) { if (setB.has(c)) common++; }
  return -(common / Math.max(setA.size, setB.size));
}

// ─── ダメージ計算 ───
export function calcDamage(word, responseTimeMs, confidenceMultiplier) {
  const bs = battleState;
  const cfg = DAMAGE_CONFIG;
  const wp = getWordProgress(bs.saveData, word.id);

  let dmg = cfg.baseDamage + bs.avatarBonus.atk;

  // 価値連動ダメージ
  if (wp.lastSeenTime === null) dmg += cfg.firstSeenBonus;
  else if (wp.lastResult === false) dmg += cfg.missedBonus;

  // 忘却曲線ボーナス
  if (wp.lastSeenTime !== null && (Date.now() - wp.lastSeenTime) > cfg.forgottenThresholdMs) {
    dmg += cfg.forgottenBonus;
  }

  // アイテム: 集中レンズ (自信度倍率強化)
  let effectiveConf = confidenceMultiplier;
  if (hasEquippedItem('focus_lens')) {
    effectiveConf = 1 + (confidenceMultiplier - 1) * 1.25;
  }
  dmg *= effectiveConf;

  // 1秒以内クリティカル
  const isCritical = responseTimeMs <= cfg.criticalTimeMs && (!bs.style || !bs.style.effects.criticalDisabled);
  if (isCritical) {
    let critMult = cfg.criticalMultiplier;
    if (bs.style && bs.style.effects.criticalMultiplier) {
      critMult = bs.style.effects.criticalMultiplier;
    }
    dmg *= critMult;

    // アイテム: 迅速の触媒
    if (hasEquippedItem('cloze_catalyst')) {
      dmg *= 1.5;
    }
    // アイテム: 吸血の牙 (クリティカル時HP回復)
    if (hasEquippedItem('vampire_fang')) {
      bs.player.hp = Math.min(bs.player.maxHp, bs.player.hp + 12);
    }
  }

  // スタイル効果
  if (bs.style) {
    if (bs.style.effects.baseDamageMultiplier) {
      dmg *= bs.style.effects.baseDamageMultiplier;
    }
    if (bs.style.id === 'beginner' && wp.lastSeenTime === null) {
      dmg *= bs.style.effects.firstSeenCorrectBonus;
    }
    if (bs.style.id === 'analyst' && wp.incorrectCount > wp.correctCount) {
      dmg *= bs.style.effects.weakWordDamageMultiplier;
    }
    if (bs.style.id === 'gambler') {
      const min = bs.style.effects.damageRandomMin;
      const max = bs.style.effects.damageRandomMax;
      dmg *= min + Math.random() * (max - min);
    }
  }

  // アイテム: 鉄の剣 (+15%)
  if (hasEquippedItem('iron_sword')) {
    dmg *= 1.15;
  }

  // アイテム: 幸運の古銭 (30%で2倍追撃)
  let isDoubleAttack = false;
  if (hasEquippedItem('lucky_coin') && Math.random() < 0.3) {
    dmg *= 2.0;
    isDoubleAttack = true;
  }

  // アイテム: 賢者の石 (全ステ+20%、マスター単語2倍)
  if (hasEquippedItem('philosophers_stone')) {
    dmg *= 1.2;
    if (wp.masteryLevel >= 2) {
      dmg *= 2.0;
    }
  }

  return { damage: Math.round(dmg), isCritical, isDoubleAttack };
}

// ─── ミス被弾計算 ───
export function calcMissPenalty(confidenceMultiplier) {
  const bs = battleState;
  const cfg = DAMAGE_CONFIG;
  let penalty = cfg.missBasePenalty * confidenceMultiplier;

  // アバター防御力ボーナス
  penalty = Math.max(1, penalty - bs.avatarBonus.def);

  // スタイル効果
  if (bs.style) {
    if (bs.style.id === 'beginner' && bs.currentWord) {
      const wp = getWordProgress(bs.saveData, bs.currentWord.id);
      if (wp.lastSeenTime === null) {
        penalty *= (1 - bs.style.effects.firstSeenMissReduction);
      }
    }
    if (bs.style.effects.damageReduction) {
      penalty *= (1 - bs.style.effects.damageReduction);
    }
  }

  // アイテム: 木の盾 (-15%)
  if (hasEquippedItem('wooden_shield')) {
    penalty *= 0.85;
  }

  const finalPenalty = Math.max(1, Math.round(penalty));

  // アイテム: トゲの鎧 (被ダメの50%反射)
  if (hasEquippedItem('spiked_armor') && bs.currentEnemy) {
    const reflect = Math.round(finalPenalty * 0.5);
    bs.currentEnemy.hp = Math.max(0, bs.currentEnemy.hp - reflect);
  }

  return finalPenalty;
}

// ─── アイテム所持判定 ───
function hasEquippedItem(itemId) {
  return battleState && battleState.equippedItems.includes(itemId);
}

// ─── バリア判定 ───
export function checkBarrier() {
  const bs = battleState;
  if (bs.player.barrier > 0) {
    bs.player.barrier--;
    sound.playSE('guard');
    return true;
  }
  return false;
}

// ─── 復活判定 (不死鳥の羽) ───
export function checkRevive() {
  const bs = battleState;
  if (hasEquippedItem('phoenix_feather') && !bs.player.hasRevived) {
    bs.player.hasRevived = true;
    bs.player.hp = Math.round(bs.player.maxHp * 0.5);
    sound.playSE('stageClear');
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
      return true;
    }
  } else {
    bs.shieldHits = 0;
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
  sound.playSE('itemGet');

  switch (item.effect.action) {
    case 'skipQuestion':
      return { action: 'skip' };
    case 'healHp': {
      const healAmount = Math.round(bs.player.maxHp * item.effect.value);
      bs.player.hp = Math.min(bs.player.maxHp, bs.player.hp + healAmount);
      return { action: 'heal', value: healAmount };
    }
    case 'sealWord':
      if (bs.currentWord) {
        bs.sealedWordIds.push(bs.currentWord.id);
        return { action: 'seal', word: bs.currentWord.en };
      }
      return null;
    case 'directDamage':
      if (bs.currentEnemy) {
        bs.currentEnemy.hp = Math.max(0, bs.currentEnemy.hp - item.effect.value);
        sound.playSE('attack');
        return { action: 'damage', value: item.effect.value };
      }
      return null;
    case 'resetTimer':
      bs.questionStartTime = Date.now();
      return { action: 'resetTimer' };
    default:
      return null;
  }
}

// ─── 敵撃破時のドロップ候補（3択ピック）生成 ───
export function generateLootChoices() {
  const bs = battleState;
  if (!bs) return [];

  // 解放済みアイテムから、未所持のアイテム（またはアクティブアイテム）を優先
  const unlocked = bs.saveData.permanent.unlockedItems || [];
  let pool = unlocked.filter(id => ITEMS[id]);

  // もし解放済みアイテムが少なければ全体からフォールバック
  if (pool.length < 3) {
    pool = Object.keys(ITEMS);
  }

  // 重み付けシャッフル（EpicやRareも適度に出現）
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const choices = [];
  for (const id of shuffled) {
    if (!choices.includes(id)) {
      choices.push(id);
      if (choices.length >= 3) break;
    }
  }

  return choices.map(id => ({ id, ...ITEMS[id] }));
}

// ─── ドロップアイテムの取得 ───
export function pickLootItem(itemId) {
  const bs = battleState;
  if (!bs) return;

  const item = ITEMS[itemId];
  if (!item) return;

  bs.equippedItems.push(itemId);
  if (item.type === 'active') {
    bs.activeItemUses[itemId] = (bs.activeItemUses[itemId] || 0) + (item.maxUses || 1);
  }

  // パッシブ効果の即時反映（例: 砂時計で即時時間延長）
  if (item.effect.hook === 'onBattleStart' && item.effect.action === 'addTimer') {
    bs.timeLimit += item.effect.value;
  }
  if (item.effect.hook === 'onBattleStart' && item.effect.action === 'addBarrier') {
    bs.player.barrier += item.effect.value;
  }

  sound.playSE('itemGet');
}

// ─── 敵撃破後の判定 ───
export function onEnemyDefeated() {
  const bs = battleState;
  bs.player.defeatedCount++;
  incrementStat(bs.saveData, 'totalDefeated');

  // ボス撃破でダンジョンクリア
  if (bs.waveNumber >= bs.totalWaves && bs.currentEnemy.isBoss) {
    return 'dungeonClear';
  }

  return 'lootDrop'; // 通常は戦利品ドロップへ
}

// ─── 実効制限時間 ───
export function getEffectiveTimeLimit() {
  const bs = battleState;
  let tl = bs.timeLimit;

  // タイムイーター: 速度1.5倍
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
  sound.stopBGM();
  const result = bs ? { ...bs } : null;
  battleState = null;
  return result;
}

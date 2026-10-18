// ============================================================
// storage.js — LocalStorage 管理（学習進捗の保存・読み込み）
// ============================================================

const STORAGE_KEY = 'leapRogueLite_v2';

// ─── デフォルトデータ ───
function createDefaultSave() {
  return {
    permanent: {
      coins: 0,
      unlockedStyles: ['beginner'],
      unlockedItems: ['scroll_shield', 'smoke_bomb'],
      maxItemSlots: 2,
      equippedItems: ['scroll_shield', 'smoke_bomb'],
      selectedStyle: 'beginner',
      // 累計統計
      stats: {
        totalDefeated: 0,
        totalCriticals: 0,
        totalAnswers: 0,
        totalCorrect: 0,
        totalIncorrect: 0,
        highConfidenceCorrect: 0,
        clozeCorrect: 0,
        dungeonClears: {},     // { d1: 2, d2: 1 ... }
        perfectClears: 0,
        completedQuests: [],
      },
    },
    wordProgress: {},
    // wordId => { correctCount, incorrectCount, lastResult, lastSeenTime, masteryLevel, isCloze }
  };
}

// ─── ロード ───
export function loadSaveData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // マイグレーション: 不足フィールドをデフォルトで補完
      const defaults = createDefaultSave();
      if (!data.permanent) data.permanent = defaults.permanent;
      if (!data.permanent.stats) data.permanent.stats = defaults.permanent.stats;
      if (!data.permanent.equippedItems) data.permanent.equippedItems = defaults.permanent.equippedItems;
      if (!data.wordProgress) data.wordProgress = {};
      // stats内の不足フィールドも補完
      for (const key of Object.keys(defaults.permanent.stats)) {
        if (data.permanent.stats[key] === undefined) {
          data.permanent.stats[key] = defaults.permanent.stats[key];
        }
      }
      return data;
    }
  } catch (e) {
    console.warn('SaveData load failed, creating new:', e);
  }
  return createDefaultSave();
}

// ─── セーブ ───
export function saveSaveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('SaveData save failed:', e);
  }
}

// ─── リセット ───
export function resetSaveData() {
  localStorage.removeItem(STORAGE_KEY);
  return createDefaultSave();
}

// ─── 単語進捗ヘルパー ───
export function getWordProgress(saveData, wordId) {
  if (!saveData.wordProgress[wordId]) {
    saveData.wordProgress[wordId] = {
      correctCount: 0,
      incorrectCount: 0,
      lastResult: null,
      lastSeenTime: null,
      masteryLevel: 0,
      isCloze: false,
    };
  }
  return saveData.wordProgress[wordId];
}

export function updateWordProgress(saveData, wordId, isCorrect) {
  const wp = getWordProgress(saveData, wordId);
  if (isCorrect) {
    wp.correctCount++;
    wp.lastResult = true;
  } else {
    wp.incorrectCount++;
    wp.lastResult = false;
  }
  wp.lastSeenTime = Date.now();
  // マスタリーレベル更新
  if (wp.correctCount >= 5) wp.masteryLevel = 3;
  else if (wp.correctCount >= 3) wp.masteryLevel = 2;
  else if (wp.correctCount >= 1) wp.masteryLevel = 1;
  else wp.masteryLevel = 0;
}

// ─── 統計更新ヘルパー ───
export function incrementStat(saveData, statName, amount = 1) {
  if (typeof saveData.permanent.stats[statName] === 'number') {
    saveData.permanent.stats[statName] += amount;
  }
}

export function recordDungeonClear(saveData, dungeonId) {
  if (!saveData.permanent.stats.dungeonClears[dungeonId]) {
    saveData.permanent.stats.dungeonClears[dungeonId] = 0;
  }
  saveData.permanent.stats.dungeonClears[dungeonId]++;
}

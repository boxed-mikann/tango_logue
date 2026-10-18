// ============================================================
// storage.js — LocalStorage 管理（学習進捗、能力値、設定保存）
// ============================================================

const STORAGE_KEY = 'leapRogueLite_v2';

// ─── デフォルトデータ ───
function createDefaultSave() {
  return {
    permanent: {
      coins: 50, // 初期コイン少しプレゼント
      unlockedStyles: ['beginner', 'balanced'], // 初期2種
      unlockedItems: ['scroll_shield', 'smoke_bomb'], // 初期2種解放済み
      equippedItems: ['scroll_shield'], // 持ち込み装備中アイテム
      selectedStyle: 'beginner',
      // 能力値手動振り分け (マスター単語数がSPになる)
      avatarStats: {
        atk: 0,
        def: 0,
        hp: 0,
        time: 0,
      },
      // クエスト進行
      claimedQuests: [], // 報酬受け取り済みクエストID
      // 設定
      settings: {
        bgmEnabled: true,
        seEnabled: true,
        autoSpeak: true, // 出題時に自動で単語を発音するか
      },
      // 累計統計
      stats: {
        totalDefeated: 0,
        totalCriticals: 0,
        totalAnswers: 0,
        totalCorrect: 0,
        totalIncorrect: 0,
        highConfidenceCorrect: 0,
        dungeonClears: {},     // { d1: 2, d2: 1 ... }
        perfectClears: 0,
        lastConfidence: 10,    // 自信度バー維持用 (10 = 1.0x)
      },
    },
    wordProgress: {},
    // wordId => { correctCount, incorrectCount, lastResult, lastSeenTime, masteryLevel }
  };
}

// ─── ロード ───
export function loadSaveData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const defaults = createDefaultSave();

      if (!data.permanent) data.permanent = defaults.permanent;
      if (!data.permanent.stats) data.permanent.stats = defaults.permanent.stats;
      if (!data.permanent.avatarStats) data.permanent.avatarStats = defaults.permanent.avatarStats;
      if (!data.permanent.settings) data.permanent.settings = defaults.permanent.settings;
      if (!data.permanent.claimedQuests) data.permanent.claimedQuests = defaults.permanent.claimedQuests;
      if (!data.permanent.unlockedStyles) data.permanent.unlockedStyles = defaults.permanent.unlockedStyles;
      if (!data.permanent.unlockedItems) data.permanent.unlockedItems = defaults.permanent.unlockedItems;
      if (!data.permanent.equippedItems) data.permanent.equippedItems = defaults.permanent.equippedItems;
      if (!data.wordProgress) data.wordProgress = {};

      // 足りないstatsキーを補完
      for (const k of Object.keys(defaults.permanent.stats)) {
        if (data.permanent.stats[k] === undefined) {
          data.permanent.stats[k] = defaults.permanent.stats[k];
        }
      }
      // 初期スタイル2つが必ず含まれるように保証
      defaults.permanent.unlockedStyles.forEach(s => {
        if (!data.permanent.unlockedStyles.includes(s)) {
          data.permanent.unlockedStyles.push(s);
        }
      });

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

  // マスタリーレベル判定 (正解3回以上でマスター)
  if (wp.correctCount >= 5) wp.masteryLevel = 3;
  else if (wp.correctCount >= 3) wp.masteryLevel = 2;
  else if (wp.correctCount >= 1) wp.masteryLevel = 1;
  else wp.masteryLevel = 0;
}

// ─── マスター単語数・遭遇単語数の計算 ───
export function getMasteredWordsCount(saveData) {
  let count = 0;
  for (const wp of Object.values(saveData.wordProgress)) {
    if (wp.masteryLevel >= 2) count++;
  }
  return count;
}

export function getSeenWordsCount(saveData) {
  let count = 0;
  for (const wp of Object.values(saveData.wordProgress)) {
    if (wp.lastSeenTime !== null) count++;
  }
  return count;
}

// ─── 統計更新 ───
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

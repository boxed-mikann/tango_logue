// ============================================================
// data.js — マスターデータ（データ駆動型設計の中核）
// ============================================================

// ─── ダンジョン定義 ───
// CSVにstage列が追加されたらそれに従う。現状は行番号で均等5分割。
export const DUNGEONS = [
  {
    id: 'd1',
    name: '基礎の森',
    subtitle: 'LEAP Part 1',
    icon: '🌲',
    description: '英語学習の第一歩。基本単語を習得せよ。',
    enemyPool: ['slime', 'goblin', 'bat'],
    bossId: 'forest_king',
    questionsPerRun: 10,
    bossAppearAt: 10,
    timeLimit: 15.0,
    enemyHpBase: 50,
    enemyHpGrowth: 8,
    playerHp: 150,
    coinReward: 10,
  },
  {
    id: 'd2',
    name: '炎の洞窟',
    subtitle: 'LEAP Part 2',
    icon: '🔥',
    description: '中級単語が潜む灼熱の洞窟。',
    enemyPool: ['fire_bat', 'orc', 'time_eater'],
    bossId: 'flame_dragon',
    questionsPerRun: 10,
    bossAppearAt: 10,
    timeLimit: 12.0,
    enemyHpBase: 70,
    enemyHpGrowth: 10,
    playerHp: 130,
    coinReward: 15,
  },
  {
    id: 'd3',
    name: '氷結の峡谷',
    subtitle: 'LEAP Part 3',
    icon: '❄️',
    description: '上級単語が凍てつく峡谷に眠る。',
    enemyPool: ['shield_slime', 'chameleon', 'vampire'],
    bossId: 'ice_golem',
    questionsPerRun: 10,
    bossAppearAt: 10,
    timeLimit: 10.0,
    enemyHpBase: 90,
    enemyHpGrowth: 12,
    playerHp: 120,
    coinReward: 20,
  },
  {
    id: 'd4',
    name: '魔王の回廊',
    subtitle: 'LEAP Part 4',
    icon: '🏰',
    description: '難関単語が蠢く魔の回廊。',
    enemyPool: ['doppelganger', 'time_eater', 'vampire'],
    bossId: 'dark_mage',
    questionsPerRun: 10,
    bossAppearAt: 10,
    timeLimit: 8.0,
    enemyHpBase: 110,
    enemyHpGrowth: 14,
    playerHp: 110,
    coinReward: 25,
  },
  {
    id: 'd5',
    name: '忘却の深淵',
    subtitle: 'LEAP Part 5',
    icon: '🌀',
    description: '最終ダンジョン。全ての記憶を試す。',
    enemyPool: ['doppelganger', 'shield_slime', 'chameleon', 'vampire', 'time_eater'],
    bossId: 'oblivion_lord',
    questionsPerRun: 10,
    bossAppearAt: 10,
    timeLimit: 6.0,
    enemyHpBase: 130,
    enemyHpGrowth: 16,
    playerHp: 100,
    coinReward: 35,
  },
];

// ─── 敵ユニット定義 ───
export const ENEMIES = {
  // ─ ザコ ─
  slime:      { name: 'スライム',          icon: '🟢', trait: null,            desc: '特殊能力なし。' },
  goblin:     { name: 'ゴブリン',          icon: '👺', trait: null,            desc: '特殊能力なし。' },
  bat:        { name: 'コウモリ',          icon: '🦇', trait: null,            desc: '特殊能力なし。' },
  fire_bat:   { name: 'ファイア蝙蝠',     icon: '🔥', trait: null,            desc: '特殊能力なし。' },
  orc:        { name: 'オーク',            icon: '👹', trait: null,            desc: '特殊能力なし。' },
  // ─ 特殊ザコ ─
  time_eater:   { name: 'タイム・イーター',       icon: '⏳', trait: 'timeEater',    desc: 'タイマーのカウントダウン速度が1.5倍になる。' },
  shield_slime: { name: 'シールド・スライム',     icon: '🛡️', trait: 'shield',       desc: '2重バリアを持ち、2回連続正解しないと倒せない。' },
  chameleon:    { name: 'カメレオン・ジャマー',   icon: '🦎', trait: 'chameleon',    desc: '1秒後に選択肢の配置をシャッフルする。' },
  doppelganger: { name: 'ドッペルゲンガー',       icon: '👥', trait: 'doppelganger', desc: '激似のひっかけ選択肢を混ぜる。' },
  vampire:      { name: 'ヴァンパイア',           icon: '🧛', trait: 'vampire',      desc: 'ミス時にダメージ分HPを回復する。' },
  // ─ ボス ─
  forest_king:   { name: '古代樹の番人',       icon: '🌳', trait: null,            desc: '森の守護者。', isBoss: true },
  flame_dragon:  { name: '炎龍ヴォルカン',     icon: '🐉', trait: 'timeEater',    desc: '灼熱の炎が時を加速させる。', isBoss: true },
  ice_golem:     { name: '氷結のゴーレム',     icon: '🧊', trait: 'shield',       desc: '氷の鎧で守られている。', isBoss: true },
  dark_mage:     { name: '闇の魔導士',         icon: '🧙', trait: 'doppelganger', desc: '幻惑の魔法で惑わせる。', isBoss: true },
  oblivion_lord: { name: '忘却の魔王',         icon: '💀', trait: 'oblivion',     desc: '過去にミスした苦手単語を優先出題する。', isBoss: true },
};

// ─── バトルスタイル定義 ───
export const STYLES = [
  {
    id: 'beginner',
    name: 'ビギナー',
    icon: '🌱',
    desc: '初見単語のミス時被ダメ70%カット。初見正解のダメージ+50%。',
    unlockCondition: null, // 初期解放
    effects: {
      firstSeenMissReduction: 0.7,
      firstSeenCorrectBonus: 1.5,
    },
  },
  {
    id: 'analyst',
    name: 'アナリスト',
    icon: '🔬',
    desc: '苦手単語の出題率UP & 与ダメージ1.8倍。',
    unlockCondition: { type: 'defeatedTotal', value: 30, label: '累計30体撃破で解放' },
    effects: {
      weakWordDamageMultiplier: 1.8,
      weakWordProbBoost: true,
    },
  },
  {
    id: 'gambler',
    name: 'ギャンブラー',
    icon: '🎰',
    desc: '毎ターンの攻撃力が0.5〜3.0倍でランダム変動。',
    unlockCondition: { type: 'coins', value: 100, label: '100コインで購入' },
    effects: {
      damageRandomMin: 0.5,
      damageRandomMax: 3.0,
    },
  },
  {
    id: 'mindful',
    name: 'マインドフル',
    icon: '🧘',
    desc: '制限時間2倍。ただし1秒以内クリティカルなし。',
    unlockCondition: { type: 'dungeonClear', value: 'd2', label: '炎の洞窟クリアで解放' },
    effects: {
      timeLimitMultiplier: 2.0,
      criticalDisabled: true,
    },
  },
  {
    id: 'speedster',
    name: 'スピードスター',
    icon: '⚡',
    desc: '1秒以内クリティカルのダメージ2.5倍。制限時間20%減。',
    unlockCondition: { type: 'criticalCount', value: 50, label: '累計50回クリティカルで解放' },
    effects: {
      criticalMultiplier: 2.5,
      timeLimitMultiplier: 0.8,
    },
  },
  {
    id: 'berserker',
    name: '狂戦士',
    icon: '🔥',
    desc: '自信度「低」選択不可。基礎ダメージ1.5倍。',
    unlockCondition: { type: 'dungeonClear', value: 'd3', label: '氷結の峡谷クリアで解放' },
    effects: {
      baseDamageMultiplier: 1.5,
      minConfidence: 1.2,
    },
  },
];

// ─── アイテム定義 ───
export const ITEMS = {
  // ─ パッシブ ─
  scroll_shield: {
    name: '聖なる護符',
    icon: '📜',
    type: 'passive',
    desc: '各戦闘開始時にミスを1回防ぐバリアを自動展開。',
    unlockCondition: null, // 初期解放
    effect: { hook: 'onBattleStart', action: 'addBarrier', value: 1 },
  },
  retro_mask: {
    name: '復習の仮面',
    icon: '🎭',
    type: 'passive',
    desc: '過去にミスした単語が出た瞬間、自動でバリア生成。',
    unlockCondition: { type: 'incorrectTotal', value: 20, label: '累計20回ミスで解放' },
    effect: { hook: 'onQuestionStart', action: 'barrierIfMissedBefore' },
  },
  cloze_catalyst: {
    name: '穴埋めの触媒',
    icon: '🧪',
    type: 'passive',
    desc: '穴埋め問題で1秒以内に正解すると追撃発生。',
    unlockCondition: { type: 'clozeCorrect', value: 10, label: '穴埋め10回正解で解放' },
    effect: { hook: 'onAnswer', action: 'bonusDamageIfClozeCritical', value: 1.5 },
  },
  // ─ アクティブ ─
  smoke_bomb: {
    name: '煙幕',
    icon: '💨',
    type: 'active',
    desc: '現在の問題をスキップする。（1Runに3回まで）',
    unlockCondition: null, // 初期解放
    maxUses: 3,
    effect: { hook: 'onActiveItemUse', action: 'skipQuestion' },
  },
  first_aid: {
    name: '応急キット',
    icon: '🩹',
    type: 'active',
    desc: 'ミス時の解説画面でHPを30%回復。（1Runに2回まで）',
    unlockCondition: { type: 'dungeonClear', value: 'd1', label: '基礎の森クリアで解放' },
    maxUses: 2,
    effect: { hook: 'onActiveItemUse', action: 'healHp', value: 0.3 },
  },
  seal_charm: {
    name: '封印の呪符',
    icon: '🔮',
    type: 'active',
    desc: '今回のRunからその単語を一時除外。（1Runに1回まで）',
    unlockCondition: { type: 'dungeonClear', value: 'd3', label: '氷結の峡谷クリアで解放' },
    maxUses: 1,
    effect: { hook: 'onActiveItemUse', action: 'sealWord' },
  },
};

// ─── クエスト（実績 / メタプログレッション）定義 ───
export const QUESTS = [
  { id: 'q1',  name: '初めての一歩',       desc: 'ダンジョンを1回クリアする',        reward: { coins: 20 },   condition: { type: 'dungeonClearCount', value: 1 } },
  { id: 'q2',  name: '三度目の正直',       desc: 'ダンジョンを3回クリアする',        reward: { coins: 30 },   condition: { type: 'dungeonClearCount', value: 3 } },
  { id: 'q3',  name: '百戦錬磨',           desc: '累計100体の敵を撃破する',          reward: { coins: 50 },   condition: { type: 'defeatedTotal', value: 100 } },
  { id: 'q4',  name: '電光石火',           desc: '1秒以内クリティカルを10回出す',    reward: { coins: 30 },   condition: { type: 'criticalCount', value: 10 } },
  { id: 'q5',  name: '暗記の達人',         desc: '50単語をマスターする（正解3回以上）', reward: { coins: 40 },condition: { type: 'masteredWords', value: 50 } },
  { id: 'q6',  name: '全制覇',             desc: '全5ダンジョンをクリアする',        reward: { coins: 100, unlockItem: 'seal_charm' }, condition: { type: 'allDungeonsClear' } },
  { id: 'q7',  name: 'ハイリスカー',       desc: '自信度2.0xで10回正解する',         reward: { coins: 50 },   condition: { type: 'highConfidenceCorrect', value: 10 } },
  { id: 'q8',  name: '鉄壁',               desc: 'HP満タンでダンジョンをクリアする',  reward: { coins: 60 },   condition: { type: 'perfectClear' } },
  { id: 'q9',  name: '千里の道',           desc: '累計500問に回答する',              reward: { coins: 80 },   condition: { type: 'totalAnswers', value: 500 } },
  { id: 'q10', name: '単語マスター',       desc: '200単語をマスターする',            reward: { coins: 150 },  condition: { type: 'masteredWords', value: 200 } },
];

// ─── ダメージ計算パラメータ ───
export const DAMAGE_CONFIG = {
  baseDamage: 15,
  firstSeenBonus: 25,
  missedBonus: 20,
  forgottenBonus: 15,          // 3日以上未遭遇
  forgottenThresholdMs: 3 * 24 * 60 * 60 * 1000,
  criticalTimeMs: 1000,
  criticalMultiplier: 1.5,     // デフォルト（スタイルで上書き可）
  confidenceMin: 1.0,
  confidenceMax: 2.0,
  missBasePenalty: 20,
  masteryThreshold: 3,         // 正解回数≧この値で「マスター」
};

// ─── CSV => ダンジョン単語割り当て ───
// ステージ列が指定されている場合は各ダンジョンに直接割り当て、ない場合は均等分割
export function assignWordsToDungeons(words) {
  const hasExplicitStage = words.some(w => w.stage !== undefined && w.stage !== null);

  DUNGEONS.forEach((d, i) => {
    const stageNum = i + 1;
    if (hasExplicitStage) {
      d.wordList = words.filter(w => w.stage === stageNum || w.stage === d.id);
      d.wordRange = null;
    } else {
      const perDungeon = Math.ceil(words.length / DUNGEONS.length);
      const start = i * perDungeon;
      const end = Math.min((i + 1) * perDungeon, words.length);
      d.wordRange = { start, end };
      d.wordList = words.slice(start, end);
    }
  });
}


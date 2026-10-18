// ============================================================
// data.js — マスターデータ（ダンジョン、敵、アイテム、スタイル、クエスト）
// ============================================================

// ─── ダンジョン定義 ───
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
    coinReward: 20,
    unlockCondition: null, // 初期解放
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
    coinReward: 30,
    unlockCondition: { reqDungeonId: 'd1', label: '基礎の森クリアで解放' },
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
    coinReward: 40,
    unlockCondition: { reqDungeonId: 'd2', label: '炎の洞窟クリアで解放' },
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
    coinReward: 50,
    unlockCondition: { reqDungeonId: 'd3', label: '氷結の峡谷クリアで解放' },
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
    coinReward: 70,
    unlockCondition: { reqDungeonId: 'd4', label: '魔王の回廊クリアで解放' },
  },
];

// ─── 敵ユニット定義 ───
export const ENEMIES = {
  // ─ ザコ ─
  slime:        { name: 'スライム',          icon: '🟢', trait: null,            desc: '特殊能力なし。' },
  goblin:       { name: 'ゴブリン',          icon: '👺', trait: null,            desc: '特殊能力なし。' },
  bat:          { name: 'コウモリ',          icon: '🦇', trait: null,            desc: '特殊能力なし。' },
  fire_bat:     { name: 'ファイア蝙蝠',     icon: '🔥', trait: null,            desc: '特殊能力なし。' },
  orc:          { name: 'オーク',            icon: '👹', trait: null,            desc: '特殊能力なし。' },
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
// 初期から2個選択肢あり。未解放は「遭遇単語数」で順次解除
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
    id: 'balanced',
    name: 'バランサー',
    icon: '⚖️',
    desc: '攻守のバランスが良い基本スタイル。与ダメ+10% & 被ダメ10%カット。',
    unlockCondition: null, // 初期解放
    effects: {
      baseDamageMultiplier: 1.1,
      damageReduction: 0.1,
    },
  },
  {
    id: 'analyst',
    name: 'アナリスト',
    icon: '🔬',
    desc: '苦手単語の出題率UP & 与ダメージ1.8倍。',
    unlockCondition: { type: 'seenWords', value: 20, label: '累計20単語遭遇で解放' },
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
    unlockCondition: { type: 'seenWords', value: 50, label: '累計50単語遭遇で解放' },
    effects: {
      damageRandomMin: 0.5,
      damageRandomMax: 3.0,
    },
  },
  {
    id: 'speedster',
    name: 'スピードスター',
    icon: '⚡',
    desc: '1秒以内クリティカルのダメージ2.5倍。制限時間20%減。',
    unlockCondition: { type: 'seenWords', value: 80, label: '累計80単語遭遇で解放' },
    effects: {
      criticalMultiplier: 2.5,
      timeLimitMultiplier: 0.8,
    },
  },
  {
    id: 'mindful',
    name: 'マインドフル',
    icon: '🧘',
    desc: '制限時間2倍。ただし1秒以内クリティカルなし。',
    unlockCondition: { type: 'seenWords', value: 120, label: '累計120単語遭遇で解放' },
    effects: {
      timeLimitMultiplier: 2.0,
      criticalDisabled: true,
    },
  },
  {
    id: 'berserker',
    name: '狂戦士',
    icon: '🔥',
    desc: '自信度「低」選択不可。基礎ダメージ1.5倍。',
    unlockCondition: { type: 'seenWords', value: 160, label: '累計160単語遭遇で解放' },
    effects: {
      baseDamageMultiplier: 1.5,
      minConfidence: 1.2,
    },
  },
];

// ─── 持ち込みスロット枠定義（全5枠） ───
export const ITEM_SLOTS_DEF = [
  { slotIndex: 0, label: '枠 1', unlockCondition: null }, // 最初から解放
  { slotIndex: 1, label: '枠 2', unlockCondition: { type: 'totalCorrect', value: 10, label: '累計10問正解' } },
  { slotIndex: 2, label: '枠 3', unlockCondition: { type: 'dungeonClear', value: 'd1', label: '基礎の森クリア' } },
  { slotIndex: 3, label: '枠 4', unlockCondition: { type: 'totalCorrect', value: 50, label: '累計50問正解' } },
  { slotIndex: 4, label: '枠 5', unlockCondition: { type: 'dungeonClear', value: 'd2', label: '炎の洞窟クリア' } },
];

// ─── アイテム定義（全18種、レアリティ付き） ───
// レアリティ: common, rare, epic, legendary
export const ITEMS = {
  // ── Common (コモン: 60%) ──
  scroll_shield: {
    name: '聖なる護符',
    icon: '📜',
    rarity: 'common',
    type: 'passive',
    desc: '各戦闘開始時にミスを1回防ぐバリアを自動展開。',
    effect: { hook: 'onBattleStart', action: 'addBarrier', value: 1 },
  },
  smoke_bomb: {
    name: '煙幕',
    icon: '💨',
    rarity: 'common',
    type: 'active',
    desc: '現在の問題をスキップする。（1Runに3回まで）',
    maxUses: 3,
    effect: { hook: 'onActiveItemUse', action: 'skipQuestion' },
  },
  first_aid: {
    name: '応急キット',
    icon: '🩹',
    rarity: 'common',
    type: 'active',
    desc: 'ミス時の解説画面でHPを30%回復。（1Runに2回まで）',
    maxUses: 2,
    effect: { hook: 'onActiveItemUse', action: 'healHp', value: 0.3 },
  },
  iron_sword: {
    name: '鉄の剣',
    icon: '🗡️',
    rarity: 'common',
    type: 'passive',
    desc: '基礎攻撃力が15%アップする。',
    effect: { hook: 'onCalcDamage', action: 'damageMult', value: 1.15 },
  },
  wooden_shield: {
    name: '木の盾',
    icon: '🪵',
    rarity: 'common',
    type: 'passive',
    desc: '被ダメージを15%カットする。',
    effect: { hook: 'onTakeDamage', action: 'reduceDamage', value: 0.15 },
  },
  hourglass: {
    name: '砂時計',
    icon: '⏳',
    rarity: 'common',
    type: 'passive',
    desc: '制限時間が+2.0秒延長される。',
    effect: { hook: 'onBattleStart', action: 'addTimer', value: 2.0 },
  },
  gold_magnet: {
    name: '黄金の磁石',
    icon: '🧲',
    rarity: 'common',
    type: 'passive',
    desc: 'ダンジョンクリア時の獲得コインが+50%アップする。',
    effect: { hook: 'onClear', action: 'coinBonus', value: 0.5 },
  },

  // ── Rare (レア: 28%) ──
  retro_mask: {
    name: '復習の仮面',
    icon: '🎭',
    rarity: 'rare',
    type: 'passive',
    desc: '過去にミスした単語が出題された瞬間にバリアを自動生成。',
    effect: { hook: 'onQuestionStart', action: 'barrierIfMissedBefore' },
  },
  cloze_catalyst: {
    name: '迅速の触媒',
    icon: '🧪',
    rarity: 'rare',
    type: 'passive',
    desc: '1秒以内のクリティカル正解時にダメージ+50%追撃。',
    effect: { hook: 'onCalcDamage', action: 'criticalBonus', value: 1.5 },
  },
  vampire_fang: {
    name: '吸血の牙',
    icon: '🦷',
    rarity: 'rare',
    type: 'passive',
    desc: '1秒以内クリティカル正解時にHPが12回復する。',
    effect: { hook: 'onAnswer', action: 'healOnCritical', value: 12 },
  },
  focus_lens: {
    name: '集中レンズ',
    icon: '🔍',
    rarity: 'rare',
    type: 'passive',
    desc: '自信度スライダーのダメージ倍率効果が1.25倍に強化される。',
    effect: { hook: 'onCalcDamage', action: 'confidenceBoost', value: 1.25 },
  },
  spiked_armor: {
    name: 'トゲの鎧',
    icon: '🦔',
    rarity: 'rare',
    type: 'passive',
    desc: 'ダメージを受けた時、敵に被弾ダメージの50%を跳ね返す。',
    effect: { hook: 'onTakeDamage', action: 'reflectDamage', value: 0.5 },
  },
  warp_clock: {
    name: '時計の針',
    icon: '⏰',
    rarity: 'rare',
    type: 'active',
    desc: '現在のタイマーを満タンまで巻き戻す。（1Runに2回まで）',
    maxUses: 2,
    effect: { hook: 'onActiveItemUse', action: 'resetTimer' },
  },

  // ── Epic (エピック: 10%) ──
  seal_charm: {
    name: '封印の呪符',
    icon: '🔮',
    rarity: 'epic',
    type: 'active',
    desc: '出題中の単語を今回のRunから一時除外。（1Runに1回まで）',
    maxUses: 1,
    effect: { hook: 'onActiveItemUse', action: 'sealWord' },
  },
  lightning_scroll: {
    name: '雷電の巻物',
    icon: '⚡',
    rarity: 'epic',
    type: 'active',
    desc: '敵に大ダメージ雷撃を放つ。（1Runに1回まで）',
    maxUses: 1,
    effect: { hook: 'onActiveItemUse', action: 'directDamage', value: 60 },
  },
  phoenix_feather: {
    name: '不死鳥の羽',
    icon: '🪶',
    rarity: 'epic',
    type: 'passive',
    desc: 'HPが0になった時、1度だけHP50%で復活する。',
    effect: { hook: 'onDeath', action: 'revive', value: 0.5 },
  },
  lucky_coin: {
    name: '幸運の古銭',
    icon: '🪙',
    rarity: 'epic',
    type: 'passive',
    desc: '正解時、30%の確率で2倍の追撃ダメージが発生する。',
    effect: { hook: 'onCalcDamage', action: 'doubleAttackChance', chance: 0.3 },
  },

  // ── Legendary (レジェンダリー: 2%) ──
  philosophers_stone: {
    name: '賢者の石',
    icon: '💎',
    rarity: 'legendary',
    type: 'passive',
    desc: '全能力値+20%。マスター済み単語のダメージが2倍になる。',
    effect: { hook: 'onCalcDamage', action: 'allStatsAndMasterBoost', value: 1.2 },
  },
};

// ─── クエスト（段階的実績）定義 ───
export const QUEST_CHAINS = [
  // クリア系
  [
    { id: 'q_clear_1', name: '冒険の始まり', desc: 'ダンジョンを1回クリアする', reward: 20, condition: { type: 'dungeonClearCount', value: 1 } },
    { id: 'q_clear_3', name: '探索の軌跡', desc: 'ダンジョンを累計3回クリアする', reward: 40, condition: { type: 'dungeonClearCount', value: 3 } },
    { id: 'q_clear_10', name: 'ダンジョンマスター', desc: 'ダンジョンを累計10回クリアする', reward: 80, condition: { type: 'dungeonClearCount', value: 10 } },
  ],
  // 撃破系
  [
    { id: 'q_def_10', name: '魔物ハンター見習い', desc: '敵を累計10体撃破する', reward: 15, condition: { type: 'defeatedTotal', value: 10 } },
    { id: 'q_def_50', name: '魔物バスター', desc: '敵を累計50体撃破する', reward: 35, condition: { type: 'defeatedTotal', value: 50 } },
    { id: 'q_def_150', name: '百戦錬磨の勇者', desc: '敵を累計150体撃破する', reward: 70, condition: { type: 'defeatedTotal', value: 150 } },
  ],
  // クリティカル系
  [
    { id: 'q_crit_10', name: '電光石火', desc: '1秒以内クリティカルを10回達成', reward: 25, condition: { type: 'criticalCount', value: 10 } },
    { id: 'q_crit_50', name: '神速の反射神経', desc: '1秒以内クリティカルを50回達成', reward: 60, condition: { type: 'criticalCount', value: 50 } },
  ],
  // 単語マスター系
  [
    { id: 'q_mast_10', name: '単語の芽生え', desc: '単語を10語マスターする（正解3回以上）', reward: 30, condition: { type: 'masteredWords', value: 10 } },
    { id: 'q_mast_50', name: '語彙の達人', desc: '単語を50語マスターする', reward: 60, condition: { type: 'masteredWords', value: 50 } },
    { id: 'q_mast_150', name: '博覧強記', desc: '単語を150語マスターする', reward: 120, condition: { type: 'masteredWords', value: 150 } },
  ],
  // 自信度系
  [
    { id: 'q_conf_10', name: '勝負師の勘', desc: '自信度2.0xで10回正解する', reward: 30, condition: { type: 'highConfidenceCorrect', value: 10 } },
    { id: 'q_conf_30', name: '強気の極致', desc: '自信度2.0xで30回正解する', reward: 60, condition: { type: 'highConfidenceCorrect', value: 30 } },
  ],
];

// ─── ダメージ計算パラメータ ───
export const DAMAGE_CONFIG = {
  baseDamage: 15,
  firstSeenBonus: 25,
  missedBonus: 20,
  forgottenBonus: 15,          // 3日以上未遭遇
  forgottenThresholdMs: 3 * 24 * 60 * 60 * 1000,
  criticalTimeMs: 1000,
  criticalMultiplier: 1.5,
  confidenceMin: 1.0,
  confidenceMax: 2.0,
  missBasePenalty: 20,
  masteryThreshold: 3,
};

// ─── CSV => ダンジョン単語割り当て ───
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

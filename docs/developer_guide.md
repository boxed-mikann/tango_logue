# 🛠️ LEAP ROGUE-LITE 開発・拡張ガイド (Developer Guide)

本アプリは、ロジックとマスターデータを明確に分離した**「データ駆動型アーキテクチャ」**を採用しています。
ゲームバランスの調整、単語の追加、アイテムや敵、スタイルの拡張は、マスターデータ（`words.csv` や `js/data.js`）を編集するだけで安全かつ迅速に行うことができます。

---

## 1. 📖 単語の追加・変更・ステージ分類 (`words.csv`)

単語データはルート直下の `words.csv` で管理されています。

### CSVフォーマット仕様
CSVのパーサーは以下の3つの形式を自動判別します。

| 形式 | 記述例 | 説明 |
| :--- | :--- | :--- |
| **末尾ステージ番号指定** | `abandon,見捨てる・放棄する,1` | **推奨**。第3列にステージ番号（1〜5）を指定 |
| **先頭ステージ番号指定** | `1,abandon,見捨てる・放棄する` | 第1列にステージ番号（1〜5）を指定 |
| **ステージ指定なし (自動均等配分)** | `abandon,見捨てる・放棄する` | 全単語数に応じてダンジョン1〜5に均等分割 |

> [!TIP]
> 日本語訳の中にカンマ（例: `①見捨てる, ②放棄する`）が含まれる場合は、ダブルクォーテーションで囲んでください：
> `abandon,"①見捨てる, ②放棄する",1`

---

## 2. 🎨 イメージ・スプライト・アバターの差し替え

現在は軽量性と動作速度を重視して絵文字（👾, ⚔️, 🌲など）を使用していますが、画像ファイル（PNG, SVG, WebP）に容易に差し替え可能です。

### A. 敵やプレイヤーのスプライトを画像にする場合
`index.html` のスプライト表示要素：
```html
<!-- 敵スプライト -->
<div id="enemy-sprite" class="text-4xl">👾</div>

<!-- プレイヤースプライト -->
<div id="player-sprite" class="text-4xl">⚔️</div>
```

画像に切り替える場合、`js/data.js` の `icon` プロパティに画像パスを指定するかHTMLタグを埋め込みます：
```javascript
// 例: 画像パスを指定する場合
slime: { 
  name: 'スライム', 
  icon: '<img src="./assets/enemies/slime.png" class="w-12 h-12 object-contain filter drop-shadow">' 
}
```
そして `js/main.js` の描画箇所（`renderBattleUI()`）で `textContent` の代わりに `innerHTML` を使って反映します。

---

## 3. 👾 敵ユニットの追加・特殊ギミック作成 (`js/data.js`)

新しい敵は `js/data.js` の `ENEMIES` オブジェクトに追加します。

### 定義例
```javascript
export const ENEMIES = {
  // 新規敵「ゴースト」を追加
  ghost: {
    name: 'ファントム',
    icon: '👻',
    trait: 'evasion',  // 特殊特性
    desc: '正解しても30%の確率で攻撃を回避する。',
  },
  ...
};
```

### 特殊ギミック（trait）をバトル処理に組み込む手順
`js/battle.js` の該当フック箇所に判定を追加します：
- **出題前**: `selectNextWord()`
- **ダメージ計算・攻撃時**: `calcDamage()` または `handleAnswer()`
- **タイマー制御**: `getEffectiveTimeLimit()`

**実装例（攻撃回避ギミックの追加）**:
`js/battle.js` の `handleAnswer` 内で：
```javascript
if (bs.currentEnemy.trait === 'evasion' && Math.random() < 0.3) {
  showCutin('👻 MISS!', '敵が攻撃をすり抜けた！', 'cutin-miss');
  setTimeout(() => nextQuestion(), 800);
  return;
}
```

### ダンジョンへの出現設定
追加した敵を `DUNGEONS` の `enemyPool`（ザコ枠）または `bossId`（ボス枠）にIDを追加します：
```javascript
{
  id: 'd1',
  name: '基礎の森',
  enemyPool: ['slime', 'goblin', 'bat', 'ghost'], // ここに追加
  ...
}
```

---

## 4. 🎒 アイテムの追加・レアリティ設定 (`js/data.js`)

新しいアイテムは `js/data.js` の `ITEMS` に追加するだけで、**ガチャの排出候補**および**戦闘中ドロップ候補（3択ピック）**に自動登録されます。

### 定義フォーマット
```javascript
export const ITEMS = {
  // アイテムID
  dragon_ring: {
    name: '竜の指輪',
    icon: '💍',
    rarity: 'epic',          // 'common' | 'rare' | 'epic' | 'legendary'
    type: 'passive',         // 'passive' (自動発動) または 'active' (任意使用)
    desc: '基礎攻撃力が30%アップする。',
    effect: { 
      hook: 'onCalcDamage',  // 割り込みフックポイント
      action: 'damageMult', 
      value: 1.3 
    },
  },
  heal_potion: {
    name: '回復ポーション',
    icon: '🧪',
    rarity: 'common',
    type: 'active',
    desc: 'HPを40回復する。（1Runに2回まで）',
    maxUses: 2,
    effect: { 
      hook: 'onActiveItemUse', 
      action: 'healHpFixed', 
      value: 40 
    },
  },
};
```

### フックポイント一覧
| フック名 | 発生タイミング | 用途例 |
| :--- | :--- | :--- |
| `onBattleStart` | バトル開始時 | バリア自動展開、タイマー延長など |
| `onQuestionStart` | 問題出題時 | 苦手単語出現時の自動バリアなど |
| `onCalcDamage` | 正解ダメージ計算時 | ダメージ倍率UP、追撃発生など |
| `onAnswer` | 正解/不正解確定時 | 正解時HP回復など |
| `onTakeDamage` | プレイヤー被弾時 | 被ダメージカット、ダメージ反射など |
| `onDeath` | HPが0になった時 | 不死鳥の羽などの蘇生効果 |
| `onActiveItemUse` | アクティブアイテム使用時 | 問題スキップ、回復、雷撃など |

---

## 5. 🛡️ バトルスタイルの追加 (`js/data.js`)

新しいバトルスタイルは `js/data.js` の `STYLES` に追加します。

```javascript
export const STYLES = [
  {
    id: 'samurai',
    name: 'サムライ',
    icon: '⚔️',
    desc: '1秒クリティカルのダメージ3倍。ただしミス時の被ダメージも2倍。',
    unlockCondition: { 
      type: 'seenWords', 
      value: 200, 
      label: '累計200単語遭遇で解放' 
    },
    effects: {
      criticalMultiplier: 3.0,
      damageTakenMultiplier: 2.0,
    },
  },
];
```

- `unlockCondition`: `null` なら初期解放。`{ type: 'seenWords', value: X }` で遭遇単語数に応じた自動アンロック。
- `effects`: `js/battle.js` の `calcDamage()` や `calcMissPenalty()` 内で効果を参照して処理します。

---

## 6. 🔊 BGM・SEの追加・音源調整 (`js/audio.js`)

外部のMP3やWAVファイルを用意することなく、Web Audio API で即時に新しい効果音を追加できます。

`js/audio.js` の `playSE(name)` 内に新しいケースを追加：
```javascript
case 'levelUp':
  // 3和音のファンファーレ
  this.playTone(440.00, 'triangle', 0.1, 0, 0.7);
  this.playTone(554.37, 'triangle', 0.1, 0.08, 0.7);
  this.playTone(659.25, 'triangle', 0.25, 0.16, 0.8);
  break;
```
任意の場所で `sound.playSE('levelUp')` を呼び出すだけで発音されます。

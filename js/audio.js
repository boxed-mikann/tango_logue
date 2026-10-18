// ============================================================
// audio.js — Web Audio API によるシンセサイザーBGM & SEエンジン
// （外部ファイル依存なし・超軽量・即時発音・音量制御対応）
// ============================================================

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.bgmGain = null;
    this.seGain = null;
    this.masterGain = null;
    this.isBgmPlaying = false;
    this.currentBgmType = null;
    this.bgmTimer = null;
    this.bgmStep = 0;

    // 設定
    this.settings = {
      bgmEnabled: true,
      seEnabled: true,
      bgmVolume: 0.25,
      seVolume: 0.5,
    };
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.settings.bgmEnabled ? this.settings.bgmVolume : 0;
    this.bgmGain.connect(this.masterGain);

    this.seGain = this.ctx.createGain();
    this.seGain.gain.value = this.settings.seEnabled ? this.settings.seVolume : 0;
    this.seGain.connect(this.masterGain);
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  updateSettings(newSettings) {
    Object.assign(this.settings, newSettings);
    if (this.bgmGain) {
      this.bgmGain.gain.value = this.settings.bgmEnabled ? this.settings.bgmVolume : 0;
    }
    if (this.seGain) {
      this.seGain.gain.value = this.settings.seEnabled ? this.settings.seVolume : 0;
    }
    if (!this.settings.bgmEnabled && this.isBgmPlaying) {
      this.stopBGM();
    } else if (this.settings.bgmEnabled && !this.isBgmPlaying && this.currentBgmType) {
      this.playBGM(this.currentBgmType);
    }
  }

  // ─── 汎用トーンジェネレーター ───
  playTone(freq, type = 'sine', duration = 0.1, startTime = 0, gainLevel = 1.0) {
    if (!this.settings.seEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime + startTime;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(gainLevel, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.seGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  // ─── サウンドエフェクト (SE) ───
  playSE(name) {
    if (!this.settings.seEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    switch (name) {
      case 'click':
        this.playTone(800, 'sine', 0.04, 0, 0.4);
        break;

      case 'correct':
        // 明るい上昇2音 (ド-ソ)
        this.playTone(523.25, 'triangle', 0.1, 0, 0.6);
        this.playTone(783.99, 'triangle', 0.18, 0.09, 0.7);
        break;

      case 'critical':
        // 爽快なアルペジオ (ド-ミ-ソ-高ド)
        this.playTone(523.25, 'sine', 0.08, 0, 0.7);
        this.playTone(659.25, 'sine', 0.08, 0.07, 0.7);
        this.playTone(783.99, 'sine', 0.08, 0.14, 0.8);
        this.playTone(1046.50, 'triangle', 0.28, 0.21, 0.9);
        break;

      case 'miss':
        // 低い不協和音 (ブブー)
        this.playTone(220, 'sawtooth', 0.18, 0, 0.5);
        this.playTone(196, 'sawtooth', 0.22, 0.12, 0.5);
        break;

      case 'attack': {
        // ヒット音（ホワイトノイズ + 低音スイープ）
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.connect(gain);
        gain.connect(this.seGain);
        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }

      case 'damage': {
        // 被弾・重い打撃
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);
        gain.gain.setValueAtTime(0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.connect(gain);
        gain.connect(this.seGain);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }

      case 'guard':
        // キン！という金属バリア音
        this.playTone(1200, 'sine', 0.08, 0, 0.8);
        this.playTone(1800, 'sine', 0.15, 0.04, 0.6);
        break;

      case 'enemySpawn':
        this.playTone(260, 'sawtooth', 0.15, 0, 0.4);
        this.playTone(390, 'sawtooth', 0.25, 0.1, 0.5);
        break;

      case 'bossWarning':
        // 警報風サイレン音
        this.playTone(440, 'square', 0.15, 0, 0.6);
        this.playTone(370, 'square', 0.15, 0.15, 0.6);
        this.playTone(440, 'square', 0.2, 0.3, 0.7);
        break;

      case 'itemDrop':
      case 'itemGet':
        // ピロリン！
        this.playTone(659.25, 'sine', 0.09, 0, 0.6);
        this.playTone(880.00, 'sine', 0.09, 0.08, 0.7);
        this.playTone(1174.66, 'triangle', 0.25, 0.16, 0.8);
        break;

      case 'stageClear':
        // ファンファーレ
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
          this.playTone(freq, 'triangle', 0.2, i * 0.12, 0.7);
        });
        this.playTone(1046.50, 'sine', 0.6, 0.48, 0.9);
        break;

      case 'gameOver':
        // 暗い下降和音
        this.playTone(392.00, 'sawtooth', 0.25, 0, 0.5);
        this.playTone(349.23, 'sawtooth', 0.25, 0.2, 0.5);
        this.playTone(329.63, 'sawtooth', 0.25, 0.4, 0.5);
        this.playTone(261.63, 'sawtooth', 0.5, 0.6, 0.6);
        break;

      default:
        break;
    }
  }

  // ─── レトロ風 BGM シーケンサー ───
  playBGM(type = 'battle') {
    this.currentBgmType = type;
    if (!this.settings.bgmEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    if (this.isBgmPlaying) {
      this.stopBGM();
    }

    this.isBgmPlaying = true;
    this.bgmStep = 0;

    // シンプルな8ビットRPG調メロディ & ベースパターン
    // (A minor / Pentatonic系)
    const patterns = {
      home: {
        tempoMs: 220,
        bass: [220, 0, 261.63, 0, 293.66, 0, 261.63, 0],
        melody: [440, 523.25, 659.25, 523.25, 587.33, 523.25, 440, 0],
      },
      battle: {
        tempoMs: 160,
        bass: [110, 110, 130.81, 110, 146.83, 110, 130.81, 164.81],
        melody: [440, 0, 523.25, 587.33, 659.25, 587.33, 523.25, 440],
      },
      boss: {
        tempoMs: 135,
        bass: [98, 98, 116.54, 98, 130.81, 116.54, 146.83, 130.81],
        melody: [392, 466.16, 523.25, 587.33, 622.25, 587.33, 523.25, 466.16],
      },
    };

    const pat = patterns[type] || patterns.battle;

    this.bgmTimer = setInterval(() => {
      if (!this.isBgmPlaying || !this.settings.bgmEnabled) return;
      const bFreq = pat.bass[this.bgmStep % pat.bass.length];
      const mFreq = pat.melody[this.bgmStep % pat.melody.length];

      const now = this.ctx.currentTime;

      // ベース音
      if (bFreq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(bFreq, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (pat.tempoMs / 1000) * 0.9);
        osc.connect(gain);
        gain.connect(this.bgmGain);
        osc.start(now);
        osc.stop(now + (pat.tempoMs / 1000) * 0.9);
      }

      // メロディ音
      if (mFreq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(mFreq, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (pat.tempoMs / 1000) * 0.8);
        osc.connect(gain);
        gain.connect(this.bgmGain);
        osc.start(now);
        osc.stop(now + (pat.tempoMs / 1000) * 0.8);
      }

      this.bgmStep++;
    }, pat.tempoMs);
  }

  stopBGM() {
    this.isBgmPlaying = false;
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const sound = new SoundEngine();

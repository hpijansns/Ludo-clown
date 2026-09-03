/* Loud Audio Master Engine & Synthesizer Effects */
class LoudAudioMaster {
  constructor() {
    this.ctx = null;
    this.compressor = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(28, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(14, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.18, this.ctx.currentTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(2.2, this.ctx.currentTime);
        this.compressor.connect(gain);
        gain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type, duration, vol = 0.55, bass = false) {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.compressor);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);

      if (bass) {
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(80, this.ctx.currentTime);
        subGain.gain.setValueAtTime(vol * 0.95, this.ctx.currentTime);
        subGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        sub.connect(subGain);
        subGain.connect(this.compressor);
        sub.start();
        sub.stop(this.ctx.currentTime + duration);
      }
    } catch (e) {}
  }

  roll() {
    this.init();
    let c = 0;
    const iv = setInterval(() => {
      this.playTone(210 + Math.random() * 260, 'square', 0.045, 0.45);
      c++;
      if (c > 5) clearInterval(iv);
    }, 38);
  }

  step(idx) {
    this.playTone(430 + (idx % 14) * 28, 'sine', 0.065, 0.7);
  }

  capture() {
    this.playTone(260, 'sawtooth', 0.14, 0.9, true);
    setTimeout(() => this.playTone(105, 'sawtooth', 0.32, 1.0, true), 60);
  }

  rewind(step) {
    this.playTone(680 + (step % 8) * 45, 'triangle', 0.035, 0.45);
  }

  bonus() {
    this.playTone(740, 'triangle', 0.12, 0.75);
    setTimeout(() => this.playTone(1080, 'triangle', 0.24, 0.85), 85);
  }

  home() {
    [587.33, 739.99, 880, 1174.66].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'triangle', 0.22, 0.8, true), i * 70);
    });
  }

  win() {
    [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'triangle', 0.4, 0.9, true), i * 100);
    });
  }

  warningBeep() {
    this.playTone(850, 'sine', 0.08, 0.5);
  }

  /* Winning Stadium Crowd Cheers & Applause Synthesizer */
  cheerAndApplause() {
    this.init();
    if (!this.ctx) return;

    // 1. Victory Fanfare Melodic Chords
    const chords = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    chords.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 'triangle', 0.5, 0.7, true);
      }, idx * 110);
    });

    // 2. Stadium Crowd Clapping / Applause Roar
    const bufferSize = this.ctx.sampleRate * 2.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.75));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 2.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor || this.ctx.destination);

    noise.start();
  }
}

const sound = new LoudAudioMaster();

function triggerHaptic() {
  if (navigator.vibrate) {
    navigator.vibrate(80);
  }
}

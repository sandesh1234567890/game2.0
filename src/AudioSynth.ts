export class AudioSynth {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // Initialized lazily on first user click to bypass autoplay restrictions
  }

  private initContext() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    this.createNoiseBuffer();
  }

  // Pre-generate white noise buffer to reuse for gunshots, slides, and impacts
  private createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2.0; // 2 seconds of noise
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2.0 - 1.0;
    }
  }

  // Synthesize custom gunshot crack and reverberation sweep
  playShoot(type: string = 'rifle') {
    this.initContext();
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;

    // 1. Heavy transient thump
    const thump = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thump.type = 'sine';
    
    let thumpFreq = 140;
    let thumpDecay = 0.06;
    let thumpVol = 0.8;

    if (type === 'sniper') {
      thumpFreq = 90;
      thumpDecay = 0.12;
      thumpVol = 1.2;
    } else if (type === 'pistol') {
      thumpFreq = 160;
      thumpDecay = 0.04;
      thumpVol = 0.45;
    } else if (type === 'smg') {
      thumpFreq = 180;
      thumpDecay = 0.03;
      thumpVol = 0.5;
    } else if (type === 'shotgun') {
      thumpFreq = 60;
      thumpDecay = 0.18;
      thumpVol = 1.5;
    }

    thump.frequency.setValueAtTime(thumpFreq, now);
    thump.frequency.exponentialRampToValueAtTime(40, now + thumpDecay);

    thumpGain.gain.setValueAtTime(thumpVol, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + thumpDecay);

    thump.connect(thumpGain);
    thumpGain.connect(this.ctx.destination);
    thump.start(now);
    thump.stop(now + thumpDecay);

    // 2. High-frequency noise crack
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';

    let filterFreq = 1000;
    let noiseDecay = 0.18;
    let noiseVol = 0.7;

    if (type === 'sniper') {
      filterFreq = 600;
      noiseDecay = 0.35;
      noiseVol = 1.0;
    } else if (type === 'pistol') {
      filterFreq = 1300;
      noiseDecay = 0.1;
      noiseVol = 0.5;
    } else if (type === 'smg') {
      filterFreq = 1600;
      noiseDecay = 0.08;
      noiseVol = 0.45;
    } else if (type === 'shotgun') {
      filterFreq = 400;
      noiseDecay = 0.45;
      noiseVol = 1.2;
    }

    noiseFilter.frequency.setValueAtTime(filterFreq, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(150, now + noiseDecay);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(noiseVol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDecay);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noiseNode.start(now);
    noiseNode.stop(now + noiseDecay);
  }

  // Hitmarker Ping (satisfying high frequency pulse)
  playHitmarker() {
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now); // high frequency beep

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Headshot "Ding" (FM metallic ring sound)
  playHeadshot() {
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    
    // Carrier oscillator
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(2200, now);

    // Modulator for FM synthesis to create metallic bell sound
    const modulator = this.ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(1100, now);

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(800, now);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency); // FM modulation
    
    carrier.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    modulator.start(now);
    carrier.start(now);

    modulator.stop(now + 0.35);
    carrier.stop(now + 0.35);
  }

  // Tactical slide sound (Friction drag)
  playSlide() {
    this.initContext();
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.7);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noiseNode.start(now);
    noiseNode.stop(now + 0.7);
  }

  // Jump slide / push sound
  playJump() {
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.linearRampToValueAtTime(160, now + 0.1);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  // Reload clicks (mechanical transient sound)
  playReload() {
    this.initContext();
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;

    // First click (mag release)
    const click1 = this.ctx.createBufferSource();
    click1.buffer = this.noiseBuffer;
    const filter1 = this.ctx.createBiquadFilter();
    filter1.type = 'highpass';
    filter1.frequency.setValueAtTime(2000, now);
    const gain1 = this.ctx.createGain();
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    click1.connect(filter1);
    filter1.connect(gain1);
    gain1.connect(this.ctx.destination);
    click1.start(now);
    click1.stop(now + 0.05);

    // Second click (mag inserted, t+0.25s)
    const click2 = this.ctx.createBufferSource();
    click2.buffer = this.noiseBuffer;
    const filter2 = this.ctx.createBiquadFilter();
    filter2.type = 'bandpass';
    filter2.frequency.setValueAtTime(1200, now + 0.3);
    const gain2 = this.ctx.createGain();
    gain2.gain.setValueAtTime(0.15, now + 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    click2.connect(filter2);
    filter2.connect(gain2);
    gain2.connect(this.ctx.destination);
    click2.start(now + 0.3);
    click2.stop(now + 0.35);

    // Third click (bolt pull, t+0.6s)
    const click3 = this.ctx.createBufferSource();
    click3.buffer = this.noiseBuffer;
    const filter3 = this.ctx.createBiquadFilter();
    filter3.type = 'highpass';
    filter3.frequency.setValueAtTime(2500, now + 0.65);
    const gain3 = this.ctx.createGain();
    gain3.gain.setValueAtTime(0.1, now + 0.65);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

    click3.connect(filter3);
    filter3.connect(gain3);
    gain3.connect(this.ctx.destination);
    click3.start(now + 0.65);
    click3.stop(now + 0.72);
  }

  // Damage impact grunt
  playDamage() {
    this.initContext();
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(now);
    source.stop(now + 0.12);
  }

  // Kill streak activation sound (rising alert tone)
  playStreakNotification() {
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Three ascending tones
    const freqs = [600, 900, 1200];
    freqs.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      gain.gain.setValueAtTime(0.15, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.1);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.1);
    });
  }

  // New wave start horn (dramatic low brass)
  playWaveStart() {
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.3);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  // Synthesize explosion sound (sub-bass thump + white noise rumble)
  playExplosion() {
    this.initContext();
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const duration = 1.5;

    // 1. Low sub-bass thump
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(90, now);
    subOsc.frequency.exponentialRampToValueAtTime(10, now + 0.4);
    subGain.gain.setValueAtTime(1.8, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.8);

    // 2. Mid rumble/crack
    const midOsc = this.ctx.createOscillator();
    const midGain = this.ctx.createGain();
    midOsc.type = 'sawtooth';
    midOsc.frequency.setValueAtTime(120, now);
    midOsc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    midGain.gain.setValueAtTime(0.6, now);
    midGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    midOsc.connect(midGain);
    midGain.connect(this.ctx.destination);
    midOsc.start(now);
    midOsc.stop(now + 0.3);

    // 3. Noise explosion blast
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.noiseBuffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1200, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(80, now + 1.0);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noiseNode.start(now);
    noiseNode.stop(now + duration);
  }
}

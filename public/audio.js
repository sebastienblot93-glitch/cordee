// Petits effets sonores synthétisés (aucun fichier à charger). Touche M : couper / remettre le son.
(function () {
  let ac = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem('cordee.muted') === '1'; } catch { /* stockage indisponible */ }

  function ctx() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.16;
      master.connect(ac.destination);
    } catch { ac = null; }
    return ac;
  }

  // Les navigateurs exigent un geste de l'utilisateur avant de produire du son
  function unlock() {
    const a = ctx();
    if (a && a.state === 'suspended') a.resume();
  }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));

  // tone : fréquence de départ -> d'arrivée, forme d'onde, durée, volume, délai
  function tone(f0, f1, dur, type = 'square', vol = 0.5, delay = 0) {
    const a = ctx();
    if (!a || muted) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.4, lo = 400, delay = 0) {
    const a = ctx();
    if (!a || muted) return;
    const t0 = a.currentTime + delay;
    const n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lo;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  const SOUNDS = {
    jump: () => tone(300, 620, 0.12, 'square', 0.25),
    spring: () => { tone(220, 900, 0.22, 'sine', 0.5); tone(440, 1200, 0.18, 'triangle', 0.3, 0.04); },
    orb: () => { tone(500, 900, 0.16, 'sine', 0.4); tone(750, 1200, 0.12, 'triangle', 0.25, 0.03); },
    arrow: () => { noise(0.1, 0.35, 3000); tone(700, 300, 0.1, 'triangle', 0.2); },
    fire: () => { noise(0.22, 0.5, 1800); tone(260, 120, 0.22, 'sawtooth', 0.22); },
    ice: () => { tone(1400, 1800, 0.1, 'triangle', 0.3); tone(1900, 2400, 0.14, 'sine', 0.22, 0.05); },
    swap: () => { tone(300, 1100, 0.18, 'sine', 0.4); tone(1100, 300, 0.18, 'sine', 0.4, 0.18); },
    hit: () => { tone(900, 1500, 0.12, 'triangle', 0.35); tone(1500, 1800, 0.1, 'sine', 0.2, 0.06); },
    crystal: () => { tone(880, 880, 0.18, 'sine', 0.4); tone(1320, 1320, 0.25, 'sine', 0.3, 0.07); },
    target: () => { tone(220, 220, 0.08, 'square', 0.4); tone(660, 660, 0.14, 'triangle', 0.4, 0.07); },
    torch: () => { noise(0.3, 0.45, 1400); tone(180, 360, 0.3, 'sawtooth', 0.15); },
    burn: () => { noise(0.35, 0.45, 1200); },
    key: () => { tone(988, 988, 0.1, 'square', 0.3); tone(1319, 1319, 0.2, 'square', 0.3, 0.09); },
    checkpoint: () => { tone(523, 523, 0.1, 'triangle', 0.4); tone(784, 784, 0.18, 'triangle', 0.4, 0.1); },
    door: () => { tone(330, 660, 0.3, 'triangle', 0.4); tone(494, 988, 0.3, 'triangle', 0.3, 0.1); },
    die: () => { tone(400, 70, 0.35, 'sawtooth', 0.35); noise(0.2, 0.4, 900); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 'square', 0.3, i * 0.11)); },
    chapter: () => { [392, 523, 659].forEach((f, i) => tone(f, f, 0.5, 'triangle', 0.3, i * 0.16)); },
    click: () => tone(600, 600, 0.04, 'square', 0.2),
  };

  const last = {};
  window.Sfx = {
    play(name, minGap = 40) {
      const now = performance.now();
      if (last[name] && now - last[name] < minGap) return;
      last[name] = now;
      const fn = SOUNDS[name];
      if (fn) { try { fn(); } catch { /* son non critique */ } }
    },
    isMuted: () => muted,
    setMuted(m) {
      muted = !!m;
      try { localStorage.setItem('cordee.muted', muted ? '1' : '0'); } catch { /* ignore */ }
      if (master) master.gain.value = muted ? 0 : 0.16;
      return muted;
    },
    toggle() { return this.setMuted(!muted); },
  };
})();

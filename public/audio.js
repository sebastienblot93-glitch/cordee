// Sons et musique synthétisés (aucun fichier à charger).
// Touche M : couper / remettre tout le son. Le bouton « Musique » coupe seulement la musique.
(function () {
  let ac = null;
  let master = null; // volume général
  let musicBus = null; // volume de la musique (plus faible que les bruitages)
  let muted = false;
  let musicOn = true;
  try { muted = localStorage.getItem('cordee.muted') === '1'; } catch { /* stockage indisponible */ }
  try { musicOn = localStorage.getItem('cordee.music') !== '0'; } catch { /* stockage indisponible */ }

  const MASTER_VOL = 0.13;
  const MUSIC_VOL = 0.15;

  function ctx() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : MASTER_VOL;
      master.connect(ac.destination);
      musicBus = ac.createGain();
      musicBus.gain.value = MUSIC_VOL;
      musicBus.connect(master);
    } catch { ac = null; }
    return ac;
  }

  // Les navigateurs exigent un geste de l'utilisateur avant de produire du son
  function unlock() {
    const a = ctx();
    if (a && a.state === 'suspended') {
      a.resume().then(() => ensureMusic()).catch(() => {});
    } else if (a) ensureMusic();
  }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));

  /* ---------- Bruitages ---------- */
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

  let noiseBuf = null;
  function noiseBuffer(a) {
    if (noiseBuf && noiseBuf.sampleRate === a.sampleRate) return noiseBuf;
    const n = a.sampleRate; // 1 seconde de bruit réutilisée
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function noise(dur, vol = 0.4, lo = 400, delay = 0) {
    const a = ctx();
    if (!a || muted) return;
    const t0 = a.currentTime + delay;
    const src = a.createBufferSource();
    src.buffer = noiseBuffer(a);
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lo;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // Chaque chapitre a sa « voix » de saut
  const JUMP_WAVE = { prairie: 'square', arcane: 'triangle', dark: 'sine', sanctuary: 'triangle', garden: 'sine', forge: 'sawtooth', mist: 'sine', summit: 'sawtooth' };
  let jumpWave = 'square';

  const SOUNDS = {
    jump: () => tone(300, 620, 0.12, jumpWave, jumpWave === 'sine' ? 0.4 : 0.25),
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
    star: () => { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.32, i * 0.07)); tone(2637, 2637, 0.35, 'sine', 0.2, 0.3); },
    medal: () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, f, 0.25, 'triangle', 0.3, 0.1 + i * 0.1)); },
    checkpoint: () => { tone(523, 523, 0.1, 'triangle', 0.4); tone(784, 784, 0.18, 'triangle', 0.4, 0.1); },
    door: () => { tone(330, 660, 0.3, 'triangle', 0.4); tone(494, 988, 0.3, 'triangle', 0.3, 0.1); },
    die: () => { tone(400, 70, 0.35, 'sawtooth', 0.35); noise(0.2, 0.4, 900); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 'square', 0.3, i * 0.11)); },
    chapter: () => { [392, 523, 659].forEach((f, i) => tone(f, f, 0.5, 'triangle', 0.3, i * 0.16)); },
    click: () => tone(600, 600, 0.04, 'square', 0.2),
    tick: () => tone(1100, 1100, 0.05, 'square', 0.22),
    timeup: () => { [440, 370, 311, 247].forEach((f, i) => tone(f, f * 0.96, 0.28, 'sawtooth', 0.3, i * 0.2)); },
  };

  /* ---------- Musique : un petit séquenceur de « chiptune » ---------- */
  // Chaque morceau dure 4 mesures de 16 pas (64 pas) et boucle.
  //  tonic : note de base (numéro MIDI) ; scale : gamme (demi-tons) ; prog : 4 accords [racine en demi-tons, notes de l'accord]
  //  bass : motif de basse sur 16 pas (0 = racine, 1 = quinte, 2 = octave) ; arp : motif d'arpège (numéro de note de l'accord)
  //  lead : mélodie sur 64 pas (nombre = degré de la gamme, '-' = prolonge, '.' = silence)
  //  kick / snare / hat : batterie sur 16 pas ; w : formes d'onde ; stac : notes courtes ; echo : écho sur la mélodie
  const MAJ = [0, 4, 7, 12];
  const MIN = [0, 3, 7, 12];
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const MINOR = [0, 2, 3, 5, 7, 8, 10];

  const SONGS = {
    menu: {
      bpm: 108, tonic: 60, scale: MAJOR, bo: -24,
      prog: [[0, MAJ], [9, MIN], [5, MAJ], [7, MAJ]],
      bass: '0.0.1.0.0.0.2.0.', arp: '0.1.2.1.0.1.2.3.',
      lead: '4 - - 2 4 - - 7 - - 4 - 2 - 0 - 5 - - 4 5 - - 9 - - 5 - 4 - 2 - 3 - - 5 7 - - 5 - - 3 - 5 - 7 - 4 - 6 - 8 - 6 - 4 - . . 1 - 4 .',
      kick: 'x.......x.......', snare: '', hat: '..x...x...x...x.',
      w: { lead: 'square', arp: 'triangle', bass: 'triangle' }, v: { lead: 0.5, arp: 0.2, bass: 0.55 },
    },
    // 1. La prairie : joyeux et sautillant
    prairie: {
      bpm: 132, tonic: 60, scale: MAJOR, bo: -24,
      prog: [[0, MAJ], [7, MAJ], [9, MIN], [5, MAJ]],
      bass: '0.0.2.0.0.0.2.1.', arp: '0.1.2.1.3.2.1.2.',
      lead: '4 - 2 - 0 - 2 - 4 - - - 7 - 4 - 6 - 4 - 6 - 8 - 6 - - - 4 - 1 - 7 - 5 - 7 - 9 - 7 - - - 5 - 4 - 5 - 3 - 5 - 7 - 5 - 3 - 4 - 2 -',
      kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
      w: { lead: 'square', arp: 'square', bass: 'triangle' }, v: { lead: 0.5, arp: 0.14, bass: 0.6 },
    },
    // 2. Les Arcanes : mystérieux, arpèges rapides (ré mineur)
    arcane: {
      bpm: 120, tonic: 62, scale: MINOR, bo: -24,
      prog: [[0, MIN], [8, MAJ], [3, MAJ], [10, MAJ]],
      bass: '0.0.0.0.1.0.0.2.', arp: '0123232101232321',
      lead: '4 - 2 - 0 - 2 - 4 - - 5 4 - 2 - 5 - 7 - 9 - 7 - 5 - - - 4 - 2 - 2 - 4 - 6 - 4 - 2 - - - 4 - 6 - 6 - 8 - 10 - 8 - 6 - - - 4 - 3 -',
      kick: 'x.....x.x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
      w: { lead: 'square', arp: 'square', bass: 'triangle' }, v: { lead: 0.45, arp: 0.13, bass: 0.6 },
    },
    // 3. Les Ténèbres : lent, creux, inquiétant (la mineur)
    dark: {
      bpm: 84, tonic: 57, scale: MINOR, bo: -12,
      prog: [[0, MIN], [8, MAJ], [5, MIN], [7, MIN]],
      bass: '0...............', arp: '0...2...1...3...',
      lead: '. . . . 4 - - - - - - - 2 - - - . . . . 5 - - - - - 3 - - - - . . . . . 3 - - - 5 - - - 7 - - - . . . . 4 - - - 6 - - - 8 - 6 -',
      kick: 'x.........x.....', snare: '', hat: '',
      w: { lead: 'triangle', arp: 'sine', bass: 'sine' }, v: { lead: 0.6, arp: 0.2, bass: 0.7 }, echo: true,
    },
    // 4. Le Sanctuaire : solennel (fa majeur)
    sanctuary: {
      bpm: 100, tonic: 53, scale: MAJOR, bo: -12,
      prog: [[0, MAJ], [9, MIN], [5, MAJ], [7, MAJ]],
      bass: '0.......1.......', arp: '0.1.2.3.2.1.0.1.',
      lead: '4 - - - 2 - - - 0 - - - 2 - 4 - 5 - - - 7 - - - 9 - - - 7 - 5 - 3 - - - 5 - - - 7 - - - 5 - 3 - 4 - 6 - 8 - - - 6 - 4 - 2 - 4 -',
      kick: 'x.......x.......', snare: '', hat: '..x...x...x...x.',
      w: { lead: 'triangle', arp: 'square', bass: 'triangle' }, v: { lead: 0.65, arp: 0.1, bass: 0.6 },
    },
    // 5. Les Jardins suspendus : sautillant et aérien (sol majeur)
    garden: {
      bpm: 148, tonic: 55, scale: MAJOR, bo: -12, stac: true,
      prog: [[0, MAJ], [9, MIN], [5, MAJ], [7, MAJ]],
      bass: '0...2...0...2.1.', arp: '3.2.1.0.3.2.1.0.',
      lead: '2 . 4 . 7 . 4 . 2 . 4 . 0 . 2 . 5 . 7 . 9 . 7 . 5 . 7 . 4 . 5 . 3 . 5 . 7 . 5 . 3 . 5 . 7 . 5 . 4 . 6 . 8 . 6 . 9 . 8 . 6 . 4 .',
      kick: 'x.....x.x.....x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
      w: { lead: 'triangle', arp: 'square', bass: 'triangle' }, v: { lead: 0.7, arp: 0.11, bass: 0.6 },
    },
    // 6. La Forge : lourd et martelé (mi mineur)
    forge: {
      bpm: 126, tonic: 52, scale: MINOR, bo: -12,
      prog: [[0, MIN], [8, MAJ], [5, MIN], [7, MIN]],
      bass: '0.0.2.0.0.0.2.0.', arp: '0.2.1.2.0.2.1.3.',
      lead: '4 - 2 - 0 - 2 - 4 - 7 - 4 - 2 - 5 - 7 - 9 - 7 - 5 - 7 - 4 - 5 - 3 - 5 - 7 - 5 - 3 - 5 - 7 - 9 - 4 - 6 - 8 - 6 - 4 - 6 - 8 - 6 -',
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
      w: { lead: 'square', arp: 'sawtooth', bass: 'sawtooth' }, v: { lead: 0.42, arp: 0.08, bass: 0.4 },
    },
    // 7. Les Brumes : flottant, long et rêveur (mi bémol majeur, avec écho)
    mist: {
      bpm: 92, tonic: 51, scale: MAJOR, bo: -12,
      prog: [[0, [0, 4, 7, 11]], [9, [0, 3, 7, 10]], [5, [0, 4, 7, 11]], [7, MAJ]],
      bass: '0.......1.......', arp: '0.1.2.3.2.1.2.3.',
      lead: '4 - - - - - 2 - - - 6 - - - 4 - 7 - - - 9 - - - - - 7 - - - 5 - 5 - - - 7 - - - - - 9 - - - 7 - 8 - - - 6 - - - 4 - - - 6 - 8 -',
      kick: 'x.......x.......', snare: '', hat: '..x...x...x...x.',
      w: { lead: 'sine', arp: 'triangle', bass: 'sine' }, v: { lead: 0.8, arp: 0.16, bass: 0.75 }, echo: true,
    },
    // 8. Le Sommet : tendu et héroïque (la mineur), tempo soutenu
    summit: {
      bpm: 138, tonic: 57, scale: MINOR, bo: -12,
      prog: [[0, MIN], [3, MAJ], [8, MAJ], [10, MAJ]],
      bass: '0.0.0.2.0.0.0.2.', arp: '0.2.1.2.0.2.3.2.',
      lead: '7 - 9 - 11 - 9 - 7 - 4 - 7 - 9 - 11 - 12 - 11 - 9 - 7 - 9 - 7 - 4 - 2 - 4 - 7 - 4 - 2 - 0 - 2 - 4 - 7 - 9 - 11 - 9 - 7 - - - - - - -',
      kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx',
      w: { lead: 'sawtooth', arp: 'square', bass: 'sawtooth' }, v: { lead: 0.38, arp: 0.08, bass: 0.42 },
    },
  };

  // Les mélodies sont écrites en texte : on les transforme en listes, et on vérifie leur longueur (64 pas)
  Object.values(SONGS).forEach((s) => {
    s.leadSteps = s.lead.split(/\s+/).filter(Boolean);
    if (s.leadSteps.length !== 64) {
      // sécurité : un morceau mal écrit ne doit jamais faire planter le jeu
      while (s.leadSteps.length < 64) s.leadSteps.push('.');
      s.leadSteps.length = 64;
    }
  });

  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const degSemi = (scale, d) => scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

  const mus = { name: null, want: null, gain: null, step: 0, next: 0, timer: null, tempo: 1 };

  function voice(freq, t0, dur, wave, vol, out, attack = 0.006) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.setValueAtTime(vol, t0 + Math.max(attack, dur * 0.55));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  function drum(kind, t0, out) {
    if (kind === 'kick') {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t0);
      o.frequency.exponentialRampToValueAtTime(42, t0 + 0.11);
      g.gain.setValueAtTime(0.6, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      o.connect(g);
      g.connect(out);
      o.start(t0);
      o.stop(t0 + 0.16);
      return;
    }
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = kind === 'snare' ? 1600 : 7000;
    const g = ac.createGain();
    const len = kind === 'snare' ? 0.11 : 0.035;
    g.gain.setValueAtTime(kind === 'snare' ? 0.32 : 0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + len + 0.02);
  }

  function scheduleStep(song, step, t0, stepDur, out) {
    const bar = Math.floor(step / 16);
    const si = step % 16;
    const [rootSemi, tones] = song.prog[bar];
    const base = song.tonic + rootSemi;
    const bch = song.bass[si];
    if (bch && bch !== '.') {
      const off = bch === '1' ? 7 : bch === '2' ? 12 : 0;
      voice(mf(base + song.bo + off), t0, stepDur * 1.8, song.w.bass, song.v.bass * 0.5, out);
    }
    const ach = song.arp[si];
    if (ach && ach !== '.') {
      const tone2 = tones[Number(ach) % tones.length];
      voice(mf(base + 12 + tone2), t0, stepDur * 0.9, song.w.arp, song.v.arp * 0.5, out);
    }
    const tok = song.leadSteps[step];
    if (tok !== '.' && tok !== '-') {
      let len = 1;
      while (len < 16 && song.leadSteps[(step + len) % 64] === '-') len++;
      const f = mf(song.tonic + 12 + degSemi(song.scale, Number(tok)));
      const dur = song.stac ? stepDur * 0.7 : stepDur * len * 0.96;
      const soft = song.w.lead === 'sine' || song.w.lead === 'triangle';
      voice(f, t0, dur, song.w.lead, song.v.lead * 0.5, out, soft && len > 2 ? 0.03 : 0.006);
      if (song.echo) voice(f, t0 + stepDur * 3, dur, song.w.lead, song.v.lead * 0.18, out, 0.02);
    }
    if (song.kick && song.kick[si] === 'x') drum('kick', t0, out);
    if (song.snare && song.snare[si] === 'x') drum('snare', t0, out);
    if (song.hat && song.hat[si] === 'x') drum('hat', t0, out);
  }

  function pump() {
    const a = ac;
    const song = SONGS[mus.name];
    if (!a || !song || !mus.gain) return;
    if (mus.next < a.currentTime - 0.15) mus.next = a.currentTime + 0.05; // onglet resté en arrière-plan : on repart proprement
    while (mus.next < a.currentTime + 0.25) {
      const stepDur = 60 / song.bpm / 4 / mus.tempo;
      try { scheduleStep(song, mus.step, mus.next, stepDur, mus.gain); } catch { /* musique non critique */ }
      mus.next += stepDur;
      mus.step = (mus.step + 1) % 64;
    }
  }

  function stopMusic() {
    if (mus.timer) { clearInterval(mus.timer); mus.timer = null; }
    if (mus.gain && ac) {
      const g = mus.gain;
      try {
        g.gain.cancelScheduledValues(ac.currentTime);
        g.gain.setValueAtTime(g.gain.value, ac.currentTime);
        g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
      } catch { /* ignore */ }
      setTimeout(() => { try { g.disconnect(); } catch { /* ignore */ } }, 600);
    }
    mus.gain = null;
    mus.name = null;
  }

  function ensureMusic() {
    if (!ac || ac.state === 'suspended') return;
    const want = musicOn && !muted ? mus.want : null;
    if (want === mus.name) return;
    stopMusic();
    if (!want || !SONGS[want]) return;
    mus.name = want;
    mus.step = 0;
    mus.gain = ac.createGain();
    mus.gain.gain.setValueAtTime(0, ac.currentTime);
    mus.gain.gain.linearRampToValueAtTime(1, ac.currentTime + 0.6);
    mus.gain.connect(musicBus);
    mus.next = ac.currentTime + 0.08;
    mus.timer = setInterval(pump, 40);
    pump();
  }

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
      if (master) master.gain.value = muted ? 0 : MASTER_VOL;
      try { ensureMusic(); } catch { /* ignore */ }
      return muted;
    },
    toggle() { return this.setMuted(!muted); },
    // Musique : 'menu' ou le nom d'un thème de chapitre ; null pour arrêter
    // silent = true : on garde le style du chapitre (bruit de saut) mais on ne joue pas la musique intégrée
    music(name, silent) {
      mus.want = silent ? null : name;
      if (JUMP_WAVE[name]) jumpWave = JUMP_WAVE[name];
      if (ac) { try { ensureMusic(); } catch { /* ignore */ } }
    },
    // 1 = tempo normal ; > 1 = plus rapide (dernières secondes d'un niveau chronométré)
    musicTempo(x) { mus.tempo = Math.max(0.5, Math.min(1.6, x || 1)); },
    musicEnabled: () => musicOn,
    setMusic(on) {
      musicOn = !!on;
      try { localStorage.setItem('cordee.music', musicOn ? '1' : '0'); } catch { /* ignore */ }
      try { ensureMusic(); } catch { /* ignore */ }
      return musicOn;
    },
    toggleMusic() { return this.setMusic(!musicOn); },
    songs: Object.keys(SONGS),
  };
})();

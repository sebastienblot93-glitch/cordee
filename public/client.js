// Même physique que le serveur (servie par /physics.js) : sert à prévoir la trajectoire des tirs
const Phys = window.Physics;
const PW = Phys.PW;
const PH = Phys.PH;

const $ = (id) => document.getElementById(id);
const screens = { menu: $('screen-menu'), lobby: $('screen-lobby'), game: $('screen-game') };
const menuRoot = $('menu-root');

// Couleur de chaque groupe (1, 2, 3) : plaques, portes, cristaux, cibles, torches, volets
const GROUP_COLORS = { 1: '#ff6b9d', 2: '#4dd8e8', 3: '#9be564' };
const ROLE_LABEL = { mage: 'Mage', archer: 'Archer' };
const LIGHT_MAGE = 100; // rayon de la lumière du Mage dans les niveaux sombres
const LIGHT_SELF = 44; // rayon de la lueur de chaque joueur
const LIGHT_TORCH = 92; // rayon d'une torche allumée
// Couleur d'ambiance de chaque chapitre (cadre, titres, boutons)
const ACCENT = { prairie: '#9be564', arcane: '#b79cff', dark: '#8aa0ff', sanctuary: '#ffd24a', garden: '#ff9ad0', forge: '#ff8a2a', mist: '#9fe0ee', summit: '#ff9fb8', citadel: '#ff6bd0' };
// Sorts affichés dans la barre sous le jeu (slot 0 = dash)
const SPELLS = {
  mage: [
    { slot: 1, name: 'Orbe', key: 'clic gauche', color: '#b79cff', tip: 'Active les cristaux' },
    { slot: 2, name: 'Glace', key: 'clic droit', color: '#a0e1ff', tip: 'Crée des plateformes sur les runes' },
    { slot: 3, name: 'Échange', key: 'bouton, puis clic gauche', color: '#ff9ad0', tip: 'Échange ta place avec l’autre joueur', need: 'swap' },
    { slot: 0, name: 'Dash', key: 'touche Maj', color: '#9be564', tip: 'Course éclair', dash: true },
  ],
  plain: [
    { slot: 0, name: 'Dash', key: 'touche Maj', color: '#9be564', tip: 'Course éclair', dash: true },
  ],
  archer: [
    { slot: 1, name: 'Flèche', key: 'clic gauche', color: '#e6c58a', tip: 'Active les cibles' },
    { slot: 2, name: 'Feu', key: 'clic droit', color: '#ff9a3a', tip: 'Brûle le bois, allume les torches', need: 'fire' },
    { slot: 0, name: 'Dash', key: 'touche Maj', color: '#9be564', tip: 'Course éclair', dash: true },
  ],
};

let ws;
let pingTimer = null;
let myId = null;
let hostId = null;
let roomCode = null;
let players = []; // [{id, name, color, role, skin}]
let levelList = []; // [{name, roles, chapter}]
let chapterList = []; // [{name, theme}]
let level = null; // { rows, tile, keys, door, index, total, name, hint, cfg, chapter, theme, L, bg, tiles, decor }
let world = null;
let lastChapter = -1;
let armed = 1; // sort choisi : le clic gauche dans le jeu lance ce sort
let actBtns = []; // boutons de la barre des sorts
let lastTl = -1;
let pingRtt = 80;
const sprites = new Map(); // id -> { x, y, tx, ty, face, vy, ... }
const mouse = { x: 0, y: 0, has: false };

// Netteté : sur un écran HiDPI, le canvas est dessiné à résolution double (RES). LW x LH = taille logique du niveau.
let RES = (window.devicePixelRatio || 1) >= 1.5 ? 2 : 1;
let LW = 960;
let LH = 480;

let jumpPresses = 0; // compteur : chaque nouvelle pression de saut compte (double saut de l'Archer)

/* ---------- Apparence (skin + couleur), mémorisée dans le navigateur ---------- */
function loadLook() {
  try {
    const j = JSON.parse(localStorage.getItem('cordee.look'));
    if (j && Skins.ids.includes(j.skin) && Skins.colors.includes(j.color)) return j;
  } catch { /* pas de stockage */ }
  return { skin: 'tasse', color: Skins.colors[1] };
}
const look = loadLook();
function saveLook() {
  try { localStorage.setItem('cordee.look', JSON.stringify(look)); } catch { /* ignore */ }
}

/* ---------- Musiques personnalisées par chapitre ---------- */
// Pour donner une musique à un chapitre, ajoutez une ligne : nom du thème -> lecteur YouTube ou fichier mp3.
//   { yt: 'IDENTIFIANT_DE_LA_VIDEO', title: 'Titre affiché', start: 15 }   (lecteur officiel YouTube, visible sous le jeu ;
//        start = seconde de départ, facultatif : la musique y revient à chaque démarrage et à chaque boucle)
//   { src: 'music/mon-fichier.mp3', title: 'Titre affiché' }    (fichier à déposer dans public/music/)
// Thèmes : prairie, arcane, dark, sanctuary, garden, forge, mist, summit. Sans ligne, le chapitre garde sa musique intégrée.
const CUSTOM_TRACKS = {
  prairie: { yt: 'oIUveqb6kSA', title: 'Indila x BENNETT · Dernière Danse (Techno Mix)' },
  arcane: { yt: '2zdqymnZoHc', start: 15, title: 'Shy’m · Et Alors !' },
  dark: { yt: 'VMUmA6YszKs', start: 48, title: 'Laura Ferré · Lucifer' },
  sanctuary: { yt: 'kQWoeq1oAbc', title: 'AXMO x Aki Hiro · Castle In The Sky' },
  garden: { yt: 'BtyHYIpykN0', start: 122, title: 'PNL · Au DD' },
  forge: { yt: 'oL-y9O8FD14', title: 'Musique de la Forge' },
  mist: { yt: 'Y-cWAGiVeF8', title: 'Musique des Brumes' },
  summit: { yt: 'fB8TyLTD7EE', start: 12, title: 'Musique du Sommet' },
};
const CUSTOM_VOLUME = 15; // 0 à 100 : volume de base de ces musiques (bas, pour ne pas couvrir les bruitages) ; le curseur « Musique » le multiplie
const customVol = () => Math.min(100, CUSTOM_VOLUME * (window.Sfx.musicVolume() / 50));

const Custom = {
  name: null, // thème dont la musique personnalisée joue en ce moment
  player: null, // lecteur YouTube
  ready: false,
  apiAsked: false,
  audio: null, // lecteur mp3
  rate: 1,
  failed: new Set(), // thèmes pour lesquels la musique personnalisée n'a pas pu démarrer (on garde la musique intégrée)

  shouldPlay() { return !!this.name && !window.Sfx.isMuted() && window.Sfx.musicEnabled(); },

  // Joue ou met en pause selon les boutons Son / Musique
  sync() {
    const play = this.shouldPlay();
    try {
      if (this.audio) { this.audio.volume = customVol() / 100; if (play) this.audio.play().catch(() => {}); else this.audio.pause(); }
      if (this.player && this.ready && this.player.playVideo) {
        this.player.setVolume(customVol());
        if (play) this.player.playVideo(); else this.player.pauseVideo();
      }
    } catch { /* lecteur indisponible : sans importance */ }
  },

  setRate(x, force) {
    if (x === this.rate && !force) return; // pas d'appel inutile à chaque mise à jour
    this.rate = x;
    try {
      if (this.audio) this.audio.playbackRate = x;
      if (this.player && this.ready && this.player.setPlaybackRate) this.player.setPlaybackRate(x);
    } catch { /* ignore */ }
  },

  fail(name) {
    this.failed.add(name);
    if (this.name === name) {
      this.stop();
      window.Sfx.music(name); // retour à la musique intégrée du chapitre
    }
  },

  loadApi(cb) {
    if (window.YT && window.YT.Player) return cb();
    window.onYouTubeIframeAPIReady = cb;
    if (this.apiAsked) return;
    this.apiAsked = true;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { window.onYouTubeIframeAPIReady = null; this.apiAsked = false; if (this.name) this.fail(this.name); };
    document.head.append(s);
  },

  start(name, t) {
    if (this.name === name) { this.sync(); return; }
    this.stop();
    this.name = name;
    this.startAt = t.start || 0;
    $('yt-title').textContent = `♪ ${t.title || ''}`;
    $('yt-wrap').classList.add('show');
    if (t.src) {
      if (!this.audio) { this.audio = new Audio(); this.audio.loop = true; }
      this.audio.src = t.src;
      this.audio.onerror = () => this.fail(name);
      this.audio.playbackRate = this.rate;
      this.sync();
      return;
    }
    // lecteur YouTube : s'il ne répond pas au bout de 10 s (réseau bloqué, vidéo non intégrable…), on garde la musique intégrée
    clearTimeout(this.guard);
    this.guard = setTimeout(() => { if (this.name === name && !this.ready) this.fail(name); }, 10000);
    const make = () => {
      if (this.name !== name) return;
      if (this.player) {
        try { this.player.loadVideoById({ videoId: t.yt, startSeconds: this.startAt }); this.ready = true; this.sync(); } catch { this.fail(name); }
        return;
      }
      this.player = new window.YT.Player('yt-player', {
        width: 200, height: 200, videoId: t.yt,
        playerVars: { autoplay: 1, controls: 1, start: this.startAt, rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          // fin du morceau : on repart du point de départ choisi (et pas de 0:00)
          onStateChange: (e) => {
            if (e.data === 0 && this.name) {
              try { this.player.seekTo(this.startAt || 0, true); this.player.playVideo(); } catch { /* ignore */ }
            }
          },
          onReady: () => { this.ready = true; clearTimeout(this.guard); this.player.setVolume(customVol()); this.setRate(this.rate, true); this.sync(); },
          onError: () => this.fail(this.name || name),
        },
      });
    };
    this.loadApi(make);
  },

  stop() {
    this.name = null;
    clearTimeout(this.guard);
    $('yt-wrap').classList.remove('show');
    try {
      if (this.audio) this.audio.pause();
      if (this.player && this.ready && this.player.pauseVideo) this.player.pauseVideo();
    } catch { /* ignore */ }
  },
};

// Choisit la musique : celle du chapitre si elle est personnalisée, sinon la musique intégrée
function setMusicFor(name) {
  const t = CUSTOM_TRACKS[name];
  if (t && !Custom.failed.has(name)) {
    window.Sfx.music(name, true); // garde seulement le style sonore du chapitre
    Custom.start(name, t);
  } else {
    Custom.stop();
    window.Sfx.music(name);
  }
}
function setTempo(x) {
  window.Sfx.musicTempo(x);
  Custom.setRate(x);
}

function freshWorld(lv) {
  return {
    status: 'playing', keys: [], open: [], pressed: [], door: lv.keys.length === 0,
    cr: [], tg: [], tc: [], bn: [], bt: [], seq: { p: 0, done: false, flash: false }, sh: [], ice: [], proj: [], cps: [], cph: [], cd: [],
    lk: 1, ld: 0, sy: 0, jw: new Map(), cy: [], bs: null, hc: null, iv: [],
    deaths: 0, tl: lv.timer || 0, recvAt: performance.now(), sr: 0, res: null,
  };
}

/* ---------- Écrans ---------- */
function show(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
  menuRoot.style.display = name === 'game' ? 'none' : '';
  if (name !== 'game') {
    document.body.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--accent');
    setMusicFor('menu');
    setTempo(1);
  }
}

function setError(msg) {
  $('menu-error').textContent = msg || '';
  $('lobby-error').textContent = msg || '';
}

/* ---------- Rôles ---------- */
function myPlayer() {
  return players.find((p) => p.id === myId);
}

// Capacités actives dans le niveau en cours : 'mage', 'archer' ou 'plain' (niveaux sans pouvoirs)
function myKit() {
  const me = myPlayer();
  if (!level || !level.cfg.abilities || !me) return 'plain';
  return me.role;
}

/* ---------- Réseau ---------- */
function connect(onOpen) {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  ws = new WebSocket(proto + location.host);
  ws.onopen = () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ t: 'ping', c: performance.now() }), 1000);
    onOpen();
  };
  ws.onclose = () => {
    if (screens.menu.classList.contains('active')) return;
    show('menu');
    setError('Connexion perdue. Recrée ou rejoins une room.');
    level = null;
    lastChapter = -1;
  };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function handle(msg) {
  switch (msg.t) {
    case 'joined':
      myId = msg.id;
      break;
    case 'error':
      setError(msg.msg);
      break;
    case 'lobby':
      roomCode = msg.code;
      hostId = msg.hostId;
      const prevRoles = new Map(players.map((q) => [q.id, q.role]));
      players = msg.players;
      levelList = msg.levels || [];
      chapterList = msg.chapters || [];
      if (msg.status === 'lobby') {
        level = null;
        lastChapter = -1;
        sprites.clear();
        $('banner').classList.remove('show');
        if (window.Progress) window.Progress.hideResult();
        renderLobby();
      } else if (level) {
        updateHud();
        rolesChanged(prevRoles);
        updateTeamBar();
        if (tutOn()) renderTutBook();
      }
      break;
    case 'nograb':
      toast(msg.why === 'ceiling' ? 'Pas la place de porter ici : plafond trop bas.'
        : msg.why === 'level' ? 'Porter (F) n’est possible que dans certains niveaux, par exemple « Courte-échelle ».'
        : 'Collez-vous à votre coéquipier (même hauteur), puis appuyez sur F.');
      break;
    case 'emote':
      onEmote(msg);
      break;
    case 'mark':
      onMark(msg);
      break;
    case 'tut':
      onTut(msg);
      break;
    case 'start':
      startLevel(msg);
      break;
    case 'state':
      applyState(msg);
      break;
    case 'pos':
      applyPositions(msg);
      break;
    case 'pong':
      pingRtt = Math.min(2000, Math.max(1, pingRtt * 0.7 + (performance.now() - msg.c) * 0.3));
      $('hud-ping').textContent = `Ping ${Math.round(pingRtt)} ms`;
      break;
  }
}

/* ---------- Effets : particules, secousses, éclats de lumière ---------- */
const parts = [];
let shakeMag = 0;
function shake(m) { shakeMag = Math.max(shakeMag, m); }
function addPart(p) {
  if (parts.length > (fxLow ? 220 : 700)) parts.shift();
  parts.push(p);
}
function burst(x, y, color, n, speed = 2.5, grav = 0.08, life = 36, size = 3, extra) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.65);
    addPart(Object.assign({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: grav, life: life * (0.6 + Math.random() * 0.4), max: life, color, size: size * (0.6 + Math.random() * 0.7) }, extra));
  }
}
// Gerbe d'étincelles brillantes (étoiles additives)
function sparks(x, y, color, n = 10, speed = 3, life = 34) {
  burst(x, y, color, n, speed, 0.04, life, 5, { shape: 'star', add: true, spin: 0.2 });
}
// Gros éclat de lumière furtif
function flash(x, y, color, size = 46, life = 12) {
  addPart({ glow: true, x, y, vx: 0, vy: 0, g: 0, life, max: life, color, size, add: true });
}
function dust(x, y, n = 5) {
  for (let i = 0; i < n; i++) {
    addPart({ x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 0.8, g: 0.0, life: 24, max: 24, color: 'rgba(240,240,250,.55)', size: 4 + Math.random() * 3, shape: 'smoke' });
  }
}
function ring(x, y, color, r1 = 40) {
  addPart({ ring: true, x, y, r: 4, r1, life: 22, max: 22, color });
}
function confetti() {
  const cols = ['#ff6b9d', '#4dd8e8', '#9be564', '#ffd24a', '#b79cff', '#ff9a3a'];
  for (let i = 0; i < 130; i++) {
    addPart({
      x: Math.random() * LW, y: -10 - Math.random() * 80, vx: (Math.random() - 0.5) * 2.4, vy: 1 + Math.random() * 2.2, g: 0.03,
      life: 170, max: 170, color: cols[i % cols.length], size: 5 + Math.random() * 3, shape: 'rect', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, keep: true,
    });
  }
}
function stepParts() {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life--;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    if (p.ring) { p.r += (p.r1 - p.r) * 0.2; continue; }
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.g;
    if (p.shape === 'smoke') { p.vx *= 0.96; p.vy *= 0.96; }
    if (p.vr) p.rot += p.vr;
    if (p.spin) p.rot = (p.rot || 0) + p.spin;
  }
}
function drawParts() {
  let add = false;
  for (const p of parts) {
    const a = Math.max(0, Math.min(1, p.life / p.max));
    if (!!p.add !== add) {
      add = !!p.add;
      ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    }
    if (p.ring) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5 + 3.5 * a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.stroke();
      continue;
    }
    if (p.glow) {
      const r = p.size * (1.2 - a * 0.4);
      ctx.globalAlpha = a;
      ctx.drawImage(window.Themes.glowSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
      continue;
    }
    ctx.fillStyle = p.color;
    if (p.shape === 'smoke') {
      ctx.globalAlpha = a * 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (p.size / 2) * (1.8 - a * 0.8), 0, TAU);
      ctx.fill();
    } else if (p.shape === 'star') {
      ctx.globalAlpha = Math.min(1, a * 1.4);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      sparkle4(0, 0, (p.size / 2) * (0.5 + a), p.color);
      ctx.restore();
    } else if (p.shape === 'rect') {
      ctx.globalAlpha = p.keep ? Math.min(1, a * 2) : a;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.8 + 0.2);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.4, (p.size / 2) * (0.4 + 0.6 * a)), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- Réaction aux changements d'état (sons + effets) ---------- */
const springAnim = new Map(); // index de case -> images restantes
const prevWorldInfo = { door: false, keys: 0, cps: 0, status: 'playing', deaths: 0, sr: 0 };

function tileCenter(idx) {
  const w = level.L.w;
  return { x: (idx % w) * level.tile + level.tile / 2, y: Math.floor(idx / w) * level.tile + level.tile / 2 };
}

function reactToState(prev, msg) {
  const T = level.tile;
  const sfx = window.Sfx.play.bind(window.Sfx);
  const me = sprites.get(myId);
  if (msg.keys.length > prevWorldInfo.keys) {
    msg.keys.filter((k) => !(prev.keys || []).includes(k)).forEach((k) => {
      const key = level.keys[k];
      if (key) {
        burst(key.x + 16, key.y + 16, '#ffd24a', 12, 3, 0.05, 30);
        sparks(key.x + 16, key.y + 16, '#fff3a0', 10, 3.4);
        flash(key.x + 16, key.y + 16, '#ffd24a', 50, 14);
        ring(key.x + 16, key.y + 16, '#ffd24a', 34);
      }
    });
    sfx('key');
  }
  if (msg.door && !prevWorldInfo.door && level.keys.length) {
    sfx('door');
    shake(2.5);
    if (level.door) {
      const dx = level.door.x + 16;
      const dy = level.door.y + 16;
      burst(dx, dy, '#ffd24a', 20, 3.2, 0.02, 40);
      sparks(dx, dy, '#fff3a0', 14, 4, 44);
      ring(dx, dy, '#ffd24a', 56);
      flash(dx, dy, '#ffe08a', 90, 22);
    }
  }
  if (msg.cps.length > prevWorldInfo.cps) {
    sfx('checkpoint');
    msg.cps.filter((c) => !(prev.cps || []).includes(c)).forEach((c) => {
      const cp = level.L.checkpoints[c];
      if (cp) {
        burst(cp.x + 22, cp.y + 10, '#9be564', 12, 2.4, 0.03, 30);
        sparks(cp.x + 22, cp.y + 10, '#d8ffb0', 10, 3);
        ring(cp.x + 16, cp.y + 16, '#9be564', 36);
      }
    });
  }
  (msg.cr || []).forEach((v, i) => {
    if (v && !(prev.cr || [])[i]) {
      const c = level.L.crystals[i];
      if (c) {
        burst(c.x + 16, c.y + 16, GROUP_COLORS[c.group], 12, 2.6, 0.02, 30);
        sparks(c.x + 16, c.y + 16, '#ffffff', 8, 3);
        ring(c.x + 16, c.y + 16, '#fff', 34);
        flash(c.x + 16, c.y + 16, GROUP_COLORS[c.group], 60, 14);
      }
      sfx('crystal');
    }
  });
  (msg.tg || []).forEach((v, i) => {
    if (v && !(prev.tg || [])[i]) {
      const t = level.L.targets[i];
      if (t) {
        burst(t.x + 16, t.y + 16, '#9be564', 12, 2.6, 0.02, 30);
        sparks(t.x + 16, t.y + 16, '#d8ffb0', 8, 3);
        ring(t.x + 16, t.y + 16, '#9be564', 32);
      }
      sfx('target');
    }
  });
  (msg.tc || []).forEach((v, i) => {
    if (v && !(prev.tc || [])[i]) {
      const t = level.L.torches[i];
      if (t) {
        burst(t.x + 16, t.y + 8, '#ffb040', 14, 2.6, -0.03, 34, 4, { add: true });
        flash(t.x + 16, t.y + 6, '#ffaa3c', 80, 20);
      }
      sfx('torch');
    }
  });
  // glace posée : cristaux qui scintillent
  const oldIce = new Set((prev.ice || []).map((b) => `${b[0]},${b[1]}`));
  (msg.ice || []).forEach((b) => {
    if (oldIce.has(`${b[0]},${b[1]}`)) return;
    const cx = b[0] * T + T / 2;
    const cy = b[1] * T + T / 2;
    sparks(cx, cy, '#d8f4ff', 10, 3);
    ring(cx, cy, '#a0e1ff', 34);
    flash(cx, cy, '#a0e1ff', 56, 14);
  });
  const oldBt = new Set(prev.bt || []);
  let burned = 0;
  (msg.bt || []).forEach((idx) => {
    if (oldBt.has(idx)) return;
    burned++;
    const c = tileCenter(idx);
    burst(c.x, c.y, '#ff8a2a', 9, 2.2, 0.02, 30, 4, { add: true });
    burst(c.x, c.y, '#3a2a22', 6, 1.4, 0.06, 30, 4);
    burst(c.x, c.y, 'rgba(60,50,50,.5)', 3, 0.8, -0.02, 40, 9, { shape: 'smoke' });
  });
  if (burned) { sfx('burn', 120); shake(2); }
  if (msg.deaths > prevWorldInfo.deaths && window.Progress) window.Progress.onDeath(msg.deaths - prevWorldInfo.deaths);
  if (msg.deaths > prevWorldInfo.deaths && !(msg.ev || []).some((e) => e[0] === 'die')) sfx('die');
  (msg.ev || []).forEach((e) => {
    if (e[0] === 'die') {
      const mine = me && Math.hypot(e[1] - me.tx, e[2] - me.ty) < 40;
      burst(e[1] + 12, e[2] + 14, '#ffffff', 16, 3.4, 0.12, 36);
      sparks(e[1] + 12, e[2] + 14, '#ffd8ef', 10, 4.4, 40);
      ring(e[1] + 12, e[2] + 14, '#ffffff', 50);
      flash(e[1] + 12, e[2] + 14, '#ffffff', 60, 12);
      shake(mine ? 6 : 2.5);
      sfx('die', 120);
    } else if (e[0] === 'swap') {
      ring(e[1] + 12, e[2] + 14, '#4dd8e8', 52);
      ring(e[3] + 12, e[4] + 14, '#ff6b9d', 52);
      burst(e[1] + 12, e[2] + 14, '#4dd8e8', 14, 3, 0.02, 30, 4, { add: true });
      burst(e[3] + 12, e[4] + 14, '#ff6b9d', 14, 3, 0.02, 30, 4, { add: true });
      flash(e[1] + 12, e[2] + 14, '#4dd8e8', 66, 14);
      flash(e[3] + 12, e[4] + 14, '#ff6b9d', 66, 14);
      sfx('swap');
    } else if (e[0] === 'sync') {
      sfx('crystal', 100);
      sfx('door', 100);
      players.forEach((q) => {
        const s = sprites.get(q.id);
        if (!s) return;
        ring(s.tx + 12, s.ty + 14, '#ffd24a', 60);
        sparks(s.tx + 12, s.ty + 6, '#fff3a0', 10, 3.6, 36);
      });
      shake(2);
      toast('Synchro ! Les ponts dorés sont là, courez !');
    } else if (e[0] === 'grab') {
      sfx('click', 60);
      ring(e[1] + 12, e[2] + 14, '#ffffff', 36);
      sparks(e[1] + 12, e[2], '#ffffff', 6, 2.4, 24);
    } else if (e[0] === 'throw') {
      sfx('spring', 100);
      burst(e[1] + 12, e[2] + 20, '#ffffff', 8, 2.4, 0.05, 24);
      ring(e[1] + 12, e[2] + 14, '#ffd24a', 40);
    } else if (e[0] === 'fire') {
      burst(e[1], e[2], '#ffb040', 10, 2.6, -0.02, 26, 4, { add: true });
      flash(e[1], e[2], '#ff8a2a', 50, 12);
    } else if (e[0] === 'hit') {
      burst(e[1], e[2], '#ffffff', 6, 2, 0.02, 18);
      sparks(e[1], e[2], '#ffffff', 5, 2.6, 20);
    } else if (e[0] === 'hurt') {
      burst(e[1] + 12, e[2] + 14, '#ff5a7a', 14, 3.4, 0.1, 30);
      ring(e[1] + 12, e[2] + 14, '#ff5a7a', 46);
      flash(e[1] + 12, e[2] + 14, '#ff3a5a', 64, 12);
      shake(me && Math.hypot(e[1] - me.tx, e[2] - me.ty) < 40 ? 7 : 3);
      sfx('hurt', 80);
      hurtFlash = 14;
    } else if (e[0] === 'bhit') {
      sparks(e[1], e[2], '#fff3a0', 8, 3.4, 24);
      flash(e[1], e[2], '#ffffff', 40, 8);
      sfx('bhit', 40);
    } else if (e[0] === 'bblock') {
      sparks(e[1], e[2], '#ff9ae0', 6, 2.6, 18);
      ring(e[1], e[2], '#ff9ae0', 22);
      sfx('bblock', 60);
    } else if (e[0] === 'sdown') {
      ring(e[1], e[2], '#7dfcff', 90);
      burst(e[1], e[2], '#7dfcff', 22, 4.4, 0.02, 40, 4, { add: true });
      flash(e[1], e[2], '#7dfcff', 140, 18);
      shake(3);
      sfx('sdown', 200);
      toast('Le bouclier est tombé ! Tirez sur son cœur !');
    } else if (e[0] === 'sup') {
      ring(e[1], e[2], '#ff9ae0', 70);
      sfx('sup', 200);
    } else if (e[0] === 'bphase') {
      ring(e[1], e[2], '#ffd24a', 150);
      ring(e[1], e[2], '#ff6b9d', 100);
      burst(e[1], e[2], '#ffb0d0', 30, 5.4, 0.02, 50, 5, { add: true });
      flash(e[1], e[2], '#ffffff', 220, 24);
      shake(9);
      sfx('bphase', 300);
      toast('Le Gardien rugit ! Phase suivante… (+2 cœurs)');
    } else if (e[0] === 'bdie') {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          if (!level) return;
          const ox = e[1] + (Math.random() - 0.5) * 120;
          const oy = e[2] + (Math.random() - 0.5) * 90;
          burst(ox, oy, i % 2 ? '#ffd24a' : '#ff6b9d', 22, 5, 0.04, 50, 5, { add: true });
          ring(ox, oy, '#ffffff', 80);
          flash(ox, oy, '#ffffff', 160, 18);
          shake(7);
        }, i * 220);
      }
      sfx('bdie', 500);
      confetti();
      toast('Le Gardien est vaincu ! Rejoignez la porte !');
    } else if (e[0] === 'rock') {
      burst(e[1], e[2] - 4, '#c8b9a0', 8, 3, 0.12, 24);
      shake(1.5);
      sfx('rock', 60);
    } else if (e[0] === 'ballpop') {
      burst(e[1], e[2], '#ffb040', 8, 2.6, 0.02, 20, 4, { add: true });
      sfx('ballpop', 60);
    }
  });
  if (msg.sr && !prevWorldInfo.sr && level.star) {
    const st = level.star;
    const first = window.Progress ? window.Progress.onStar(level.name) : true;
    sfx('star');
    burst(st.x + 16, st.y + 16, '#ffe27a', 16, 3.2, 0.03, 36);
    sparks(st.x + 16, st.y + 16, '#ffffff', 12, 3.8, 40);
    ring(st.x + 16, st.y + 16, '#ffd24a', 44);
    flash(st.x + 16, st.y + 16, '#ffe27a', 70, 18);
    toast(first ? '★ Étoile cachée trouvée !' : '★ Étoile (déjà dans ta collection)');
  }
  if (msg.status !== prevWorldInfo.status && msg.status === 'timeup') { sfx('timeup'); shake(5); }
  if (msg.status !== prevWorldInfo.status && msg.status === 'bossdown') { sfx('timeup'); shake(6); }
  if (msg.status !== prevWorldInfo.status && (msg.status === 'won' || msg.status === 'finished')) {
    sfx('win');
    confetti();
    shake(3);
    players.forEach((p) => {
      const s = sprites.get(p.id);
      if (s) { sparks(s.tx + 12, s.ty + 4, p.color, 12, 4, 46); flash(s.tx + 12, s.ty + 10, p.color, 70, 18); }
    });
    if (window.Progress && msg.res) {
      const medal = window.Progress.onResult(msg.res, msg.status === 'finished', myId === hostId);
      if (medal === 'diamond' || medal === 'gold' || medal === 'silver') setTimeout(() => sfx('medal'), 500);
    }
    if (msg.res && level && !msg.res.tutorial) Ghost.finish(msg.res, level);
  }
  prevWorldInfo.sr = msg.sr || 0;
  prevWorldInfo.door = msg.door;
  prevWorldInfo.keys = msg.keys.length;
  prevWorldInfo.cps = msg.cps.length;
  prevWorldInfo.status = msg.status;
  prevWorldInfo.deaths = msg.deaths;
}

const CAST_COLOR = { orb: '#b79cff', swap: '#ff9ad0', ice: '#a0e1ff', arrow: '#f2d9a0', fire: '#ff9a3a' };
// Lance l'animation de sort d'un personnage (bras tendu vers la visée)
function startCast(s, ang, kind) {
  s.castT = 14;
  s.castAng = ang;
  s.castKind = kind;
  const hx = s.tx + PW / 2 + Math.cos(ang) * 16;
  const hy = s.ty + 8 + Math.sin(ang) * 16;
  flash(hx, hy, CAST_COLOR[kind] || '#ffffff', 40, 9);
  sparks(hx, hy, CAST_COLOR[kind] || '#ffffff', 4, 2, 18);
}

// Un tir qui apparaît près d'un joueur = ce joueur vient de lancer un sort
function detectCasts(prev, msg) {
  const old = prev.proj || [];
  (msg.proj || []).forEach((pr) => {
    const [kind, x, y, vx, vy] = pr;
    const known = old.some((q) => {
      if (q[0] !== kind) return false;
      for (let n = 0; n <= 8; n++) {
        if (Math.hypot(q[1] + q[3] * n - x, q[2] + q[4] * n - y) < 14) return true;
      }
      return false;
    });
    if (known) return;
    let best = null;
    let bd = 60;
    sprites.forEach((s) => {
      const d = Math.hypot(s.tx + PW / 2 - x, s.ty + PH / 2 - y);
      if (d < bd) { bd = d; best = s; }
    });
    if (best) startCast(best, Math.atan2(vy, vx), kind);
  });
  // la glace n'a pas de projectile : on repère le nouveau bloc et le mage le plus proche
  const oldIce = new Set((prev.ice || []).map((b) => `${b[0]},${b[1]}`));
  (msg.ice || []).forEach((b) => {
    if (oldIce.has(`${b[0]},${b[1]}`)) return;
    const bx = b[0] * level.tile + level.tile / 2;
    const by = b[1] * level.tile + level.tile / 2;
    let best = null;
    let bd = Infinity;
    players.forEach((p) => {
      if (p.role !== 'mage') return;
      const s = sprites.get(p.id);
      if (!s) return;
      const d = Math.hypot(s.tx - bx, s.ty - by);
      if (d < bd) { bd = d; best = s; }
    });
    if (best) startCast(best, Math.atan2(by - (best.ty + 8), bx - (best.tx + PW / 2)), 'ice');
  });
}

// Message de positions seul (entre deux états complets) : met à jour la cible des sprites, rien d'autre
function applyPositions(msg) {
  if (!level || !world) return;
  for (const [id, x, y, face] of msg.p) {
    const s = sprites.get(id);
    if (!s) continue;
    s.tx = x;
    s.ty = y;
    s.face = face;
  }
}

function applyState(msg) {
  if (!level) return;
  const prev = world || {};
  reactToState(prev, msg);
  world = {
    status: msg.status, keys: msg.keys, open: msg.open, pressed: msg.pressed, door: msg.door,
    cr: msg.cr, tg: msg.tg, tc: msg.tc || [], bn: msg.bn || [], bt: msg.bt || [], seq: msg.seq, sh: msg.sh, ice: msg.ice,
    proj: msg.proj, cps: msg.cps, cph: msg.cph || [], cd: msg.cd, deaths: msg.deaths,
    lk: msg.lk === undefined ? 1 : msg.lk, ld: msg.ld || 0, sy: msg.sy || 0, cy: msg.cy || [],
    jw: new Map(msg.p.map((q, i) => [q[0], (msg.jw || [])[i] || 0])), tl: msg.tl || 0, recvAt: performance.now(),
    sr: msg.sr || 0, res: msg.res || null, bs: msg.bs || null, hc: msg.hc || null, iv: msg.iv || [],
  };
  for (const [id, x, y, face] of msg.p) {
    let s = sprites.get(id);
    if (!s) {
      sprites.set(id, (s = {
        x, y, tx: x, ty: y, fx: x, fy: y, py: y, face, vy: 0, air: false, mv: false, t: Math.random() * 100,
        walk: 0, land: 0, pop: 14, castT: 0, castAng: 0, castKind: '', dashT: 0, lx: 0, ly: 0,
      }));
      sparks(x + PW / 2, y + PH / 2, '#ffffff', 6, 2.4, 26);
    }
    const dy = y - s.fy; // écarts mesurés depuis le dernier état complet (30 par seconde), pas depuis le dernier message de positions
    const dx = x - s.fx;
    if (Math.hypot(dx, dy) > 70) {
      // téléportation (retour au checkpoint, échange) : on réapparaît d'un coup, avec un petit effet
      s.x = x; s.y = y; s.py = y; s.pop = 12;
      sparks(x + PW / 2, y + PH / 2, '#ffffff', 6, 2.8, 26);
      flash(x + PW / 2, y + PH / 2, '#ffffff', 44, 10);
    } else {
      // détection des sauts, atterrissages, rebonds et dashs pour les bruitages, la poussière et l'animation
      const feetTx = Math.floor((x + PW / 2) / level.tile);
      const feetTy = Math.floor((y + PH - 0.5) / level.tile);
      if (dy < -11 && level.L.spring[feetTy] && level.L.spring[feetTy][feetTx]) {
        springAnim.set(feetTy * level.L.w + feetTx, 14);
        window.Sfx.play('spring', 80);
        dust(x + PW / 2, y + PH, 6);
        sparks(x + PW / 2, y + PH, '#ffd05a', 8, 3);
        s.pop = 0;
      } else if (dy < -6 && !s.air && s.vy > -3) {
        dust(x + PW / 2, y + PH, 4);
        if (id === myId) window.Sfx.play('jump', 60);
      }
      if (s.vy > 4 && dy < 1.5) {
        dust(x + PW / 2, y + PH, 4);
        s.land = 9;
      }
      if (Math.abs(dx) > 14 && Math.abs(dy) < 6) s.dashT = 10;
    }
    s.vy = dy;
    s.air = dy < -1 || dy > 1;
    s.mv = Math.abs(dx) > 0.4;
    s.tx = x;
    s.ty = y;
    s.fx = x;
    s.fy = y;
    s.face = face;
  }
  detectCasts(prev, msg);
  updateBanner();
  updateHud();
  updateTimer();
  updateBossHud();
}

/* ---------- Équipe : échange de rôles, emotes, messages ---------- */
// Emotes : touches G, M, J (la lettre écrite sur la touche, donc aussi en AZERTY) (ou boutons sous le jeu). Pour en ajouter : une ligne ici (et un visage dans drawFace).
const EMOTES = [
  { key: 'g', face: 'laugh', emoji: '😂', text: 'Mdr !' },
  { key: 'm', face: 'shock', emoji: '😱', text: 'Aïe aïe aïe !' },
  { key: 'j', face: 'cool', emoji: '😎', text: 'Trop facile.' },
];
const emotes = new Map(); // id du joueur -> { n, f0 }
let lastEmoteAt = 0;

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function sendEmote(n) {
  const now = performance.now();
  if (!level || now - lastEmoteAt < 500) return;
  lastEmoteAt = now;
  send({ t: 'emote', e: n });
}

// Temps de jeu : on compte les secondes où une partie est réellement en cours (onglet visible)
setInterval(() => {
  if (level && world && world.status === 'playing' && !document.hidden && window.Progress) window.Progress.addPlay(5);
}, 5000);

/* ---------- Boss : barres de vie, dessin du Gardien et de ses attaques ---------- */
let hurtFlash = 0;
const bossFx = { x: 0, y: 0, ready: false, deadAt: 0, lastHearts: -1, lastHp: -1 };
function updateBossHud() {
  const box = $('boss-hud');
  const cfg = level && level.cfg.boss;
  $('team-hud').classList.toggle('on', !!(cfg && world.bs));
  if (!cfg || !world.bs) { box.classList.remove('on'); bossFx.ready = false; bossFx.lastHearts = -1; bossFx.lastHp = -1; return; }
  const b = world.bs;
  box.classList.add('on');
  $('bh-name').textContent = `⚔ ${cfg.name || 'Le Boss'}`;
  $('bh-phase').textContent = b.dd ? 'Vaincu !' : `Phase ${b.ph}/3`;
  $('bh-fill').style.width = `${Math.max(0, (b.hp / cfg.hp) * 100)}%`;
  if (bossFx.lastHp > b.hp) { const bar = box.querySelector('.bh-bar'); bar.classList.add('hit'); setTimeout(() => bar.classList.remove('hit'), 90); }
  bossFx.lastHp = b.hp;
  const sh = $('bh-shield');
  if (b.dd) { sh.textContent = ''; sh.className = ''; } else if (b.ps > 0) { sh.textContent = 'Le Gardien rugit…'; sh.className = ''; } else if (b.ex) {
    sh.textContent = `BOUCLIER BAISSÉ ! Tirez sur le cœur ! (${(b.ut / 60).toFixed(1)} s)`;
    sh.className = 'down';
  } else if (b.sr) { sh.textContent = 'Bouclier en recharge : préparez cristal + cible'; sh.className = ''; } else {
    sh.textContent = 'Bouclier actif : cristal du Mage ET cible de l’Archer en même temps';
    sh.className = '';
  }
  if (world.hc && bossFx.lastHearts !== world.hc[0]) {
    const th = $('team-hp');
    if (th.children.length !== world.hc[1]) { th.innerHTML = ''; for (let i = 0; i < world.hc[1]; i++) th.append(document.createElement('i')); }
    [...th.children].forEach((c, i) => c.classList.toggle('empty', i >= world.hc[0]));
    if (bossFx.lastHearts > world.hc[0]) { th.classList.add('hurt'); setTimeout(() => th.classList.remove('hurt'), 250); }
    bossFx.lastHearts = world.hc[0];
  }
}

const PHASE_COL = { 1: ['#7dfcff', '#4aa8ff'], 2: ['#ffd24a', '#ff9a3a'], 3: ['#ff6b6b', '#ff2a5a'] };
function drawBoss(frame) {
  const b = world.bs;
  if (!b) return;
  if (b.dd) { if (!bossFx.deadAt) bossFx.deadAt = frame; } else bossFx.deadAt = 0;
  const fade = b.dd ? Math.max(0, 1 - (frame - bossFx.deadAt) / 70) : 1;
  if (fade <= 0) return;
  if (!bossFx.ready) { bossFx.x = b.x; bossFx.y = b.y; bossFx.ready = true; }
  bossFx.x += (b.x - bossFx.x) * 0.35;
  bossFx.y += (b.y - bossFx.y) * 0.35;
  const [c1, c2] = PHASE_COL[b.ph] || PHASE_COL[1];
  const t = frame;
  const waveWarn = b.hz.some((h) => h[0] === 'w' && h[3] > 0);
  ctx.save();
  ctx.translate(bossFx.x, bossFx.y);
  ctx.globalAlpha = fade;
  // lueur
  ctx.globalCompositeOperation = 'lighter';
  window.Themes.halo(ctx, 0, 0, 150 + Math.sin(t * 0.05) * 8, c2, b.ex ? 0.5 : 0.22);
  ctx.globalCompositeOperation = 'source-over';
  // pointes de la couronne
  ctx.fillStyle = '#1d1538';
  ctx.strokeStyle = '#0c0818';
  ctx.lineWidth = 3;
  [-48, -24, 0, 24, 48].forEach((dx, i) => {
    const h = 34 + (i === 2 ? 20 : i % 2 ? 0 : 10);
    ctx.beginPath();
    ctx.moveTo(dx - 11, -48);
    ctx.lineTo(dx, -48 - h);
    ctx.lineTo(dx + 11, -48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  // mains flottantes
  const bob = Math.sin(t * 0.06);
  [-1, 1].forEach((s) => {
    const fx = s * (112 + bob * 6);
    const fy = waveWarn ? -30 + Math.sin(t * 0.5) * 3 : 26 + bob * 10 * s;
    ctx.save();
    ctx.translate(fx, fy);
    const g = ctx.createLinearGradient(-20, -20, 20, 20);
    g.addColorStop(0, '#5a4f86');
    g.addColorStop(1, '#241c44');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-22, -24, 44, 48, 12);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-12 + k * 12, 6); ctx.lineTo(-12 + k * 12, 20); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = '#0c0818';
    ctx.lineWidth = 3;
  });
  // torse
  const tg = ctx.createLinearGradient(0, -60, 0, 60);
  tg.addColorStop(0, '#5d5290');
  tg.addColorStop(1, '#231b45');
  ctx.fillStyle = tg;
  ctx.beginPath();
  [[-62, -34], [-40, -62], [40, -62], [62, -34], [56, 28], [28, 62], [-28, 62], [-56, 28]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-50, -30); ctx.lineTo(-30, 40); ctx.moveTo(50, -30); ctx.lineTo(30, 40);
  ctx.stroke();
  // veines de phase
  ctx.strokeStyle = c1;
  ctx.globalAlpha = fade * (b.ph > 1 ? 0.8 : 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-40, -50); ctx.lineTo(-30, -30); ctx.lineTo(-44, -10);
  ctx.moveTo(40, -50); ctx.lineTo(30, -30); ctx.lineTo(44, -10);
  if (b.ph > 2) { ctx.moveTo(-20, 56); ctx.lineTo(-10, 40); ctx.moveTo(20, 56); ctx.lineTo(10, 40); }
  ctx.stroke();
  ctx.globalAlpha = fade;
  // yeux
  const ballWarn = b.hz.some((h) => h[0] === 'b' && h[3] > 0);
  ctx.fillStyle = '#0c0818';
  ctx.beginPath();
  ctx.roundRect(-40, -42, 80, 16, 8);
  ctx.fill();
  ctx.fillStyle = ballWarn ? '#fff' : c1;
  [-20, 20].forEach((ex) => { ctx.beginPath(); ctx.ellipse(ex, -34, 9, ballWarn ? 6 : 4, 0, 0, TAU); ctx.fill(); });
  // cœur
  ctx.save();
  ctx.translate(0, 8);
  ctx.fillStyle = '#0c0818';
  ctx.beginPath(); ctx.arc(0, 0, 33, 0, TAU); ctx.fill();
  const open = !!b.ex;
  const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
  if (open) { core.addColorStop(0, '#ffffff'); core.addColorStop(0.5, c1); core.addColorStop(1, c2); } else { core.addColorStop(0, '#9a7cc8'); core.addColorStop(1, '#3a2860'); }
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(0, 0, 27 + (open ? Math.sin(t * 0.3) * 2 : 0), 0, TAU); ctx.fill();
  if (b.fl > 0) { ctx.fillStyle = `rgba(255,255,255,${b.fl / 12})`; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill(); }
  // bouclier hexagonal
  if (!open && !b.dd) {
    const k = b.sr ? 0.35 + 0.25 * Math.sin(t * 0.5) : 0.9;
    ctx.globalAlpha = fade * k;
    ctx.strokeStyle = '#ff9ae0';
    ctx.fillStyle = 'rgba(255,120,220,.14)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 0.01; const px = Math.cos(a) * 50; const py = Math.sin(a) * 50; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 0.01; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 50, Math.sin(a) * 50); }
    ctx.stroke();
  } else if (open) {
    ctx.globalAlpha = fade * 0.9;
    ctx.strokeStyle = c1;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { // éclats du bouclier brisé qui tournent
      const a = (i / 6) * TAU + t * 0.08;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 46, Math.sin(a) * 46); ctx.lineTo(Math.cos(a + 0.25) * 56, Math.sin(a + 0.25) * 56); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.restore();
}

function drawBossHazards(frame) {
  const b = world.bs;
  if (!b || b.dd) return;
  const ahead = Math.min((performance.now() - world.recvAt) / 16.7, 2);
  const H = LH;
  const floorY = H - level.tile;
  b.hz.forEach((h) => {
    if (h[0] === 'r') { // rocher : colonne rouge annoncée, puis chute
      const [, x, y, warn] = h;
      if (warn > 0) {
        const k = 1 - warn / 80;
        const pulse = 0.5 + 0.5 * Math.sin(frame * 0.5);
        ctx.fillStyle = `rgba(255,70,90,${0.07 + 0.1 * pulse + k * 0.1})`;
        ctx.fillRect(x - 15, 0, 30, floorY);
        ctx.strokeStyle = `rgba(255,120,130,${0.35 + 0.3 * pulse})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(x - 15, 0, 30, floorY);
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(255,60,80,${0.5 + k * 0.4})`;
        ctx.beginPath(); ctx.ellipse(x, floorY - 2, 10 + k * 8, 4 + k * 2, 0, 0, TAU); ctx.fill();
        if (warn === 78 || warn === 62 || warn === 50) window.Sfx.play('warn', 200);
      } else {
        const ry = y + 13 * ahead;
        ctx.fillStyle = 'rgba(255,120,120,.18)';
        ctx.fillRect(x - 12, Math.max(0, ry - 90), 24, 90);
        ctx.save();
        ctx.translate(x, ry);
        ctx.rotate(Math.sin(ry * 0.05) * 0.3);
        ctx.fillStyle = '#8c7f9e';
        ctx.strokeStyle = '#2a2140';
        ctx.lineWidth = 3;
        ctx.beginPath();
        [[-14, -4], [-7, -15], [6, -14], [15, -2], [10, 13], [-5, 15]].forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.3)';
        ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(2, -11); ctx.lineTo(-4, -3); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    } else if (h[0] === 'w') { // onde de choc : lueur au sol annoncée, puis crête qui court
      const [, x, dir, warn, vx] = h;
      if (warn > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(frame * 0.6);
        ctx.fillStyle = `rgba(255,220,90,${0.35 + 0.35 * pulse})`;
        ctx.beginPath(); ctx.ellipse(x, floorY - 2, 26, 6, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,120,.8)';
        ctx.lineWidth = 3;
        for (let k = 1; k <= 3; k++) { // chevrons dans le sens de l'onde
          const cx = x + dir * (18 + k * 16);
          ctx.beginPath(); ctx.moveTo(cx - dir * 6, floorY - 16); ctx.lineTo(cx, floorY - 8); ctx.lineTo(cx - dir * 6, floorY); ctx.stroke();
        }
      } else {
        const wx = x + dir * vx * ahead;
        ctx.save();
        ctx.translate(wx, floorY);
        ctx.globalCompositeOperation = 'lighter';
        window.Themes.halo(ctx, 0, -10, 34, '#ffe27a', 0.5);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#fff2b0';
        ctx.strokeStyle = '#ff9a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-dir * 22, 0);
        ctx.lineTo(-dir * 10, -12);
        ctx.lineTo(-dir * 4, -6);
        ctx.lineTo(dir * 6, -22);
        ctx.lineTo(dir * 10, -8);
        ctx.lineTo(dir * 14, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    } else if (h[0] === 'b') { // boule de feu : charge + ligne de visée, puis vol
      const [, x, y, warn, vx, vy, tx, ty] = h;
      if (warn > 0) {
        const k = 1 - Math.min(warn, 60) / 60;
        ctx.save();
        ctx.strokeStyle = `rgba(255,120,90,${warn <= 12 ? 0.8 : 0.35})`;
        ctx.lineWidth = warn <= 12 ? 2.5 : 1.5;
        ctx.setLineDash([4, 7]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(tx, ty, 12 + (warn <= 12 ? 0 : Math.sin(frame * 0.4) * 3), 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        window.Themes.halo(ctx, x, y, 14 + k * 22, '#ff8a3a', 0.4 + k * 0.5);
        ctx.restore();
      } else {
        const bx = x + vx * ahead;
        const by = y + vy * ahead;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        window.Themes.halo(ctx, bx, by, 30, '#ff7a2a', 0.7);
        for (let i = 1; i <= 4; i++) window.Themes.halo(ctx, bx - vx * i * 3, by - vy * i * 3, 12 - i * 2, '#ff9a4a', 0.4 - i * 0.07);
        ctx.restore();
        ctx.fillStyle = '#fff3c0';
        ctx.beginPath(); ctx.arc(bx, by, 6 + Math.sin(frame * 0.7) * 1.2, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ff6a2a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, by, 9, 0, TAU); ctx.stroke();
      }
    }
  });
}

/* ---------- Fantôme de la meilleure partie (discret : transparent, désactivable avec le bouton 👻) ---------- */
const Ghost = {
  on: true,
  rec: null, // enregistrement en cours : { t0, last, ids, d: [] }
  best: null, // fantôme affiché : { t, p: [{k, s, c}], n, pos: Float32Array }
  startAt: 0,
  SAMPLE_MS: 100,
  key(name) { return `cordee.ghost.v1.${window.Progress ? window.Progress.team() : ''}.${name}`; },
  decode(g) {
    if (!g || g.v !== 1 || !Array.isArray(g.p) || !Array.isArray(g.d)) return null;
    const np = g.p.length;
    const w = np * 2 + 1;
    const n = Math.floor(g.d.length / w);
    if (n < 2) return null;
    const pos = new Float32Array(n * np * 2);
    const face = new Int8Array(n * np);
    let cur = new Array(np * 2).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < np * 2; j++) {
        cur[j] = i === 0 ? g.d[j] : cur[j] + g.d[i * w + j];
        pos[i * np * 2 + j] = cur[j];
      }
      const m = g.d[i * w + np * 2];
      for (let q = 0; q < np; q++) face[i * np + q] = m & (1 << q) ? -1 : 1;
    }
    return { t: g.t, p: g.p, np, n, pos, face };
  },
  load(name) {
    try { return this.decode(JSON.parse(localStorage.getItem(this.key(name)))); } catch { return null; }
  },
  // Début de niveau : on prépare l'enregistrement et on charge le fantôme (local, puis celui de l'équipe s'il est plus rapide)
  start(lv) {
    this.startAt = performance.now();
    if (lv.chapter && lv.chapter.tutorial) { this.rec = null; this.best = null; return; }
    this.rec = { t0: this.startAt, next: 0, d: [], ids: null, prev: null };
    this.best = this.load(lv.name);
    this.fetched = null;
    const team = window.Progress ? window.Progress.team() : '';
    if (team) {
      const name = lv.name;
      fetch(`/api/team/${encodeURIComponent(team)}/ghost/${encodeURIComponent(name)}`)
        .then((r) => r.json())
        .then((j) => {
          if (!j || !j.ok || !j.ghost || !level || level.name !== name) return;
          const g = this.decode(j.ghost);
          if (g && (!this.best || g.t < this.best.t - 0.05)) {
            this.best = g;
            try { localStorage.setItem(this.key(name), JSON.stringify(j.ghost)); } catch { /* ignore */ }
          }
        })
        .catch(() => {});
    }
  },
  sample() {
    const r = this.rec;
    if (!r || !level || !world || world.status !== 'playing' || document.hidden) return;
    const now = performance.now();
    if (now < r.next) return;
    r.next = Math.max(r.next + this.SAMPLE_MS, now - this.SAMPLE_MS);
    if (!r.ids) {
      r.ids = players.map((p) => p.id).sort();
      r.look = r.ids.map((id) => { const p = players.find((q) => q.id === id) || {}; return { k: level.cfg.abilities ? p.role : 'plain', s: p.skin || 'tasse', c: p.color || '#ffffff' }; });
    }
    if (r.d.length >= (r.ids.length * 2 + 1) * 2400) return; // 4 minutes au maximum
    const cur = [];
    let mask = 0;
    r.ids.forEach((id, q) => {
      const s = sprites.get(id);
      cur.push(s ? Math.round(s.tx) : (r.prev ? r.prev[q * 2] : 0), s ? Math.round(s.ty) : (r.prev ? r.prev[q * 2 + 1] : 0));
      if (s && s.face < 0) mask |= 1 << q;
    });
    cur.forEach((v, j) => r.d.push(r.prev ? v - r.prev[j] : v));
    r.d.push(mask);
    r.prev = cur;
  },
  // Fin de niveau gagné : on garde cette partie si elle bat le fantôme actuel
  finish(res, lv) {
    const r = this.rec;
    this.rec = null;
    if (!r || !res || res.skipped || !r.ids || r.d.length < (r.ids.length * 2 + 1) * 5) return;
    const t = Math.round((res.time / 60) * 10) / 10;
    const old = this.load(lv.name);
    if (old && old.t <= t) return;
    const g = { v: 1, t, p: r.look, d: r.d };
    try { localStorage.setItem(this.key(lv.name), JSON.stringify(g)); } catch { /* stockage plein : sans importance */ }
    const team = window.Progress ? window.Progress.team() : '';
    if (team) {
      fetch(`/api/team/${encodeURIComponent(team)}/ghost/${encodeURIComponent(lv.name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ghost: g }),
      }).catch(() => {});
    }
  },
  draw() {
    const g = this.best;
    if (!this.on || !g || !world || world.status !== 'playing' || !level) return;
    const f = (performance.now() - this.startAt) / this.SAMPLE_MS;
    if (f > g.n + 15) return; // le fantôme a terminé depuis un moment
    const i = Math.min(Math.floor(f), g.n - 2);
    const k = Math.min(1, f - i);
    const fade = f > g.n - 1 ? Math.max(0, 1 - (f - (g.n - 1)) / 15) : 1;
    const fr = Math.floor(f);
    for (let q = 0; q < g.np; q++) {
      const a = (i * g.np + q) * 2;
      const b = ((i + 1) * g.np + q) * 2;
      const x0 = g.pos[a];
      const y0 = g.pos[a + 1];
      const x = x0 + (g.pos[b] - x0) * k;
      const y = y0 + (g.pos[b + 1] - y0) * k;
      const vx = g.pos[b] - x0;
      const vy = g.pos[b + 1] - y0;
      const look = g.p[q];
      ctx.save();
      ctx.globalAlpha = 0.3 * fade;
      Skins.draw(ctx, look.s, x, y, {
        dir: g.face[(i * g.np) + q] || 1, color: look.c, t: fr * 0.6, kit: look.k, walk: Math.abs(vx) > 1 && Math.abs(vy) < 2 ? 1 : 0,
        air: Math.abs(vy) > 1.5, vy: vy / 6, dash: false, look: { x: 0, y: 0 }, cast: null,
      });
      ctx.restore();
    }
  },
};
setInterval(() => Ghost.sample(), 50);
try { Ghost.on = localStorage.getItem('cordee.ghost') !== '0'; } catch { /* ignore */ }
function updateGhostButton() {
  $('btn-ghost').classList.toggle('off', !Ghost.on);
  $('btn-ghost').title = Ghost.on ? 'Fantôme de votre meilleure partie : affiché (cliquer pour le masquer)' : 'Fantôme de votre meilleure partie : masqué (cliquer pour l’afficher)';
}
$('btn-ghost').onclick = () => {
  Ghost.on = !Ghost.on;
  try { localStorage.setItem('cordee.ghost', Ghost.on ? '1' : '0'); } catch { /* ignore */ }
  updateGhostButton();
  window.Sfx.play('click');
};
$('btn-ghost').addEventListener('mousedown', (e) => e.preventDefault());
updateGhostButton();

/* ---------- Signal « regarde ici » (Ctrl + clic droit) ---------- */
const marks = []; // { x, y, f0, color }
let lastMarkAt = 0;
function sendMark() {
  const now = performance.now();
  if (!level || !mouse.has || now - lastMarkAt < 1200) return;
  lastMarkAt = now;
  send({ t: 'mark', x: mouse.x, y: mouse.y });
}
function onMark(msg) {
  if (!level) return;
  const p = players.find((q) => q.id === msg.id);
  const color = p ? p.color : '#ffd84a';
  marks.length = 0; // un seul repère à la fois
  marks.push({ x: msg.x, y: msg.y, f0: frame, color, id: msg.id });
  window.Sfx.play('mark', 300);
  ring(msg.x, msg.y, color, 56);
  sparks(msg.x, msg.y, color, 8, 2.2, 30);
}
function drawMarks() {
  const LIFE = 210;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    const age = frame - m.f0;
    if (age > LIFE) { marks.splice(i, 1); continue; }
    const fade = age > LIFE - 40 ? (LIFE - age) / 40 : 1;
    const pulse = (age % 50) / 50;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 8 + pulse * 26, 0, TAU);
    ctx.globalAlpha = fade * (1 - pulse) * 0.9;
    ctx.stroke();
    ctx.globalAlpha = fade;
    // petite flèche qui rebondit au-dessus du point
    const by = m.y - 22 - Math.abs(Math.sin(age * 0.18)) * 7;
    ctx.fillStyle = m.color;
    ctx.strokeStyle = '#1a1030';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m.x, by + 10);
    ctx.lineTo(m.x - 9, by - 4);
    ctx.lineTo(m.x - 3, by - 4);
    ctx.lineTo(m.x - 3, by - 12);
    ctx.lineTo(m.x + 3, by - 12);
    ctx.lineTo(m.x + 3, by - 4);
    ctx.lineTo(m.x + 9, by - 4);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(m.x, m.y, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function onEmote(msg) {
  const def = EMOTES[msg.e];
  if (!def || !level) return;
  emotes.set(msg.id, { n: msg.e, f0: frame });
  const s = sprites.get(msg.id);
  if (s) sparks(s.tx + PW / 2, s.ty - 8, '#ffd84a', 6, 2.4, 26);
}

// Porter / lancer son coéquipier (niveaux avec cfg.carry) : 1er appui = porter, 2e appui = lancer
function grabPartner() {
  if (!level) return;
  if (!level.cfg.carry) return toast('Porter (F) n’est possible que dans certains niveaux, par exemple « Courte-échelle ».');
  send({ t: 'grab' });
}

function swapRoles() {
  if (!level || players.length < 2) return;
  send({ t: 'swaproles' });
}

// Appelé quand le serveur renvoie la liste des joueurs en pleine partie : un rôle a peut-être changé
function rolesChanged(prev) {
  let any = false;
  players.forEach((p) => {
    if (!prev.has(p.id) || prev.get(p.id) === p.role) return;
    any = true;
    const s = sprites.get(p.id);
    if (!s) return;
    const col = p.role === 'mage' ? '#b79cff' : '#9be564';
    s.pop = 12;
    s.castT = 0;
    sparks(s.tx + PW / 2, s.ty + PH / 2, col, 12, 3.6, 40);
    ring(s.tx + PW / 2, s.ty + PH / 2, col, 44);
    flash(s.tx + PW / 2, s.ty + PH / 2, col, 64, 14);
  });
  if (!any) return;
  armed = 1;
  updateRoleHint();
  window.Sfx.play('swap', 80);
  const me = myPlayer();
  if (me && level.cfg.abilities) toast(`Rôles échangés : tu es maintenant ${me.role === 'mage' ? 'le Mage' : 'l’Archer'} !`);
}

function updateTeamBar() {
  const bar = $('teambar');
  bar.innerHTML = '';
  if (!level) return;
  const add = (b) => {
    b.type = 'button';
    b.tabIndex = -1; // pas de focus : la barre d'espace doit rester le saut
    b.addEventListener('mousedown', (e) => e.preventDefault());
    bar.append(b);
  };
  if (level.cfg.abilities && players.length >= 2) {
    const b = document.createElement('button');
    b.className = 'team swap';
    b.innerHTML = 'Échanger les rôles<small>T</small>';
    b.title = 'Toi et ton coéquipier échangez vos rôles (Mage ↔ Archer), à tout moment';
    b.onclick = swapRoles;
    add(b);
    const sep = document.createElement('span');
    sep.className = 'sep';
    bar.append(sep);
  }
  if (level.cfg.carry && players.length >= 2) {
    const b = document.createElement('button');
    b.className = 'team swap';
    b.innerHTML = 'Porter / lancer<small>F</small>';
    b.title = 'Près de ton coéquipier : porte-le. Appuie encore pour le lancer devant toi !';
    b.onclick = grabPartner;
    add(b);
    const sep = document.createElement('span');
    sep.className = 'sep';
    bar.append(sep);
  }
  EMOTES.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'team emo';
    b.textContent = m.emoji;
    b.title = `${m.text} (touche ${m.key.toUpperCase()})`;
    b.onclick = () => sendEmote(i);
    add(b);
  });
}

function startLevel(msg) {
  const T = msg.tile;
  const cfg = msg.cfg || {};
  const keys = [];
  let door = null;
  msg.level.forEach((row, ty) => {
    [...row].forEach((ch, tx) => {
      if (ch === 'K') keys.push({ x: tx * T, y: ty * T });
      if (ch === 'D') door = { x: tx * T, y: ty * T };
    });
  });
  const L = Phys.parseLevel({ rows: msg.level, sequence: cfg.seqGroup ? { group: cfg.seqGroup, order: [] } : undefined });
  const chapter = msg.chapter || { index: 0, name: '', theme: 'arcane', pos: 1, count: 1, powers: [] };
  level = {
    rows: msg.level, tile: T, keys, door, index: msg.index, total: msg.total, name: msg.name, hint: msg.hint, chapter,
    timer: msg.timer || 0,
    diamond: msg.diamond || 0, gold: msg.gold || 0, silver: msg.silver || 0,
    star: (L.stars && L.stars[0]) || null,
    theme: chapter.theme,
    cfg: {
      abilities: !!cfg.abilities, dark: !!cfg.dark, fire: !!cfg.fire, swap: !!cfg.swap,
      seqGroup: cfg.seqGroup || 0, labels: cfg.labels || [],
      link: !!cfg.link, sync: !!cfg.sync, carry: !!cfg.carry, heavy: cfg.heavy || [], boss: cfg.boss || null,
      tips: cfg.tips || [], tutorial: cfg.tutorial || null,
    },
    L,
  };
  world = freshWorld(level);
  sprites.clear();
  parts.length = 0;
  springAnim.clear();
  Object.assign(prevWorldInfo, { door: world.door, keys: 0, cps: 0, status: 'playing', deaths: 0, sr: 0 });
  setupCanvas();
  level.bg = window.Themes.makeBackground(level.theme, LW, LH, msg.index + 1, RES);
  level.tiles = window.Themes.makeTiles(level.theme, msg.level, T, msg.index + 1, RES);
  level.decor = window.Themes.makeDecor(level.theme, LW, LH, msg.index + 1);
  level.vig = makeVignette(LW, LH, level.theme);
  level.tipSprites = (level.cfg.tips || []).map(makeTipSprite);
  level.shift = 0;
  irisT = 0;
  shakeMag = 0;
  canvas.style.transform = '';
  level.hintShown = !HINT_HIDDEN;
  if (window.Progress) { window.Progress.onStart(msg); window.Progress.hideResult(); }
  updateHintLine();
  armed = 1;
  lastTl = -1;
  updateTimer.lastTier = null;
  emotes.clear();
  marks.length = 0;
  bossFx.deadAt = 0;
  bossFx.ready = false;
  bossFx.lastHearts = -1;
  if (!level.cfg.boss) { $('boss-hud').classList.remove('on'); $('team-hud').classList.remove('on'); }
  Ghost.start(level);
  updateRoleHint();
  updateTeamBar();
  updateBanner();
  updateHud();
  updateTimer();
  show('game');
  document.body.dataset.theme = level.theme;
  document.documentElement.style.setProperty('--accent', ACCENT[level.theme] || '#ffd24a');
  setMusicFor(level.theme);
  setTempo(1);
  if (level.cfg.abilities && !helpSeen() && !level.cfg.tutorial) showHelp();
  tutorialUi();
  if (chapter.index !== lastChapter) {
    lastChapter = chapter.index;
    showChapterCard(chapter);
  }
}

// Indice : masqué par défaut (le consulter compte comme une aide pour la médaille « sans indice »)
const HINT_HIDDEN = true;
function updateHintLine() {
  if (!level) return;
  const timerNote = level.timer ? `⏱ Niveau chronométré : ${spokenTime(level.timer)}.` : '';
  $('level-hint').textContent = level.hintShown
    ? `${level.hint}  ${timerNote}`
    : `💡 Indice masqué : touche I ou bouton « Indice » (compte comme une aide).  ${timerNote}`;
  $('btn-hint').style.display = level.hintShown ? 'none' : '';
}
function revealHint() {
  if (!level || level.hintShown) return;
  level.hintShown = true;
  if (window.Progress) window.Progress.noteHelp();
  updateHintLine();
}
function showChapterCard(ch) {
  const el = $('chapter-card');
  $('chapter-num').textContent = ch.tutorial ? 'Tutoriel' : `Chapitre ${ch.index + 1}`;
  $('chapter-name').textContent = ch.name;
  $('chapter-blurb').textContent = ch.blurb || '';
  const ul = $('chapter-powers');
  ul.innerHTML = '';
  (ch.powers || []).forEach((p) => {
    const li = document.createElement('li');
    li.textContent = p;
    ul.append(li);
  });
  el.classList.remove('show');
  void el.offsetWidth; // relance l'animation
  el.classList.add('show');
  window.Sfx.play('chapter');
  clearTimeout(showChapterCard.timer);
  showChapterCard.timer = setTimeout(() => el.classList.remove('show'), 5200);
}

function updateBanner() {
  const finished = world.status === 'finished';
  const timeup = world.status === 'timeup';
  const down = world.status === 'bossdown';
  const ph = world.bs ? world.bs.ph : 1;
  $('banner').textContent = down
    ? `Le Gardien vous a terrassés…\n${ph > 1 ? `On reprend à la phase ${ph}` : 'On recommence le combat'}`
    : 'Temps écoulé !\nOn recommence le niveau…';
  $('banner').classList.toggle('bad', timeup || down);
  // « Niveau réussi » / « Terminé » : c'est l'écran de résultat (progress.js) qui s'en charge
  $('banner').classList.toggle('show', timeup || down);
}

function updateHud() {
  if (!level) return;
  const ch = level.chapter;
  $('hud-level').textContent = ch.tutorial ? 'Tutoriel · Apprenez toutes les touches' : `${ch.name} · Niveau ${level.index + 1}/${level.total} : ${level.name}`;
  const parts2 = [];
  if (level.keys.length) parts2.push(`Clés ${world.keys.length}/${level.keys.length}`);
  if (world.deaths) parts2.push(`Chutes ${world.deaths}`);
  $('hud-keys').textContent = parts2.join('   ');
}

/* ---------- Minuteur ---------- */
function fmtTime(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function spokenTime(sec) {
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}
function updateTimer() {
  const el = $('hud-timer');
  if (!level || !level.timer || !world) {
    el.textContent = '';
    el.className = '';
    return;
  }
  const playing = world.status === 'playing';
  const tl = world.status === 'timeup' ? 0 : world.tl;
  // médaille que l'on aurait en finissant maintenant : or, puis argent, puis bronze
  const elapsed = level.timer - tl;
  const tier = playing && window.Progress ? window.Progress.tier(elapsed) : null;
  const icon = tier === 'diamond' ? ' 💎' : tier === 'gold' ? ' 🥇' : tier === 'silver' ? ' 🥈' : tier === 'bronze' ? ' 🥉' : '';
  el.textContent = `⏱ ${fmtTime(tl)}${icon}`;
  el.className = playing && tl <= 10 ? 'urgent' : playing && tl <= 30 ? 'warn' : (tier || '');
  if (playing && tier !== updateTimer.lastTier) {
    if (updateTimer.lastTier === 'diamond' && tier === 'gold') toast('💎 perdu… vise l’or !');
    else if (updateTimer.lastTier === 'gold' && tier === 'silver') toast('🥇 perdue… vise l’argent !');
    else if (updateTimer.lastTier === 'silver' && tier === 'bronze') toast('🥈 perdue… finis en bronze !');
    updateTimer.lastTier = tier;
  }
  if (tl !== lastTl) {
    lastTl = tl;
    if (playing && tl <= 10 && tl > 0) window.Sfx.play('tick', 300);
  }
  // la musique accélère pendant les 30 dernières secondes
  setTempo(playing && tl > 0 && tl <= 30 ? 1.22 : 1);
}

/* ---------- Barre des sorts et aide ---------- */
function slotAvailable(slot) {
  const kit = myKit();
  if (!level || kit === 'plain') return false;
  if (slot === 1) return true;
  if (slot === 2) return kit === 'mage' || !!level.cfg.fire;
  if (slot === 3) return kit === 'mage' && !!level.cfg.swap;
  return false;
}

function refreshArmed() {
  actBtns.forEach((b) => b.el.classList.toggle('armed', !b.dash && b.slot === armed));
  canvas.style.cursor = myKit() === 'plain' ? 'default' : 'crosshair';
}

function armSlot(slot) {
  if (!slotAvailable(slot)) return;
  armed = slot;
  refreshArmed();
  window.Sfx.play('click', 60);
}

function updateRoleHint() {
  const kit = myKit();
  const bar = $('actionbar');
  bar.innerHTML = '';
  actBtns = [];
  (SPELLS[kit] || []).forEach((d) => {
    if (d.need && !level.cfg[d.need]) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'act';
    b.tabIndex = -1; // pas de focus : la barre d'espace doit rester le saut
    b.style.setProperty('--c', d.color);
    b.title = d.tip;
    const name = document.createElement('b');
    name.textContent = d.name;
    const tip = document.createElement('small');
    tip.textContent = d.tip;
    const key = document.createElement('small');
    key.textContent = d.key;
    const fill = document.createElement('i');
    b.append(name, tip, key, fill);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (d.dash) { send({ t: 'dash' }); window.Sfx.play('click', 60); } else armSlot(d.slot);
    });
    bar.append(b);
    actBtns.push({ el: b, slot: d.slot, dash: !!d.dash, fill });
  });
  const move = 'Bouger : <kbd>←</kbd> <kbd>→</kbd> (ou <kbd>Q</kbd> <kbd>D</kbd>) · Sauter : <kbd>Espace</kbd>';
  let extra = '';
  if (kit === 'archer') extra = ' · Double saut : <kbd>Espace</kbd> deux fois';
  if (kit !== 'plain') extra += '<br>Pour lancer un sort : clique sur son bouton, puis clique dans le jeu pour viser.';
  $('move-help').innerHTML = move + extra;
  refreshArmed();
}

function updateActionCooldowns() {
  if (!actBtns.length || !world) return;
  const cd = world.cd.find((c) => c[0] === myId);
  const kit = myKit();
  actBtns.forEach((b) => {
    let r = 0;
    if (cd) {
      if (b.dash) r = cd[3];
      else if (b.slot === 3) r = cd[4] || 0;
      else r = cd[b.slot] || 0;
    }
    r = Math.round(r * 50) / 50;
    if (b.last !== r) { b.last = r; b.fill.style.setProperty('--cd', r); b.el.style.setProperty('--cd', r); }
  });
  void kit;
}

function helpSeen() {
  try { return localStorage.getItem('cordee.helpSeen') === '1'; } catch { return false; }
}

function helpHtml() {
  const kit = myKit();
  const c = level ? level.cfg : {};
  let h = '<h4>Pour tout le monde</h4><ul>'
    + '<li>Bouger : <kbd>←</kbd> <kbd>→</kbd> (ou <kbd>Q</kbd> <kbd>D</kbd>)</li>'
    + '<li>Sauter : <kbd>Espace</kbd> (ou <kbd>↑</kbd>)</li>'
    + '<li><kbd>Maj</kbd> : dash, une course éclair (pour les deux joueurs)</li>'
    + (level && level.cfg.carry ? '<li><kbd>F</kbd> : porter ton coéquipier (il doit être tout près), puis <kbd>F</kbd> encore pour le lancer devant toi. Le porté peut sauter pour descendre.</li>' : '')
    + (level && level.cfg.link ? '<li><b>Blocs verts liés</b> : ils disparaissent si vous vous éloignez de plus de 7 cases. Le fil entre vous vire au rouge avant la rupture.</li>' : '')
    + (level && level.cfg.sync ? '<li><b>Ponts dorés</b> : sautez <b>tous les deux en même temps</b> (moins d’une seconde d’écart) pour les faire apparaître 6 secondes.</li>' : '')
    + (level && level.cfg.heavy && level.cfg.heavy.length ? '<li><b>Plaque lourde</b> : il faut être <b>deux</b> dessus pour l’enfoncer.</li>' : '')
    + '<li>Coincés ? <kbd>R</kbd> recommence le niveau</li>'
    + '<li><kbd>T</kbd> échange ton rôle avec ton coéquipier (Mage ↔ Archer), à tout moment</li>'
    + '<li><kbd>G</kbd> <kbd>M</kbd> <kbd>J</kbd> : emotes (une bulle apparaît au-dessus de toi)</li>'
    + '<li><kbd>Ctrl</kbd> + clic droit : « regarde ici », un repère visible par ton coéquipier</li>'
    + '<li><kbd>P</kbd> coupe le son · <kbd>H</kbd> rouvre cette aide</li></ul>';
  if (kit === 'mage') {
    h += '<h4>Tu es le Mage</h4><ul>'
      + '<li>Sous le jeu, <b>clique sur un sort</b> pour le choisir, puis <b>clique dans le jeu</b> à l’endroit à viser.</li>'
      + '<li><b>Orbe</b> : touche les cristaux pour ouvrir les portes de la même couleur.</li>'
      + '<li><b>Glace</b> : transforme une rune en plateforme (un moment).</li>'
      + (c.swap ? '<li><b>Échange</b> : lance l’éclair sur ton coéquipier, vous échangez vos places.</li>' : '')
      + '<li><b>Clic gauche</b> : lance le sort choisi (l’orbe au départ). <b>Clic droit</b> : pose de la glace.</li></ul>';
  } else if (kit === 'archer') {
    h += '<h4>Tu es l’Archer</h4><ul>'
      + '<li>Sous le jeu, <b>clique sur un sort</b> pour le choisir, puis <b>clique dans le jeu</b> à l’endroit à viser. La flèche retombe : vise un peu plus haut.</li>'
      + '<li><b>Flèche</b> : touche les cibles pour ouvrir les portes de la même couleur.</li>'
      + (c.fire ? '<li><b>Feu</b> : brûle le bois (tout le bois relié brûle) et allume les torches.</li>' : '')
      + '<li><b>Double saut</b> : appuie deux fois sur Espace. <b>Dash</b> : bouton Dash (ou <kbd>Maj</kbd>) pour une course éclair.</li>'
      + '<li><b>Clic gauche</b> : tire le sort choisi (la flèche au départ).' + (c.fire ? ' <b>Clic droit</b> : flèche de feu.' : '') + '</li></ul>';
  } else {
    h += '<h4>Ce niveau</h4><ul><li>Pas encore de pouvoirs : portez-vous, poussez-vous, coopérez !</li></ul>';
  }
  if (level && level.timer) h += `<h4>Chrono</h4><ul><li>Ce niveau est chronométré (${spokenTime(level.timer)}). Si le temps tombe à zéro, il recommence.</li></ul>`;
  return h;
}

function showHelp() {
  $('help-body').innerHTML = helpHtml();
  $('help').classList.add('show');
}
function hideHelp() {
  $('help').classList.remove('show');
  try { localStorage.setItem('cordee.helpSeen', '1'); } catch { /* ignore */ }
}
$('help-close').onclick = hideHelp;
$('help').addEventListener('mousedown', (e) => { if (e.target === $('help')) hideHelp(); });
$('btn-help').addEventListener('mousedown', (e) => e.preventDefault());
// L'aide ouverte à la main pendant un niveau compte comme une aide (l'ouverture automatique de la 1re fois, non)
function openHelpByHand() {
  if (level && level.cfg.tutorial) send({ t: 'tut', step: 'help' });
  if (window.Progress && level && world && world.status === 'playing') window.Progress.noteHelp();
  showHelp();
}
$('btn-help').onclick = () => (level ? openHelpByHand() : null);
$('btn-hint').addEventListener('mousedown', (e) => e.preventDefault());
$('btn-hint').onclick = () => revealHint();

/* ---------- Tutoriel : carnet des touches, bulles dans le jeu, visite de l'interface ---------- */
const tut = { need: [], p: {} };
const coach = { i: -1, seen: false, timer: 0, steps: [] };
const tutOn = () => !!(level && level.cfg.tutorial);

function onTut(msg) {
  const before = new Set(tut.p[myId] || []);
  tut.need = msg.need || [];
  tut.p = msg.p || {};
  if (!tutOn()) return;
  (tut.p[myId] || []).forEach((id) => {
    if (before.has(id)) return;
    const st = level.cfg.tutorial.steps.find((x) => x.id === id);
    if (st) { toast(`✔ ${st.label}`); window.Sfx.play('mark', 80); }
  });
  renderTutBook();
}

function renderTutBook() {
  const book = $('tut-book');
  if (!tutOn()) { book.classList.remove('on'); return; }
  const steps = level.cfg.tutorial.steps.filter((x) => tut.need.includes(x.id));
  const mine = new Set(tut.p[myId] || []);
  const mate = players.find((q) => q.id !== myId);
  const theirs = new Set((mate && tut.p[mate.id]) || []);
  const nMine = steps.filter((x) => mine.has(x.id)).length;
  const nTheirs = steps.filter((x) => theirs.has(x.id)).length;
  book.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'tb-head';
  const title = document.createElement('span');
  title.innerHTML = `<b>Carnet des touches</b> · toi ${nMine}/${steps.length}${mate ? ` · ${mate.name.replace(/[<>&]/g, '')} ${nTheirs}/${steps.length}` : ''}`;
  head.append(title);
  const btns = document.createElement('span');
  btns.className = 'tb-btns';
  const visit = document.createElement('button');
  visit.className = 'ghost'; visit.type = 'button'; visit.tabIndex = -1; visit.textContent = 'Revoir la visite';
  visit.addEventListener('mousedown', (e) => e.preventDefault());
  visit.onclick = () => coachStart();
  btns.append(visit);
  if (myId === hostId) {
    const skip = document.createElement('button');
    skip.className = 'ghost'; skip.type = 'button'; skip.tabIndex = -1; skip.textContent = 'Passer le tutoriel';
    skip.addEventListener('mousedown', (e) => e.preventDefault());
    skip.onclick = () => { if (confirm('Passer le tutoriel et commencer au niveau 1 ?')) send({ t: 'skip' }); };
    btns.append(skip);
  } else {
    const note = document.createElement('span');
    note.textContent = 'Le chef de room peut passer le tutoriel.';
    btns.append(note);
  }
  head.append(btns);
  book.append(head);
  const ul = document.createElement('ul');
  ul.id = 'tut-list';
  steps.forEach((x) => {
    const li = document.createElement('li');
    li.className = (mine.has(x.id) ? 'done' : '') + (theirs.has(x.id) ? ' mate' : '');
    li.innerHTML = `<i>${mine.has(x.id) ? '✔' : '○'}</i>${x.label}<em>${x.key}</em>`;
    ul.append(li);
  });
  book.append(ul);
  book.classList.add('on');
}

// Conseils dessinés dans le niveau : un petit panneau de texte, pré-rendu une fois
function makeTipSprite(tip) {
  const f = '700 11px Nunito, sans-serif';
  const w = tip.w || 150;
  const m = document.createElement('canvas').getContext('2d');
  m.font = f;
  const lines = [];
  let cur = '';
  String(tip.text).split(' ').forEach((word) => {
    const t = cur ? `${cur} ${word}` : word;
    if (m.measureText(t).width > w - 16 && cur) { lines.push(cur); cur = word; } else cur = t;
  });
  if (cur) lines.push(cur);
  const h = lines.length * 14 + 12;
  const tail = 7;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil((w + 4) * RES);
  cv.height = Math.ceil((h + tail + 4) * RES);
  const g = cv.getContext('2d');
  g.scale(RES, RES);
  g.translate(2, 2);
  g.beginPath();
  const r = 8;
  g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, w / 2 + 6, h, r);
  g.lineTo(w / 2 + 6, h); g.lineTo(w / 2, h + tail); g.lineTo(w / 2 - 6, h);
  g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath();
  g.fillStyle = 'rgba(255, 247, 226, .96)';
  g.fill();
  g.lineWidth = 2; g.strokeStyle = '#1d1a3b'; g.lineJoin = 'round'; g.stroke();
  g.font = f; g.fillStyle = '#1d1a3b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((ln, i) => g.fillText(ln, w / 2, 8 + i * 14 + 6));
  const cx = tip.tx * level.tile + level.tile / 2;
  return { cv, w: w + 4, h: h + tail + 4, x: Math.min(Math.max(cx - w / 2, 4), LW - w - 6) - 2, y: tip.ty * level.tile - h / 2 - 2 };
}
function drawTips(fr) {
  level.tipSprites.forEach((t, i) => {
    ctx.drawImage(t.cv, t.x, t.y + Math.sin(fr / 38 + i * 1.7) * 1.6, t.w, t.h);
  });
}

// Visite de l'interface : des bulles qui montrent chaque affichage, une par une
const COACH_ALL = [
  { sel: '#hud-level', text: 'En haut : le chapitre, le numéro du niveau et son nom. Les niveaux de la partie sont chronométrés (le chrono s’affiche ici, au milieu).' },
  { sel: '#hud-keys', text: 'Les clés du niveau : il faut les ramasser toutes pour ouvrir la porte. Ton nombre de chutes s’affiche aussi ici.' },
  { sel: '#hud-ping', text: 'Ton ping : le délai avec le serveur, en millisecondes. Plus il est bas, plus le jeu est fluide.' },
  { sel: '#actionbar', text: 'Tes sorts, selon ton rôle (Mage ou Archer) : clique sur un sort pour l’armer, puis clique dans le jeu pour viser. La jauge montre la recharge. Raccourcis : 1, 2, 3.' },
  { sel: '#teambar', text: 'Ici : échanger les rôles avec ton coéquipier (T), porter/lancer (F) et les emotes (G, M, J) pour parler sans micro.' },
  { sel: '#level-hint', text: 'L’indice du niveau est masqué : touche I. Le consulter compte comme une aide (la médaille « sans indice » est perdue pour tout le duo).' },
  { sel: '#audio-ctl', text: 'Records et Étoiles (tes meilleurs temps et les étoiles cachées), la musique et son volume, le fantôme de ta meilleure partie (👻) et le son (touche P).' },
  { sel: '#tut-book', text: 'Le carnet des touches : chaque touche essayée est cochée. Quand vous avez tout coché tous les deux, la grille finale s’ouvre. Le chef de room peut passer le tutoriel.' },
];
function coachEl(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 4 && r.height > 4 ? { el, r } : null;
}
function coachShow(i) {
  const st = coach.steps[i];
  if (!st) return coachEnd();
  coach.i = i;
  let t = coachEl(st.sel);
  if (!t) return coachShow(i + 1);
  if (t.r.top < 0 || t.r.bottom > innerHeight) { t.el.scrollIntoView({ block: 'center' }); t = coachEl(st.sel) || t; }
  const r = t.r;
  const hl = $('coach-hl');
  hl.style.left = `${r.left - 5}px`; hl.style.top = `${r.top - 5}px`;
  hl.style.width = `${r.width + 10}px`; hl.style.height = `${r.height + 10}px`;
  const b = $('coach-bubble');
  b.querySelector('.cb-step').textContent = `Visite de l’interface · ${i + 1}/${coach.steps.length}`;
  b.querySelector('p').textContent = st.text;
  $('coach-next').textContent = i === coach.steps.length - 1 ? 'Compris !' : 'Suivant ›';
  const bh = b.offsetHeight;
  const below = r.bottom + 16 + bh < innerHeight;
  b.style.top = `${Math.max(8, below ? r.bottom + 16 : r.top - 16 - bh)}px`;
  b.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - b.offsetWidth / 2), innerWidth - b.offsetWidth - 8)}px`;
}
function coachStart() {
  if (!tutOn()) return;
  clearTimeout(coach.timer);
  coach.steps = COACH_ALL.filter((x) => x.sel !== '#hud-keys' || level.keys.length);
  coach.seen = true;
  $('coach').classList.add('on');
  coachShow(0);
}
function coachEnd() {
  clearTimeout(coach.timer);
  coach.i = -1;
  $('coach').classList.remove('on');
}
$('coach-next').onclick = () => coachShow(coach.i + 1);
$('coach-skip').onclick = coachEnd;
window.addEventListener('resize', () => { if (coach.i >= 0) coachShow(coach.i); });

// Début d'un niveau : on affiche (ou on masque) le carnet, et on lance la visite une seule fois
function tutorialUi() {
  coachEnd();
  if (!tutOn()) { $('tut-book').classList.remove('on'); return; }
  renderTutBook();
  if (!coach.seen) coach.timer = setTimeout(coachStart, 5600);
}

/* ---------- Choix de l'apparence ---------- */
function drawSkinThumb(cv, id, color, t) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const sc = Math.min(cv.width / 40, (cv.height - 3) / (Skins.H + Skins.headroom(id, 'plain') + 2));
  g.save();
  g.translate(cv.width / 2, cv.height - 2);
  g.scale(sc, sc);
  Skins.draw(g, id, -Skins.W / 2, -Skins.H, { dir: 1, color, t });
  g.restore();
}

function renderLookPicker(root) {
  root.innerHTML = '';
  const me = myPlayer();
  const color = me ? me.color : look.color;
  const grid = document.createElement('div');
  grid.className = 'skin-grid';
  Skins.ids.forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `skin-btn ghost${id === look.skin ? ' on' : ''}`;
    b.title = Skins.names[id];
    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 152;
    drawSkinThumb(cv, id, color, 30);
    const nm = document.createElement('span');
    nm.className = 'skin-name';
    nm.textContent = Skins.names[id];
    b.append(cv, nm);
    b.onclick = () => { look.skin = id; saveLook(); window.Sfx.play('click'); pushLook(); refreshPickers(); };
    grid.append(b);
  });
  const cols = document.createElement('div');
  cols.className = 'color-row';
  Skins.colors.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `swatch${c === color ? ' on' : ''}`;
    b.style.background = c;
    b.setAttribute('aria-label', `Couleur ${c}`);
    const taken = players.some((p) => p.color === c && p.id !== myId);
    if (taken) b.classList.add('taken');
    b.onclick = () => {
      if (taken) return;
      look.color = c; saveLook(); window.Sfx.play('click'); pushLook(); refreshPickers();
    };
    cols.append(b);
  });
  root.append(grid, cols);
}

function pushLook() {
  if (ws && ws.readyState === 1 && roomCode) send({ t: 'look', skin: look.skin, color: look.color });
}

function refreshPickers() {
  renderLookPicker($('look-menu'));
  renderLookPicker($('look-lobby'));
  if (screens.lobby.classList.contains('active')) renderPlayerList();
}

// Aperçu animé sur l'écran d'accueil : le personnage reste, marche, saute et lance un sort à tour de rôle
function drawPreview() {
  const cv = $('look-preview');
  if (!cv || !screens.menu.classList.contains('active')) return;
  if (cv.width !== 216) { cv.width = 216; cv.height = 252; }
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const t = performance.now() / 16.7;
  const cyc = Math.floor(t / 100);
  const ph = cyc % 4;
  const lt = (t % 100) / 100;
  const round = Math.floor(cyc / 4);
  const o = { dir: round % 2 ? -1 : 1, color: look.color, t, kit: 'plain', walk: 0, air: false, vy: 0, dash: false };
  let lift = 0;
  if (ph === 1) {
    o.walk = 1;
  } else if (ph === 2) {
    o.air = true;
    lift = Math.sin(lt * Math.PI) * 12;
    o.vy = lt < 0.5 ? -5 : 5;
  } else if (ph === 3) {
    o.kit = round % 2 ? 'archer' : 'mage';
    o.cast = { ang: -0.45, k: Math.max(0, 1 - lt * 1.6) };
  }
  const S = cv.width / 54;
  const fit = Math.min(1, 52 / (Skins.H + Skins.headroom(look.skin, o.kit) + 6));
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath();
  g.ellipse(27 * S, 59.5 * S, (11 - lift * 0.3) * S, 2.2 * S, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(27 * S, (59 - lift) * S);
  g.scale(S * fit, S * fit);
  Skins.draw(g, look.skin, -Skins.W / 2, -Skins.H, o);
  g.restore();
}

/* ---------- Lobby ---------- */
function renderPlayerList() {
  const ul = $('lobby-players');
  ul.innerHTML = '';
  players.forEach((p) => {
    const li = document.createElement('li');
    const cv = document.createElement('canvas');
    cv.width = 80; cv.height = 104;
    drawSkinThumb(cv, p.skin || 'tasse', p.color, 30);
    const name = document.createElement('span');
    name.textContent = p.name;
    const role = document.createElement('span');
    role.className = 'tag';
    role.textContent = ROLE_LABEL[p.role] || '';
    li.append(cv, name, role);
    if (p.id === hostId) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'chef de room';
      li.append(tag);
    }
    ul.append(li);
  });
}

function renderLobby() {
  show('lobby');
  $('lobby-code').textContent = roomCode;
  renderPlayerList();
  const me = myPlayer();
  if (me) {
    $('role-select').value = me.role;
    look.color = Skins.colors.includes(me.color) ? me.color : look.color;
  }
  renderLookPicker($('look-lobby'));

  const isHost = myId === hostId;
  const sel = $('level-select');
  if (sel.options.length !== levelList.length) {
    const current = sel.value;
    sel.innerHTML = '';
    let group = null;
    let lastCh = -1;
    const order = levelList.map((l, i) => i).sort((a, b) => (levelList[b].tutorial ? 1 : 0) - (levelList[a].tutorial ? 1 : 0)); // le tutoriel d'abord
    order.forEach((i) => {
      const l = levelList[i];
      if (l.chapter !== lastCh) {
        lastCh = l.chapter;
        group = document.createElement('optgroup');
        group.label = l.tutorial ? 'Tutoriel (à deux)' : `Chapitre ${l.chapter + 1} · ${(chapterList[l.chapter] || {}).name || ''}`;
        sel.append(group);
      }
      const o = document.createElement('option');
      o.value = i;
      o.textContent = l.tutorial ? 'Tutoriel : apprendre toutes les touches' : `${i + 1}. ${l.name}${l.roles ? ' (Mage + Archer)' : ''}`;
      group.append(o);
    });
    sel.value = current || '0';
    if (current) sel.value = current;
  }
  // « Reprendre ma partie » (choisi au chargement de la page) : le niveau est présélectionné pour le chef de room
  if (isHost && window.Progress && window.Progress.peekResume() !== null && sel.options.length) {
    const r = window.Progress.takeResume();
    if (r >= 0 && r < sel.options.length) sel.value = String(r);
  }
  updateTutNote();
  $('level-panel').style.display = isHost ? '' : 'none';
  $('btn-start').style.display = isHost ? '' : 'none';
  $('lobby-wait').style.display = isHost ? 'none' : '';
}

$('btn-create').onclick = () => {
  setError('');
  connect(() => send({ t: 'create', name: $('name').value, skin: look.skin, color: look.color }));
};

$('btn-join').onclick = () => {
  const code = $('code').value.trim();
  if (code.length !== 4) return setError('Le code contient 4 lettres.');
  setError('');
  connect(() => send({ t: 'join', code, name: $('name').value, skin: look.skin, color: look.color }));
};

$('role-select').onchange = () => send({ t: 'role', role: $('role-select').value });
// Première partie de l'équipe : le tutoriel est lancé à la place du niveau 1 (le chef peut choisir un autre niveau dans la liste)
function firstGameTutorial() {
  const idx = levelList.findIndex((l) => l.tutorial);
  const chosen = Number($('level-select').value) || 0;
  if (idx < 0 || chosen !== 0 || players.length < 2 || !window.Progress || !window.Progress.needsTutorial()) return -1;
  return idx;
}
function updateTutNote() {
  $('tut-note').style.display = myId === hostId && firstGameTutorial() >= 0 ? 'block' : 'none';
}
$('level-select').addEventListener('change', updateTutNote);
$('btn-start').onclick = () => {
  setError('');
  const tutIdx = firstGameTutorial();
  send({ t: 'start', level: tutIdx >= 0 ? tutIdx : Number($('level-select').value) || 0 });
};

$('btn-copy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${roomCode}`;
  try {
    await navigator.clipboard.writeText(url);
    $('btn-copy').textContent = 'Lien copié !';
  } catch {
    $('btn-copy').textContent = url;
  }
};

function updateMuteButton() {
  $('btn-mute').textContent = window.Sfx.isMuted() ? 'Son : coupé (P)' : 'Son : activé (P)';
  $('btn-music').textContent = window.Sfx.musicEnabled() ? 'Musique : oui' : 'Musique : non';
  Custom.sync();
}
$('btn-mute').onclick = () => { window.Sfx.toggle(); updateMuteButton(); window.Sfx.play('click'); };
$('btn-music').onclick = () => { window.Sfx.toggleMusic(); updateMuteButton(); window.Sfx.play('click'); };
const volSlider = $('music-vol');
volSlider.value = window.Sfx.musicVolume();
volSlider.title = `Volume de la musique : ${volSlider.value} %`;
volSlider.oninput = () => {
  const v = window.Sfx.setMusicVolume(volSlider.value);
  volSlider.title = `Volume de la musique : ${v} %`;
  Custom.sync();
};
['change', 'pointerup'].forEach((ev) => volSlider.addEventListener(ev, () => volSlider.blur())); // le curseur ne garde pas le clavier : les flèches restent pour le personnage
[$('btn-mute'), $('btn-music')].forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
updateMuteButton();

// Lien d'invitation : ?room=ABCD pré-remplit le code
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('code').value = urlRoom.slice(0, 4).toUpperCase();

/* ---------- Clavier et souris ---------- */
// event.code = position physique : ZQSD sur AZERTY et WASD sur QWERTY donnent les mêmes codes
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
};
const input = { left: false, right: false, jump: false };

function sendInput() {
  send({ t: 'input', ...input, jp: jumpPresses });
}

function setKey(e, down) {
  const k = KEYS[e.code];
  if (!k) return;
  e.preventDefault();
  let changed = false;
  if (down && k === 'jump' && !e.repeat) {
    jumpPresses++;
    changed = true;
  }
  if (input[k] !== down) {
    input[k] = down;
    changed = true;
  }
  if (changed) sendInput();
}

function aimPoint() {
  // Sans souris, on vise droit devant soi
  const s = sprites.get(myId);
  if (mouse.has || !s) return { x: mouse.x, y: mouse.y };
  return { x: s.tx + PW / 2 + (s.face || 1) * 200, y: s.ty + PH / 2 };
}

function cast(slot) {
  if (!level || !level.cfg.abilities) return;
  const kit = myKit();
  if (slot === 2 && kit === 'archer' && !level.cfg.fire) return;
  if (slot === 3 && !(kit === 'mage' && level.cfg.swap)) return;
  const a = aimPoint();
  send({ t: 'cast', slot, x: a.x, y: a.y });
  const sound = kit === 'mage' ? ['orb', 'ice', 'swap'][slot - 1] : ['arrow', 'fire'][slot - 1];
  if (sound) window.Sfx.play(sound, 120);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' && !e.repeat && !(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) {
    window.Sfx.toggle();
    updateMuteButton();
    return;
  }
  if (!level) return;
  if (e.code === 'Escape' && $('help').classList.contains('show')) return hideHelp();
  if (e.code === 'KeyH' && !e.repeat) return $('help').classList.contains('show') ? hideHelp() : openHelpByHand();
  if (e.code === 'KeyI' && !e.repeat) return revealHint();
  if (/^(Digit|Numpad)[1-3]$/.test(e.code) && !e.repeat) return armSlot(Number(e.code.slice(-1)));
  const emo = e.ctrlKey || e.metaKey || e.altKey ? -1 : EMOTES.findIndex((m) => m.key === String(e.key).toLowerCase());
  if (emo >= 0) { if (!e.repeat) sendEmote(emo); return; }
  if (e.code === 'KeyT' && !e.repeat) return swapRoles();
  if (e.code === 'KeyF' && !e.repeat) return grabPartner();
  if (e.code === 'KeyR' && !e.repeat) return send({ t: 'restart' });
  if (e.code === 'KeyN' && !e.repeat) return send({ t: 'skip' }); // seul le chef de room est écouté
  if (e.code === 'KeyK' && !e.repeat) return cast(2);
  if (e.code === 'KeyE' && !e.repeat) return cast(3);
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyL') && !e.repeat) {
    e.preventDefault();
    return send({ t: 'dash' });
  }
  setKey(e, true);
});
window.addEventListener('keyup', (e) => {
  if (level) setKey(e, false);
});
window.addEventListener('blur', () => {
  input.left = input.right = input.jump = false;
  sendInput();
});

const canvas = $('canvas');
let ctx = canvas.getContext('2d'); // 'let' : on le remplace un instant pour pré-dessiner les petits sprites (voir cachedSprite)
const mainCtx = ctx;

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * LW) / r.width, y: ((e.clientY - r.top) * LH) / r.height };
}
canvas.addEventListener('mousemove', (e) => {
  Object.assign(mouse, canvasPoint(e), { has: true });
});
canvas.addEventListener('mousedown', (e) => {
  if (!level) return;
  e.preventDefault();
  Object.assign(mouse, canvasPoint(e), { has: true });
  if (e.button === 2 && (e.ctrlKey || e.metaKey)) return sendMark(); // Ctrl + clic droit : « regarde ici », pas un sort
  if (e.button === 0) cast(slotAvailable(armed) ? armed : 1);
  if (e.button === 2) cast(2);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------- Rendu : éléments du décor ---------- */
function setupCanvas() {
  LW = level.rows[0].length * level.tile;
  LH = level.rows.length * level.tile;
  canvas.width = LW * RES;
  canvas.height = LH * RES;
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

/* ---------- Rendu : éléments du niveau (style cartoon lisse) ---------- */
const TAU = Math.PI * 2;
const OUTLINE = '#1d1a3b';

// Lueur additive (sprite pré-calculé, très peu coûteux)
function glowAt(x, y, r, color, a) {
  if (fxLow) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  window.Themes.halo(ctx, x, y, r, color, a);
  ctx.restore();
}
function rrPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fillOut(fill, lw, out) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw || 1.6;
  ctx.strokeStyle = out || OUTLINE;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}
function vGrad(y0, y1, c0, c1) {
  const k = ctx.createLinearGradient(0, y0, 0, y1);
  k.addColorStop(0, c0);
  k.addColorStop(1, c1);
  return k;
}
function sparkle4(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function drawShape(kind, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (kind === 0) {
    ctx.arc(cx, cy, size, 0, TAU);
  } else if (kind === 1) {
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size, cy + size * 0.8);
    ctx.lineTo(cx - size, cy + size * 0.8);
    ctx.closePath();
  } else {
    rrPath(cx - size * 0.85, cy - size * 0.85, size * 1.7, size * 1.7, 1.5);
  }
  ctx.fill();
}

// Petits éléments qui ne changent presque pas : dessinés une fois dans un mini-canvas, puis simplement collés à chaque image.
const spriteCache = new Map();
function cachedSprite(key, w, h, ox, oy, fn) {
  let c = spriteCache.get(key);
  if (!c) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * RES);
    cv.height = Math.ceil(h * RES);
    const g = cv.getContext('2d');
    g.scale(RES, RES);
    g.translate(ox, oy);
    const keepFrame = frame;
    ctx = g;
    try { fn(); } finally { ctx = mainCtx; frame = keepFrame; }
    c = { cv, ox, oy, w, h };
    spriteCache.set(key, c);
  }
  return c;
}
function blitSprite(c, x, y) {
  ctx.drawImage(c.cv, x - c.ox, y - c.oy, c.w, c.h);
}

function drawGate(x, y, T, group, isOpen) {
  const tx = x / T;
  const ty = y / T;
  const ch = String.fromCharCode(96 + group);
  const up = !!(level.rows[ty - 1] && level.rows[ty - 1][tx] === ch);
  const down = !!(level.rows[ty + 1] && level.rows[ty + 1][tx] === ch);
  // l'animation (rayures, pointillés) tourne par pas de 2 images : 40 positions, qui bouclent exactement
  const phase = (Math.floor(frame / 2) % 40) * 2;
  const spr = cachedSprite(`gate|${group}|${up}|${down}|${isOpen}|${phase}`, T + 8, T + 8, 4, 4, () => {
    frame = phase;
    drawGateBody(0, 0, T, group, isOpen, up, down);
  });
  blitSprite(spr, x, y);
  // la lueur (coûteuse) n'est dessinée que sur une case sur deux, un peu plus large
  if (!isOpen && ty % 2 === 0) glowAt(x + T / 2, y + T, 36, GROUP_COLORS[group], 0.5 + Math.sin(frame * 0.12 + y) * 0.1);
}

function drawGateBody(x, y, T, group, isOpen, up, down) {
  const color = GROUP_COLORS[group];
  const cap = (cy) => {
    rrPath(x + 3, cy, T - 6, 7, 3);
    fillOut(vGrad(cy, cy + 7, '#8a90c4', '#4a4f82'), 1.5);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + T / 2, cy + 3.5, 1.9, 0, TAU);
    ctx.fill();
  };
  if (isOpen) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.lineDashOffset = -frame * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + T / 2, y);
    ctx.lineTo(x + T / 2, y + T);
    ctx.stroke();
    ctx.restore();
    if (!up) cap(y);
    if (!down) cap(y + T - 7);
    return;
  }
  const y0 = y - (up ? 1 : 0);
  const hh = T + (up ? 1 : 0) + (down ? 1 : 0);
  ctx.save();
  rrPath(x + 6, y0, T - 12, hh, 3);
  const gx = ctx.createLinearGradient(x + 6, 0, x + T - 6, 0);
  gx.addColorStop(0, `${color}99`);
  gx.addColorStop(0.5, `${color}ee`);
  gx.addColorStop(1, `${color}99`);
  ctx.fillStyle = gx;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 3;
  const off = (frame * 0.7) % 14;
  for (let i = -T; i < T + 14; i += 14) {
    ctx.beginPath();
    ctx.moveTo(x + 4, y + i + off + 14);
    ctx.lineTo(x + T - 4, y + i + off);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillRect(x + T / 2 - 1, y0, 2, hh);
  ctx.restore();
  rrPath(x + 6, y0, T - 12, hh, 3);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  if (!up) cap(y);
  if (!down) cap(y + T - 7);
}

function drawShutter(x, y, T, group, isOpen) {
  const color = GROUP_COLORS[group];
  if (isOpen) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    rrPath(x + 2, y + 2, T - 4, T - 4, 4);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = color;
    [[6, 6], [T - 6, 6], [6, T - 6], [T - 6, T - 6]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 1.4, 0, TAU);
      ctx.fill();
    });
    return;
  }
  rrPath(x + 1, y + 1, T - 2, T - 2, 4);
  fillOut(vGrad(y, y + T, '#3a3a76', '#242450'), 1.6);
  for (let i = 0; i < 3; i++) {
    const by = y + 5 + i * 9;
    rrPath(x + 4, by, T - 8, 6, 2);
    fillOut(vGrad(by, by + 6, color, `${color}99`), 1.2);
  }
  glowAt(x + T / 2, y + T / 2, 24, color, 0.25);
}

function drawPlate(x, y, T, group, isPressed) {
  const color = GROUP_COLORS[group];
  const h = isPressed ? 3 : 8;
  rrPath(x + 2, y + T - 7, T - 4, 7, 3);
  fillOut(vGrad(y + T - 7, y + T, '#4a4f82', '#2a2a58'), 1.5);
  rrPath(x + 6, y + T - 7 - h, T - 12, h + 1, 3);
  fillOut(vGrad(y + T - 7 - h, y + T - 6, Skins.shade(color, 0.4), color), 1.5);
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.fillRect(x + 9, y + T - 6 - h, T - 18, 1.6);
  if (isPressed) glowAt(x + T / 2, y + T - 8, 22, color, 0.6);
}

function drawKey(k, frame) {
  const bob = Math.sin(frame * 0.07 + k.x) * 2.2;
  const cx = k.x + 16;
  const cy = k.y + 16 + bob;
  glowAt(cx, cy, 24 + Math.sin(frame * 0.1) * 3, '#ffd24a', 0.6);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.45 + Math.sin(frame * 0.05) * 0.12);
  ctx.beginPath();
  ctx.arc(0, -8, 6.4, 0, TAU);
  ctx.arc(0, -8, 2.7, 0, TAU, true);
  fillOut(vGrad(-14, -2, '#fff0a0', '#e8aa00'), 1.6);
  rrPath(-2.2, -2, 4.4, 17, 1.6);
  fillOut(vGrad(-2, 15, '#ffe27a', '#d89a00'), 1.5);
  rrPath(2, 7, 5.5, 3.2, 1);
  fillOut('#f2bf24', 1.3);
  rrPath(2, 12, 4.5, 3.2, 1);
  fillOut('#f2bf24', 1.3);
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.beginPath();
  ctx.ellipse(-3, -11, 1.5, 0.9, -0.6, 0, TAU);
  ctx.fill();
  ctx.restore();
  const tw = (frame * 0.05 + k.x) % 1;
  if (tw < 0.5) sparkle4(cx + 9, cy - 13, 4.5 * Math.sin(tw * Math.PI * 2), '#fff7c0');
}

// Étoile cachée : facultative, une par niveau. Pâle si elle est déjà dans ta collection.
function drawStar(s, frame, owned) {
  const bob = Math.sin(frame * 0.06 + s.x) * 2.6;
  const cx = s.x + 16;
  const cy = s.y + 16 + bob;
  const pulse = 1 + Math.sin(frame * 0.12) * 0.07;
  ctx.save();
  if (owned) ctx.globalAlpha = 0.5;
  glowAt(cx, cy, 30 + Math.sin(frame * 0.1) * 4, '#ffe27a', owned ? 0.35 : 0.75);
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(frame * 0.04) * 0.18);
  ctx.scale(pulse, pulse);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 13 : 5.6;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  fillOut(vGrad(-13, 12, '#fff6b0', '#ffb62e'), 1.8);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath();
  ctx.ellipse(-3, -4, 2.2, 1.2, -0.7, 0, TAU);
  ctx.fill();
  ctx.restore();
  const tw = (frame * 0.045 + s.x) % 1;
  if (tw < 0.45 && !owned) sparkle4(cx + 12, cy - 12, 4.2 * Math.sin((tw / 0.45) * Math.PI), '#ffffff');
}

function drawDoor(d, T, isOpen, inside, total, frame) {
  const cx = d.x + T / 2;
  const x0 = d.x + 2;
  const x1 = d.x + T - 2;
  const base = d.y + T;
  const rad = (x1 - x0) / 2;
  const arch = (inset) => {
    ctx.beginPath();
    ctx.moveTo(x0 + inset, base);
    ctx.lineTo(x0 + inset, d.y + 12);
    ctx.arc(cx, d.y + 12, rad - inset, Math.PI, 0);
    ctx.lineTo(x1 - inset, base);
    ctx.closePath();
  };
  if (isOpen) glowAt(cx, d.y + T / 2, 44, '#ffd24a', 0.55 + Math.sin(frame * 0.1) * 0.12);
  arch(0);
  fillOut(vGrad(d.y, base, '#b9b6e0', '#7a77aa'), 1.8);
  // clef de voûte et joints de pierre
  ctx.strokeStyle = 'rgba(29,26,59,.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, d.y - 4);
  ctx.lineTo(cx, d.y + 1);
  ctx.moveTo(x0, d.y + 20);
  ctx.lineTo(x0 + 3, d.y + 20);
  ctx.moveTo(x1, d.y + 20);
  ctx.lineTo(x1 - 3, d.y + 20);
  ctx.stroke();
  ctx.save();
  arch(4);
  ctx.clip();
  if (isOpen) {
    const k = ctx.createRadialGradient(cx, d.y + 18, 2, cx, d.y + 18, 22);
    k.addColorStop(0, '#fffbe0');
    k.addColorStop(0.5, '#ffd86a');
    k.addColorStop(1, '#e89a1c');
    ctx.fillStyle = k;
    ctx.fillRect(d.x, d.y - 4, T, T + 4);
    ctx.save();
    ctx.translate(cx, d.y + 18);
    ctx.rotate(frame * 0.02);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 6; i++) {
      ctx.rotate(TAU / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-4, -26);
      ctx.lineTo(4, -26);
      ctx.fill();
    }
    ctx.restore();
  } else {
    ctx.fillStyle = vGrad(d.y, base, '#8a5a32', '#5a3a1e');
    ctx.fillRect(d.x, d.y, T, T);
    ctx.strokeStyle = 'rgba(30,16,6,.5)';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(d.x + 8 + i * 5, d.y + 2);
      ctx.lineTo(d.x + 8 + i * 5, base);
      ctx.stroke();
    }
    ctx.fillStyle = '#3a3a5a';
    ctx.fillRect(d.x, d.y + 14, T, 3);
    ctx.fillRect(d.x, d.y + 26, T, 3);
  }
  ctx.restore();
  arch(4);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  if (isOpen) {
    ctx.font = '700 12px Nunito, sans-serif';
    ctx.textAlign = 'center';
    outlinedText(`${inside}/${total}`, cx, d.y - 8, '#f3efe4');
  } else {
    // serrure dorée
    ctx.beginPath();
    ctx.arc(cx, d.y + 21, 4.2, 0, TAU);
    fillOut('#ffd24a', 1.4);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(cx - 0.9, d.y + 20, 1.8, 5);
    ctx.beginPath();
    ctx.arc(cx, d.y + 20, 1.3, 0, TAU);
    ctx.fill();
  }
}

function outlinedText(text, x, y, fill) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = 'rgba(14, 10, 40, .85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawCrystal(c, T, active, seqShape, seqDone, flash, frame) {
  const cx = c.x + T / 2;
  const cy = c.y + T / 2 + Math.sin(frame * 0.06 + c.x) * 1.8;
  const color = seqShape >= 0 ? (flash ? '#ff5050' : seqDone ? '#9be564' : '#b79cff') : GROUP_COLORS[c.group];
  glowAt(cx, cy, active ? 40 + Math.sin(frame * 0.2) * 3 : 24, color, active ? 0.75 : 0.35);
  const P = [[0, -14], [10.5, -6.5], [10.5, 7], [0, 14.5], [-10.5, 7], [-10.5, -6.5]];
  ctx.beginPath();
  P.forEach(([px, py], i) => ctx[i ? 'lineTo' : 'moveTo'](cx + px, cy + py));
  ctx.closePath();
  fillOut(vGrad(cy - 14, cy + 14, Skins.shade(color, 0.45), Skins.shade(color, -0.12)), 1.8);
  ctx.fillStyle = 'rgba(255,255,255,.42)'; // facette éclairée
  ctx.beginPath();
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx - 10.5, cy - 6.5);
  ctx.lineTo(cx - 10.5, cy + 3);
  ctx.lineTo(cx, cy - 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.16)'; // facette dans l'ombre
  ctx.beginPath();
  ctx.moveTo(cx, cy - 3);
  ctx.lineTo(cx + 10.5, cy - 6.5);
  ctx.lineTo(cx + 10.5, cy + 7);
  ctx.lineTo(cx, cy + 14.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(29,26,59,.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 3);
  ctx.lineTo(cx, cy + 14.5);
  ctx.moveTo(cx, cy - 3);
  ctx.lineTo(cx - 10.5, cy + 3);
  ctx.moveTo(cx, cy - 3);
  ctx.lineTo(cx + 10.5, cy - 6.5);
  ctx.stroke();
  if (active) {
    for (let i = 0; i < 3; i++) {
      const a = frame * 0.06 + (i * TAU) / 3;
      sparkle4(cx + Math.cos(a) * 18, cy + Math.sin(a) * 14, 2.6 + Math.sin(frame * 0.2 + i) * 1.2, '#ffffff');
    }
  }
  if (seqShape >= 0) drawShape(seqShape, cx, cy + 1, 4.6, OUTLINE);
}

function drawTarget(t, T, active) {
  const cx = t.x + T / 2;
  const cy = t.y + T / 2;
  if (active) glowAt(cx, cy, 30, '#9be564', 0.65);
  ctx.fillStyle = '#8a5a30'; // petit pied de bois
  ctx.fillRect(cx - 2, cy + 11, 4, 6);
  const rings = [[14.5, GROUP_COLORS[t.group]], [10.5, '#f6f2e8'], [6.5, active ? '#9be564' : '#ff5a5a'], [2.7, '#f6f2e8']];
  rings.forEach(([r, col], i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    if (i === 0) fillOut(col, 1.8);
    else {
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(29,26,59,.45)';
      ctx.stroke();
    }
  });
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath();
  ctx.ellipse(cx - 6, cy - 8, 4, 1.8, -0.7, 0, TAU);
  ctx.fill();
}

function drawCheckpoint(c, T, active, frame, half) {
  const col = active ? '#9be564' : half ? '#ffb347' : '#8a86bc';
  if (active) glowAt(c.x + 23, c.y + 10, 28, '#9be564', 0.5);
  rrPath(c.x + 13.5, c.y + 3, 3.4, T - 3, 1.5);
  fillOut('#e0e3f6', 1.4);
  ctx.beginPath();
  ctx.arc(c.x + 15.2, c.y + 3, 3.1, 0, TAU);
  fillOut('#ffd24a', 1.4);
  const wave = active ? Math.sin(frame * 0.15) : 0.2;
  ctx.beginPath();
  ctx.moveTo(c.x + 17, c.y + 6);
  ctx.bezierCurveTo(c.x + 22, c.y + 4 + wave * 2.4, c.x + 25, c.y + 9 - wave * 2.4, c.x + 31, c.y + 8 + wave * 1.4);
  ctx.lineTo(c.x + 27, c.y + 12.5 + wave);
  ctx.lineTo(c.x + 31, c.y + 17 + wave * 1.4);
  ctx.bezierCurveTo(c.x + 25, c.y + 18 - wave * 2.4, c.x + 22, c.y + 13 + wave * 2.4, c.x + 17, c.y + 15);
  ctx.closePath();
  fillOut(col, 1.5);
  if (active) sparkle4(c.x + 23, c.y + 11, 2.6 + Math.sin(frame * 0.2) * 1, '#fff');
}

function drawSpikes(x, y, T, theme) {
  const hot = theme === 'forge';
  blitSprite(cachedSprite(`spikes|${hot}`, T + 4, T + 4, 2, 2, () => drawSpikesBody(0, 0, T, hot)), x, y);
}

function drawSpikesBody(x, y, T, hot) {
  rrPath(x + 1, y + T - 5, T - 2, 5, 2);
  fillOut('#4a4f7a', 1.4);
  for (let i = 0; i < 3; i++) {
    const bx = x + 2 + i * 10;
    ctx.beginPath();
    ctx.moveTo(bx, y + T - 4);
    ctx.lineTo(bx + 5, y + T - 18);
    ctx.lineTo(bx + 10, y + T - 4);
    ctx.closePath();
    const k = ctx.createLinearGradient(bx, 0, bx + 10, 0);
    k.addColorStop(0, hot ? '#f0c8b0' : '#f4f6ff');
    k.addColorStop(1, hot ? '#a07a66' : '#8d93b8');
    fillOut(k, 1.5);
    ctx.fillStyle = hot ? '#ff7a3a' : 'rgba(255,255,255,.75)';
    ctx.beginPath();
    ctx.arc(bx + 5, y + T - 15.5, 1.4, 0, TAU);
    ctx.fill();
  }
}

function drawRune(x, y, T, hover, ok) {
  const col = hover ? (ok ? '#9be564' : '#ff6b6b') : '#b79cff';
  const pulse = 0.55 + Math.sin(frame * 0.08 + x * 0.1) * 0.25;
  glowAt(x + T / 2, y + T / 2, 22, col, pulse * (hover ? 1.1 : 0.55));
  ctx.save();
  rrPath(x + 3, y + 3, T - 6, T - 6, 6);
  ctx.setLineDash([5, 4]);
  ctx.lineDashOffset = -frame * 0.25;
  ctx.strokeStyle = col;
  ctx.globalAlpha = hover ? 1 : 0.55 + pulse * 0.4;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 16, y + 9);
  ctx.lineTo(x + 16, y + 23);
  ctx.moveTo(x + 9, y + 16);
  ctx.lineTo(x + 23, y + 16);
  ctx.stroke();
  ctx.restore();
}

/* ---------- Coopération : blocs liés, ponts synchro, fil, porter ---------- */
function chainIcon(cx, cy, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  rrPath(cx - 8, cy - 4.5, 10, 9, 4.5);
  ctx.stroke();
  rrPath(cx - 2, cy - 4.5, 10, 9, 4.5);
  ctx.stroke();
}

function drawLinkBlock(x, y, T, on, ratio, frame) {
  const warn = on && ratio > 0.82;
  if (warn && Math.floor(frame / 5) % 2 === 0 && ratio > 0.93) return; // clignote : rupture imminente
  const state = !on ? 'off' : warn ? 'warn' : 'on';
  const spr = cachedSprite(`link|${state}`, T + 4, T + 4, 2, 2, () => {
    if (state === 'off') { // fantôme : le bloc reviendra si vous vous rapprochez
      ctx.globalAlpha = 0.55;
      rrPath(2.5, 2.5, T - 5, T - 5, 5);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#7be0b0';
      ctx.stroke();
      ctx.setLineDash([]);
      chainIcon(T / 2, T / 2, 'rgba(123,224,176,.6)');
      return;
    }
    const hi = state === 'warn' ? '#ffc27a' : '#9bf5cc';
    const lo = state === 'warn' ? '#e0663a' : '#2f9e7a';
    rrPath(0.5, 0.5, T - 1, T - 1, 5);
    fillOut(vGrad(0, T, hi, lo), 1.8, state === 'warn' ? '#7a2e14' : '#17594a');
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.fillRect(4, 3, T - 8, 3);
    chainIcon(T / 2, T / 2 + 1, 'rgba(255,255,255,.9)');
  });
  blitSprite(spr, x, y);
}

function drawSyncBlock(x, y, T, ticks, frame) {
  const on = ticks > 0;
  if (on && ticks < 50 && Math.floor(frame / 4) % 2 === 0) return; // bientôt fini : clignote
  const spr = cachedSprite(`sync|${on}`, T + 4, T + 4, 2, 2, () => {
    if (!on) {
      ctx.globalAlpha = 0.6;
      rrPath(2.5, 2.5, T - 5, T - 5, 5);
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffd24a';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,210,74,.55)';
      ctx.beginPath();
      ctx.moveTo(T / 2, T / 2 - 9);
      ctx.lineTo(T / 2 + 6, T / 2 + 2);
      ctx.lineTo(T / 2 - 6, T / 2 + 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(T / 2, T / 2 - 1);
      ctx.lineTo(T / 2 + 6, T / 2 + 10);
      ctx.lineTo(T / 2 - 6, T / 2 + 10);
      ctx.closePath();
      ctx.fill();
      return;
    }
    rrPath(0.5, 0.5, T - 1, T - 1, 5);
    fillOut(vGrad(0, T, '#fff3b0', '#e8a523'), 1.8, '#7a4a10');
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(4, 3, T - 8, 3);
    sparkle4(T / 2, T / 2 + 1, 7, 'rgba(255,255,255,.95)');
  });
  blitSprite(spr, x, y);
  if (on) glowAt(x + T / 2, y + T / 2, 26, '#ffd24a', 0.35);
}

// Le fil qui relie les joueurs (niveaux avec blocs liés) : vert, jaune puis rouge à l'approche de la rupture
function drawTether() {
  const ids = players.map((p) => p.id).filter((id) => sprites.has(id)).sort();
  if (ids.length < 2) return;
  const r = world.ld;
  const broken = !world.lk;
  const col = broken ? '#ff5a5a' : r > 0.82 ? '#ff7a4a' : r > 0.62 ? '#ffd24a' : '#7bf0b0';
  for (let i = 0; i < ids.length - 1; i++) {
    const a = sprites.get(ids[i]);
    const b = sprites.get(ids[i + 1]);
    const ax = a.x + PW / 2;
    const ay = a.y + PH * 0.55;
    const bx = b.x + PW / 2;
    const by = b.y + PH * 0.55;
    const d = Math.hypot(bx - ax, by - ay);
    const sag = Math.max(0, 1 - d / 224) * 26; // le fil pend quand il est lâche, se tend en s'éloignant
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(14,10,40,.7)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = broken ? 2 : 3;
    if (broken || r > 0.82) ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -frame * 0.8;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by);
    ctx.stroke();
    ctx.restore();
  }
}

// Jauge du lien, indications de saut synchro, "F" pour porter, trajectoire du lancer
function drawCoopOverlay(mine) {
  const cfg = level.cfg;
  const W = LW;
  ctx.save();
  ctx.textAlign = 'center';
  if (cfg.link && players.length >= 2) {
    const r = Math.min(1.2, world.ld);
    const broken = !world.lk;
    const col = broken ? '#ff5a5a' : r > 0.82 ? '#ff7a4a' : r > 0.62 ? '#ffd24a' : '#7bf0b0';
    const bw = 150;
    const bx = W / 2 - bw / 2;
    const by = 40;
    rrPath(bx - 3, by - 3, bw + 6, 12, 6);
    ctx.fillStyle = 'rgba(14,10,40,.7)';
    ctx.fill();
    rrPath(bx, by, Math.max(6, bw * Math.min(1, r)), 6, 3);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.font = '700 11px Nunito, sans-serif';
    const msg = broken ? 'LIEN ROMPU : rapprochez-vous !' : r > 0.82 ? 'Attention : trop loin !' : 'Lien entre vous';
    if (!broken || Math.floor(frame / 12) % 2 === 0) outlinedText(msg, W / 2, by - 7, col);
  }
  if (cfg.sync && players.length >= 2) {
    if (world.sy > 0) {
      const bw = 150;
      const bx = W / 2 - bw / 2;
      rrPath(bx - 3, 37, bw + 6, 12, 6);
      ctx.fillStyle = 'rgba(14,10,40,.7)';
      ctx.fill();
      rrPath(bx, 40, Math.max(4, bw * Math.min(1, world.sy / Phys.COOP.syncHold)), 6, 3);
      ctx.fillStyle = '#ffd24a';
      ctx.fill();
      ctx.font = '700 11px Nunito, sans-serif';
      outlinedText('PONT ACTIF : courez !', W / 2, 33, '#ffe08a');
    } else {
      ctx.font = '700 11px Nunito, sans-serif';
      outlinedText('Sautez ENSEMBLE pour faire apparaître le pont', W / 2, 36, '#ffe08a');
    }
    // un joueur a sauté : on l'indique, et on invite l'autre à sauter vite
    const waiting = players.filter((p) => (world.jw.get(p.id) || 0) > 0);
    if (world.sy <= 0 && waiting.length > 0 && waiting.length < players.length) {
      players.forEach((p) => {
        const s = sprites.get(p.id);
        if (!s) return;
        const left = world.jw.get(p.id) || 0;
        const cx = s.x + PW / 2;
        if (left > 0) { // a déjà sauté : anneau qui se vide
          ctx.beginPath();
          ctx.arc(cx, s.y + PH / 2, 22, -Math.PI / 2, -Math.PI / 2 + (left / 20) * TAU);
          ctx.strokeStyle = '#ffd24a';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else { // doit sauter maintenant !
          ctx.font = '800 14px Nunito, sans-serif';
          outlinedText('SAUTE !', cx, s.y - 30 - Math.abs(Math.sin(frame * 0.3)) * 4, '#ffd24a');
        }
      });
    }
  }
  if (cfg.carry && players.length >= 2 && world.status === 'playing' && mine) {
    const iCarry = world.cy.find((c) => c[0] === myId);
    const iAmCarried = world.cy.find((c) => c[1] === myId);
    ctx.font = '800 13px Nunito, sans-serif';
    if (iAmCarried) {
      outlinedText('Espace : descendre', mine.x + PW / 2, mine.y - 26, '#ffffff');
    } else if (iCarry) {
      outlinedText('F : lancer !', mine.x + PW / 2, mine.y - PH - 34, '#ffd24a');
      // trajectoire du lancer
      const st = Phys.newPlayerState('plain');
      st.x = mine.tx;
      st.y = mine.ty - PH;
      st.vy = Phys.COOP.throwVy;
      st.vx = (mine.face || 1) * Phys.COOP.throwVx;
      ctx.fillStyle = '#ffd24a';
      for (let i = 0; i < 90; i++) {
        Phys.stepPlayer(level.L, st);
        if (i % 3 === 0) {
          ctx.globalAlpha = 0.8 * (1 - i / 110);
          ctx.beginPath();
          ctx.arc(st.x + PW / 2, st.y + PH / 2, 2.6, 0, TAU);
          ctx.fill();
        }
        if (st.onGround && i > 4) break;
      }
      ctx.globalAlpha = 1;
    } else {
      // "F" au-dessus du coéquipier s'il est assez près pour être porté
      players.forEach((p) => {
        if (p.id === myId) return;
        const s = sprites.get(p.id);
        if (!s || world.cy.some((c) => c[1] === p.id || c[0] === p.id)) return;
        const dx = Math.abs(s.tx - mine.tx);
        const dy = s.ty - mine.ty;
        if (dx <= Phys.COOP.grabReach && dy >= -PH - 8 && dy <= 10) {
          const b = Math.sin(frame * 0.2) * 2;
          outlinedText('F : porter', s.x + PW / 2, s.y - 50 + b, '#ffffff');
        }
      });
    }
  }
  ctx.restore();
}

function drawIce(b, T, frame) {
  const [tx, ty, left] = b;
  if (left < 90 && Math.floor(frame / 6) % 2 === 0) return; // clignote juste avant de fondre
  const pad = Phys.ICE_PAD || 0; // la glace déborde un peu de chaque côté (voir physics.js)
  const x = tx * T - pad;
  const y = ty * T;
  const W = T + 2 * pad;
  glowAt(x + W / 2, y + T / 2, 30 + pad, '#a0e1ff', 0.3);
  rrPath(x + 0.5, y + 0.5, W - 1, T - 1, 5);
  fillOut(vGrad(y, y + T, 'rgba(226,247,255,.96)', 'rgba(120,200,240,.94)'), 1.8, '#2f6a96');
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 4);
  ctx.lineTo(x + 16, y + 4);
  ctx.lineTo(x + 4, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + T - 6);
  ctx.lineTo(x + 20, y + 14);
  ctx.lineTo(x + W - 5, y + 18);
  ctx.stroke();
  if (frame % 9 === 0) addPart({ x: x + Math.random() * W, y: y + Math.random() * T, vx: 0, vy: -0.2, g: 0, life: 20, max: 20, color: '#ffffff', size: 2.5, shape: 'star', add: true });
}

function drawSpring(x, y, T, anim) {
  const squash = anim > 0 ? Math.sin((anim / 14) * Math.PI) : 0;
  const coilH = 15 - squash * 8 + (anim > 7 ? 4 : 0);
  rrPath(x + 4, y + T - 6, T - 8, 6, 2.5);
  fillOut('#5a5f8a', 1.5);
  const top = y + T - 6 - coilH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 9, y + T - 6);
  for (let i = 0; i < 4; i++) {
    ctx.lineTo(x + 23, top + coilH - (i * coilH) / 4 - coilH / 8);
    ctx.lineTo(x + 9, top + coilH - ((i + 1) * coilH) / 4);
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 5.4;
  ctx.stroke();
  ctx.strokeStyle = '#dfe4f4';
  ctx.lineWidth = 3;
  ctx.stroke();
  rrPath(x + 3, top - 6, T - 6, 7, 3.2);
  fillOut(vGrad(top - 6, top + 1, '#ffd05a', '#f08a10'), 1.6);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillRect(x + 7, top - 4.6, T - 14, 1.8);
  if (anim > 6) glowAt(x + T / 2, top - 4, 26, '#ffd05a', 0.6);
}

function drawWood(x, y, T, burning, frame) {
  if (!burning) return blitSprite(cachedSprite('wood', T + 4, T + 4, 2, 2, () => drawWoodBody(0, 0, T, false, 0)), x, y);
  drawWoodBody(x, y, T, burning, frame);
}

function drawWoodBody(x, y, T, burning, frame) {
  rrPath(x + 0.5, y + 0.5, T - 1, T - 1, 3);
  fillOut(vGrad(y, y + T, burning ? '#8a4524' : '#d09550', burning ? '#5a2a14' : '#9c6531'), 1.8, '#3a2210');
  ctx.strokeStyle = burning ? 'rgba(30,10,4,.6)' : 'rgba(70,40,14,.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 11);
  ctx.lineTo(x + T - 1, y + 11);
  ctx.moveTo(x + 1, y + 22);
  ctx.lineTo(x + T - 1, y + 22);
  ctx.stroke();
  ctx.strokeStyle = burning ? 'rgba(30,10,4,.35)' : 'rgba(90,55,20,.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 5);
  ctx.quadraticCurveTo(x + 14, y + 3, x + 22, y + 6);
  ctx.moveTo(x + 8, y + 16);
  ctx.quadraticCurveTo(x + 18, y + 18, x + 26, y + 15);
  ctx.moveTo(x + 5, y + 27);
  ctx.quadraticCurveTo(x + 12, y + 25, x + 20, y + 28);
  ctx.stroke();
  ctx.fillStyle = burning ? '#2a1208' : '#5a4220';
  [[5, 5], [T - 5, 5], [5, T - 5], [T - 5, T - 5]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, 1.3, 0, TAU);
    ctx.fill();
  });
  if (burning) {
    glowAt(x + T / 2, y + T / 2, 40, '#ff8a2a', 0.65);
    for (let i = 0; i < 3; i++) {
      const fx = x + 6 + i * 10;
      const h = 11 + Math.sin(frame * 0.4 + i * 2 + x) * 5;
      ctx.fillStyle = '#ff5a14';
      ctx.beginPath();
      ctx.moveTo(fx - 5, y + T);
      ctx.quadraticCurveTo(fx - 2, y + T - h, fx + Math.sin(frame * 0.3 + i) * 2, y + T - h * 2);
      ctx.quadraticCurveTo(fx + 3, y + T - h, fx + 5, y + T);
      ctx.fill();
      ctx.fillStyle = '#ffc23a';
      ctx.beginPath();
      ctx.moveTo(fx - 3, y + T);
      ctx.quadraticCurveTo(fx, y + T - h * 1.1, fx + 3, y + T);
      ctx.fill();
    }
    if (frame % 3 === 0) addPart({ x: x + Math.random() * T, y: y + 6, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random(), g: -0.01, life: 30, max: 30, color: '#ffb040', size: 3, add: true });
    if (frame % 7 === 0) addPart({ x: x + Math.random() * T, y: y, vx: (Math.random() - 0.5) * 0.4, vy: -0.7, g: -0.005, life: 40, max: 40, color: 'rgba(50,40,40,.5)', size: 7, shape: 'smoke' });
  }
}

function drawTorch(t, T, lit, frame) {
  const x = t.x;
  const y = t.y;
  const col = GROUP_COLORS[t.group];
  rrPath(x + 13, y + 14, 6, 17, 2);
  fillOut(vGrad(y + 14, y + 31, '#8a5a30', '#5a3a1e'), 1.5);
  ctx.beginPath();
  ctx.moveTo(x + 7, y + 11);
  ctx.lineTo(x + 25, y + 11);
  ctx.lineTo(x + 21, y + 21);
  ctx.lineTo(x + 11, y + 21);
  ctx.closePath();
  fillOut(vGrad(y + 11, y + 21, '#5a5a86', '#32325a'), 1.6);
  ctx.fillStyle = col;
  ctx.fillRect(x + 9, y + 12.5, 14, 3);
  if (!lit) {
    ctx.fillStyle = '#3a2a22';
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 10, 5, 2.6, 0, 0, TAU);
    ctx.fill();
    return;
  }
  glowAt(x + 16, y + 4, 56, '#ffaa3c', 0.6 + Math.sin(frame * 0.3 + x) * 0.08);
  const f = Math.sin(frame * 0.35 + x) * 2.5;
  ctx.fillStyle = '#ff5a14';
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 12);
  ctx.quadraticCurveTo(x + 7, y, x + 16 + f, y - 15);
  ctx.quadraticCurveTo(x + 25, y, x + 24, y + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffc23a';
  ctx.beginPath();
  ctx.moveTo(x + 11, y + 12);
  ctx.quadraticCurveTo(x + 10, y + 3, x + 16 - f * 0.5, y - 7);
  ctx.quadraticCurveTo(x + 22, y + 3, x + 21, y + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff4c0';
  ctx.beginPath();
  ctx.moveTo(x + 13.5, y + 12);
  ctx.quadraticCurveTo(x + 16, y + 1, x + 18.5, y + 12);
  ctx.closePath();
  ctx.fill();
  if (frame % 4 === 0) addPart({ x: x + 16 + (Math.random() - 0.5) * 6, y: y + 2, vx: (Math.random() - 0.5) * 0.4, vy: -1.1, g: -0.01, life: 28, max: 28, color: '#ffb040', size: 2.6, add: true });
}

function drawProjectile(pr, ticksAhead, frame) {
  const [kind, x0, y0, vx, vy] = pr;
  const x = x0 + vx * ticksAhead;
  const y = y0 + vy * ticksAhead;
  if (kind === 'orb') {
    glowAt(x, y, 26, '#b79cff', 0.8);
    const k = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 6.5);
    k.addColorStop(0, '#ffffff');
    k.addColorStop(1, '#c9b4ff');
    ctx.fillStyle = k;
    ctx.beginPath();
    ctx.arc(x, y, 6 + Math.sin(frame * 0.5) * 0.6, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(80,50,170,.7)';
    ctx.stroke();
    addPart({ x, y, vx: -vx * 0.04 + (Math.random() - 0.5) * 0.4, vy: -vy * 0.04 + (Math.random() - 0.5) * 0.4, g: 0, life: 20, max: 20, color: '#b79cff', size: 5, add: true });
  } else if (kind === 'swap') {
    glowAt(x, y, 24, '#ff9ad0', 0.7);
    for (let i = 0; i < 3; i++) {
      const a = frame * 0.5 + (i * TAU) / 3;
      ctx.fillStyle = i % 2 ? '#4dd8e8' : '#ff6b9d';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 3.4, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(29,26,59,.6)';
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, TAU);
    ctx.fill();
    addPart({ x, y, vx: 0, vy: 0, g: 0, life: 16, max: 16, color: frame % 4 ? '#4dd8e8' : '#ff6b9d', size: 4, add: true });
  } else {
    const a = Math.atan2(vy, vx);
    const fire = kind === 'fire';
    if (fire) glowAt(x, y, 30, '#ff8a2a', 0.8);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE; // hampe
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(3, 0);
    ctx.stroke();
    ctx.strokeStyle = '#e6c58a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath(); // empennage
    ctx.moveTo(-14, 0);
    ctx.lineTo(-9, -4);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-9, 4);
    ctx.closePath();
    fillOut(fire ? '#ff9a3a' : '#ff9ad0', 1.1);
    ctx.beginPath(); // pointe
    ctx.moveTo(8, 0);
    ctx.lineTo(1, -4);
    ctx.lineTo(1, 4);
    ctx.closePath();
    fillOut(fire ? '#ffd24a' : '#f6f2e8', 1.3);
    if (fire) {
      ctx.fillStyle = '#ff6a1a';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.quadraticCurveTo(15 + Math.sin(frame) * 2, -8, 3, 0);
      ctx.quadraticCurveTo(15, 8, 8, 0);
      ctx.fill();
    }
    ctx.restore();
    if (fire) addPart({ x, y, vx: (Math.random() - 0.5) * 0.5, vy: -0.4, g: -0.01, life: 22, max: 22, color: Math.random() < 0.5 ? '#ff8a2a' : '#ffd24a', size: 4, add: true });
    else if (frame % 2 === 0) addPart({ x, y, vx: 0, vy: 0, g: 0, life: 10, max: 10, color: 'rgba(255,255,255,.6)', size: 2.4 });
  }
}

// Bloc caché, révélé par la lumière
function drawHidden(x, y, T, a) {
  ctx.globalAlpha = Math.min(1, a * 1.6);
  rrPath(x + 0.5, y + 0.5, T - 1, T - 1, 5);
  fillOut(vGrad(y, y + T, '#9c80f2', '#5c3cc0'), 1.8);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fillRect(x + 4, y + 3, T - 8, 3);
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 18);
  ctx.lineTo(x + 20, y + 18);
  ctx.moveTo(x + 16, y + 14);
  ctx.lineTo(x + 16, y + 23);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Indice peint dans le décor : visible seulement pour le bon rôle, et seulement de près
function drawLabel(lb, T, lightSources) {
  const kit = myKit();
  if (lb.role && lb.role !== kit) return;
  const cx = lb.tx * T + T / 2;
  const cy = lb.ty * T + T / 2;
  let near = Infinity;
  for (const s of lightSources) near = Math.min(near, Math.hypot(s.x - cx, s.y - cy));
  if (near > lb.radius) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (lb.radius - near) / 40);
  const w = 24 + lb.shapes.length * 28;
  ctx.fillStyle = 'rgba(30, 30, 80, .92)';
  ctx.fillRect(cx - w / 2, cy - 22, w, 44);
  ctx.strokeStyle = '#b79cff';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - w / 2, cy - 22, w, 44);
  lb.shapes.forEach((k, i) => drawShape(k, cx - ((lb.shapes.length - 1) * 28) / 2 + i * 28, cy, 8, '#f3efe4'));
  ctx.restore();
}

/* ---------- Rendu : joueurs ---------- */
function easeOutBack(x) {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// Distance entre les pieds et le sol (pour l'ombre portée)
function groundBelow(s) {
  const T = level.tile;
  const L = level.L;
  const tx = Math.floor((s.x + PW / 2) / T);
  const y0 = Math.max(0, Math.floor((s.y + PH - 1) / T));
  for (let ty = y0; ty < L.h; ty++) {
    if (Phys.tileSolid(L, tx, ty)) return ty * T;
  }
  return null;
}

function drawShadow(s) {
  const gy = groundBelow(s);
  if (gy === null) return;
  const dist = gy - (s.y + PH);
  if (dist < -2 || dist > 220) return;
  const k = 1 - Math.min(1, Math.max(0, dist) / 220);
  ctx.save();
  ctx.fillStyle = `rgba(14, 8, 36, ${0.1 + 0.28 * k})`;
  ctx.beginPath();
  ctx.ellipse(s.x + PW / 2, gy - 1, 6 + 8 * k, 1.6 + 2.2 * k, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Fait évoluer l'animation d'un joueur (appelé une fois par image)
function stepSprite(s, p) {
  s.py = s.y;
  s.x += (s.tx - s.x) * 0.6; // lissage entre deux mises à jour serveur
  s.y += (s.ty - s.y) * 0.6;
  const walking = s.mv && !s.air;
  s.walk += ((walking ? 1 : 0) - s.walk) * 0.25;
  if (s.land > 0) s.land--;
  if (s.pop > 0) s.pop--;
  if (s.castT > 0) s.castT--;
  if (s.dashT > 0) {
    s.dashT--;
    // traînée de vitesse
    if (s.dashT % 2 === 0) {
      addPart({ x: s.x + PW / 2 - (s.face || 1) * 10, y: s.y + 6 + Math.random() * 18, vx: -(s.face || 1) * 1.2, vy: 0, g: 0, life: 14, max: 14, color: p.color, size: 4, shape: 'smoke', add: true });
    }
  }
  // petits pas de poussière en marchant
  if (walking && (frame + Math.floor(s.t)) % 10 === 0) dust(s.x + PW / 2 - (s.face || 1) * 4, s.y + PH, 1);
  // le regard suit la souris (soi) ou le coéquipier le plus proche
  let tx = 0;
  let ty = 0;
  if (p.id === myId && mouse.has) {
    tx = Math.max(-1, Math.min(1, (mouse.x - (s.x + PW / 2)) / 70));
    ty = Math.max(-1, Math.min(1, (mouse.y - (s.y + 8)) / 70));
  } else {
    let bd = 240;
    sprites.forEach((o, id) => {
      if (id === p.id) return;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d < bd) { bd = d; tx = Math.max(-1, Math.min(1, (o.x - s.x) / 60)); ty = Math.max(-1, Math.min(1, (o.y - s.y) / 60)); }
    });
  }
  s.lx += (tx - s.lx) * 0.15;
  s.ly += (ty - s.ly) * 0.15;
}


// Visages des emotes, dessinés à la main pour rester dans le style du jeu (pas de dépendance à la police d'emojis)
function drawFace(kind, x, y, r, t) {
  const u = r / 12;
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'laugh') ctx.rotate(Math.sin(t * 0.5) * 0.14);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  fillOut(vGrad(-r, r, '#ffe566', '#ffb52e'), 1.6);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'laugh') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.8 * u;
    [-4.4, 4.4].forEach((ex) => {
      ctx.beginPath();
      ctx.arc(ex * u, -2.4 * u, 2.6 * u, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(-6.4 * u, 1.4 * u);
    ctx.quadraticCurveTo(0, 13 * u, 6.4 * u, 1.4 * u);
    ctx.closePath();
    fillOut('#6a1f33', 1.3);
    ctx.fillStyle = '#ff7f95';
    ctx.beginPath();
    ctx.ellipse(0, 6.4 * u, 3.2 * u, 1.8 * u, 0, 0, TAU);
    ctx.fill();
    const k = (t * 0.06) % 1; // larmes de rire
    ctx.fillStyle = 'rgba(120, 214, 255, .95)';
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.ellipse(sd * (9.6 * u), (-0.5 + k * 5) * u, 1.5 * u, 2.2 * u, 0, 0, TAU);
      ctx.fill();
    });
  } else if (kind === 'shock') {
    const jit = Math.sin(t * 1.3) * 0.5 * u;
    [-4.4, 4.4].forEach((ex) => {
      ctx.beginPath();
      ctx.arc(ex * u, -2.2 * u, 3.3 * u, 0, TAU);
      fillOut('#ffffff', 1.1);
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.arc(ex * u + jit, -2.2 * u, 1.3 * u, 0, TAU);
      ctx.fill();
    });
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(-7.6 * u, -7 * u);
    ctx.lineTo(-2.2 * u, -8.8 * u);
    ctx.moveTo(2.2 * u, -8.8 * u);
    ctx.lineTo(7.6 * u, -7 * u);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 5.8 * u, 2.6 * u, 3.6 * u, 0, 0, TAU);
    fillOut('#6a1f33', 1.2);
    ctx.fillStyle = 'rgba(120, 214, 255, .95)'; // goutte de sueur
    ctx.beginPath();
    ctx.moveTo(9.4 * u, -9.6 * u);
    ctx.quadraticCurveTo(12.2 * u, -5.6 * u, 9.4 * u, -4.4 * u);
    ctx.quadraticCurveTo(6.6 * u, -5.6 * u, 9.4 * u, -9.6 * u);
    ctx.fill();
  } else {
    rrPath(-10 * u, -5.4 * u, 8.6 * u, 6 * u, 2.2 * u);
    fillOut('#1d1a3b', 1);
    rrPath(1.4 * u, -5.4 * u, 8.6 * u, 6 * u, 2.2 * u);
    fillOut('#1d1a3b', 1);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.moveTo(-1.5 * u, -3.6 * u);
    ctx.lineTo(1.5 * u, -3.6 * u);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(-8 * u, -4.4 * u);
    ctx.lineTo(-5.6 * u, -1.6 * u);
    ctx.moveTo(3.4 * u, -4.4 * u);
    ctx.lineTo(5.8 * u, -1.6 * u);
    ctx.stroke();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.moveTo(-4.4 * u, 5 * u);
    ctx.quadraticCurveTo(1.4 * u, 9 * u, 6.6 * u, 3.8 * u);
    ctx.stroke();
  }
  ctx.restore();
}

// Bulle de dialogue au-dessus d'un joueur : apparaît en rebondissant, flotte, puis s'efface
function drawEmote(p, cx, top, mine) {
  const em = emotes.get(p.id);
  if (!em) return;
  const def = EMOTES[em.n];
  const age = frame - em.f0;
  const LIFE = 170;
  if (!def || age > LIFE) { emotes.delete(p.id); return; }
  const pop = Math.max(0.01, easeOutBack(Math.min(1, age / 14)));
  ctx.save();
  ctx.font = '700 12px Nunito, sans-serif';
  const tw = ctx.measureText(def.text).width;
  const w = 8 + 24 + 6 + tw + 10;
  const h = 30;
  const bx = Math.max(3, Math.min(LW - w - 3, cx - w / 2));
  const by = top - (mine ? 32 : 22) - h + Math.sin(frame * 0.12) * 1.5;
  const tipX = Math.max(bx + 10, Math.min(bx + w - 10, cx));
  const tipY = by + h + 8;
  ctx.globalAlpha = Math.min(1, (LIFE - age) / 18);
  ctx.translate(tipX, tipY);
  ctx.scale(pop, pop);
  ctx.translate(-tipX, -tipY);
  rrPath(bx, by, w, h, 14);
  ctx.fillStyle = '#fffdf3';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tipX - 5, by + h - 1);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX + 5, by + h - 1);
  ctx.fillStyle = '#fffdf3';
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(tipX - 4, by + h - 2.4, 8, 2.8); // cache le trait entre la bulle et la pointe
  drawFace(def.face, bx + 8 + 12, by + h / 2, 11.5, frame);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2a2147';
  ctx.fillText(def.text, bx + 8 + 24 + 6, by + h / 2 + 1);
  ctx.restore();
}

function drawPlayer(p, s, frame) {
  const kit = level.cfg.abilities ? p.role : 'plain';
  const skin = p.skin || 'tasse';
  const casting = s.castT > 0;
  const dir = casting && Math.abs(Math.cos(s.castAng)) > 0.25 ? Math.sign(Math.cos(s.castAng)) : (s.face || 1);
  const vy = s.y - s.py;
  // étirement en saut, écrasement à l'arrivée, apparition en "pop"
  let sx = 1;
  let sy = 1;
  const stretch = Math.max(-0.1, Math.min(0.16, -vy * 0.012));
  sy += stretch;
  sx -= stretch * 0.5;
  if (s.land > 0) {
    const k = Math.sin((s.land / 9) * Math.PI) * 0.2;
    sy -= k;
    sx += k * 0.8;
  }
  if (s.pop > 0) {
    const k = Math.max(0.05, easeOutBack(1 - s.pop / 14));
    sx *= k;
    sy *= k;
  }
  const o = {
    dir, color: p.color, t: frame + s.t, kit, walk: s.walk, air: s.air, vy, dash: s.dashT > 0,
    look: { x: s.lx * dir, y: s.ly },
    cast: casting ? { ang: s.castAng, k: s.castT / 14 } : null,
  };
  const cx = s.x + PW / 2;
  const fy = s.y + PH;

  if (kit === 'mage') glowAt(cx, s.y + 6, 36, '#b79cff', 0.2 + (casting ? 0.3 : 0));

  if (s.dashT > 0) { // images rémanentes du dash
    for (let i = 1; i <= 3; i++) {
      ctx.save();
      ctx.globalAlpha = 0.28 - i * 0.07;
      Skins.draw(ctx, skin, s.x - dir * i * 9, s.y, Object.assign({}, o, { cast: null }));
      ctx.restore();
    }
  }
  ctx.save();
  if (world.iv && world.iv.includes(p.id)) ctx.globalAlpha = Math.floor(frame / 4) % 2 ? 0.35 : 0.85; // invincible après un coup : clignote
  ctx.translate(cx, fy);
  ctx.scale(sx, sy);
  ctx.translate(-cx, -fy);
  Skins.draw(ctx, skin, s.x, s.y, o);
  ctx.restore();

  ctx.font = '700 12px Nunito, sans-serif';
  ctx.textAlign = 'center';
  const mine = p.id === myId;
  const tag = mine ? `${p.name} (toi)` : p.name;
  const top = s.y - Skins.headroom(skin, kit) - 5;
  outlinedText(tag, cx, top, '#f3efe4');
  // rappel de la couleur du joueur sous son nom
  rrPath(cx - 9, top + 3, 18, 3, 1.5);
  ctx.fillStyle = p.color;
  ctx.fill();
  drawEmote(p, cx, top, mine);
  if (mine) { // petite flèche qui rebondit au-dessus de son propre personnage
    const b = Math.sin(frame * 0.12) * 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 4.5, top - 17 + b);
    ctx.lineTo(cx + 4.5, top - 17 + b);
    ctx.lineTo(cx, top - 11 + b);
    ctx.closePath();
    fillOut(p.color, 1.4);
  }
}

function drawAim(s) {
  const kit = myKit();
  if (kit === 'plain' || !mouse.has) return;
  const L = level.L;
  const T = level.tile;

  if (kit === 'mage') {
    // la glace se pose sur une rune à portée : on surligne la case visée
    const tx = Math.floor(mouse.x / T);
    const ty = Math.floor(mouse.y / T);
    if (L.rune[ty] && L.rune[ty][tx]) {
      const d = Math.hypot(tx * T + T / 2 - (s.x + PW / 2), ty * T + T / 2 - (s.y + PH / 2));
      drawRune(tx * T, ty * T, T, true, d <= Phys.SPELL.reach);
    }
  }

  if (kit === 'mage' && armed === 2) return; // la glace se pose directement sur la rune surlignée
  const kind = kit === 'mage' ? (armed === 3 ? 'swap' : 'orb') : (armed === 2 ? 'fire' : 'arrow');
  const path = Phys.projectilePath(L, kind, { x: s.x, y: s.y, face: s.face }, mouse.x, mouse.y);
  const col = { orb: '#b79cff', swap: '#ff9ad0', fire: '#ff9a3a', arrow: '#f2d9a0' }[kind];
  ctx.save();
  ctx.fillStyle = col;
  const n = path.pts.length;
  path.pts.forEach(([x, y], i) => {
    if (i % 4 !== 0) return;
    ctx.globalAlpha = 0.85 * (1 - (i / n) * 0.65);
    ctx.beginPath();
    ctx.arc(x, y, 2.4 - (i / n) * 0.8, 0, TAU);
    ctx.fill();
  });
  const end = path.pts[n - 1];
  const pulse = 1 + Math.sin(frame * 0.2) * 0.12;
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(end[0], end[1], 6 * pulse, 0, TAU);
  ctx.moveTo(end[0] - 10, end[1]);
  ctx.lineTo(end[0] - 4, end[1]);
  ctx.moveTo(end[0] + 4, end[1]);
  ctx.lineTo(end[0] + 10, end[1]);
  ctx.moveTo(end[0], end[1] - 10);
  ctx.lineTo(end[0], end[1] - 4);
  ctx.moveTo(end[0], end[1] + 4);
  ctx.lineTo(end[0], end[1] + 10);
  ctx.stroke();
  ctx.restore();
}

/* ---------- Rendu : niveau ---------- */
const darkLayer = document.createElement('canvas');
let frame = 0;
let irisT = 1;

function lightAt(lightSources, x, y) {
  let a = 0;
  for (const s of lightSources) a = Math.max(a, 1 - Math.hypot(s.x - x, s.y - y) / s.r);
  return Math.max(0, a);
}

// Bords sombres (vignette), pré-rendus une fois par niveau
function makeVignette(w, h, theme) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w / 2);
  c.height = Math.ceil(h / 2);
  const g = c.getContext('2d');
  const light = window.Themes.get(theme).light;
  const k = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.45, c.width / 2, c.height / 2, c.width * 0.62);
  k.addColorStop(0, 'rgba(10,6,30,0)');
  k.addColorStop(1, light ? 'rgba(20,10,40,.30)' : 'rgba(0,0,12,.5)');
  g.fillStyle = k;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/* ---------- Qualité automatique : si l'ordinateur rame, on allège le rendu ---------- */
let fxLow = false; // mode économique : moins de lueurs et de particules
let lastDrawAt = 0;
let slowAvg = 16.7;
let slowCount = 0;
function rebuildAssets() {
  if (!level) return;
  spriteCache.clear();
  setupCanvas();
  level.bg = window.Themes.makeBackground(level.theme, LW, LH, level.index + 1, RES);
  level.tiles = window.Themes.makeTiles(level.theme, level.rows, level.tile, level.index + 1, RES);
}
function lighten() {
  if (RES > 1) { // 1er palier : on arrête le rendu en double résolution (4 fois moins de pixels à dessiner)
    RES = 1;
    rebuildAssets();
  } else if (!fxLow) { // 2e palier : moins de lueurs et de particules
    fxLow = true;
  } else {
    return;
  }
  slowAvg = 16.7;
  slowCount = 0;
  toast('Jeu allégé automatiquement pour rester fluide');
}
function governQuality(now) {
  const dt = now - lastDrawAt;
  lastDrawAt = now;
  if (dt <= 0 || dt > 250) return; // onglet en arrière-plan ou pause : on ignore
  slowAvg += (dt - slowAvg) * 0.05;
  if (slowAvg > 24) { if (++slowCount > 150) lighten(); } else slowCount = Math.max(0, slowCount - 2);
}

function draw() {
  requestAnimationFrame(draw);
  drawPreview();
  if (!level || !world) return;
  frame++;
  governQuality(performance.now());
  const T = level.tile;
  const L = level.L;
  const W = LW;
  const H = LH;
  const theme = level.theme;
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // état des portes, volets, glace et bois brûlé : sert aux ombres et à la visée
  // (calculés une seule fois par message du serveur, pas à chaque image)
  const S = world.sets || (world.sets = {
    open: new Set(world.open), shut: new Set(world.sh), pressed: new Set(world.pressed), burnt: new Set(world.bt),
    burning: new Set(world.bn), ice: new Set(world.ice.map((b) => b[1] * L.w + b[0])),
  });
  L.linkOn = !!world.lk;
  L.syncOn = world.sy > 0;
  L.open = S.open;
  L.shutOpen = S.shut;
  L.ice = S.ice;
  L.burnt = S.burnt;

  // fond en profondeur : suit doucement la position moyenne des joueurs
  let mx = 0;
  let n = 0;
  sprites.forEach((s) => { mx += s.x + PW / 2; n++; });
  const want = n ? (mx / n / W - 0.5) * 2 : 0;
  level.shift += (want - level.shift) * 0.04;
  window.Themes.drawBackground(ctx, level.bg, level.shift);
  window.Themes.drawDecor(ctx, theme, level.decor, frame, W, H);
  ctx.drawImage(level.tiles, 0, 0, W, H);
  if (!fxLow) window.Themes.drawTileFx(ctx, level.tiles, frame);
  if (world.bs) drawBoss(frame);

  const openSet = S.open;
  const pressedSet = S.pressed;
  const shutSet = S.shut;
  const burntSet = S.burnt;
  const burningSet = S.burning;

  // Sources de lumière (niveaux sombres) : tout le monde a une petite lueur, le Mage éclaire plus loin
  const lights = [];
  for (const p of players) {
    const s = sprites.get(p.id);
    if (!s) continue;
    const isMage = level.cfg.abilities && p.role === 'mage';
    lights.push({ x: s.x + PW / 2, y: s.y + PH / 2, r: isMage ? LIGHT_MAGE : LIGHT_SELF, c: isMage ? '#9a7bff' : '#ffeec0', a: isMage ? 0.28 : 0.14 });
  }
  L.torches.forEach((t, i) => {
    if (world.tc[i]) lights.push({ x: t.x + T / 2, y: t.y + T / 2, r: LIGHT_TORCH, c: '#ffb040', a: 0.3 });
  });
  world.bn.forEach((idx) => {
    const c = tileCenter(idx);
    lights.push({ x: c.x, y: c.y, r: 60, c: '#ff8a2a', a: 0.3 });
  });
  if (level.cfg.dark && level.star && !world.sr) lights.push({ x: level.star.x + T / 2, y: level.star.y + T / 2, r: 40, c: '#ffe27a', a: 0.28 }); // l'étoile scintille dans le noir

  level.rows.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      const ch = row[tx];
      if (ch === '.' || ch === '#') continue;
      const x = tx * T;
      const y = ty * T;
      if (ch === 'h') {
        const a = lightAt(lights, x + T / 2, y + T / 2);
        if (a > 0.02) drawHidden(x, y, T, a);
      } else if (ch === 'r') {
        drawRune(x, y, T, false, false);
      } else if (ch === '^') {
        drawSpikes(x, y, T, theme);
      } else if (ch >= 'a' && ch <= 'c') {
        drawGate(x, y, T, ch.charCodeAt(0) - 96, openSet.has(ch.charCodeAt(0) - 96));
      } else if (ch >= '1' && ch <= '3') {
        drawPlate(x, y, T, Number(ch), pressedSet.has(Number(ch)));
      } else if (ch === 'w' || ch === 'v' || ch === 'u') {
        const g = ch === 'w' ? 1 : ch === 'v' ? 2 : 3;
        drawShutter(x, y, T, g, shutSet.has(g));
      } else if (ch === 'l') {
        drawLinkBlock(x, y, T, !!world.lk, world.ld, frame);
      } else if (ch === 's') {
        drawSyncBlock(x, y, T, world.sy, frame);
      } else if (ch === 'j') {
        const idx = ty * L.w + tx;
        const a = springAnim.get(idx) || 0;
        if (a > 0) springAnim.set(idx, a - 1);
        drawSpring(x, y, T, a);
      } else if (ch === 't') {
        const idx = ty * L.w + tx;
        if (!burntSet.has(idx)) drawWood(x, y, T, burningSet.has(idx), frame);
      }
    }
  });

  L.checkpoints.forEach((c, i) => drawCheckpoint(c, T, world.cps.includes(i), frame, (world.cph || []).includes(i)));
  L.torches.forEach((t, i) => drawTorch(t, T, !!world.tc[i], frame));
  L.crystals.forEach((c, i) => {
    const seqShape = c.seqIndex >= 0 ? c.seqIndex % 3 : -1;
    drawCrystal(c, T, !!world.cr[i], seqShape, world.seq.done, world.seq.flash, frame);
  });
  L.targets.forEach((t, i) => drawTarget(t, T, !!world.tg[i]));
  level.keys.forEach((k, i) => {
    if (!world.keys.includes(i)) drawKey(k, frame);
  });
  if (level.star && !world.sr) drawStar(level.star, frame, !!(window.Progress && window.Progress.hasStar(level.name)));

  // Progression d'une séquence de cristaux
  if (level.cfg.seqGroup) {
    const cnt = L.crystals.filter((c) => c.seqIndex >= 0).length;
    for (let i = 0; i < cnt; i++) {
      const on = world.seq.done || i < world.seq.p;
      ctx.beginPath();
      ctx.arc(W / 2 - (cnt - 1) * 11 + i * 22, 22, 6.5, 0, TAU);
      fillOut(on ? '#9be564' : 'rgba(255, 255, 255, .45)', 1.6);
      if (on) glowAt(W / 2 - (cnt - 1) * 11 + i * 22, 22, 18, '#9be564', 0.5);
    }
  }

  if (level.door) {
    let inside = 0;
    for (const p of players) {
      const s = sprites.get(p.id);
      if (!s) continue;
      const cx = s.tx + PW / 2;
      const cy = s.ty + PH / 2;
      if (cx >= level.door.x && cx <= level.door.x + T && cy >= level.door.y && cy <= level.door.y + T) inside++;
    }
    drawDoor(level.door, T, world.door, inside, players.length, frame);
  }

  world.ice.forEach((b) => drawIce(b, T, frame));

  const ahead = Math.min((performance.now() - world.recvAt) / 16.7, 2);
  world.proj.forEach((pr) => drawProjectile(pr, ahead, frame));

  level.cfg.labels.forEach((lb) => drawLabel(lb, T, lights));

  window.Themes.drawFront(ctx, theme, level.decor, frame, W, H);

  // Obscurité : un voile noir percé par la lumière du Mage, la lueur de chaque joueur et les torches
  if (level.cfg.dark) {
    const dw = Math.ceil(W / 2);
    const dh = Math.ceil(H / 2);
    if (darkLayer.width !== dw || darkLayer.height !== dh) {
      darkLayer.width = dw;
      darkLayer.height = dh;
    }
    const dctx = darkLayer.getContext('2d');
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, dw, dh);
    dctx.fillStyle = 'rgba(5, 5, 20, .86)';
    dctx.fillRect(0, 0, dw, dh);
    dctx.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const flick = l.r > 80 && l.r !== LIGHT_MAGE ? Math.sin(frame * 0.3 + l.x) * 3 : 0;
      const rr = (l.r + flick) / 2;
      const g = dctx.createRadialGradient(l.x / 2, l.y / 2, rr * 0.25, l.x / 2, l.y / 2, rr);
      g.addColorStop(0, 'rgba(0, 0, 0, 1)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dctx.fillStyle = g;
      dctx.beginPath();
      dctx.arc(l.x / 2, l.y / 2, rr, 0, TAU);
      dctx.fill();
    }
    ctx.drawImage(darkLayer, 0, 0, W, H);
    // lueur colorée de chaque source par-dessus l'obscurité
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) window.Themes.halo(ctx, l.x, l.y, l.r * 0.95, l.c, l.a);
    ctx.restore();
  }

  if (level.cfg.link) drawTether();

  if (level.tipSprites && level.tipSprites.length) drawTips(frame);
  Ghost.draw(); // derrière les vrais joueurs
  // ombres puis joueurs (le tien passe devant)
  const order = players.slice().sort((a, b) => (a.id === myId) - (b.id === myId));
  for (const p of order) {
    const s = sprites.get(p.id);
    if (s) drawShadow(s);
  }
  for (const p of order) {
    const s = sprites.get(p.id);
    if (!s) continue;
    stepSprite(s, p);
    drawPlayer(p, s, frame);
  }

  if (world.bs) drawBossHazards(frame);
  stepParts();
  drawParts();
  if (marks.length) drawMarks();

  const mine = sprites.get(myId);
  if (hurtFlash > 0) { ctx.fillStyle = `rgba(255,40,70,${hurtFlash / 40})`; ctx.fillRect(0, 0, W, H); hurtFlash--; }
  if (mine && world.status === 'playing') drawAim(mine);
  drawCoopOverlay(mine);

  ctx.globalAlpha = 1;
  ctx.drawImage(level.vig, 0, 0, W, H);

  // ouverture en iris au début d'un niveau
  if (irisT < 1) {
    irisT = Math.min(1, irisT + 0.03);
    const e = 1 - Math.pow(1 - irisT, 3);
    const cx = mine ? mine.x + PW / 2 : W / 2;
    const cy = mine ? mine.y + PH / 2 : H / 2;
    const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 10;
    ctx.fillStyle = '#0b0818';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, Math.max(0.1, e * maxR), 0, TAU);
    ctx.fill('evenodd');
  }

  // secousse d'écran
  if (shakeMag > 0.25) {
    const dx = (Math.random() - 0.5) * 2 * shakeMag;
    const dy = (Math.random() - 0.5) * 2 * shakeMag;
    canvas.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(1.012)`;
    shakeMag *= 0.86;
  } else if (shakeMag !== 0) {
    shakeMag = 0;
    canvas.style.transform = '';
  }

  if (frame % 3 === 0) updateActionCooldowns();
}

if (window.Progress) {
  window.Progress.setHooks({
    toast,
    replay: () => send({ t: 'restart' }), // écran de résultat : le chef rejoue le niveau
    next: () => send({ t: 'skip' }), // ... ou passe à la suite
    help: () => send({ t: 'help' }), // l'indice consulté par un joueur compte pour tout le duo
  });
}

refreshPickers();
setMusicFor('menu');
draw();

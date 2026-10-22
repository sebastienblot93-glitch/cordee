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
let pingRtt = 80;
const sprites = new Map(); // id -> { x, y, tx, ty, face, vy, ... }
const mouse = { x: 0, y: 0, has: false };

let jumpPresses = 0; // compteur : chaque nouvelle pression de saut compte (double saut de l'Archer)

/* ---------- Apparence (skin + couleur), mémorisée dans le navigateur ---------- */
function loadLook() {
  try {
    const j = JSON.parse(localStorage.getItem('cordee.look'));
    if (j && Skins.ids.includes(j.skin) && Skins.colors.includes(j.color)) return j;
  } catch { /* pas de stockage */ }
  return { skin: 'classic', color: Skins.colors[1] };
}
const look = loadLook();
function saveLook() {
  try { localStorage.setItem('cordee.look', JSON.stringify(look)); } catch { /* ignore */ }
}

function freshWorld(lv) {
  return {
    status: 'playing', keys: [], open: [], pressed: [], door: lv.keys.length === 0,
    cr: [], tg: [], tc: [], bn: [], bt: [], seq: { p: 0, done: false, flash: false }, sh: [], ice: [], proj: [], cps: [], cd: [],
    deaths: 0, recvAt: performance.now(),
  };
}

/* ---------- Écrans ---------- */
function show(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
  menuRoot.style.display = name === 'game' ? 'none' : '';
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
      players = msg.players;
      levelList = msg.levels || [];
      chapterList = msg.chapters || [];
      if (msg.status === 'lobby') {
        level = null;
        lastChapter = -1;
        sprites.clear();
        $('banner').classList.remove('show');
        renderLobby();
      } else if (level) {
        updateHud();
      }
      break;
    case 'start':
      startLevel(msg);
      break;
    case 'state':
      applyState(msg);
      break;
    case 'pong':
      pingRtt = Math.min(2000, Math.max(1, pingRtt * 0.7 + (performance.now() - msg.c) * 0.3));
      $('hud-ping').textContent = `Ping ${Math.round(pingRtt)} ms`;
      break;
  }
}

/* ---------- Effets : particules ---------- */
const parts = [];
function addPart(p) {
  if (parts.length > 420) parts.shift();
  parts.push(p);
}
function burst(x, y, color, n, speed = 2.5, grav = 0.08, life = 36, size = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.65);
    addPart({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: grav, life: life * (0.6 + Math.random() * 0.4), max: life, color, size: size * (0.6 + Math.random() * 0.7) });
  }
}
function dust(x, y, n = 5) {
  for (let i = 0; i < n; i++) {
    addPart({ x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 0.8, g: 0.02, life: 22, max: 22, color: 'rgba(235,235,245,.7)', size: 3 + Math.random() * 2 });
  }
}
function ring(x, y, color, r1 = 40) {
  addPart({ ring: true, x, y, r: 4, r1, life: 20, max: 20, color });
}
function confetti() {
  for (let i = 0; i < 90; i++) {
    addPart({
      x: Math.random() * canvas.width, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, g: 0.02,
      life: 140, max: 140, color: ['#ff6b9d', '#4dd8e8', '#9be564', '#ffd24a', '#b79cff'][i % 5], size: 4,
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
  }
}
function drawParts() {
  for (const p of parts) {
    const a = Math.max(0, Math.min(1, p.life / p.max));
    if (p.ring) {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

/* ---------- Réaction aux changements d'état (sons + effets) ---------- */
const springAnim = new Map(); // index de case -> images restantes
const prevWorldInfo = { door: false, keys: 0, cps: 0, status: 'playing', deaths: 0 };

function tileCenter(idx) {
  const w = level.L.w;
  return { x: (idx % w) * level.tile + level.tile / 2, y: Math.floor(idx / w) * level.tile + level.tile / 2 };
}

function reactToState(prev, msg) {
  const T = level.tile;
  const sfx = window.Sfx.play.bind(window.Sfx);
  if (msg.keys.length > prevWorldInfo.keys) {
    msg.keys.filter((k) => !(prev.keys || []).includes(k)).forEach((k) => {
      const key = level.keys[k];
      if (key) burst(key.x + 16, key.y + 16, '#ffd24a', 16, 3, 0.05, 30);
    });
    sfx('key');
  }
  if (msg.door && !prevWorldInfo.door && level.keys.length) {
    sfx('door');
    if (level.door) burst(level.door.x + 16, level.door.y + 16, '#ffd24a', 24, 3.2, 0.02, 40);
  }
  if (msg.cps.length > prevWorldInfo.cps) {
    sfx('checkpoint');
    msg.cps.filter((c) => !(prev.cps || []).includes(c)).forEach((c) => {
      const cp = level.L.checkpoints[c];
      if (cp) burst(cp.x + 20, cp.y + 10, '#9be564', 14, 2.4, 0.03, 30);
    });
  }
  (msg.cr || []).forEach((v, i) => {
    if (v && !(prev.cr || [])[i]) {
      const c = level.L.crystals[i];
      if (c) { burst(c.x + 16, c.y + 16, GROUP_COLORS[c.group], 14, 2.6, 0.02, 30); ring(c.x + 16, c.y + 16, '#fff', 30); }
      sfx('crystal');
    }
  });
  (msg.tg || []).forEach((v, i) => {
    if (v && !(prev.tg || [])[i]) {
      const t = level.L.targets[i];
      if (t) burst(t.x + 16, t.y + 16, '#9be564', 14, 2.6, 0.02, 30);
      sfx('target');
    }
  });
  (msg.tc || []).forEach((v, i) => {
    if (v && !(prev.tc || [])[i]) {
      const t = level.L.torches[i];
      if (t) burst(t.x + 16, t.y + 8, '#ffb040', 18, 2.6, -0.03, 34);
      sfx('torch');
    }
  });
  const oldBt = new Set(prev.bt || []);
  let burned = 0;
  (msg.bt || []).forEach((idx) => {
    if (oldBt.has(idx)) return;
    burned++;
    const c = tileCenter(idx);
    burst(c.x, c.y, '#ff8a2a', 9, 2.2, 0.02, 30);
    burst(c.x, c.y, '#3a2a22', 5, 1.2, 0.06, 28);
  });
  if (burned) sfx('burn', 120);
  if (msg.deaths > prevWorldInfo.deaths && !(msg.ev || []).some((e) => e[0] === 'die')) sfx('die');
  (msg.ev || []).forEach((e) => {
    if (e[0] === 'die') {
      burst(e[1] + 12, e[2] + 14, '#ffffff', 22, 3.4, 0.12, 36);
      sfx('die', 120);
    } else if (e[0] === 'swap') {
      ring(e[1] + 12, e[2] + 14, '#4dd8e8', 46);
      ring(e[3] + 12, e[4] + 14, '#ff6b9d', 46);
      burst(e[1] + 12, e[2] + 14, '#4dd8e8', 16, 3, 0.02, 30);
      burst(e[3] + 12, e[4] + 14, '#ff6b9d', 16, 3, 0.02, 30);
      sfx('swap');
    } else if (e[0] === 'fire') {
      burst(e[1], e[2], '#ffb040', 12, 2.6, -0.02, 26);
    } else if (e[0] === 'hit') {
      burst(e[1], e[2], '#ffffff', 8, 2, 0.02, 18);
    }
  });
  if (msg.status !== prevWorldInfo.status && (msg.status === 'won' || msg.status === 'finished')) {
    sfx('win');
    confetti();
  }
  prevWorldInfo.door = msg.door;
  prevWorldInfo.keys = msg.keys.length;
  prevWorldInfo.cps = msg.cps.length;
  prevWorldInfo.status = msg.status;
  prevWorldInfo.deaths = msg.deaths;
  void T;
}

function applyState(msg) {
  if (!level) return;
  const prev = world || {};
  reactToState(prev, msg);
  world = {
    status: msg.status, keys: msg.keys, open: msg.open, pressed: msg.pressed, door: msg.door,
    cr: msg.cr, tg: msg.tg, tc: msg.tc || [], bn: msg.bn || [], bt: msg.bt || [], seq: msg.seq, sh: msg.sh, ice: msg.ice,
    proj: msg.proj, cps: msg.cps, cd: msg.cd, deaths: msg.deaths, recvAt: performance.now(),
  };
  for (const [id, x, y, face] of msg.p) {
    let s = sprites.get(id);
    if (!s) sprites.set(id, (s = { x, y, tx: x, ty: y, py: y, face, vy: 0, air: false, mv: false, t: Math.random() * 100 }));
    const dy = y - s.ty;
    const dx = x - s.tx;
    // détection des sauts, atterrissages et rebonds pour les bruitages et la poussière
    if (Math.abs(dy) < 80) {
      const feetTx = Math.floor((x + PW / 2) / level.tile);
      const feetTy = Math.floor((y + PH - 0.5) / level.tile);
      if (dy < -11 && level.L.spring[feetTy] && level.L.spring[feetTy][feetTx]) {
        springAnim.set(feetTy * level.L.w + feetTx, 14);
        window.Sfx.play('spring', 80);
        dust(x + PW / 2, y + PH, 6);
      } else if (dy < -6 && !s.air && s.vy > -3) {
        dust(x + PW / 2, y + PH, 4);
        if (id === myId) window.Sfx.play('jump', 60);
      }
      if (s.vy > 4 && dy < 1.5) dust(x + PW / 2, y + PH, 4);
    }
    s.vy = dy;
    s.air = dy < -1 || dy > 1;
    s.mv = Math.abs(dx) > 0.4;
    s.tx = x;
    s.ty = y;
    s.face = face;
  }
  updateBanner();
  updateHud();
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
    theme: chapter.theme,
    cfg: {
      abilities: !!cfg.abilities, dark: !!cfg.dark, fire: !!cfg.fire, swap: !!cfg.swap,
      seqGroup: cfg.seqGroup || 0, labels: cfg.labels || [],
    },
    L,
  };
  world = freshWorld(level);
  sprites.clear();
  parts.length = 0;
  springAnim.clear();
  Object.assign(prevWorldInfo, { door: world.door, keys: 0, cps: 0, status: 'playing', deaths: 0 });
  setupCanvas();
  const W = canvas.width;
  const H = canvas.height;
  level.bg = window.Themes.makeBackground(level.theme, W, H, msg.index + 1);
  level.tiles = window.Themes.makeTiles(level.theme, msg.level, T, msg.index + 1);
  level.decor = window.Themes.makeDecor(level.theme, W, H, msg.index + 1);
  $('level-hint').textContent = level.hint;
  updateRoleHint();
  updateBanner();
  updateHud();
  show('game');
  if (chapter.index !== lastChapter) {
    lastChapter = chapter.index;
    showChapterCard(chapter);
  }
}

function showChapterCard(ch) {
  const el = $('chapter-card');
  $('chapter-num').textContent = `Chapitre ${ch.index + 1}`;
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
  $('banner').textContent = finished ? 'Bravo, vous avez terminé tous les niveaux !' : 'Niveau réussi !';
  $('banner').classList.toggle('show', finished || world.status === 'won');
}

function updateHud() {
  if (!level) return;
  const ch = level.chapter;
  $('hud-level').textContent = `${ch.name} · Niveau ${level.index + 1}/${level.total} : ${level.name}`;
  const parts2 = [];
  if (level.keys.length) parts2.push(`Clés ${world.keys.length}/${level.keys.length}`);
  if (world.deaths) parts2.push(`Chutes ${world.deaths}`);
  $('hud-keys').textContent = parts2.join('   ');
}

function updateRoleHint() {
  const kit = myKit();
  const c = level.cfg;
  const mage = 'Mage : clic gauche (ou J) lance une orbe qui active les cristaux. Clic droit (ou K) pose de la glace sur les runes.'
    + (c.swap ? ' E : éclair d’échange, tu changes de place avec le premier joueur touché.' : '');
  const archer = 'Archer : clic gauche (ou J) tire une flèche qui active les cibles. Saute deux fois, et Maj (ou L) pour un dash.'
    + (c.fire ? ' Clic droit (ou K) : flèche de feu, elle brûle le bois et allume les torches.' : '');
  const text = { mage, archer, plain: 'Flèches ou ZQSD pour bouger, espace pour sauter.' }[kit];
  $('role-hint').textContent = text;
}

/* ---------- Choix de l'apparence ---------- */
function drawSkinThumb(cv, id, color, t) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const sc = cv.width / 40;
  g.save();
  g.scale(sc, sc);
  Skins.draw(g, id, 8, cv.height / sc - 32, { dir: 1, color, t });
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
    cv.width = 60; cv.height = 76;
    drawSkinThumb(cv, id, color, 30);
    b.append(cv);
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

// Aperçu animé sur l'écran d'accueil
function drawPreview() {
  const cv = $('look-preview');
  if (!cv || !screens.menu.classList.contains('active')) return;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const t = performance.now() / 16.7;
  g.save();
  g.scale(2.4, 2.4);
  const bob = Math.abs(Math.sin(t * 0.08)) * 3;
  Skins.draw(g, look.skin, 10, 22 - bob, { dir: Math.sin(t * 0.02) > 0 ? 1 : -1, color: look.color, t });
  g.restore();
}

/* ---------- Lobby ---------- */
function renderPlayerList() {
  const ul = $('lobby-players');
  ul.innerHTML = '';
  players.forEach((p) => {
    const li = document.createElement('li');
    const cv = document.createElement('canvas');
    cv.width = 40; cv.height = 52;
    drawSkinThumb(cv, p.skin || 'classic', p.color, 30);
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
    levelList.forEach((l, i) => {
      if (l.chapter !== lastCh) {
        lastCh = l.chapter;
        group = document.createElement('optgroup');
        group.label = `Chapitre ${l.chapter + 1} · ${(chapterList[l.chapter] || {}).name || ''}`;
        sel.append(group);
      }
      const o = document.createElement('option');
      o.value = i;
      o.textContent = `${i + 1}. ${l.name}${l.roles ? ' (Mage + Archer)' : ''}`;
      group.append(o);
    });
    if (current) sel.value = current;
  }
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
$('btn-start').onclick = () => {
  setError('');
  send({ t: 'start', level: Number($('level-select').value) || 0 });
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
  $('btn-mute').textContent = window.Sfx.isMuted() ? 'Son : coupé (M)' : 'Son : activé (M)';
}
$('btn-mute').onclick = () => { window.Sfx.toggle(); updateMuteButton(); window.Sfx.play('click'); };
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
  if (e.code === 'KeyM' && !e.repeat && document.activeElement && document.activeElement.tagName !== 'INPUT') {
    window.Sfx.toggle();
    updateMuteButton();
    return;
  }
  if (!level) return;
  if (e.code === 'KeyR' && !e.repeat) return send({ t: 'restart' });
  if (e.code === 'KeyN' && !e.repeat) return send({ t: 'skip' }); // seul le chef de room est écouté
  if (e.code === 'KeyJ' && !e.repeat) return cast(1);
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
const ctx = canvas.getContext('2d');

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
}
canvas.addEventListener('mousemove', (e) => {
  Object.assign(mouse, canvasPoint(e), { has: true });
});
canvas.addEventListener('mousedown', (e) => {
  if (!level) return;
  e.preventDefault();
  Object.assign(mouse, canvasPoint(e), { has: true });
  if (e.button === 0) cast(1);
  if (e.button === 2) cast(2);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------- Rendu : éléments du décor ---------- */
function setupCanvas() {
  canvas.width = level.rows[0].length * level.tile;
  canvas.height = level.rows.length * level.tile;
}

function drawShape(kind, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (kind === 0) {
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
  } else if (kind === 1) {
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size, cy + size * 0.8);
    ctx.lineTo(cx - size, cy + size * 0.8);
    ctx.closePath();
  } else {
    ctx.rect(cx - size * 0.85, cy - size * 0.85, size * 1.7, size * 1.7);
  }
  ctx.fill();
}

function drawGate(x, y, T, group, isOpen) {
  const color = GROUP_COLORS[group];
  if (isOpen) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x + 3, y + 1, T - 6, T - 2);
    ctx.restore();
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(x + 4, y, T - 8, T);
  ctx.fillStyle = 'rgba(22, 22, 58, .45)';
  for (let i = -T; i < T; i += 10) {
    ctx.beginPath();
    ctx.moveTo(x + 4, y + i + 10);
    ctx.lineTo(x + T - 4, y + i);
    ctx.lineTo(x + T - 4, y + i + 5);
    ctx.lineTo(x + 4, y + i + 15);
    ctx.fill();
  }
  ctx.strokeStyle = '#16163a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 4, y, T - 8, T);
}

function drawShutter(x, y, T, group, isOpen) {
  const color = GROUP_COLORS[group];
  if (isOpen) {
    ctx.fillStyle = 'rgba(255, 255, 255, .06)';
    ctx.fillRect(x, y, T, T);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
    return;
  }
  ctx.fillStyle = '#2a2a5a';
  ctx.fillRect(x, y, T, T);
  ctx.fillStyle = color;
  for (let i = 4; i < T; i += 10) ctx.fillRect(x, y + i, T, 4);
}

function drawPlate(x, y, T, group, isPressed) {
  const h = isPressed ? 3 : 8;
  ctx.fillStyle = '#16163a';
  ctx.fillRect(x + 2, y + T - 4, T - 4, 4);
  ctx.fillStyle = GROUP_COLORS[group];
  ctx.fillRect(x + 5, y + T - 4 - h, T - 10, h);
}

function drawKey(k, frame) {
  const bob = Math.sin(frame * 0.07 + k.x) * 2;
  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = 'rgba(255, 210, 74, .22)';
  ctx.beginPath();
  ctx.arc(k.x + 16, k.y + 16, 17 + Math.sin(frame * 0.1) * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.arc(k.x + 16, k.y + 11, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(k.x + 14, k.y + 15, 4, 13);
  ctx.fillRect(k.x + 18, k.y + 21, 6, 3);
  ctx.fillRect(k.x + 18, k.y + 26, 4, 3);
  ctx.fillStyle = '#16163a';
  ctx.beginPath();
  ctx.arc(k.x + 16, k.y + 11, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDoor(d, T, isOpen, inside, total, frame) {
  if (isOpen) {
    const pulse = 0.25 + Math.sin(frame * 0.1) * 0.08;
    ctx.fillStyle = `rgba(255, 210, 74, ${pulse})`;
    ctx.beginPath();
    ctx.arc(d.x + T / 2, d.y + T / 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(d.x + 4, d.y, T - 8, T);
    ctx.fillStyle = '#16163a';
    ctx.fillRect(d.x + 8, d.y + 4, T - 16, T - 4);
    ctx.font = '12px Nunito, sans-serif';
    ctx.textAlign = 'center';
    outlinedText(`${inside}/${total}`, d.x + T / 2, d.y - 6, '#f3efe4');
  } else {
    ctx.fillStyle = '#2e2e6a';
    ctx.fillRect(d.x + 4, d.y, T - 8, T);
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 2;
    ctx.strokeRect(d.x + 5, d.y + 1, T - 10, T - 2);
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(d.x + 10, d.y + 15, 12, 10);
    ctx.beginPath();
    ctx.arc(d.x + 16, d.y + 15, 4, Math.PI, 0);
    ctx.stroke();
  }
}

function outlinedText(text, x, y, fill) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10, 10, 30, .75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawCrystal(c, T, active, seqShape, seqDone, flash, frame) {
  const cx = c.x + T / 2;
  const cy = c.y + T / 2 + Math.sin(frame * 0.06 + c.x) * 1.5;
  const color = seqShape >= 0 ? (flash ? '#ff5050' : seqDone ? '#9be564' : '#b79cff') : GROUP_COLORS[c.group];
  if (active) {
    ctx.fillStyle = 'rgba(255, 255, 255, .28)';
    ctx.beginPath();
    ctx.arc(cx, cy, 21 + Math.sin(frame * 0.2) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 13);
  ctx.lineTo(cx + 10, cy);
  ctx.lineTo(cx, cy + 13);
  ctx.lineTo(cx - 10, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 13);
  ctx.lineTo(cx + 10, cy);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = active ? '#fff' : '#16163a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 13);
  ctx.lineTo(cx + 10, cy);
  ctx.lineTo(cx, cy + 13);
  ctx.lineTo(cx - 10, cy);
  ctx.closePath();
  ctx.stroke();
  if (seqShape >= 0) drawShape(seqShape, cx, cy, 4.5, '#16163a');
}

function drawTarget(t, T, active) {
  const cx = t.x + T / 2;
  const cy = t.y + T / 2;
  const rings = [[14, GROUP_COLORS[t.group]], [10, '#f3efe4'], [6, active ? '#9be564' : '#ff5050'], [2.5, '#16163a']];
  for (const [r, col] of rings) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCheckpoint(c, T, active, frame) {
  ctx.fillStyle = '#c9c9ee';
  ctx.fillRect(c.x + 14, c.y + 4, 3, T - 4);
  ctx.fillStyle = active ? '#9be564' : '#7a7aa8';
  const wave = active ? Math.sin(frame * 0.15) * 2 : 0;
  ctx.beginPath();
  ctx.moveTo(c.x + 17, c.y + 5);
  ctx.lineTo(c.x + 29, c.y + 10 + wave);
  ctx.lineTo(c.x + 17, c.y + 15);
  ctx.closePath();
  ctx.fill();
}

function drawSpikes(x, y, T, theme) {
  ctx.fillStyle = theme === 'forge' ? '#d8b8a0' : '#d6d6f2';
  for (let i = 0; i < 3; i++) {
    const bx = x + 2 + i * 10;
    ctx.beginPath();
    ctx.moveTo(bx, y + T);
    ctx.lineTo(bx + 5, y + T - 15);
    ctx.lineTo(bx + 10, y + T);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  for (let i = 0; i < 3; i++) {
    const bx = x + 2 + i * 10;
    ctx.beginPath();
    ctx.moveTo(bx + 5, y + T - 15);
    ctx.lineTo(bx + 10, y + T);
    ctx.lineTo(bx + 5, y + T);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRune(x, y, T, hover, ok) {
  ctx.save();
  ctx.strokeStyle = hover ? (ok ? '#9be564' : '#ff6b6b') : 'rgba(183, 156, 255, .85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x + 3, y + 3, T - 6, T - 6);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x + 16, y + 9);
  ctx.lineTo(x + 16, y + 23);
  ctx.moveTo(x + 9, y + 16);
  ctx.lineTo(x + 23, y + 16);
  ctx.stroke();
  ctx.restore();
}

function drawIce(b, T, frame) {
  const [tx, ty, left] = b;
  if (left < 90 && Math.floor(frame / 6) % 2 === 0) return; // clignote juste avant de fondre
  ctx.fillStyle = 'rgba(160, 225, 255, .85)';
  ctx.fillRect(tx * T, ty * T, T, T);
  ctx.fillStyle = 'rgba(255, 255, 255, .6)';
  ctx.fillRect(tx * T + 3, ty * T + 3, T - 6, 5);
  ctx.strokeStyle = '#e8f8ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(tx * T + 1, ty * T + 1, T - 2, T - 2);
  if (frame % 9 === 0) addPart({ x: tx * T + Math.random() * T, y: ty * T + Math.random() * T, vx: 0, vy: -0.2, g: 0, life: 18, max: 18, color: '#ffffff', size: 2 });
}

function drawSpring(x, y, T, anim) {
  const squash = anim > 0 ? Math.sin((anim / 14) * Math.PI) : 0;
  const coilH = 15 - squash * 8 + (anim > 7 ? 4 : 0);
  ctx.fillStyle = '#4a4a6a';
  ctx.fillRect(x + 5, y + T - 5, T - 10, 5);
  ctx.strokeStyle = '#cfd4e4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const top = y + T - 5 - coilH;
  ctx.moveTo(x + 9, y + T - 5);
  for (let i = 0; i < 4; i++) {
    ctx.lineTo(x + 23, top + coilH - (i * coilH) / 4 - coilH / 8);
    ctx.lineTo(x + 9, top + coilH - ((i + 1) * coilH) / 4);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffb02e';
  ctx.fillRect(x + 3, top - 5, T - 6, 6);
  ctx.fillStyle = '#ffe07a';
  ctx.fillRect(x + 5, top - 5, T - 10, 2);
}

function drawWood(x, y, T, burning, frame) {
  ctx.fillStyle = burning ? '#7a3a1c' : '#a8703a';
  ctx.fillRect(x, y, T, T);
  ctx.fillStyle = burning ? '#5a2410' : '#8a5a2c';
  ctx.fillRect(x, y + 10, T, 2);
  ctx.fillRect(x, y + 21, T, 2);
  ctx.fillStyle = burning ? '#3a1a0c' : '#6a4420';
  ctx.fillRect(x + 4, y + 4, 2, 2);
  ctx.fillRect(x + T - 6, y + 4, 2, 2);
  ctx.fillRect(x + 4, y + T - 6, 2, 2);
  ctx.fillRect(x + T - 6, y + T - 6, 2, 2);
  ctx.strokeStyle = '#4a2c12';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
  if (burning) {
    for (let i = 0; i < 3; i++) {
      const fx = x + 6 + i * 10;
      const h = 10 + Math.sin(frame * 0.4 + i * 2 + x) * 5;
      ctx.fillStyle = '#ff6a1a';
      ctx.beginPath();
      ctx.moveTo(fx - 4, y + T);
      ctx.quadraticCurveTo(fx, y + T - h * 2, fx + 4, y + T);
      ctx.fill();
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.moveTo(fx - 2, y + T);
      ctx.quadraticCurveTo(fx, y + T - h, fx + 2, y + T);
      ctx.fill();
    }
    if (frame % 4 === 0) addPart({ x: x + Math.random() * T, y: y + 6, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random(), g: -0.01, life: 28, max: 28, color: '#ffb040', size: 2.5 });
  }
}

function drawTorch(t, T, lit, frame) {
  const x = t.x;
  const y = t.y;
  const col = GROUP_COLORS[t.group];
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(x + 14, y + 14, 4, 16);
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 12);
  ctx.lineTo(x + 24, y + 12);
  ctx.lineTo(x + 20, y + 20);
  ctx.lineTo(x + 12, y + 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = col;
  ctx.fillRect(x + 9, y + 12, 14, 3);
  if (!lit) {
    ctx.fillStyle = 'rgba(120,70,40,.9)';
    ctx.fillRect(x + 12, y + 9, 8, 4);
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x + 16, y + 6, 2, x + 16, y + 6, 46);
  g.addColorStop(0, 'rgba(255,170,60,.45)');
  g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 30, y - 40, 92, 92);
  ctx.restore();
  const f = Math.sin(frame * 0.35 + x) * 2.5;
  ctx.fillStyle = '#ff6a1a';
  ctx.beginPath();
  ctx.moveTo(x + 9, y + 12);
  ctx.quadraticCurveTo(x + 16 + f, y - 14, x + 23, y + 12);
  ctx.fill();
  ctx.fillStyle = '#ffc23a';
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 12);
  ctx.quadraticCurveTo(x + 16 - f * 0.5, y - 6, x + 20, y + 12);
  ctx.fill();
  ctx.fillStyle = '#fff4c0';
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 12);
  ctx.quadraticCurveTo(x + 16, y + 2, x + 18, y + 12);
  ctx.fill();
  if (frame % 5 === 0) addPart({ x: x + 16 + (Math.random() - 0.5) * 6, y: y + 2, vx: (Math.random() - 0.5) * 0.4, vy: -1.1, g: -0.01, life: 26, max: 26, color: '#ffb040', size: 2 });
}

function drawProjectile(pr, ticksAhead, frame) {
  const [kind, x0, y0, vx, vy] = pr;
  const x = x0 + vx * ticksAhead;
  const y = y0 + vy * ticksAhead;
  if (kind === 'orb') {
    ctx.fillStyle = 'rgba(183, 156, 255, .35)';
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9ddff';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    if (frame % 2 === 0) addPart({ x, y, vx: 0, vy: 0, g: 0, life: 16, max: 16, color: '#b79cff', size: 3 });
  } else if (kind === 'swap') {
    for (let i = 0; i < 3; i++) {
      const a = frame * 0.5 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = i % 2 ? '#4dd8e8' : '#ff6b9d';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    if (frame % 2 === 0) addPart({ x, y, vx: 0, vy: 0, g: 0, life: 14, max: 14, color: frame % 4 ? '#4dd8e8' : '#ff6b9d', size: 3 });
  } else {
    const a = Math.atan2(vy, vx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = '#e6c58a';
    ctx.fillRect(-12, -1.5, 14, 3);
    ctx.fillStyle = kind === 'fire' ? '#ff9a3a' : '#f3efe4';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fill();
    if (kind === 'fire') {
      ctx.fillStyle = '#ff6a1a';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.quadraticCurveTo(14 + Math.sin(frame) * 2, -7, 2, 0);
      ctx.quadraticCurveTo(14, 7, 8, 0);
      ctx.fill();
    }
    ctx.restore();
    if (kind === 'fire') addPart({ x, y, vx: (Math.random() - 0.5) * 0.5, vy: -0.4, g: -0.01, life: 20, max: 20, color: Math.random() < 0.5 ? '#ff8a2a' : '#ffd24a', size: 3 });
  }
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
function drawWeapon(kit, s, dir, frame) {
  if (kit === 'mage') {
    ctx.fillStyle = '#8b6b3a';
    ctx.fillRect(s.x + (dir > 0 ? PW + 2 : -5), s.y + 6, 3, 22);
    ctx.fillStyle = '#e9ddff';
    ctx.beginPath();
    ctx.arc(s.x + (dir > 0 ? PW + 3.5 : -3.5), s.y + 5, 3.5 + Math.sin(frame * 0.2) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kit === 'archer') {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e6c58a';
    ctx.beginPath();
    ctx.arc(s.x + (dir > 0 ? PW + 1 : -1), s.y + 15, 10, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
    ctx.stroke();
    ctx.fillStyle = '#7a4a22'; // carquois
    ctx.fillRect(s.x + (dir > 0 ? -4 : PW + 1), s.y + 6, 3, 14);
  }
}

function drawPlayer(p, s, frame) {
  const kit = level.cfg.abilities ? p.role : 'plain';
  const dir = s.face || 1;
  const skin = p.skin || 'classic';
  // petite animation : étirement en saut, écrasement à l'arrivée, léger rebond en marchant
  const vy = s.y - s.py;
  const stretch = Math.max(-0.12, Math.min(0.18, -vy * 0.014));
  const bob = s.mv && !s.air ? Math.abs(Math.sin(frame * 0.4 + s.t)) * 1.6 : 0;
  ctx.save();
  ctx.translate(s.x + PW / 2, s.y + PH);
  ctx.scale(1 - stretch * 0.5, 1 + stretch);
  ctx.translate(-(s.x + PW / 2), -(s.y + PH) - bob);
  Skins.draw(ctx, skin, s.x, s.y, { dir, color: p.color, t: frame + s.t });
  if (skin === 'classic' && kit === 'mage') {
    ctx.fillStyle = '#6a3fd1';
    ctx.beginPath();
    ctx.moveTo(s.x - 2, s.y + 2);
    ctx.lineTo(s.x + PW / 2, s.y - 14);
    ctx.lineTo(s.x + PW + 2, s.y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(s.x + PW / 2 - 1, s.y - 8, 2, 2);
  } else if (skin === 'classic' && kit === 'archer') {
    ctx.fillStyle = '#2f7d4a';
    ctx.fillRect(s.x - 1, s.y - 3, PW + 2, 8);
  }
  drawWeapon(kit, s, dir, frame);
  ctx.restore();

  ctx.font = '12px Nunito, sans-serif';
  ctx.textAlign = 'center';
  const tag = p.id === myId ? `${p.name} (toi)` : p.name;
  const top = s.y - ((skin === 'wizard') ? 24 : (skin === 'classic' && kit === 'mage') ? 20 : (skin === 'knight' || skin === 'robot' || skin === 'cat' || skin === 'dino') ? 14 : 8);
  outlinedText(tag, s.x + PW / 2, top, '#f3efe4');
  // rappel de la couleur du joueur sous son nom
  ctx.fillStyle = p.color;
  ctx.fillRect(s.x + PW / 2 - 8, top + 3, 16, 2);
}

function drawAim(s) {
  const kit = myKit();
  if (kit === 'plain' || !mouse.has) return;
  const L = level.L;
  L.open = new Set(world.open);
  L.shutOpen = new Set(world.sh);
  L.ice = new Set(world.ice.map((b) => b[1] * L.w + b[0]));
  L.burnt = new Set(world.bt);
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

  const path = Phys.projectilePath(L, kit === 'mage' ? 'orb' : 'arrow', { x: s.x, y: s.y, face: s.face }, mouse.x, mouse.y);
  ctx.save();
  ctx.fillStyle = kit === 'mage' ? 'rgba(183, 156, 255, .75)' : 'rgba(230, 197, 138, .85)';
  path.pts.forEach(([x, y], i) => {
    if (i % 4 === 0) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  });
  const end = path.pts[path.pts.length - 1];
  ctx.strokeStyle = 'rgba(255, 255, 255, .85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(end[0], end[1], 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCooldowns() {
  const kit = myKit();
  if (kit === 'plain') return;
  const cd = world.cd.find((c) => c[0] === myId);
  let bars;
  if (kit === 'mage') {
    bars = [['Orbe (J)', cd ? cd[1] : 0, '#b79cff'], ['Glace (K)', cd ? cd[2] : 0, '#a0e1ff']];
    if (level.cfg.swap) bars.push(['Échange (E)', cd ? cd[4] || 0 : 0, '#ff9ad0']);
  } else {
    bars = [['Flèche (J)', cd ? cd[1] : 0, '#e6c58a']];
    if (level.cfg.fire) bars.push(['Feu (K)', cd ? cd[2] : 0, '#ff9a3a']);
    bars.push(['Dash (L)', cd ? cd[3] : 0, '#9be564']);
  }
  bars.forEach(([label, remaining, color], i) => {
    const x = 12 + i * 104;
    const y = canvas.height - 28;
    ctx.fillStyle = 'rgba(13, 13, 38, .75)';
    ctx.fillRect(x, y, 96, 16);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, 92 * (1 - remaining), 12);
    ctx.font = '11px Nunito, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = remaining > 0 ? '#f3efe4' : '#16163a';
    ctx.fillText(label, x + 6, y + 12);
  });
}

/* ---------- Rendu : niveau ---------- */
const darkLayer = document.createElement('canvas');
let frame = 0;

function lightAt(lightSources, x, y) {
  let a = 0;
  for (const s of lightSources) a = Math.max(a, 1 - Math.hypot(s.x - x, s.y - y) / s.r);
  return Math.max(0, a);
}

function draw() {
  requestAnimationFrame(draw);
  drawPreview();
  if (!level || !world) return;
  frame++;
  const T = level.tile;
  const L = level.L;
  const W = canvas.width;
  const H = canvas.height;
  const theme = level.theme;

  ctx.drawImage(level.bg, 0, 0);
  window.Themes.drawDecor(ctx, theme, level.decor, frame, W, H);
  ctx.drawImage(level.tiles, 0, 0);

  const openSet = new Set(world.open);
  const pressedSet = new Set(world.pressed);
  const shutSet = new Set(world.sh);
  const burntSet = new Set(world.bt);
  const burningSet = new Set(world.bn);

  // Sources de lumière (niveaux sombres) : tout le monde a une petite lueur, le Mage éclaire plus loin
  const lights = [];
  for (const p of players) {
    const s = sprites.get(p.id);
    if (!s) continue;
    const isMage = level.cfg.abilities && p.role === 'mage';
    lights.push({ x: s.x + PW / 2, y: s.y + PH / 2, r: isMage ? LIGHT_MAGE : LIGHT_SELF });
  }
  L.torches.forEach((t, i) => {
    if (world.tc[i]) lights.push({ x: t.x + T / 2, y: t.y + T / 2, r: LIGHT_TORCH });
  });
  world.bn.forEach((idx) => {
    const c = tileCenter(idx);
    lights.push({ x: c.x, y: c.y, r: 60 });
  });

  level.rows.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      const ch = row[tx];
      if (ch === '.' || ch === '#') continue;
      const x = tx * T;
      const y = ty * T;
      if (ch === 'h') {
        const a = lightAt(lights, x + T / 2, y + T / 2);
        if (a > 0.02) {
          ctx.globalAlpha = Math.min(1, a * 1.6);
          ctx.fillStyle = '#7d5ce0';
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = '#b79cff';
          ctx.fillRect(x, y, T, 4);
          ctx.globalAlpha = 1;
        }
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

  L.checkpoints.forEach((c, i) => drawCheckpoint(c, T, world.cps.includes(i), frame));
  L.torches.forEach((t, i) => drawTorch(t, T, !!world.tc[i], frame));
  L.crystals.forEach((c, i) => {
    const seqShape = c.seqIndex >= 0 ? c.seqIndex % 3 : -1;
    drawCrystal(c, T, !!world.cr[i], seqShape, world.seq.done, world.seq.flash, frame);
  });
  L.targets.forEach((t, i) => drawTarget(t, T, !!world.tg[i]));
  level.keys.forEach((k, i) => {
    if (!world.keys.includes(i)) drawKey(k, frame);
  });

  // Progression d'une séquence de cristaux
  if (level.cfg.seqGroup) {
    const n = L.crystals.filter((c) => c.seqIndex >= 0).length;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = world.seq.done || i < world.seq.p ? '#9be564' : 'rgba(255, 255, 255, .4)';
      ctx.beginPath();
      ctx.arc(canvas.width / 2 - (n - 1) * 10 + i * 20, 22, 6, 0, Math.PI * 2);
      ctx.fill();
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
    darkLayer.width = canvas.width;
    darkLayer.height = canvas.height;
    const dctx = darkLayer.getContext('2d');
    dctx.fillStyle = 'rgba(5, 5, 20, .86)';
    dctx.fillRect(0, 0, darkLayer.width, darkLayer.height);
    dctx.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const flick = l.r > 80 && l.r !== LIGHT_MAGE ? Math.sin(frame * 0.3 + l.x) * 3 : 0;
      const g = dctx.createRadialGradient(l.x, l.y, l.r * 0.25, l.x, l.y, l.r + flick);
      g.addColorStop(0, 'rgba(0, 0, 0, 1)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dctx.fillStyle = g;
      dctx.beginPath();
      dctx.arc(l.x, l.y, l.r + flick, 0, Math.PI * 2);
      dctx.fill();
    }
    ctx.drawImage(darkLayer, 0, 0);
  }

  for (const p of players) {
    const s = sprites.get(p.id);
    if (!s) continue;
    s.py = s.y;
    s.x += (s.tx - s.x) * 0.6; // lissage entre deux mises à jour serveur
    s.y += (s.ty - s.y) * 0.6;
    drawPlayer(p, s, frame);
  }

  stepParts();
  drawParts();

  const mine = sprites.get(myId);
  if (mine && world.status === 'playing') drawAim(mine);
  drawCooldowns();
}

refreshPickers();
draw();

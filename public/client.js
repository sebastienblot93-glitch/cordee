// Même physique que le serveur (servie par /physics.js) : sert à prévoir la trajectoire des tirs
const Phys = window.Physics;
const PW = Phys.PW;
const PH = Phys.PH;

const $ = (id) => document.getElementById(id);
const screens = { menu: $('screen-menu'), lobby: $('screen-lobby'), game: $('screen-game') };
const menuRoot = $('menu-root');

// Couleur de chaque groupe (1, 2, 3) : plaques, portes, cristaux, cibles, volets
const GROUP_COLORS = { 1: '#ff6b9d', 2: '#4dd8e8', 3: '#9be564' };
const ROLE_LABEL = { mage: 'Mage', archer: 'Archer' };
const LIGHT_MAGE = 100; // rayon de la lumière du Mage dans les niveaux sombres
const LIGHT_SELF = 44; // rayon de la lueur de chaque joueur

let ws;
let pingTimer = null;
let myId = null;
let hostId = null;
let roomCode = null;
let players = []; // [{id, name, color, role}]
let levelList = []; // [{name, roles}]
let level = null; // { rows, tile, keys, door, index, total, name, hint, cfg, L }
let world = null;
const sprites = new Map(); // id -> { x, y, tx, ty, face }
const mouse = { x: 0, y: 0, has: false };

/* ---------- Prédiction locale ----------
   Le serveur reste le chef : mais pour que le personnage réagisse tout de suite aux touches,
   le navigateur rejoue la même physique pour TON personnage, puis se recale sur le serveur. */
let jumpPresses = 0; // compteur : chaque nouvelle pression de saut compte (double saut de l'Archer)
const PREDICTION = false; // désactivée : le serveur décide seul de la position (voir reconcile)
const STEP_MS = 1000 / 60;
window.__pred = null;
const pred = { me: null, hist: [], acc: 0, last: 0, rtt: 80, jumpSeen: 0, dash: false, nudges: 0, snaps: 0 };
window.__pred = pred;
function resetPrediction() {
  pred.me = null;
  pred.hist = [];
  pred.acc = 0;
  pred.last = performance.now();
  pred.jumpSeen = jumpPresses;
  pred.dash = false;
}

function freshWorld(level) {
  return {
    status: 'playing', keys: [], open: [], pressed: [], door: level.keys.length === 0,
    cr: [], tg: [], seq: { p: 0, done: false, flash: false }, sh: [], ice: [], proj: [], cps: [], cd: [],
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
      if (msg.status === 'lobby') {
        level = null;
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
      pred.rtt = Math.min(2000, Math.max(1, pred.rtt * 0.7 + (performance.now() - msg.c) * 0.3));
      $('hud-ping').textContent = `Ping ${Math.round(pred.rtt)} ms`;
      break;
  }
}

function applyState(msg) {
  if (!level) return;
  world = {
    status: msg.status, keys: msg.keys, open: msg.open, pressed: msg.pressed, door: msg.door,
    cr: msg.cr, tg: msg.tg, seq: msg.seq, sh: msg.sh, ice: msg.ice, proj: msg.proj, cps: msg.cps, cd: msg.cd,
    deaths: msg.deaths, recvAt: performance.now(),
  };
  for (const [id, x, y, face] of msg.p) {
    let s = sprites.get(id);
    if (!s) sprites.set(id, (s = { x, y, tx: x, ty: y, face }));
    if (PREDICTION && id === myId) {
      reconcile(x, y);
      s.sx = x; // position serveur (utile pour le débogage)
      s.sy = y;
      continue;
    }
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
  level = {
    rows: msg.level, tile: T, keys, door, index: msg.index, total: msg.total, name: msg.name, hint: msg.hint,
    cfg: { abilities: !!cfg.abilities, dark: !!cfg.dark, seqGroup: cfg.seqGroup || 0, labels: cfg.labels || [] }, L,
  };
  world = freshWorld(level);
  sprites.clear();
  resetPrediction();
  setupCanvas();
  $('level-hint').textContent = level.hint;
  updateRoleHint();
  updateBanner();
  updateHud();
  show('game');
}

function updateBanner() {
  const finished = world.status === 'finished';
  $('banner').textContent = finished ? 'Bravo, vous avez terminé tous les niveaux !' : 'Niveau réussi !';
  $('banner').classList.toggle('show', finished || world.status === 'won');
}

function updateHud() {
  if (!level) return;
  $('hud-level').textContent = `Niveau ${level.index + 1}/${level.total} : ${level.name}`;
  const parts = [];
  if (level.keys.length) parts.push(`Clés ${world.keys.length}/${level.keys.length}`);
  if (world.deaths) parts.push(`Chutes ${world.deaths}`);
  $('hud-keys').textContent = parts.join('   ');
}

function updateRoleHint() {
  const kit = myKit();
  const text = {
    mage: 'Mage : clic gauche (ou J) lance une orbe qui active les cristaux. Clic droit (ou K) pose de la glace sur les runes.',
    archer: 'Archer : clic gauche (ou J) tire une flèche qui active les cibles. Saute deux fois, et Maj (ou L) pour un dash.',
    plain: 'Flèches ou ZQSD pour bouger, espace pour sauter.',
  }[kit];
  $('role-hint').textContent = text;
}

/* ---------- Lobby ---------- */
function renderLobby() {
  show('lobby');
  $('lobby-code').textContent = roomCode;
  const ul = $('lobby-players');
  ul.innerHTML = '';
  players.forEach((p) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = p.color;
    const name = document.createElement('span');
    name.textContent = p.name;
    const role = document.createElement('span');
    role.className = 'tag';
    role.textContent = ROLE_LABEL[p.role] || '';
    li.append(dot, name, role);
    if (p.id === hostId) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'chef de room';
      li.append(tag);
    }
    ul.append(li);
  });

  const me = myPlayer();
  if (me) $('role-select').value = me.role;

  const isHost = myId === hostId;
  const sel = $('level-select');
  if (sel.options.length !== levelList.length) {
    const current = sel.value;
    sel.innerHTML = '';
    levelList.forEach((l, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = `${i + 1}. ${l.name}${l.roles ? ' (Mage + Archer)' : ''}`;
      sel.append(o);
    });
    if (current) sel.value = current;
  }
  $('level-panel').style.display = isHost ? '' : 'none';
  $('btn-start').style.display = isHost ? '' : 'none';
  $('lobby-wait').style.display = isHost ? 'none' : '';
}

$('btn-create').onclick = () => {
  setError('');
  connect(() => send({ t: 'create', name: $('name').value }));
};

$('btn-join').onclick = () => {
  const code = $('code').value.trim();
  if (code.length !== 4) return setError('Le code contient 4 lettres.');
  setError('');
  connect(() => send({ t: 'join', code, name: $('name').value }));
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
  const a = aimPoint();
  send({ t: 'cast', slot, x: a.x, y: a.y });
}

window.addEventListener('keydown', (e) => {
  if (!level) return;
  if (e.code === 'KeyR' && !e.repeat) return send({ t: 'restart' });
  if (e.code === 'KeyN' && !e.repeat) return send({ t: 'skip' }); // seul le chef de room est écouté
  if (e.code === 'KeyJ' && !e.repeat) return cast(1);
  if (e.code === 'KeyK' && !e.repeat) return cast(2);
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyL') && !e.repeat) {
    e.preventDefault();
    pred.dash = true;
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


function predictStep() {
  const L = level.L;
  const me = pred.me;
  me.input.left = input.left;
  me.input.right = input.right;
  me.input.jump = input.jump;
  me.input.jumpEdge = jumpPresses !== pred.jumpSeen;
  pred.jumpSeen = jumpPresses;
  me.input.dash = pred.dash;
  pred.dash = false;
  L.open = new Set(world.open);
  Phys.gatesTouching(L, me).forEach((g) => L.open.add(g));
  L.shutOpen = new Set(world.sh);
  L.ice = new Set(world.ice.map((b) => b[1] * L.w + b[0]));
  Phys.stepPlayer(L, me);
  me.input.jumpEdge = false;
  me.input.dash = false;
  // les autres joueurs portent et poussent : on les prend à leur dernière position connue
  const others = [];
  for (const [id, s] of sprites) if (id !== myId) others.push({ x: s.tx, y: s.ty, vy: 0, onGround: true, airJump: true, dashAvail: true });
  if (others.length) Phys.resolvePlayers(L, [me, ...others]);
}

// Rejoue la physique locale par pas de 1/60 s
function runPrediction() {
  const now = performance.now();
  if (!PREDICTION || !pred.me) return;
  pred.acc += Math.min(now - pred.last, 100);
  pred.last = now;
  while (pred.acc >= STEP_MS) {
    pred.acc -= STEP_MS;
    predictStep();
    pred.hist.push({ t: now, x: pred.me.x, y: pred.me.y });
  }
  while (pred.hist.length > 90) pred.hist.shift();
}

// Le serveur donne la vraie position : on compare avec celle que NOUS avions il y a un aller-retour
function reconcile(sx, sy) {
  const now = performance.now();
  if (!pred.me) {
    pred.me = Phys.newPlayerState(myKit());
    pred.me.x = sx;
    pred.me.y = sy;
    pred.last = now;
    return;
  }
  // Le serveur est un peu en retard sur nous : sa position doit se trouver sur notre trajectoire récente.
  // On cherche donc le point de notre historique (autour d'un aller-retour) le plus proche de lui.
  const center = now - pred.rtt;
  let best = null;
  let bestD = Infinity;
  for (const h of pred.hist) {
    if (h.t < center - 200 || h.t > center + 120) continue;
    const d = Math.max(Math.abs(sx - h.x), Math.abs(sy - h.y));
    if (d < bestD) { bestD = d; best = h; }
  }
  if (!best) best = { x: pred.me.x, y: pred.me.y };
  const ex = sx - best.x;
  const ey = sy - best.y;
  const err = Math.max(Math.abs(ex), Math.abs(ey));
  const idle = !input.left && !input.right && !input.jump && pred.me.onGround;
  if (err > 64) {
    // téléportation (mort, point de reprise, redémarrage) : on s'aligne sur le serveur
    pred.me.x = sx;
    pred.me.y = sy;
    pred.me.vy = 0;
    pred.me.dashT = 0;
    pred.hist = [];
    pred.snaps++;
  } else if (err > (idle ? 1.5 : 8)) {
    // petit écart : on se rapproche doucement, sans jamais traverser un mur
    pred.nudges++;
    Phys.moveAxis(level.L, pred.me, 'x', ex * 0.3);
    Phys.moveAxis(level.L, pred.me, 'y', ey * 0.3);
  }
}

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

function drawKey(k) {
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
}

function drawDoor(d, T, isOpen, inside, total) {
  if (isOpen) {
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(d.x + 4, d.y, T - 8, T);
    ctx.fillStyle = '#16163a';
    ctx.fillRect(d.x + 8, d.y + 4, T - 16, T - 4);
    ctx.font = '12px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f3efe4';
    ctx.fillText(`${inside}/${total}`, d.x + T / 2, d.y - 6);
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

function drawCrystal(c, T, active, seqShape, seqDone, flash) {
  const cx = c.x + T / 2;
  const cy = c.y + T / 2;
  const color = seqShape >= 0 ? (flash ? '#ff5050' : seqDone ? '#9be564' : '#b79cff') : GROUP_COLORS[c.group];
  if (active) {
    ctx.fillStyle = 'rgba(255, 255, 255, .25)';
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
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
  ctx.strokeStyle = active ? '#fff' : '#16163a';
  ctx.lineWidth = 2;
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

function drawCheckpoint(c, T, active) {
  ctx.fillStyle = '#c9c9ee';
  ctx.fillRect(c.x + 14, c.y + 4, 3, T - 4);
  ctx.fillStyle = active ? '#9be564' : '#7a7aa8';
  ctx.beginPath();
  ctx.moveTo(c.x + 17, c.y + 5);
  ctx.lineTo(c.x + 29, c.y + 10);
  ctx.lineTo(c.x + 17, c.y + 15);
  ctx.closePath();
  ctx.fill();
}

function drawSpikes(x, y, T) {
  ctx.fillStyle = '#d6d6f2';
  for (let i = 0; i < 3; i++) {
    const bx = x + 2 + i * 10;
    ctx.beginPath();
    ctx.moveTo(bx, y + T);
    ctx.lineTo(bx + 5, y + T - 15);
    ctx.lineTo(bx + 10, y + T);
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
}

function drawProjectile(pr, ticksAhead) {
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
  } else {
    const a = Math.atan2(vy, vx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = '#e6c58a';
    ctx.fillRect(-12, -1.5, 14, 3);
    ctx.fillStyle = '#f3efe4';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
function drawPlayer(p, s, frame) {
  const kit = level.cfg.abilities ? p.role : 'plain';
  ctx.fillStyle = p.color;
  ctx.fillRect(s.x, s.y, PW, PH);
  const dir = s.face || 1;
  ctx.fillStyle = '#fff';
  ctx.fillRect(s.x + 5, s.y + 7, 5, 5);
  ctx.fillRect(s.x + 14, s.y + 7, 5, 5);
  ctx.fillStyle = '#16163a';
  ctx.fillRect(s.x + 7 + (dir > 0 ? 1 : -1), s.y + 9, 3, 3);
  ctx.fillRect(s.x + 16 + (dir > 0 ? 1 : -1), s.y + 9, 3, 3);

  if (kit === 'mage') {
    ctx.fillStyle = '#6a3fd1';
    ctx.beginPath();
    ctx.moveTo(s.x - 2, s.y + 2);
    ctx.lineTo(s.x + PW / 2, s.y - 14);
    ctx.lineTo(s.x + PW + 2, s.y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(s.x + PW / 2 - 1, s.y - 8, 2, 2);
    ctx.fillStyle = '#8b6b3a';
    ctx.fillRect(s.x + (dir > 0 ? PW + 2 : -5), s.y + 6, 3, 22);
    ctx.fillStyle = '#e9ddff';
    ctx.beginPath();
    ctx.arc(s.x + (dir > 0 ? PW + 3.5 : -3.5), s.y + 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kit === 'archer') {
    ctx.fillStyle = '#2f7d4a';
    ctx.fillRect(s.x - 1, s.y - 3, PW + 2, 8);
    ctx.fillStyle = '#e6c58a';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e6c58a';
    ctx.beginPath();
    ctx.arc(s.x + (dir > 0 ? PW + 1 : -1), s.y + 15, 10, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
    ctx.stroke();
  }

  ctx.font = '12px Nunito, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f3efe4';
  const tag = p.id === myId ? `${p.name} (toi)` : p.name;
  ctx.fillText(tag, s.x + PW / 2, s.y - (kit === 'mage' ? 18 : 8));
}

function drawAim(s) {
  const kit = myKit();
  if (kit === 'plain' || !mouse.has) return;
  const L = level.L;
  L.open = new Set(world.open);
  L.shutOpen = new Set(world.sh);
  L.ice = new Set(world.ice.map((b) => b[1] * L.w + b[0]));
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
  ctx.fillStyle = kit === 'mage' ? 'rgba(183, 156, 255, .6)' : 'rgba(230, 197, 138, .7)';
  path.pts.forEach(([x, y], i) => {
    if (i % 4 === 0) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  });
  const end = path.pts[path.pts.length - 1];
  ctx.strokeStyle = 'rgba(255, 255, 255, .8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(end[0], end[1], 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCooldowns(me) {
  const kit = myKit();
  if (kit === 'plain') return;
  const cd = world.cd.find((c) => c[0] === myId);
  const bars = kit === 'mage'
    ? [['Orbe', cd ? cd[1] : 0, '#b79cff'], ['Glace', cd ? cd[2] : 0, '#a0e1ff']]
    : [['Flèche', cd ? cd[1] : 0, '#e6c58a'], ['Dash', cd ? cd[3] : 0, '#9be564']];
  bars.forEach(([label, remaining, color], i) => {
    const x = 12 + i * 92;
    const y = canvas.height - 28;
    ctx.fillStyle = 'rgba(13, 13, 38, .7)';
    ctx.fillRect(x, y, 84, 16);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, 80 * (1 - remaining), 12);
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
  if (!level || !world) return;
  runPrediction();
  frame++;
  const T = level.tile;
  const L = level.L;

  ctx.fillStyle = '#0d0d26';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const openSet = new Set(world.open);
  const pressedSet = new Set(world.pressed);
  const shutSet = new Set(world.sh);

  // Sources de lumière (niveaux sombres) : tout le monde a une petite lueur, le Mage éclaire plus loin
  const lights = [];
  for (const p of players) {
    const s = sprites.get(p.id);
    if (!s) continue;
    const isMage = level.cfg.abilities && p.role === 'mage';
    lights.push({ x: s.x + PW / 2, y: s.y + PH / 2, r: isMage ? LIGHT_MAGE : LIGHT_SELF });
  }

  level.rows.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      const ch = row[tx];
      const x = tx * T;
      const y = ty * T;
      if (ch === '#') {
        ctx.fillStyle = '#3b3b86';
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#5555aa';
        ctx.fillRect(x, y, T, 4);
      } else if (ch === 'h') {
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
        drawSpikes(x, y, T);
      } else if (ch >= 'a' && ch <= 'c') {
        drawGate(x, y, T, ch.charCodeAt(0) - 96, openSet.has(ch.charCodeAt(0) - 96));
      } else if (ch >= '1' && ch <= '3') {
        drawPlate(x, y, T, Number(ch), pressedSet.has(Number(ch)));
      } else if (ch === 'w' || ch === 'v' || ch === 'u') {
        const g = ch === 'w' ? 1 : ch === 'v' ? 2 : 3;
        drawShutter(x, y, T, g, shutSet.has(g));
      }
    }
  });

  L.checkpoints.forEach((c, i) => drawCheckpoint(c, T, world.cps.includes(i)));
  L.crystals.forEach((c, i) => {
    const seqShape = c.seqIndex >= 0 ? c.seqIndex % 3 : -1;
    drawCrystal(c, T, !!world.cr[i], seqShape, world.seq.done, world.seq.flash);
  });
  L.targets.forEach((t, i) => drawTarget(t, T, !!world.tg[i]));
  level.keys.forEach((k, i) => {
    if (!world.keys.includes(i)) drawKey(k);
  });

  // Progression d'une séquence de cristaux
  if (level.cfg.seqGroup) {
    const n = L.crystals.filter((c) => c.seqIndex >= 0).length;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = world.seq.done || i < world.seq.p ? '#9be564' : 'rgba(255, 255, 255, .25)';
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
    drawDoor(level.door, T, world.door, inside, players.length);
  }

  world.ice.forEach((b) => drawIce(b, T, frame));

  const ahead = Math.min((performance.now() - world.recvAt) / 16.7, 2);
  world.proj.forEach((pr) => drawProjectile(pr, ahead));

  level.cfg.labels.forEach((lb) => drawLabel(lb, T, lights));

  // Obscurité : un voile noir percé par la lumière du Mage et la lueur de chaque joueur
  if (level.cfg.dark) {
    darkLayer.width = canvas.width;
    darkLayer.height = canvas.height;
    const dctx = darkLayer.getContext('2d');
    dctx.fillStyle = 'rgba(5, 5, 20, .86)';
    dctx.fillRect(0, 0, darkLayer.width, darkLayer.height);
    dctx.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const g = dctx.createRadialGradient(l.x, l.y, l.r * 0.25, l.x, l.y, l.r);
      g.addColorStop(0, 'rgba(0, 0, 0, 1)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dctx.fillStyle = g;
      dctx.beginPath();
      dctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      dctx.fill();
    }
    ctx.drawImage(darkLayer, 0, 0);
  }

  for (const p of players) {
    const s = sprites.get(p.id);
    if (!s) continue;
    if (p.id === myId && pred.me) {
      // ton personnage : position prédite localement (réaction immédiate)
      s.x = s.tx = pred.me.x;
      s.y = s.ty = pred.me.y;
      s.face = pred.me.face;
    } else {
      s.x += (s.tx - s.x) * 0.6; // lissage entre deux mises à jour serveur
      s.y += (s.ty - s.y) * 0.6;
    }
    drawPlayer(p, s, frame);
  }

  const mine = sprites.get(myId);
  if (mine && world.status === 'playing') drawAim(mine);
  drawCooldowns(mine);
}
draw();

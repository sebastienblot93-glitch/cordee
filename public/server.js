const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { LEVELS, CHAPTERS } = require('./levels');
const {
  TILE, PW, PH, SPELL, ICE_PAD, COOP, parseLevel, hitsTile, gatesTouching, newPlayerState, stepPlayer,
  touchesRect, hitsSpikes, launchProjectile, stepProjectile, resolvePlayers, unstick, woodCluster,
} = require('./physics');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e', '#94a3b8'];
const ROLES = ['mage', 'archer'];
// Apparences proposées dans le salon (le dessin est fait par le navigateur)
const SKINS = ['classic', 'knight', 'ninja', 'robot', 'ghost', 'cat', 'astro', 'pirate', 'wizard', 'dino', 'pumpkin', 'frog', 'cookie'];
const FOREVER = 1e12;

const app = express();
// Le navigateur réutilise la même physique que le serveur (pour afficher la trajectoire des tirs)
app.get('/physics.js', (req, res) => res.sendFile(path.join(__dirname, 'physics.js')));

// Version du jeu : visible sur /diag pour vérifier que la mise à jour est bien en ligne
const BUILD = 'v2 - 24 niveaux, skins, sons';
const fs = require('fs');
const PUBLIC_DIR = path.join(__dirname, 'public');
const WEB_FILES = ['index.html', 'client.js', 'audio.js', 'skins.js', 'themes.js'];

// Pas de cache : le navigateur recharge toujours la dernière version du jeu
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  next();
});

// Si un fichier du site a été envoyé par erreur à la racine du dépôt (au lieu de public/),
// on sert quand même cette copie : c'est la plus récente.
app.get(['/', '/index.html', '/client.js', '/audio.js', '/skins.js', '/themes.js'], (req, res, next) => {
  const name = req.path === '/' ? 'index.html' : req.path.slice(1);
  const rootCopy = path.join(__dirname, name);
  if (fs.existsSync(rootCopy)) return res.sendFile(rootCopy);
  next();
});

// Page de diagnostic : ouvrez /diag dans le navigateur
app.get('/diag', (req, res) => {
  const size = (p) => (fs.existsSync(p) ? fs.statSync(p).size + ' octets' : 'MANQUANT');
  const lines = [
    'Cordée - ' + BUILD,
    'Niveaux dans levels.js : ' + LEVELS.length + ' (attendu : 24)',
    'Chapitres : ' + CHAPTERS.length + ' (attendu : 7)',
    '',
    'Fichiers dans public/ :',
    ...WEB_FILES.map((f) => '  ' + f + ' : ' + size(path.join(PUBLIC_DIR, f))),
    '',
    'Fichiers envoyés par erreur à la racine (ils sont servis quand même) :',
    ...WEB_FILES.map((f) => '  ' + f + ' : ' + (fs.existsSync(path.join(__dirname, f)) ? 'présent' : 'absent')),
  ];
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(lines.join('\n'));
});

app.use(express.static(PUBLIC_DIR));
const server = http.createServer(app);
// Latence : on désactive l'algorithme de Nagle (qui retarde l'envoi des petits paquets) sur chaque connexion
server.on('connection', (sock) => sock.setNoDelay(true));
const wss = new WebSocketServer({ server });

const rooms = new Map(); // code -> room
if (process.env.CORDEE_TEST) global.__rooms = rooms; // uniquement pour les tests automatiques

/* ---------- Monde : volets, plaques, cristaux, cibles, portes ---------- */
function holdFor(L, group) {
  const h = L.cfg.hold && L.cfg.hold[group];
  return h === undefined ? SPELL.defaultHold : h;
}

function updateWorld(room, list) {
  const L = room.level;
  const cfg = L.cfg;
  const t = room.time;

  // Volets : ouverts pendant une courte fenêtre de chaque cycle
  const shutOpen = new Set();
  if (cfg.shutters) {
    for (const [g, s] of Object.entries(cfg.shutters)) {
      if ((t + (s.phase || 0)) % s.period < s.open) shutOpen.add(Number(g));
    }
  }
  L.shutOpen = shutOpen;

  // Blocs liés : ils existent tant que tous les joueurs restent proches les uns des autres
  let far = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) far = Math.max(far, Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y));
  }
  if (room.linkOn && far > COOP.linkDist) room.linkOn = false;
  else if (!room.linkOn && far < COOP.linkBack) room.linkOn = true;
  room.linkDist = far;
  L.linkOn = room.linkOn;

  // Ponts synchro : les deux joueurs ont sauté presque en même temps
  if (cfg.sync && list.length >= 2 && room.syncUntil <= t && list.every((p) => t - p.jumpAt <= COOP.syncWindow)) {
    room.syncUntil = t + COOP.syncHold;
    room.events.push(['sync', Math.round(list[0].x), Math.round(list[0].y)]);
  }
  L.syncOn = t < room.syncUntil;

  // Déclencheurs de chaque groupe : plaques pressées, cristaux et cibles encore allumés
  const trig = { 1: [], 2: [], 3: [] };
  const pressed = new Set();
  const heavy = cfg.heavy || []; // plaques lourdes : il faut être deux dessus (ou sur les plaques voisines du même groupe)
  const heavyTouch = { 1: new Set(), 2: new Set(), 3: new Set() };
  for (const plate of L.plates) {
    if (heavy.includes(plate.group)) {
      for (const p of list) if (touchesRect(p, plate)) heavyTouch[plate.group].add(p.id);
      continue;
    }
    const on = list.some((p) => touchesRect(p, plate));
    trig[plate.group].push(on);
    if (on) pressed.add(plate.group);
  }
  for (const g of heavy) {
    if (!L.plates.some((pl) => pl.group === g)) continue;
    const on = heavyTouch[g].size >= Math.min(2, list.length);
    trig[g].push(on);
    if (on) pressed.add(g);
  }
  L.crystals.forEach((c, i) => {
    if (c.seqIndex < 0) trig[c.group].push(t < room.crystalUntil[i]);
  });
  L.targets.forEach((tg, i) => trig[tg.group].push(t < room.targetUntil[i]));
  L.torches.forEach((tc, i) => trig[tc.group].push(t < room.torchUntil[i]));

  // Une porte s'ouvre si un déclencheur est actif (ou tous, pour les groupes "and")
  const open = new Set();
  for (const g of [1, 2, 3]) {
    const arr = trig[g];
    const all = cfg.and && cfg.and.includes(g);
    const cond = arr.length > 0 && (all ? arr.every(Boolean) : arr.some(Boolean));
    if (cond && cfg.latch && cfg.latch[g]) room.latch[g] = t + cfg.latch[g];
    if (cond || (room.latch[g] || 0) > t) open.add(g);
  }
  if (cfg.sequence && room.seq.done) open.add(cfg.sequence.group);
  // Une porte reste ouverte tant qu'un joueur la traverse
  for (const p of list) for (const g of gatesTouching(L, p)) open.add(g);
  L.open = open;
  L.pressed = pressed;
}

function hitCrystal(room, i) {
  const L = room.level;
  const c = L.crystals[i];
  const t = room.time;
  if (c.seqIndex >= 0) {
    const seq = L.cfg.sequence;
    const S = room.seq;
    if (S.done) return;
    if (c.seqIndex === seq.order[S.progress]) {
      S.progress++;
      S.lastHit = t;
      if (S.progress === seq.order.length) S.done = true;
    } else {
      S.progress = 0;
      S.flash = 45;
    }
    return;
  }
  const hold = holdFor(L, c.group);
  room.crystalUntil[i] = hold === 0 ? FOREVER : t + hold;
}

function hitTarget(room, i) {
  const L = room.level;
  const hold = holdFor(L, L.targets[i].group);
  room.targetUntil[i] = hold === 0 ? FOREVER : room.time + hold;
}

function hitTorch(room, i) {
  const L = room.level;
  const hold = holdFor(L, L.torches[i].group);
  room.torchUntil[i] = hold === 0 ? FOREVER : room.time + hold;
}

// Le feu se propage de proche en proche dans le bois relié
function startBurn(room, tx, ty) {
  const L = room.level;
  const queued = new Set(room.burn.map((b) => b.idx));
  for (const c of woodCluster(L, tx, ty)) {
    if (queued.has(c.idx)) continue;
    room.burn.push({ idx: c.idx, at: room.time + SPELL.burnDelay + c.d * SPELL.burnStep });
  }
}

function stepBurn(room) {
  if (!room.burn.length) return;
  const L = room.level;
  room.burn = room.burn.filter((b) => {
    if (b.at > room.time) return true;
    L.burnt.add(b.idx);
    return false;
  });
}

/* ---------- Porter et lancer son coéquipier ---------- */
// Lâche le porteur (ou le porté) de p ; vx, vy : élan donné au porté
function dropCarried(room, carrier, vx, vy) {
  const q = room.players.get(carrier.carrying);
  carrier.carrying = null;
  carrier.grabCd = room.time + 20;
  if (q) {
    q.carriedBy = null;
    q.vx = vx;
    q.vy = vy;
    q.onGround = false;
    q.airJump = true;
    q.dashAvail = true;
    q.grabCd = room.time + 20;
  }
  return q;
}

function releaseCarry(room, p) {
  if (p.carrying) dropCarried(room, p, 0, 0);
  if (p.carriedBy) {
    const c = room.players.get(p.carriedBy);
    if (c && c.carrying === p.id) dropCarried(room, c, 0, 0);
    p.carriedBy = null;
  }
}

function grab(room, me) {
  const L = room.level;
  if (room.status !== 'playing' || me.carriedBy) return;
  if (!L.cfg.carry) return send(me.ws, { t: 'nograb', why: 'level' });
  if (me.carrying) { // 2e appui : on lance
    const q = dropCarried(room, me, (me.face || 1) * COOP.throwVx, COOP.throwVy);
    if (q) room.events.push(['throw', Math.round(q.x), Math.round(q.y)]);
    return;
  }
  if (room.time < me.grabCd) return;
  let best = null;
  let bd = Infinity;
  for (const q of room.players.values()) {
    if (q === me || q.carrying || q.carriedBy || room.time < q.grabCd) continue;
    const dx = Math.abs(q.x - me.x);
    const dy = q.y - me.y;
    if (dx > COOP.grabReach || dy < -PH - 8 || dy > 10) continue;
    if (dx + Math.abs(dy) < bd) { bd = dx + Math.abs(dy); best = q; }
  }
  if (!best) return send(me.ws, { t: 'nograb', why: 'far' }); // personne à portée
  if (hitsTile(L, me.x, me.y - PH)) return send(me.ws, { t: 'nograb', why: 'ceiling' }); // plafond trop bas
  me.carrying = best.id;
  best.carriedBy = me.id;
  best.vx = 0;
  best.vy = 0;
  best.dashT = 0;
  room.events.push(['grab', Math.round(best.x), Math.round(best.y)]);
}

/* ---------- Clés, porte, pièges ---------- */
function collectKeys(room, list) {
  room.level.keys.forEach((k, i) => {
    if (room.keysTaken.has(i)) return;
    const zone = { x: k.x + 4, y: k.y + 4, w: TILE - 8, h: TILE - 8 };
    if (list.some((p) => touchesRect(p, zone))) room.keysTaken.add(i);
  });
}

function doorOpen(room) {
  return room.keysTaken.size >= room.level.keys.length;
}

function allInDoor(room, list) {
  const d = room.level.door;
  if (!d || list.length === 0) return false;
  return list.every((p) => {
    const cx = p.x + PW / 2;
    const cy = p.y + PH / 2;
    return cx >= d.x && cx <= d.x + TILE && cy >= d.y && cy <= d.y + TILE;
  });
}

function respawn(room, p) {
  releaseCarry(room, p);
  const r = room.respawn;
  p.x = r.x;
  p.y = r.y;
  p.vy = 0;
  p.dashT = 0;
  p.onGround = false;
  p.airJump = true;
  p.dashAvail = true;
  room.deaths++;
  room.events.push(['die', Math.round(p.x), Math.round(p.y)]);
}

// Les pics renvoient au dernier drapeau validé (ou au départ). Un drapeau n'est validé
// que lorsque TOUS les joueurs l'ont atteint ; le niveau, lui, n'est jamais remis à zéro.
function hazardsAndCheckpoints(room, list) {
  const L = room.level;
  for (const p of list) if (hitsSpikes(L, p)) respawn(room, p);
  L.checkpoints.forEach((cp, i) => {
    if (room.cps.has(i)) return;
    const zone = { x: cp.x + 4, y: cp.y, w: TILE - 8, h: TILE };
    let seen = room.cpSeen.get(i);
    if (!seen) { seen = new Set(); room.cpSeen.set(i, seen); }
    for (const p of list) if (touchesRect(p, zone)) seen.add(p.id);
    if (list.length && list.every((p) => seen.has(p.id))) {
      room.cps.add(i);
      room.respawn = { x: cp.x + (TILE - PW) / 2, y: cp.y + TILE - PH };
    }
  });
}

/* ---------- Sorts et tirs ---------- */
function cast(room, p, slot, ax, ay) {
  const L = room.level;
  if (room.status !== 'playing' || !L.cfg.abilities) return;
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return;
  const t = room.time;

  if (p.kit === 'mage' && slot === 1 && t >= p.cd[0]) {
    p.cd[0] = t + SPELL.cdOrb;
    room.projectiles.push({ ...launchProjectile('orb', p, ax, ay), owner: p.id });
  } else if (p.kit === 'archer' && slot === 1 && t >= p.cd[0]) {
    p.cd[0] = t + SPELL.cdArrow;
    room.projectiles.push({ ...launchProjectile('arrow', p, ax, ay), owner: p.id });
  } else if (p.kit === 'mage' && slot === 2 && t >= p.cd[1]) {
    // Bloc de glace : seulement sur une zone de rune, à portée, jamais sur quelqu'un
    const tx = Math.floor(ax / TILE);
    const ty = Math.floor(ay / TILE);
    if (!L.rune[ty] || !L.rune[ty][tx]) return;
    const dist = Math.hypot(tx * TILE + TILE / 2 - (p.x + PW / 2), ty * TILE + TILE / 2 - (p.y + PH / 2));
    if (dist > SPELL.reach) return;
    const idx = ty * L.w + tx;
    if (L.ice.has(idx)) return;
    const cell = { x: tx * TILE - ICE_PAD, y: ty * TILE, w: TILE + 2 * ICE_PAD, h: TILE };
    if ([...room.players.values()].some((q) => touchesRect(q, cell))) return;
    p.cd[1] = t + SPELL.cdIce;
    L.ice.add(idx);
    room.ice.push({ idx, until: t + SPELL.iceLife });
    while (room.ice.length > SPELL.iceMax) L.ice.delete(room.ice.shift().idx);
  } else if (p.kit === 'archer' && slot === 2 && L.cfg.fire && t >= p.cd[1]) {
    p.cd[1] = t + SPELL.cdFire;
    room.projectiles.push({ ...launchProjectile('fire', p, ax, ay), owner: p.id });
  } else if (p.kit === 'mage' && slot === 3 && L.cfg.swap && t >= p.cd[2]) {
    p.cd[2] = t + SPELL.cdSwap;
    room.projectiles.push({ ...launchProjectile('swap', p, ax, ay), owner: p.id });
  }
  if (room.projectiles.length > 16) room.projectiles.splice(0, room.projectiles.length - 16);
}

function stepProjectiles(room) {
  const L = room.level;
  room.projectiles = room.projectiles.filter((pr) => {
    const ev = stepProjectile(L, pr);
    if (!ev) {
      if (pr.kind === 'swap' && trySwap(room, pr)) return false;
      return true;
    }
    if (ev.type === 'crystal') hitCrystal(room, ev.index);
    if (ev.type === 'target') hitTarget(room, ev.index);
    if (ev.type === 'torch') hitTorch(room, ev.index);
    if (ev.type === 'wood') startBurn(room, ev.tx, ev.ty);
    if (pr.kind === 'fire' || ev.type === 'crystal' || ev.type === 'target') {
      room.events.push([pr.kind === 'fire' ? 'fire' : 'hit', Math.round(pr.x), Math.round(pr.y)]);
    }
    return false;
  });
}

// L'éclair d'échange : le Mage échange sa place avec le premier joueur touché
function trySwap(room, pr) {
  const owner = room.players.get(pr.owner);
  if (!owner) return true;
  for (const q of room.players.values()) {
    if (q === owner) continue;
    if (pr.x > q.x - 6 && pr.x < q.x + PW + 6 && pr.y > q.y - 6 && pr.y < q.y + PH + 6) {
      const ox = owner.x;
      const oy = owner.y;
      room.events.push(['swap', Math.round(ox), Math.round(oy), Math.round(q.x), Math.round(q.y)]);
      owner.x = q.x; owner.y = q.y;
      q.x = ox; q.y = oy;
      for (const z of [owner, q]) {
        z.vy = 0; z.dashT = 0; z.airJump = true; z.dashAvail = true;
      }
      return true;
    }
  }
  return false;
}

function expireIce(room) {
  room.ice = room.ice.filter((b) => {
    if (b.until > room.time) return true;
    room.level.ice.delete(b.idx);
    return false;
  });
}

/* ---------- Joueurs entre eux ---------- */

/* ---------- Niveaux ---------- */
function resetPlayers(room) {
  const { spawn } = room.level;
  const abilities = room.level.cfg.abilities;
  let i = 0;
  for (const p of room.players.values()) {
    Object.assign(p, newPlayerState(abilities ? p.role : 'plain'), { input: p.input });
    p.input.jumpEdge = false;
    p.input.dash = false;
    p.x = spawn.x + (i % 4) * 4;
    p.y = spawn.y;
    p.cd = [0, 0, 0];
    p.jumpPending = false;
    p.dashPending = false;
    p.carrying = null;
    p.carriedBy = null;
    p.grabCd = 0;
    p.jumpAt = -999;
    i++;
  }
}

// Applique le rôle d'un joueur en cours de niveau : on garde sa position et sa vitesse, on remet ses capacités à neuf
function applyRole(room, p) {
  p.kit = room.level.cfg.abilities ? p.role : 'plain';
  p.airJump = true;
  p.dashAvail = true;
  p.dashT = 0;
  p.dashCd = 0;
  p.cd = [0, 0, 0];
  p.jumpPending = false;
  p.dashPending = false;
}

function hasBothRoles(room) {
  const roles = new Set([...room.players.values()].map((p) => p.role));
  return roles.has('mage') && roles.has('archer');
}

// Entre deux niveaux, on s'assure qu'il y a un Mage et un Archer
function ensureRoles(room) {
  const list = [...room.players.values()];
  if (list.length < 2 || hasBothRoles(room)) return;
  const missing = list[0].role === 'mage' ? 'archer' : 'mage';
  list[list.length - 1].role = missing;
}

function chapterInfo(index) {
  const def = LEVELS[index];
  const ch = CHAPTERS[def.chapter];
  const first = LEVELS.findIndex((l) => l.chapter === def.chapter);
  const count = LEVELS.filter((l) => l.chapter === def.chapter).length;
  return {
    index: def.chapter, name: ch.name, theme: ch.theme, blurb: ch.blurb, powers: ch.powers || [],
    pos: index - first + 1, count, first: index === first,
  };
}

function startMsg(room) {
  const def = LEVELS[room.levelIndex];
  return {
    t: 'start',
    level: def.rows,
    tile: TILE,
    index: room.levelIndex,
    total: LEVELS.length,
    name: def.name,
    hint: def.hint,
    timer: def.timer || 0, // secondes (0 = pas de minuteur)
    chapter: chapterInfo(room.levelIndex),
    cfg: {
      abilities: !!def.abilities,
      dark: !!def.dark,
      fire: !!def.fire,
      swap: !!def.swap,
      seqGroup: def.sequence ? def.sequence.group : 0,
      labels: def.labels || [],
      link: !!def.link,
      sync: !!def.sync,
      carry: !!def.carry,
      heavy: def.heavy || [],
    },
  };
}

function freshRoomState(room, index) {
  const def = LEVELS[index];
  room.levelIndex = index;
  room.level = parseLevel(def);
  room.keysTaken = new Set();
  room.time = 0;
  room.clock = 0; // images écoulées depuis le début du niveau (compte seulement pendant le jeu)
  room.limit = (def.timer || 0) * 60; // limite de temps en images (60 par seconde)
  room.projectiles = [];
  room.ice = [];
  room.cps = new Set();
  room.cpSeen = new Map(); // drapeau -> joueurs qui l'ont atteint
  room.respawn = { ...room.level.spawn };
  room.deaths = 0;
  room.latch = {};
  room.crystalUntil = room.level.crystals.map(() => 0);
  room.targetUntil = room.level.targets.map(() => 0);
  room.torchUntil = room.level.torches.map(() => 0);
  room.burn = [];
  room.events = [];
  room.seq = { progress: 0, done: false, flash: 0, lastHit: 0 };
  room.linkOn = true;
  room.linkDist = 0;
  room.syncUntil = 0;
}

function loadLevel(room, index) {
  freshRoomState(room, index);
  if (LEVELS[index].abilities) ensureRoles(room);
  room.status = 'playing';
  resetPlayers(room);
  broadcast(room, lobbyMsg(room));
  broadcast(room, startMsg(room));
}

function finishLevel(room) {
  if (room.levelIndex >= LEVELS.length - 1) {
    room.status = 'finished';
    room.timer = 420; // 7 secondes
  } else {
    room.status = 'won';
    room.timer = 150; // 2,5 secondes
  }
}

function backToLobby(room) {
  room.status = 'lobby';
  freshRoomState(room, 0);
  resetPlayers(room);
  broadcast(room, lobbyMsg(room));
}

/* ---------- Simulation ---------- */
function stateMsg(room, list) {
  const L = room.level;
  const t = room.time;
  const cdRatio = (until, total) => Math.max(0, Math.min(1, (until - t) / total));
  return {
    t: 'state',
    status: room.status,
    p: list.map((p) => [p.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, p.face]),
    keys: [...room.keysTaken],
    open: [...L.open],
    pressed: [...L.pressed],
    door: doorOpen(room),
    cr: L.crystals.map((c, i) => (c.seqIndex < 0 && t < room.crystalUntil[i] ? 1 : 0)),
    tg: L.targets.map((_, i) => (t < room.targetUntil[i] ? 1 : 0)),
    seq: { p: room.seq.progress, done: room.seq.done, flash: room.seq.flash > 0 },
    sh: [...L.shutOpen],
    tc: L.torches.map((_, i) => (t < room.torchUntil[i] ? 1 : 0)),
    bn: room.burn.map((b) => b.idx),
    bt: [...L.burnt],
    ev: room.events,
    ice: room.ice.map((b) => [b.idx % L.w, Math.floor(b.idx / L.w), b.until - t]),
    proj: room.projectiles.map((pr) => [pr.kind, Math.round(pr.x * 10) / 10, Math.round(pr.y * 10) / 10, Math.round(pr.vx * 100) / 100, Math.round(pr.vy * 100) / 100]),
    cps: [...room.cps],
    cph: [...room.cpSeen].filter(([i, set]) => !room.cps.has(i) && set.size > 0).map(([i]) => i),
    cd: list.map((p) => [
      p.id,
      cdRatio(p.cd[0], p.kit === 'archer' ? SPELL.cdArrow : SPELL.cdOrb),
      cdRatio(p.cd[1], p.kit === 'archer' ? SPELL.cdFire : SPELL.cdIce),
      Math.max(0, Math.min(1, p.dashCd / 40)),
      cdRatio(p.cd[2], SPELL.cdSwap),
    ]),
    lk: room.linkOn ? 1 : 0, // blocs liés présents
    ld: Math.round((room.linkDist / COOP.linkDist) * 100) / 100, // distance entre joueurs / distance maximale
    sy: Math.max(0, room.syncUntil - t), // ticks restants des ponts synchro
    jw: list.map((p) => Math.max(0, COOP.syncWindow - (t - p.jumpAt))), // fenêtre de saut synchro encore ouverte
    cy: list.filter((p) => p.carriedBy).map((p) => [p.carriedBy, p.id]),
    deaths: room.deaths,
    tl: room.limit ? Math.max(0, Math.ceil((room.limit - room.clock) / 60)) : 0, // secondes restantes
  };
}

function tick(room) {
  const list = [...room.players.values()];
  const L = room.level;
  updateWorld(room, list);

  for (const p of list) {
    if (p.carriedBy) { // porté : suit son porteur ; un saut le fait descendre
      const c = room.players.get(p.carriedBy);
      if (!c || c.carrying !== p.id) p.carriedBy = null;
      else if (p.jumpPending) dropCarried(room, c, (c.face || 1) * 2, -7);
      else { p.jumpPending = false; p.dashPending = false; continue; }
    }
    unstick(L, p);
    p.input.jumpEdge = p.jumpPending;
    p.input.dash = p.dashPending && !p.carrying; // pas de dash en portant quelqu'un
    stepPlayer(L, p);
    p.jumpPending = false;
    p.dashPending = false;
    p.input.jumpEdge = false;
    p.input.dash = false;
  }
  for (const p of list) { // les portés se posent sur la tête de leur porteur (après son déplacement)
    if (!p.carriedBy) continue;
    const c = room.players.get(p.carriedBy);
    if (!c) continue;
    if (hitsTile(L, c.x, c.y - PH)) { dropCarried(room, c, 0, 0); continue; } // plafond : on le repose
    p.x = c.x;
    p.y = c.y - PH;
    p.vy = 0;
    p.vx = 0;
    p.onGround = false;
  }
  resolvePlayers(L, list);
  collectKeys(room, list);
  hazardsAndCheckpoints(room, list);
  stepProjectiles(room);
  stepBurn(room);
  expireIce(room);

  const seq = L.cfg.sequence;
  if (seq && seq.timeout && room.seq.progress > 0 && !room.seq.done && room.time - room.seq.lastHit > seq.timeout) {
    room.seq.progress = 0;
    room.seq.flash = 45;
  }
  if (room.seq.flash > 0) room.seq.flash--;
  room.time++;

  if (room.status === 'playing') {
    if (room.limit) room.clock++;
    if (doorOpen(room) && allInDoor(room, list)) finishLevel(room);
    else if (room.limit && room.clock >= room.limit) {
      room.status = 'timeup'; // temps écoulé : on laisse lire le message puis le niveau redémarre
      room.timer = 180; // 3 secondes
    }
  } else if (room.status === 'timeup') {
    if (--room.timer <= 0) return loadLevel(room, room.levelIndex);
  } else if (room.status === 'won') {
    if (--room.timer <= 0) return loadLevel(room, room.levelIndex + 1);
  } else if (room.status === 'finished') {
    if (--room.timer <= 0) return backToLobby(room);
  }

  room.tickCount++;
  if (room.tickCount % 2 === 0) {
    broadcast(room, stateMsg(room, list)); // état complet : 30 par seconde
    room.events = [];
  } else {
    // un petit message de positions à chaque autre tick : les déplacements arrivent 60 fois par seconde
    broadcast(room, { t: 'pos', p: list.map((p) => [p.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, p.face]) });
  }
}

// Boucle à pas fixe : exactement 60 ticks par seconde (un simple setInterval(…, 16) en ferait ~62 et dériverait),
// vérifiée toutes les 4 ms pour que chaque tick parte au bon moment, sans à-coups.
const STEP_MS = 1000 / 60;
let stepAcc = 0;
let stepPrev = performance.now();
setInterval(() => {
  const now = performance.now();
  stepAcc += Math.min(now - stepPrev, 100); // si le serveur a été gelé, on ne rattrape pas plus de 100 ms
  stepPrev = now;
  while (stepAcc >= STEP_MS) {
    stepAcc -= STEP_MS;
    for (const room of rooms.values()) if (room.status !== 'lobby') tick(room);
  }
}, 4);

/* ---------- Rooms ---------- */
function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(data);
}

function lobbyMsg(room) {
  return {
    t: 'lobby',
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    levels: LEVELS.map((l) => ({ name: l.name, roles: !!l.abilities, chapter: l.chapter })),
    chapters: CHAPTERS.map((c) => ({ name: c.name, theme: c.theme })),
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, role: p.role, skin: p.skin })),
  };
}

function addPlayer(room, ws, name, skin, wantColor) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  const color = (COLORS.includes(wantColor) && !used.has(wantColor) && wantColor)
    || COLORS.find((c) => !used.has(c)) || COLORS[0];
  const counts = ROLES.map((r) => [...room.players.values()].filter((p) => p.role === r).length);
  const role = counts[0] <= counts[1] ? 'mage' : 'archer';
  const abilities = room.level.cfg.abilities;
  const player = Object.assign(newPlayerState(abilities ? role : 'plain'), {
    id: ws.id, ws, name, color, role, skin: cleanSkin(skin), cd: [0, 0, 0], jumpPending: false, dashPending: false, jpSeen: 0, carrying: null, carriedBy: null, grabCd: 0, jumpAt: -999,
  });
  player.x = room.level.spawn.x;
  player.y = room.level.spawn.y;
  room.players.set(ws.id, player);
  ws.room = room;
  if (!room.hostId) room.hostId = ws.id;
  return player;
}

function removePlayer(ws) {
  const room = ws.room;
  if (!room) return;
  const gone = room.players.get(ws.id);
  if (gone) releaseCarry(room, gone);
  room.players.delete(ws.id);
  ws.room = null;
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === ws.id) room.hostId = room.players.keys().next().value;
  broadcast(room, lobbyMsg(room));
}

function cleanSkin(s) {
  return SKINS.includes(s) ? s : 'classic';
}

function cleanName(n) {
  return String(n || 'Joueur').replace(/[<>]/g, '').trim().slice(0, 12) || 'Joueur';
}

/* ---------- WebSocket ---------- */
let nextId = 1;
wss.on('connection', (ws) => {
  ws.id = String(nextId++);
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.room;

    switch (msg.t) {
      case 'create': {
        if (room) return;
        const code = makeCode();
        const fresh = {
          code, hostId: null, status: 'lobby', players: new Map(), tickCount: 0, timer: 0,
        };
        freshRoomState(fresh, 0);
        rooms.set(code, fresh);
        addPlayer(fresh, ws, cleanName(msg.name), msg.skin, msg.color);
        send(ws, { t: 'joined', id: ws.id });
        broadcast(fresh, lobbyMsg(fresh));
        break;
      }
      case 'join': {
        if (room) return;
        const target = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!target) return send(ws, { t: 'error', msg: 'Room introuvable. Vérifie le code.' });
        if (target.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'Room pleine.' });
        addPlayer(target, ws, cleanName(msg.name), msg.skin, msg.color);
        send(ws, { t: 'joined', id: ws.id });
        broadcast(target, lobbyMsg(target));
        if (target.status !== 'lobby') send(ws, startMsg(target));
        break;
      }
      case 'role': {
        // Le rôle se choisit dans le salon
        if (!room || room.status !== 'lobby' || !ROLES.includes(msg.role)) return;
        room.players.get(ws.id).role = msg.role;
        broadcast(room, lobbyMsg(room));
        break;
      }
      case 'swaproles': {
        // En pleine partie, n'importe quel joueur peut échanger son rôle avec celui de l'autre rôle (Mage <-> Archer)
        const me = room && room.players.get(ws.id);
        if (!me || room.status !== 'playing') return;
        const now = Date.now();
        if (now < (me.roleLockUntil || 0)) return; // petite pause pour éviter les échanges en rafale
        const other = [...room.players.values()].find((q) => q !== me && q.role !== me.role);
        const mine = me.role;
        if (other) {
          me.role = other.role;
          other.role = mine;
          other.roleLockUntil = now + 1500;
          applyRole(room, other);
        } else {
          me.role = mine === 'mage' ? 'archer' : 'mage';
        }
        me.roleLockUntil = now + 1500;
        applyRole(room, me);
        broadcast(room, lobbyMsg(room));
        break;
      }
      case 'emote': {
        // Bulle de dialogue : relayée à toute la room (au plus une toutes les 0,6 s par joueur)
        const me = room && room.players.get(ws.id);
        const n = parseInt(msg.e, 10);
        if (!me || !(n >= 0 && n < 12)) return;
        const now = Date.now();
        if (now < (me.emoteUntil || 0)) return;
        me.emoteUntil = now + 600;
        broadcast(room, { t: 'emote', id: ws.id, e: n });
        break;
      }
      case 'start': {
        if (!room || room.hostId !== ws.id || room.status !== 'lobby') return;
        const index = Math.min(Math.max(parseInt(msg.level, 10) || 0, 0), LEVELS.length - 1);
        if (LEVELS[index].abilities && !hasBothRoles(room)) {
          const msgErr = room.players.size < 2
            ? `Vous êtes seul dans cette room (${room.code}). L'autre joueur doit cliquer sur « Rejoindre » et saisir ce code, sans créer sa propre room.`
            : 'Ce niveau demande un Mage et un Archer. L\u2019un de vous deux doit changer de rôle dans le salon.';
          return send(ws, { t: 'error', msg: msgErr });
        }
        loadLevel(room, index);
        break;
      }
      case 'restart': {
        // N'importe quel joueur peut recommencer le niveau (utile si on est coincé)
        if (!room || room.status !== 'playing') return;
        loadLevel(room, room.levelIndex);
        break;
      }
      case 'skip': {
        if (!room || room.hostId !== ws.id || room.status !== 'playing') return;
        if (room.levelIndex >= LEVELS.length - 1) finishLevel(room);
        else loadLevel(room, room.levelIndex + 1);
        break;
      }
      case 'input': {
        const p = room && room.players.get(ws.id);
        if (!p) return;
        p.input.left = !!msg.left;
        p.input.right = !!msg.right;
        p.input.jump = !!msg.jump;
        if (msg.jp !== undefined && msg.jp !== p.jpSeen) {
          p.jpSeen = msg.jp;
          p.jumpPending = true; // nouvelle pression de la touche saut (double saut)
          p.jumpAt = room.time; // pour les ponts synchro
        }
        break;
      }
      case 'look': {
        // Change d'apparence (skin et couleur) à tout moment
        const p = room && room.players.get(ws.id);
        if (!p) return;
        p.skin = cleanSkin(msg.skin);
        const taken = [...room.players.values()].some((q) => q !== p && q.color === msg.color);
        if (COLORS.includes(msg.color) && !taken) p.color = msg.color;
        broadcast(room, lobbyMsg(room));
        break;
      }
      case 'ping': {
        send(ws, { t: 'pong', c: msg.c });
        break;
      }
      case 'dash': {
        const p = room && room.players.get(ws.id);
        if (p) p.dashPending = true;
        break;
      }
      case 'grab': {
        const p = room && room.players.get(ws.id);
        if (p) grab(room, p);
        break;
      }
      case 'cast': {
        const p = room && room.players.get(ws.id);
        if (p) cast(room, p, msg.slot, Number(msg.x), Number(msg.y));
        break;
      }
    }
  });

  ws.on('close', () => removePlayer(ws));
});

// Détecte les connexions mortes (utile derrière un proxy d'hébergeur)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.alive) return ws.terminate();
    ws.alive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => console.log(`Serveur lancé sur http://localhost:${PORT}`));

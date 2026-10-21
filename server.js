const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { LEVELS } = require('./levels');
const {
  TILE, PW, PH, SPELL, parseLevel, hitsTile, gatesTouching, newPlayerState, stepPlayer,
  touchesRect, hitsSpikes, launchProjectile, stepProjectile, resolvePlayers, unstick,
} = require('./physics');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#ec4899'];
const ROLES = ['mage', 'archer'];
const FOREVER = 1e12;

const app = express();
// Le navigateur réutilise la même physique que le serveur (pour afficher la trajectoire des tirs)
app.get('/physics.js', (req, res) => res.sendFile(path.join(__dirname, 'physics.js')));
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map(); // code -> room

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

  // Déclencheurs de chaque groupe : plaques pressées, cristaux et cibles encore allumés
  const trig = { 1: [], 2: [], 3: [] };
  const pressed = new Set();
  for (const plate of L.plates) {
    const on = list.some((p) => touchesRect(p, plate));
    trig[plate.group].push(on);
    if (on) pressed.add(plate.group);
  }
  L.crystals.forEach((c, i) => {
    if (c.seqIndex < 0) trig[c.group].push(t < room.crystalUntil[i]);
  });
  L.targets.forEach((tg, i) => trig[tg.group].push(t < room.targetUntil[i]));

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
  const r = room.respawn;
  p.x = r.x;
  p.y = r.y;
  p.vy = 0;
  p.dashT = 0;
  p.onGround = false;
  p.airJump = true;
  p.dashAvail = true;
  room.deaths++;
}

function hazardsAndCheckpoints(room, list) {
  const L = room.level;
  for (const p of list) if (hitsSpikes(L, p)) respawn(room, p);
  L.checkpoints.forEach((cp, i) => {
    if (room.cps.has(i)) return;
    const zone = { x: cp.x + 4, y: cp.y, w: TILE - 8, h: TILE };
    if (list.some((p) => touchesRect(p, zone))) {
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
    const cell = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
    if ([...room.players.values()].some((q) => touchesRect(q, cell))) return;
    p.cd[1] = t + SPELL.cdIce;
    L.ice.add(idx);
    room.ice.push({ idx, until: t + SPELL.iceLife });
    while (room.ice.length > SPELL.iceMax) L.ice.delete(room.ice.shift().idx);
  }
  if (room.projectiles.length > 16) room.projectiles.splice(0, room.projectiles.length - 16);
}

function stepProjectiles(room) {
  const L = room.level;
  room.projectiles = room.projectiles.filter((pr) => {
    const ev = stepProjectile(L, pr);
    if (!ev) return true;
    if (ev.type === 'crystal') hitCrystal(room, ev.index);
    if (ev.type === 'target') hitTarget(room, ev.index);
    return false;
  });
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
    p.cd = [0, 0];
    p.jumpPending = false;
    p.dashPending = false;
    i++;
  }
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
    cfg: {
      abilities: !!def.abilities,
      dark: !!def.dark,
      seqGroup: def.sequence ? def.sequence.group : 0,
      labels: def.labels || [],
    },
  };
}

function freshRoomState(room, index) {
  const def = LEVELS[index];
  room.levelIndex = index;
  room.level = parseLevel(def);
  room.keysTaken = new Set();
  room.time = 0;
  room.projectiles = [];
  room.ice = [];
  room.cps = new Set();
  room.respawn = { ...room.level.spawn };
  room.deaths = 0;
  room.latch = {};
  room.crystalUntil = room.level.crystals.map(() => 0);
  room.targetUntil = room.level.targets.map(() => 0);
  room.seq = { progress: 0, done: false, flash: 0, lastHit: 0 };
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
    ice: room.ice.map((b) => [b.idx % L.w, Math.floor(b.idx / L.w), b.until - t]),
    proj: room.projectiles.map((pr) => [pr.kind, Math.round(pr.x * 10) / 10, Math.round(pr.y * 10) / 10, Math.round(pr.vx * 100) / 100, Math.round(pr.vy * 100) / 100]),
    cps: [...room.cps],
    cd: list.map((p) => [
      p.id,
      cdRatio(p.cd[0], p.kit === 'archer' ? SPELL.cdArrow : SPELL.cdOrb),
      cdRatio(p.cd[1], SPELL.cdIce),
      Math.max(0, Math.min(1, p.dashCd / 40)),
    ]),
    deaths: room.deaths,
  };
}

function tick(room) {
  const list = [...room.players.values()];
  const L = room.level;
  updateWorld(room, list);

  for (const p of list) {
    unstick(L, p);
    p.input.jumpEdge = p.jumpPending;
    p.input.dash = p.dashPending;
    stepPlayer(L, p);
    p.jumpPending = false;
    p.dashPending = false;
    p.input.jumpEdge = false;
    p.input.dash = false;
  }
  resolvePlayers(L, list);
  collectKeys(room, list);
  hazardsAndCheckpoints(room, list);
  stepProjectiles(room);
  expireIce(room);

  const seq = L.cfg.sequence;
  if (seq && seq.timeout && room.seq.progress > 0 && !room.seq.done && room.time - room.seq.lastHit > seq.timeout) {
    room.seq.progress = 0;
    room.seq.flash = 45;
  }
  if (room.seq.flash > 0) room.seq.flash--;
  room.time++;

  if (room.status === 'playing') {
    if (doorOpen(room) && allInDoor(room, list)) finishLevel(room);
  } else if (room.status === 'won') {
    if (--room.timer <= 0) return loadLevel(room, room.levelIndex + 1);
  } else if (room.status === 'finished') {
    if (--room.timer <= 0) return backToLobby(room);
  }

  room.tickCount++;
  if (room.tickCount % 2 === 0) broadcast(room, stateMsg(room, list)); // 30 mises à jour par seconde
}

setInterval(() => {
  for (const room of rooms.values()) if (room.status !== 'lobby') tick(room);
}, 1000 / 60);

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
    levels: LEVELS.map((l) => ({ name: l.name, roles: !!l.abilities })),
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, role: p.role })),
  };
}

function addPlayer(room, ws, name) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  const color = COLORS.find((c) => !used.has(c)) || COLORS[0];
  const counts = ROLES.map((r) => [...room.players.values()].filter((p) => p.role === r).length);
  const role = counts[0] <= counts[1] ? 'mage' : 'archer';
  const abilities = room.level.cfg.abilities;
  const player = Object.assign(newPlayerState(abilities ? role : 'plain'), {
    id: ws.id, ws, name, color, role, cd: [0, 0], jumpPending: false, dashPending: false, jpSeen: 0,
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
  room.players.delete(ws.id);
  ws.room = null;
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === ws.id) room.hostId = room.players.keys().next().value;
  broadcast(room, lobbyMsg(room));
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
        addPlayer(fresh, ws, cleanName(msg.name));
        send(ws, { t: 'joined', id: ws.id });
        broadcast(fresh, lobbyMsg(fresh));
        break;
      }
      case 'join': {
        if (room) return;
        const target = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!target) return send(ws, { t: 'error', msg: 'Room introuvable. Vérifie le code.' });
        if (target.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'Room pleine.' });
        addPlayer(target, ws, cleanName(msg.name));
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
        }
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

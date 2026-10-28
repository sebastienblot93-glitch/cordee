const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { LEVELS, CHAPTERS } = require('./levels');
const {
  TILE, PW, PH, SPELL, ICE_PAD, COOP, parseLevel, hitsTile, gatesTouching, newPlayerState, stepPlayer,
  touchesRect, hitsSpikes, tileSolid, launchProjectile, stepProjectile, resolvePlayers, unstick, woodCluster,
} = require('./physics');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e', '#94a3b8'];
const ROLES = ['mage', 'archer'];
// Apparences proposées dans le salon (le dessin est fait par le navigateur)
const SKINS = ['tasse', 'cookie', 'magicien', 'gilet', 'pc', 'spaetzle', 'swift', 'roulee', 'archer', 'bretzel', 'toaster', 'canard', 'durif', 'ogre'];
const FOREVER = 1e12;

const app = express();
// Le navigateur réutilise la même physique que le serveur (pour afficher la trajectoire des tirs)
app.get('/physics.js', (req, res) => res.sendFile(path.join(__dirname, 'physics.js')));

// Version du jeu : visible sur /diag pour vérifier que la mise à jour est bien en ligne
const BUILD = 'v3 - 34 niveaux, boss final, médailles, records, étoiles, sauvegarde en ligne';
const fs = require('fs');
const PUBLIC_DIR = path.join(__dirname, 'public');
const WEB_FILES = ['index.html', 'client.js', 'progress.js', 'audio.js', 'skins.js', 'themes.js'];

// Pas de cache : le navigateur recharge toujours la dernière version du jeu
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  next();
});

// Si un fichier du site a été envoyé par erreur à la racine du dépôt (au lieu de public/),
// on sert quand même cette copie : c'est la plus récente.
app.get(['/', '/index.html', '/client.js', '/progress.js', '/audio.js', '/skins.js', '/themes.js'], (req, res, next) => {
  const name = req.path === '/' ? 'index.html' : req.path.slice(1);
  const rootCopy = path.join(__dirname, name);
  if (fs.existsSync(rootCopy)) return res.sendFile(rootCopy);
  next();
});

// Page de diagnostic : ouvrez /diag dans le navigateur
app.get('/diag', async (req, res) => {
  const size = (p) => (fs.existsSync(p) ? fs.statSync(p).size + ' octets' : 'MANQUANT');
  const lines = [
    'Cordée - ' + BUILD,
    'Niveaux dans levels.js : ' + LEVELS.length + ' (attendu : 36, dont le tutoriel et le défi)',
    'Chapitres : ' + CHAPTERS.length + ' (attendu : 11, dont le tutoriel et le défi)',
    'Sauvegarde des records : ' + (storeMode === 'upstash' ? 'en ligne (Upstash) - durable' : storeMode === 'file' ? 'fichier local - effacé à chaque redémarrage sur Render' : 'mémoire - perdue au redémarrage') + ' (savedata.js : ' + size(path.join(__dirname, 'savedata.js')) + ')',
    ...(storeMode === 'upstash' ? await upstashDiag() : []),
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

// Liste des niveaux (noms, chronos, seuils de médailles) : sert aux panneaux de records et d'étoiles
app.get('/api/levels', (req, res) => {
  res.json({
    levels: LEVELS.map((l) => ({
      name: l.name, chapter: l.chapter, timer: l.timer || 0, diamond: l.diamond, gold: l.gold, silver: l.silver,
      star: l.rows.some((r) => r.includes('*')), tutorial: !!l.tutorial, challenge: !!l.challenge,
    })),
    chapters: CHAPTERS.map((c) => ({ name: c.name, theme: c.theme, challenge: !!c.challenge })),
  });
});

/* ---------- Sauvegarde en ligne des records / étoiles (« code d'équipe ») ----------
   Le disque d'un serveur Render gratuit est effacé à chaque redémarrage : les données sont donc
   gardées dans une base gratuite (Upstash Redis) si UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN sont définis.
   Sinon : un simple fichier (utile en local) ou, à défaut, la mémoire (perdue au redémarrage). */
const SaveData = require('./savedata');
const clean = (s) => String(s || '').trim().replace(/^["']+|["']+$/g, '');
const UP_URL = clean(process.env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, '');
const UP_TOKEN = clean(process.env.UPSTASH_REDIS_REST_TOKEN);
const DATA_FILE = process.env.CORDEE_DATA || path.join(__dirname, 'data', 'teams.json');

const teamCache = new Map(); // clé -> sauvegarde (copie en mémoire : évite des lectures inutiles de la base)
let fileDb = null;
let storeMode = 'memory';

// Message d'erreur lisible, avec la vraie cause (« fetch failed » seul ne dit rien)
function errText(e) {
  const c = e && e.cause;
  return (e && e.message) + (c ? ` [${c.code || c.name || ''} ${c.message || ''}]`.replace(/\s+\]/, ']') : '');
}
// Utilisé par /diag : teste la connexion à Upstash sans jamais afficher le jeton
async function upstashDiag() {
  let addr = '(illisible)';
  try { const u = new URL(UP_URL); addr = `${u.protocol}//${u.host}${u.pathname.length > 1 ? u.pathname : ''}`; } catch { addr = `(adresse invalide : « ${UP_URL.slice(0, 12)}… »)`; }
  const out = [`  Adresse lue : ${addr}`, `  Jeton : ${UP_TOKEN.length} caractères`];
  try { await upstash(['PING']); await upstash(['SET', 'cordee:diag', String(Date.now())]); out.push('  Test lecture + écriture : OK'); } catch (e) { out.push('  Test Upstash : ÉCHEC - ' + errText(e)); }
  return out;
}
async function upstash(cmd) {
  const r = await fetch(UP_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Upstash HTTP ${r.status}`);
  return j.result;
}
function initStore() {
  if (UP_URL && UP_TOKEN) { storeMode = 'upstash'; return; }
  try {
    fileDb = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {};
    storeMode = 'file';
  } catch (e) {
    fileDb = {};
    try { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); fs.writeFileSync(DATA_FILE, '{}'); storeMode = 'file'; } catch { storeMode = 'memory'; }
  }
}
initStore();
let fileTimer = null;
function saveFile() {
  if (storeMode !== 'file' || fileTimer) return;
  fileTimer = setTimeout(() => {
    fileTimer = null;
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(fileDb)); } catch { /* ignore */ }
  }, 500);
}
async function storeGet(key) {
  if (teamCache.has(key)) return teamCache.get(key);
  let raw = null;
  if (storeMode === 'upstash') raw = await upstash(['GET', `cordee:team:${key}`]);
  else if (fileDb) raw = fileDb[key] || null;
  let data = SaveData.blank();
  if (raw) { try { data = SaveData.sanitize(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch { /* données illisibles : on repart de zéro */ } }
  teamCache.set(key, data);
  return data;
}
async function storeSet(key, data) {
  const raw = JSON.stringify(data);
  if (storeMode === 'upstash') await upstash(['SET', `cordee:team:${key}`, raw]);
  else if (fileDb) { fileDb[key] = raw; saveFile(); }
  teamCache.set(key, data);
}
// Un seul traitement à la fois par équipe (les deux joueurs peuvent envoyer en même temps)
const teamLocks = new Map();
function withLock(key, fn) {
  const prev = teamLocks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  teamLocks.set(key, next);
  next.finally(() => { if (teamLocks.get(key) === next) teamLocks.delete(key); }).catch(() => {});
  return next;
}
// Limite simple : 90 requêtes par minute et par adresse
const rateHits = new Map();
function rateOk(ip) {
  const now = Date.now();
  const h = (rateHits.get(ip) || []).filter((t) => now - t < 60000);
  h.push(now);
  rateHits.set(ip, h);
  if (rateHits.size > 5000) rateHits.clear();
  return h.length <= 90;
}
const teamKey = (code) => {
  const k = String(code || '').trim().toLowerCase();
  return /^[a-z0-9_-]{6,48}$/.test(k) ? k : null;
};

async function teamHandler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const reply = (status, obj) => { res.statusCode = status; res.end(JSON.stringify(obj)); };
  const key = teamKey(req.params.code);
  if (!key) return reply(400, { ok: false, error: 'Code d’équipe invalide (6 à 48 lettres, chiffres, - ou _).' });
  if (!rateOk(req.ip || (req.socket && req.socket.remoteAddress) || '?')) return reply(429, { ok: false, error: 'Trop de requêtes, patientez un instant.' });
  try {
    const out = await withLock(key, async () => {
      const cur = await storeGet(key);
      if (req.method !== 'POST') return cur;
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const merged = SaveData.merge(cur, SaveData.sanitize(body.data));
      if (!SaveData.same(merged, cur)) await storeSet(key, merged);
      return merged;
    });
    reply(200, { ok: true, data: out, durable: storeMode === 'upstash' });
  } catch (e) {
    console.error('Sauvegarde équipe :', errText(e));
    reply(503, { ok: false, error: 'Base de sauvegarde indisponible.' });
  }
}
app.get('/savedata.js', (req, res) => res.sendFile(path.join(__dirname, 'savedata.js')));
app.get('/api/storage', (req, res) => res.json({ mode: storeMode, durable: storeMode === 'upstash' }));
// Les navigateurs envoient la sauvegarde en JSON (sendBeacon compris) ; on la lit nous-mêmes pour accepter tous les types de contenu
app.post(['/api/team/:code', '/api/team/:code/ghost/:name'], (req, res, next) => {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > 98304) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    try { req.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { req.body = {}; }
    next();
  });
  req.on('error', () => {});
});
// Fantôme de la meilleure partie d'une équipe : un petit enregistrement par niveau, on ne garde que le plus rapide
const ghostCache = new Map();
function cleanGhost(g) {
  if (!g || typeof g !== 'object' || g.v !== 1) return null;
  const t = Number(g.t);
  if (!Number.isFinite(t) || t <= 0 || t > 3600) return null;
  if (!Array.isArray(g.p) || g.p.length < 1 || g.p.length > 2 || !Array.isArray(g.d)) return null;
  const w = g.p.length * 2 + 1; // par échantillon : x, y de chaque joueur + un masque de regard
  if (g.d.length < 2 * w || g.d.length > w * 3000 || g.d.length % w !== 0) return null;
  const p = g.p.map((q) => ({
    k: ['mage', 'archer', 'plain'].includes(q && q.k) ? q.k : 'plain',
    s: cleanSkin(q && q.s),
    c: /^#[0-9a-f]{6}$/i.test(q && q.c) ? q.c : '#ffffff',
  }));
  const d = g.d.map((x) => Math.round(Number(x)));
  if (d.some((x) => !Number.isFinite(x) || Math.abs(x) > 100000)) return null;
  return { v: 1, t: Math.round(t * 10) / 10, p, d };
}
async function ghostHandler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const reply = (status, obj) => { res.statusCode = status; res.end(JSON.stringify(obj)); };
  const team = teamKey(req.params.code);
  const name = String(req.params.name || '');
  if (!team || !name || name.length > 60) return reply(400, { ok: false, error: 'Requête invalide.' });
  if (!rateOk(req.ip || (req.socket && req.socket.remoteAddress) || '?')) return reply(429, { ok: false, error: 'Trop de requêtes.' });
  const key = `ghost:${team}:${name}`;
  try {
    const out = await withLock(key, async () => {
      let cur = ghostCache.get(key);
      if (cur === undefined) {
        let raw = null;
        if (storeMode === 'upstash') raw = await upstash(['GET', `cordee:${key}`]);
        else if (fileDb) raw = fileDb[key] || null;
        try { cur = raw ? cleanGhost(typeof raw === 'string' ? JSON.parse(raw) : raw) : null; } catch { cur = null; }
        if (ghostCache.size > 60) ghostCache.clear();
        ghostCache.set(key, cur);
      }
      if (req.method !== 'POST') return cur;
      const neu = cleanGhost(req.body && req.body.ghost);
      if (neu && (!cur || neu.t < cur.t - 0.05)) {
        const raw = JSON.stringify(neu);
        if (storeMode === 'upstash') await upstash(['SET', `cordee:${key}`, raw]);
        else if (fileDb) { fileDb[key] = raw; saveFile(); }
        ghostCache.set(key, neu);
        return neu;
      }
      return cur;
    });
    reply(200, { ok: true, ghost: out || null });
  } catch (e) {
    console.error('Fantôme :', errText(e));
    reply(503, { ok: false, error: 'Base de sauvegarde indisponible.' });
  }
}
app.get('/api/team/:code/ghost/:name', ghostHandler);
app.post('/api/team/:code/ghost/:name', ghostHandler);
app.get('/api/team/:code', teamHandler);
app.post('/api/team/:code', teamHandler);
if (process.env.CORDEE_TEST) global.__teamHandler = teamHandler;

app.use(express.static(PUBLIC_DIR));
const server = http.createServer(app);
// Latence : on désactive l'algorithme de Nagle (qui retarde l'envoi des petits paquets) sur chaque connexion
server.on('connection', (sock) => sock.setNoDelay(true));
const wss = new WebSocketServer({ server });
if (process.env.CORDEE_TEST) global.__wss = wss; // uniquement pour les tests automatiques

const rooms = new Map(); // code -> room
if (process.env.CORDEE_TEST) global.__rooms = rooms; // uniquement pour les tests automatiques
if (process.env.CORDEE_TEST) global.__tick = (room) => tick(room); // idem : permet d'avancer la simulation pas à pas
if (process.env.CORDEE_TEST) global.__loadScreen = (room, k) => loadScreen(room, k); // idem : saute directement à un écran du Défi

/* ---------- Tutoriel : le carnet des touches ---------- */
// Chaque étape est validée par le serveur lui-même quand l'action a vraiment eu lieu (sauf H, qui n'existe que dans le navigateur).
const TUT_STEPS = [
  { id: 'move', label: 'Se déplacer', key: '← → (ou Q D)' },
  { id: 'jump', label: 'Sauter', key: 'Espace' },
  { id: 'dash', label: 'Dash', key: 'Maj' },
  { id: 'orb', label: 'Orbe (Mage)', key: 'clic gauche', kit: 'mage' },
  { id: 'ice', label: 'Glace (Mage)', key: 'clic droit sur une rune', kit: 'mage' },
  { id: 'swap', label: 'Échange de places (Mage)', key: 'bouton Échange, puis clic', kit: 'mage' },
  { id: 'arrow', label: 'Flèche (Archer)', key: 'clic gauche', kit: 'archer' },
  { id: 'fire', label: 'Feu (Archer)', key: 'bouton Feu (ou clic droit), puis clic', kit: 'archer' },
  { id: 'dbl', label: 'Double saut (Archer)', key: 'Espace en l’air', kit: 'archer' },
  { id: 'grab', label: 'Porter son coéquipier', key: 'F', needs2: true },
  { id: 'throw', label: 'Le lancer', key: 'F encore', needs2: true },
  { id: 'emote', label: 'Emote', key: 'G, M ou J' },
  { id: 'mark', label: '« Regarde ici »', key: 'Ctrl + clic droit' },
  { id: 'hint', label: 'Indice', key: 'I' },
  { id: 'help', label: 'Aide', key: 'H' },
];
const TUT_IDS = new Set(TUT_STEPS.map((x) => x.id));
// Les rôles sont fixes : chacun ne doit valider que les touches de son propre rôle.
function tutNeed(room, p) {
  const solo = room.players.size < 2;
  return TUT_STEPS.filter((x) => !(x.needs2 && solo) && (!x.kit || !p || x.kit === p.role)).map((x) => x.id);
}
function tutMsg(room) {
  const p = {};
  const needBy = {};
  for (const [id, set] of room.tut) p[id] = [...set].filter((k) => TUT_IDS.has(k));
  for (const q of room.players.values()) needBy[q.id] = tutNeed(room, q);
  return { t: 'tut', needBy, p };
}
function tutStep(room, p, id) {
  if (!room || !room.level || !room.level.cfg.tutorial || room.status !== 'playing') return;
  let set = room.tut.get(p.id);
  if (!set) { set = new Set(); room.tut.set(p.id, set); }
  if (set.has(id)) return;
  set.add(id);
  if (id === '_l' || id === '_r') { // se déplacer = aller à gauche ET à droite
    if (set.has('_l') && set.has('_r')) tutStep(room, p, 'move');
    return;
  }
  broadcast(room, tutMsg(room));
}
function tutComplete(room) {
  if (room.tutOk) return true;
  const list = [...room.players.values()];
  if (!list.length) return false;
  const ok = list.every((p) => { const s = room.tut.get(p.id); return s && tutNeed(room, p).every((k) => s.has(k)); });
  if (ok) room.tutOk = true;
  return ok;
}
const TUT_INDEX = LEVELS.findIndex((l) => l.tutorial);
const REAL_COUNT = TUT_INDEX >= 0 ? TUT_INDEX : LEVELS.length; // niveaux « du parcours » (le tutoriel et le niveau Défi sont à part, placés après)
const nextIndex = (i) => (LEVELS[i].tutorial ? 0 : i + 1);

// Niveaux à plusieurs écrans (le Défi) : `screens` liste des salles séparées. On passe de l'une à l'autre en franchissant la porte,
// sans écran de résultat : le chrono et le compteur de chutes continuent. Chaque écran peut avoir ses propres options (hint, theme, latch…).
const screenCount = (def) => (def.screens ? def.screens.length : 1);
const screenDef = (def, k) => (def.screens ? Object.assign({}, def, def.screens[k]) : def);

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
  if (cfg.tutorial && tutComplete(room)) open.add(cfg.tutorial.group);
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

function collectStars(room, list) {
  const st = room.level.stars[0];
  if (!st || room.starTaken) return;
  const zone = { x: st.x + 2, y: st.y + 2, w: TILE - 4, h: TILE - 4 };
  if (list.some((p) => touchesRect(p, zone))) {
    room.starTaken = true;
    room.events.push(['star', st.x + TILE / 2, st.y + TILE / 2]);
  }
}

function doorOpen(room) {
  return room.keysTaken.size >= room.level.keys.length && (!room.boss || room.boss.dead);
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


/* ---------- Le boss (dernier niveau) ---------- */
// Le bouclier du boss tombe quand le groupe 1 est actif : le cristal du Mage ET la cible de l'Archer en même temps.
// Il reste baissé quelques secondes (fenêtre de tir), puis remonte et se recharge un moment : il faut alors retoucher
// cristal et cible (on peut le faire d'avance) sans cesser d'esquiver.
// Trois phases (à 66 % et 33 % de vie) : attaques plus rapprochées, plus nombreuses, plus vives. Chaque attaque est annoncée.
const BOSS_PHASE = {
  1: { gap: 220, rocks: 3, warn: 92, ball: 2.3, wave: 2.5, down: 360, cool: 150 },
  2: { gap: 165, rocks: 3, warn: 78, ball: 2.8, wave: 3.0, down: 330, cool: 130 },
  3: { gap: 125, rocks: 4, warn: 64, ball: 3.3, wave: 3.6, down: 300, cool: 100 },
};
const BOSS_DMG = { orb: 1, arrow: 1, fire: 2 };
const HURT_INV = 130; // ticks d'invincibilité après un coup (un joueur touché clignote)
const WAVE_H = 22;
const rnd = (a, b) => a + Math.random() * (b - a);

function newBoss(c) {
  return { cx: c.cx, cy: c.cy, x: c.cx, y: c.cy, hp: c.hp, max: c.hp, hearts: c.hearts, phase: 1, resumed: 0, dead: false, shield: 'cool', until: 150,
    next: 200, last: '', hz: [], flash: 0, pause: 0, t: 0 };
}
const bossExposed = (room) => !!room.boss && !room.boss.dead && room.boss.pause <= 0 && room.boss.shield === 'down';

function hurtPlayer(room, p) {
  const t = room.time;
  if ((p.hurtUntil || 0) > t || room.status !== 'playing') return;
  p.hurtUntil = t + HURT_INV;
  p.vy = -7;
  room.hearts--;
  room.deaths++; // un coup compte comme une chute : « sans chute » = combat sans aucun dégât
  room.events.push(['hurt', Math.round(p.x), Math.round(p.y)]);
  if (room.hearts <= 0) {
    room.hearts = 0;
    room.status = 'bossdown';
    room.timer = 210;
    room.bossResume = room.boss.phase;
    room.carryClock = (room.carryClock || 0) + room.clock; // le temps des tentatives précédentes compte pour la médaille
    room.bossResumeLevel = room.levelIndex;
    room.boss.hz = [];
  }
}

function launchAttack(room, list, kind) {
  const B = room.boss;
  const L = room.level;
  const ph = BOSS_PHASE[B.phase];
  const W = L.w * TILE;
  const alive = list.length ? list : [{ x: W / 2, y: 0 }];
  if (kind === 'rain') {
    const xs = [alive[Math.floor(Math.random() * alive.length)].x + PW / 2];
    for (let k = 0, tries = 0; k < ph.rocks - 1 && tries < 60; tries++) {
      const x = rnd(TILE * 1.5, W - TILE * 1.5);
      if (xs.every((o) => Math.abs(o - x) > 62)) { xs.push(x); k++; }
    }
    xs.forEach((x, i) => B.hz.push({ k: 'r', x: Math.round(x), y: -20, warn: ph.warn + i * 4, vy: 0 }));
  } else if (kind === 'wave') {
    const dirs = B.phase === 1 ? [Math.random() < 0.5 ? 1 : -1] : [1, -1];
    const fromWalls = B.phase === 3;
    dirs.forEach((d) => B.hz.push({ k: 'w', x: fromWalls ? (d > 0 ? TILE : W - TILE) : W / 2, dir: fromWalls ? d : d, warn: 60, vx: ph.wave }));
    if (B.phase === 3) dirs.forEach((d) => B.hz.push({ k: 'w', x: d > 0 ? TILE : W - TILE, dir: d, warn: 60 + 52, vx: ph.wave }));
  } else if (kind === 'ball') {
    const n = B.phase === 1 ? 1 : B.phase === 2 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const tgt = alive[(i + Math.floor(Math.random() * 2)) % alive.length];
      B.hz.push({ k: 'b', x: B.x, y: B.y + 22, warn: 54 + i * 20, tx: tgt.x + PW / 2, ty: tgt.y + PH / 2, vx: 0, vy: 0, spd: ph.ball, who: tgt });
    }
  }
}

function stepBoss(room, list) {
  const B = room.boss;
  const L = room.level;
  if (!B || room.status !== 'playing') return;
  const W = L.w * TILE;
  B.t++;
  if (B.dead) { B.hz = []; return; }
  if (B.flash > 0) B.flash--;
  B.x = B.cx + Math.sin(B.t * 0.011) * (60 + B.phase * 40);
  B.y = B.cy + Math.sin(B.t * 0.023) * 12;
  const ratio = B.hp / B.max;
  const want = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
  if (want > B.phase) { // changement de phase : le boss rugit, tout s'arrête un instant, l'équipe reprend 3 cœurs
    B.phase = want;
    B.hz = [];
    B.pause = 140;
    B.next = B.t + 210;
    B.shield = 'cool';
    B.until = B.t + 140 + 60;
    room.crystalUntil.fill(0);
    room.targetUntil.fill(0);
    room.hearts = Math.min(B.hearts, room.hearts + 3);
    room.events.push(['bphase', Math.round(B.x), Math.round(B.y)]);
  }
  if (B.pause > 0) { B.pause--; return; }
  const ph = BOSS_PHASE[B.phase];
  if (B.shield === 'up' && L.open.has(1)) {
    B.shield = 'down';
    B.until = B.t + ph.down;
    room.events.push(['sdown', Math.round(B.x), Math.round(B.y)]);
  } else if (B.shield === 'down' && B.t >= B.until) {
    B.shield = 'cool';
    B.until = B.t + ph.cool;
    room.crystalUntil.fill(0);
    room.targetUntil.fill(0);
    room.events.push(['sup', Math.round(B.x), Math.round(B.y)]);
  } else if (B.shield === 'cool' && B.t >= B.until) {
    B.shield = 'up';
  }
  if (B.t >= B.next) {
    const kinds = ['rain', 'ball', 'wave'].filter((k) => k !== B.last);
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    B.last = k;
    launchAttack(room, list, k);
    if (B.phase === 3 && Math.random() < 0.2) launchAttack(room, list, kinds.find((x) => x !== k) || 'rain');
    B.next = B.t + ph.gap + Math.floor(rnd(0, 30));
  }
  const floorY = (L.h - 1) * TILE;
  B.hz = B.hz.filter((h) => {
    if (h.k === 'r') {
      if (h.warn > 0) { h.warn--; if (h.warn === 0) h.y = -20; return true; }
      h.y += 13;
      for (const p of list) if (p.x < h.x + 13 && p.x + PW > h.x - 13 && p.y < h.y + 13 && p.y + PH > h.y - 13) hurtPlayer(room, p);
      if (h.y >= floorY - 10) { room.events.push(['rock', Math.round(h.x), floorY]); return false; }
      return true;
    }
    if (h.k === 'w') {
      if (h.warn > 0) { h.warn--; return true; }
      h.x += h.dir * h.vx;
      for (const p of list) if (p.x < h.x + 10 && p.x + PW > h.x - 10 && p.y + PH > floorY - WAVE_H && p.y < floorY) hurtPlayer(room, p);
      return h.x > TILE - 4 && h.x < W - TILE + 4;
    }
    if (h.k === 'b') {
      if (h.warn > 0) {
        h.warn--;
        h.x = B.x; h.y = B.y + 22;
        if (h.warn > 12 && h.who) { h.tx = h.who.x + PW / 2; h.ty = h.who.y + PH / 2; } // suit sa cible, puis se verrouille
        if (h.warn === 0) {
          const dx = h.tx - h.x;
          const dy = h.ty - h.y;
          const d = Math.hypot(dx, dy) || 1;
          h.vx = (dx / d) * h.spd;
          h.vy = (dy / d) * h.spd;
          h.who = null;
        }
        return true;
      }
      h.x += h.vx;
      h.y += h.vy;
      for (const p of list) if (p.x < h.x + 9 && p.x + PW > h.x - 9 && p.y < h.y + 9 && p.y + PH > h.y - 9) { hurtPlayer(room, p); return false; }
      if (h.x < 0 || h.x > W || h.y < -40 || h.y > L.h * TILE || tileSolid(L, Math.floor(h.x / TILE), Math.floor(h.y / TILE))) {
        room.events.push(['ballpop', Math.round(h.x), Math.round(h.y)]);
        return false;
      }
      return true;
    }
    return false;
  });
}

// Un tir du joueur touche-t-il le boss (bouclier tombé : dégâts) ou une boule de feu (elle s'éteint) ?
function bossHit(room, pr) {
  const B = room.boss;
  if (!B || B.dead || pr.kind === 'swap' || room.status !== 'playing') return false;
  for (const h of B.hz) {
    if (h.k === 'b' && h.warn <= 0 && Math.hypot(pr.x - h.x, pr.y - h.y) < 17) {
      B.hz.splice(B.hz.indexOf(h), 1);
      room.events.push(['ballpop', Math.round(h.x), Math.round(h.y)]);
      return true;
    }
  }
  if (Math.hypot(pr.x - B.x, pr.y - B.y) < 40) {
    if (bossExposed(room)) {
      B.hp = Math.max(0, B.hp - (BOSS_DMG[pr.kind] || 1));
      B.flash = 10;
      room.events.push(['bhit', Math.round(pr.x), Math.round(pr.y)]);
      if (B.hp <= 0) {
        B.dead = true;
        B.hz = [];
        room.events.push(['bdie', Math.round(B.x), Math.round(B.y)]);
      }
    } else {
      room.events.push(['bblock', Math.round(pr.x), Math.round(pr.y)]);
    }
    return true;
  }
  return false;
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
    if (!ev && room.boss && bossHit(room, pr)) return false;
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
    p.hurtUntil = 0;
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

function chapterInfo(index) {
  const def = LEVELS[index];
  const ch = CHAPTERS[def.chapter];
  const first = LEVELS.findIndex((l) => l.chapter === def.chapter);
  const count = LEVELS.filter((l) => l.chapter === def.chapter).length;
  return {
    index: def.chapter, name: ch.name, theme: ch.theme, blurb: ch.blurb, powers: ch.powers || [],
    pos: index - first + 1, count, first: index === first, tutorial: !!def.tutorial, challenge: !!def.challenge,
  };
}

function startMsg(room) {
  const base = LEVELS[room.levelIndex];
  const def = screenDef(base, room.screen || 0);
  return {
    t: 'start',
    screen: room.screen || 0,
    screens: screenCount(base),
    theme: def.theme || undefined, // décor propre à l'écran (facultatif)
    title: def.title || undefined,
    deaths: room.deaths || 0,
    level: def.rows,
    tile: TILE,
    index: room.levelIndex,
    total: REAL_COUNT,
    name: def.name,
    hint: def.hint,
    timer: def.timer || 0, // secondes (0 = pas de minuteur)
    diamond: def.diamond, // médaille de diamant : temps (en secondes) à ne pas dépasser
    gold: def.gold, // médaille d'or : temps (en secondes) à ne pas dépasser
    silver: def.silver,
    star: def.rows.some((r) => r.includes('*')),
    chapter: chapterInfo(room.levelIndex),
    cfg: {
      abilities: !!def.abilities,
      dark: !!def.dark,
      fire: !!def.fire,
      swap: !!def.swap,
      seqGroup: def.sequence ? def.sequence.group : 0,
      seqLen: def.sequence && def.sequence.order ? def.sequence.order.length : 0,
      labels: def.labels || [],
      link: !!def.link,
      sync: !!def.sync,
      carry: !!def.carry,
      heavy: def.heavy || [],
      boss: def.boss ? { hp: def.boss.hp, hearts: def.boss.hearts, name: def.boss.name } : null,
      tutorial: def.tutorial ? { steps: TUT_STEPS } : null,
    },
  };
}

function freshRoomState(room, index, screen = 0) {
  const def = screenDef(LEVELS[index], screen);
  room.levelIndex = index;
  room.screen = screen;
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
  room.starTaken = false;
  room.helped = false; // un des joueurs a consulté l'indice ou l'aide pendant ce niveau
  room.result = null;
  room.latch = {};
  room.tut = new Map(); // carnet du tutoriel : joueur -> étapes réussies
  room.tutOk = false;
  room.crystalUntil = room.level.crystals.map(() => 0);
  room.targetUntil = room.level.targets.map(() => 0);
  room.torchUntil = room.level.torches.map(() => 0);
  room.burn = [];
  room.events = [];
  room.seq = { progress: 0, done: false, flash: 0, lastHit: 0 };
  room.linkOn = true;
  room.linkDist = 0;
  room.syncUntil = 0;
  room.boss = def.boss ? newBoss(def.boss) : null;
  room.hearts = def.boss ? def.boss.hearts : 0;
  // Après une défaite, on reprend au début de la phase atteinte (le boss garde les points de vie de ce palier)
  if (room.boss && room.bossResume > 1 && room.bossResumeLevel === index) {
    room.boss.hp = Math.ceil(room.boss.max * (room.bossResume === 2 ? 0.66 : 0.33));
    if (room.boss.hp / room.boss.max > (room.bossResume === 2 ? 0.66 : 0.33)) room.boss.hp--;
    room.boss.resumed = room.bossResume;
  } else {
    room.carryClock = 0;
  }
  room.bossResume = 0;
}

function loadLevel(room, index) {
  freshRoomState(room, index);
  if (LEVELS[index].abilities) ensureRoles(room);
  room.status = 'playing';
  resetPlayers(room);
  broadcast(room, lobbyMsg(room));
  broadcast(room, startMsg(room));
  if (LEVELS[index].tutorial) broadcast(room, tutMsg(room));
}

// Écran suivant (ou recommencer l'écran) : le chrono, les chutes et l'aide consultée continuent
function loadScreen(room, screen) {
  const keep = { clock: room.clock, deaths: room.deaths, helped: room.helped };
  freshRoomState(room, room.levelIndex, screen);
  Object.assign(room, keep);
  room.status = 'playing';
  resetPlayers(room);
  broadcast(room, startMsg(room));
}

function finishLevel(room, skipped) {
  // résultat du niveau : le temps compte depuis le début (hors pauses), les chutes depuis le dernier redémarrage
  room.result = { time: room.clock + (room.boss ? room.carryClock || 0 : 0), deaths: room.deaths, star: room.starTaken, skipped: !!skipped, help: !!room.helped };
  if (LEVELS[room.levelIndex].tutorial) { // pas d'écran de résultat : un court message, puis le niveau 1
    room.result.tutorial = true;
    room.timer = 240;
    room.status = 'won';
    return;
  }
  room.timer = 900; // écran de résultat : 15 secondes (le chef peut passer plus vite)
  room.status = room.levelIndex >= REAL_COUNT - 1 ? 'finished' : 'won';
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
    sr: room.starTaken ? 1 : 0,
    res: room.result,
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
    bs: room.boss ? {
      x: Math.round(room.boss.x), y: Math.round(room.boss.y), hp: room.boss.hp, ph: room.boss.phase, dd: room.boss.dead ? 1 : 0,
      rs: room.boss.resumed, ex: bossExposed(room) ? 1 : 0, sr: room.boss.shield === 'cool' ? 1 : 0, ut: Math.max(0, room.boss.until - room.boss.t), fl: room.boss.flash, ps: room.boss.pause,
      hz: room.boss.hz.map((h) => (h.k === 'r' ? ['r', h.x, Math.round(h.y), h.warn]
        : h.k === 'w' ? ['w', Math.round(h.x), h.dir, h.warn, h.vx]
        : ['b', Math.round(h.x * 10) / 10, Math.round(h.y * 10) / 10, h.warn, Math.round(h.vx * 100) / 100, Math.round(h.vy * 100) / 100, Math.round(h.tx), Math.round(h.ty)])),
    } : undefined,
    hc: room.boss ? [room.hearts, room.boss.hearts] : undefined,
    iv: room.boss ? list.filter((p) => (p.hurtUntil || 0) > t).map((p) => p.id) : undefined,
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
    const hadAirJump = p.airJump;
    stepPlayer(L, p);
    if (L.cfg.tutorial && p.kit === 'archer' && hadAirJump && !p.airJump && !p.onGround && p.input.jumpEdge) tutStep(room, p, 'dbl');
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
  collectStars(room, list);
  hazardsAndCheckpoints(room, list);
  stepProjectiles(room);
  stepBoss(room, list);
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
    room.clock++;
    if (doorOpen(room) && allInDoor(room, list)) {
      if (room.screen + 1 < screenCount(LEVELS[room.levelIndex])) loadScreen(room, room.screen + 1);
      else finishLevel(room);
    }
    else if (room.limit && room.clock >= room.limit) {
      room.status = 'timeup'; // temps écoulé : on laisse lire le message puis le niveau redémarre
      room.timer = 180; // 3 secondes
    }
  } else if (room.status === 'timeup' || room.status === 'bossdown') {
    if (--room.timer <= 0) return loadLevel(room, room.levelIndex);
  } else if (room.status === 'won') {
    if (--room.timer <= 0) return loadLevel(room, nextIndex(room.levelIndex));
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
if (!process.env.CORDEE_MANUAL) setInterval(() => {
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
    levels: LEVELS.map((l) => ({ name: l.name, roles: !!l.abilities, chapter: l.chapter, tutorial: !!l.tutorial, challenge: !!l.challenge })),
    chapters: CHAPTERS.map((c) => ({ name: c.name, theme: c.theme, challenge: !!c.challenge })),
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, role: p.role, skin: p.skin })),
  };
}

function addPlayer(room, ws, name, skin, wantColor, wantRole) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  const color = (COLORS.includes(wantColor) && !used.has(wantColor) && wantColor)
    || COLORS.find((c) => !used.has(c)) || COLORS[0];
  const counts = ROLES.map((r) => [...room.players.values()].filter((p) => p.role === r).length);
  let role = counts[0] <= counts[1] ? 'mage' : 'archer';
  if (ROLES.includes(wantRole) && counts[ROLES.indexOf(wantRole)] === 0) role = wantRole; // reconnexion : on garde son rôle s'il est libre
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
  return SKINS.includes(s) ? s : 'tasse';
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
      case 'resume': {
        // Reconnexion automatique après une coupure (redémarrage du serveur, réseau) : on retrouve sa room, ou on la recrée avec le même code
        if (room) return;
        const code = String(msg.code || '').toUpperCase().trim();
        if (!/^[A-Z]{4}$/.test(code)) return send(ws, { t: 'error', msg: 'Room introuvable. Vérifie le code.' });
        let target = rooms.get(code);
        if (!target) {
          target = { code, hostId: null, status: 'lobby', players: new Map(), tickCount: 0, timer: 0, resumed: true };
          freshRoomState(target, 0);
          rooms.set(code, target);
        } else if (target.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'Room pleine.' });
        addPlayer(target, ws, cleanName(msg.name), msg.skin, msg.color, msg.role);
        if (msg.host && target.resumed && target.players.size <= 2) target.hostId = ws.id; // l'ancien chef reprend la main
        send(ws, { t: 'joined', id: ws.id, resumed: true });
        broadcast(target, lobbyMsg(target));
        if (target.status !== 'lobby') send(ws, startMsg(target));
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
      case 'emote': {
        // Bulle de dialogue : relayée à toute la room (au plus une toutes les 0,6 s par joueur)
        const me = room && room.players.get(ws.id);
        const n = parseInt(msg.e, 10);
        if (!me || !(n >= 0 && n < 12)) return;
        const now = Date.now();
        if (now < (me.emoteUntil || 0)) return;
        me.emoteUntil = now + 600;
        broadcast(room, { t: 'emote', id: ws.id, e: n });
        tutStep(room, me, 'emote');
        break;
      }
      case 'chat': {
        // Petit chat textuel : relayé à toute la room (au plus un message toutes les 0,6 s par joueur, 120 caractères)
        const me = room && room.players.get(ws.id);
        if (!me) return;
        const text = String(msg.text == null ? '' : msg.text).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!text) return;
        const now = Date.now();
        if (now < (me.chatUntil || 0)) return;
        me.chatUntil = now + 600;
        broadcast(room, { t: 'chat', id: ws.id, text });
        break;
      }
      case 'mark': {
        // « Regarde ici » (Ctrl + clic droit) : un repère visible par tout le duo, au plus un toutes les 1,2 s par joueur
        const me = room && room.players.get(ws.id);
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!me || room.status !== 'playing' || !Number.isFinite(x) || !Number.isFinite(y)) return;
        const now = Date.now();
        if (now < (me.markUntil || 0)) return;
        me.markUntil = now + 1200;
        tutStep(room, me, 'mark');
        const L = room.level;
        broadcast(room, {
          t: 'mark', id: ws.id,
          x: Math.round(Math.min(Math.max(x, 0), L.w * TILE)),
          y: Math.round(Math.min(Math.max(y, 0), L.h * TILE)),
        });
        break;
      }
      case 'start': {
        if (!room || room.hostId !== ws.id || room.status !== 'lobby') return;
        const index = Math.min(Math.max(parseInt(msg.level, 10) || 0, 0), LEVELS.length - 1);
        if (LEVELS[index].tutorial) {
          if (room.players.size < 2) return send(ws, { t: 'error', msg: 'Le tutoriel se joue à deux : l\u2019autre joueur doit d\u2019abord rejoindre la room avec le code ' + room.code + '.' });
        } else if (LEVELS[index].abilities && !hasBothRoles(room)) {
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
        if (!room) return;
        if (room.status === 'won' || room.status === 'finished') { // depuis l'écran de résultat : le chef rejoue le niveau
          if (room.hostId !== ws.id) return;
        } else if (room.status !== 'playing') return;
        if (room.status === 'playing' && LEVELS[room.levelIndex].screens) { loadScreen(room, room.screen); break; } // on ne recommence que la salle en cours
        room.bossResume = 0;
        const keepTut = LEVELS[room.levelIndex].tutorial ? { tut: room.tut, ok: room.tutOk } : null;
        loadLevel(room, room.levelIndex);
        if (keepTut) { room.tut = keepTut.tut; room.tutOk = keepTut.ok; broadcast(room, tutMsg(room)); }
        break;
      }
      case 'tolobby': {
        // Retour au salon (choix des rôles et du niveau) sans quitter la room : n'importe quel joueur peut le demander
        if (!room || room.status === 'lobby') return;
        room.bossResume = 0;
        backToLobby(room);
        break;
      }
      case 'skip': {
        if (!room || room.hostId !== ws.id) return;
        if (room.status === 'won') loadLevel(room, nextIndex(room.levelIndex)); // le chef passe l'écran de résultat
        else if (room.status === 'finished') backToLobby(room);
        else if (room.status !== 'playing') return;
        else if (LEVELS[room.levelIndex].tutorial) loadLevel(room, 0); // « Passer le tutoriel »
        else if (room.levelIndex >= REAL_COUNT - 1) finishLevel(room, true);
        else loadLevel(room, room.levelIndex + 1);
        break;
      }
      case 'input': {
        const p = room && room.players.get(ws.id);
        if (!p) return;
        p.input.left = !!msg.left;
        p.input.right = !!msg.right;
        p.input.jump = !!msg.jump;
        if (p.input.left) tutStep(room, p, '_l');
        if (p.input.right) tutStep(room, p, '_r');
        if (msg.jp !== undefined && msg.jp !== p.jpSeen) {
          p.jpSeen = msg.jp;
          tutStep(room, p, 'jump');
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
      case 'help': {
        // un joueur a regardé l'indice : « sans indice » vaut pour tout le duo
        if (room && room.status === 'playing') room.helped = true;
        { const q = room && room.players.get(ws.id); if (q) tutStep(room, q, 'hint'); }
        break;
      }
      case 'tut': {
        // étapes qui n'existent que dans le navigateur (l'aide, touche H)
        const q = room && room.players.get(ws.id);
        if (q && msg.step === 'help') tutStep(room, q, 'help');
        break;
      }
      case 'ping': {
        send(ws, { t: 'pong', c: msg.c });
        break;
      }
      case 'dash': {
        const p = room && room.players.get(ws.id);
        if (p) { p.dashPending = true; tutStep(room, p, 'dash'); }
        break;
      }
      case 'grab': {
        const p = room && room.players.get(ws.id);
        if (p) {
          const was = p.carrying;
          grab(room, p);
          if (!was && p.carrying) tutStep(room, p, 'grab');
          else if (was && !p.carrying) tutStep(room, p, 'throw');
        }
        break;
      }
      case 'cast': {
        const p = room && room.players.get(ws.id);
        if (p) {
          const before = [...p.cd];
          cast(room, p, msg.slot, Number(msg.x), Number(msg.y));
          if (p.cd[0] !== before[0]) tutStep(room, p, p.kit === 'mage' ? 'orb' : 'arrow');
          if (p.cd[1] !== before[1]) tutStep(room, p, p.kit === 'mage' ? 'ice' : 'fire');
          if (p.cd[2] !== before[2]) tutStep(room, p, 'swap');
        }
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

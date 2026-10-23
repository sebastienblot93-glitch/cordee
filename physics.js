// Logique partagée entre le serveur et le navigateur : lecture des niveaux,
// déplacement des joueurs, projectiles. Unités en pixels, 1 tick = 1/60 de seconde.
(function () {
  const TILE = 32;
  const PW = 24; // largeur d'un joueur
  const PH = 28; // hauteur d'un joueur

  // speed : course | gravity : chute | jump : force du saut (négatif = vers le haut)
  // dashSpeed / dashTicks : l'élan de l'Archer (10 px x 7 ticks = 70 px)
  const PHYS = {
    speed: 4.5, gravity: 0.5, jump: -9.5, maxFall: 12,
    dashSpeed: 10, dashTicks: 7, dashCooldown: 40,
    spring: -14, // élan d'un ressort (environ 6 cases de haut)
  };

  // Projectiles : l'orbe du Mage vole droit, la flèche de l'Archer retombe (gravité)
  const PROJ = {
    orb: { speed: 9, gravity: 0, life: 90 },
    arrow: { speed: 12, gravity: 0.25, life: 130 },
    fire: { speed: 12, gravity: 0.25, life: 130 }, // flèche de feu de l'Archer
    swap: { speed: 10, gravity: 0, life: 70 }, // éclair d'échange du Mage
  };

  // Sorts : portée de la glace (px), durée (ticks), nombre max de blocs, recharges (ticks)
  const SPELL = {
    reach: 224, iceLife: 480, iceMax: 3, cdOrb: 30, cdIce: 40, cdArrow: 25, defaultHold: 360,
    cdFire: 45, cdSwap: 150, burnDelay: 12, burnStep: 4,
  };

  // Capacités par rôle. En dehors des niveaux "Arcanes", tout le monde est "plain".
  // Tout le monde peut faire un dash (Maj) ; l'Archer garde en plus le double saut
  const KITS = { plain: { dash: true }, mage: { dash: true }, archer: { doubleJump: true, dash: true } };

  // Légende des niveaux :
  //   #  bloc solide              .  vide
  //   S  départ                   D  porte de sortie (s'ouvre quand toutes les clés sont prises)
  //   K  clé                      C  checkpoint (point de retour après une chute)
  //   1 2 3  plaques au sol       a b c  portes liées aux groupes 1 2 3
  //   x y z  cristaux (orbe du Mage) des groupes 1 2 3
  //   o p q  cibles (flèche de l'Archer) des groupes 1 2 3
  //   w v u  volets qui s'ouvrent et se ferment en rythme (groupes 1 2 3)
  //   h  bloc caché (solide, mais visible seulement près de la lumière du Mage)
  //   r  zone de rune : le Mage peut y poser un bloc de glace
  //   ^  pics : un contact renvoie au dernier checkpoint
  //   j  ressort : un joueur qui retombe dessus est propulsé très haut
  //   t  bois : bloc solide que la flèche de feu de l'Archer brûle (et tout le bois relié)
  //   f g e  torches des groupes 1 2 3 : allumées par la flèche de feu, elles ouvrent leurs portes
  function parseLevel(def) {
    const rows = Array.isArray(def) ? def : def.rows;
    const cfg = Array.isArray(def) ? {} : def;
    const h = rows.length;
    const w = rows[0].length;
    const solid = [];
    const gate = [];
    const shut = [];
    const crystalAt = [];
    const targetAt = [];
    const hidden = [];
    const rune = [];
    const wood = [];
    const spring = [];
    const torchAt = [];
    const torches = [];
    const keys = [];
    const plates = [];
    const crystals = [];
    const targets = [];
    const spikes = [];
    const checkpoints = [];
    const runes = [];
    let door = null;
    let spawn = { x: TILE, y: TILE };

    rows.forEach((row, ty) => {
      solid[ty] = []; gate[ty] = []; shut[ty] = []; crystalAt[ty] = []; targetAt[ty] = [];
      hidden[ty] = []; rune[ty] = []; wood[ty] = []; spring[ty] = []; torchAt[ty] = [];
      [...row].forEach((ch, tx) => {
        solid[ty][tx] = ch === '#' || ch === 'h';
        hidden[ty][tx] = ch === 'h';
        rune[ty][tx] = ch === 'r';
        wood[ty][tx] = ch === 't';
        spring[ty][tx] = ch === 'j';
        torchAt[ty][tx] = -1;
        gate[ty][tx] = ch >= 'a' && ch <= 'c' ? ch.charCodeAt(0) - 96 : 0;
        shut[ty][tx] = ch === 'w' ? 1 : ch === 'v' ? 2 : ch === 'u' ? 3 : 0;
        crystalAt[ty][tx] = -1;
        targetAt[ty][tx] = -1;
        const px = tx * TILE;
        const py = ty * TILE;
        if (ch === 'D') door = { x: px, y: py };
        if (ch === 'S') spawn = { x: px + (TILE - PW) / 2, y: py + TILE - PH };
        if (ch === 'K') keys.push({ x: px, y: py });
        if (ch === 'C') checkpoints.push({ x: px, y: py });
        if (ch === 'r') runes.push({ tx, ty });
        if (ch === '^') spikes.push({ x: px + 3, y: py + 14, w: TILE - 6, h: TILE - 14 });
        if (ch >= '1' && ch <= '3') plates.push({ group: Number(ch), x: px, y: py + TILE - 8, w: TILE, h: 8 });
        if (ch === 'x' || ch === 'y' || ch === 'z') {
          crystalAt[ty][tx] = crystals.length;
          crystals.push({ group: ch.charCodeAt(0) - 119, tx, ty, x: px, y: py });
        }
        if (ch === 'f' || ch === 'g' || ch === 'e') {
          torchAt[ty][tx] = torches.length;
          torches.push({ group: ch === 'f' ? 1 : ch === 'g' ? 2 : 3, tx, ty, x: px, y: py });
        }
        if (ch === 'o' || ch === 'p' || ch === 'q') {
          targetAt[ty][tx] = targets.length;
          targets.push({ group: ch === 'o' ? 1 : ch === 'p' ? 2 : 3, tx, ty, x: px, y: py });
        }
      });
    });

    // Cristaux d'une séquence : numérotés dans l'ordre de lecture (haut en bas, gauche à droite)
    const seqGroup = cfg.sequence ? cfg.sequence.group : 0;
    let n = 0;
    crystals.forEach((c) => {
      c.seqIndex = c.group === seqGroup ? n++ : -1;
    });

    return {
      solid, gate, shut, crystalAt, targetAt, hidden, rune, wood, spring, torchAt,
      keys, plates, crystals, targets, torches, spikes, checkpoints, runes, door, spawn, w, h, cfg,
      burnt: new Set(), // blocs de bois brûlés (index ty * w + tx)
      open: new Set(), // numéros de portes ouvertes
      pressed: new Set(), // plaques pressées
      shutOpen: new Set(), // volets ouverts
      ice: new Set(), // blocs de glace (index ty * w + tx)
    };
  }

  // Une case arrête-t-elle les joueurs et les projectiles ?
  function tileSolid(L, tx, ty) {
    if (ty < 0 || tx < 0 || ty >= L.h || tx >= L.w) return true;
    if (L.solid[ty][tx]) return true;
    if (L.wood[ty][tx] && !L.burnt.has(ty * L.w + tx)) return true;
    const g = L.gate[ty][tx];
    if (g && !L.open.has(g)) return true;
    const s = L.shut[ty][tx];
    if (s && !L.shutOpen.has(s)) return true;
    return L.ice.size > 0 && L.ice.has(ty * L.w + tx);
  }

  // Les blocs de glace débordent de quelques pixels de chaque côté (plateformes plus larges, plus faciles à atteindre)
  const ICE_PAD = 5;
  function hitsIcePad(L, x, y) {
    if (!L.ice.size) return false;
    for (const idx of L.ice) {
      const bx = (idx % L.w) * TILE;
      const by = Math.floor(idx / L.w) * TILE;
      if (x < bx + TILE + ICE_PAD && x + PW > bx - ICE_PAD && y < by + TILE && y + PH > by) return true;
    }
    return false;
  }

  function tileBounds(x, y) {
    return {
      x0: Math.floor(x / TILE),
      x1: Math.floor((x + PW - 0.001) / TILE),
      y0: Math.floor(y / TILE),
      y1: Math.floor((y + PH - 0.001) / TILE),
    };
  }

  function hitsTile(L, x, y) {
    const b = tileBounds(x, y);
    for (let ty = b.y0; ty <= b.y1; ty++) {
      for (let tx = b.x0; tx <= b.x1; tx++) {
        if (tileSolid(L, tx, ty)) return true;
      }
    }
    return hitsIcePad(L, x, y);
  }

  // Portes que le joueur chevauche : elles restent ouvertes tant qu'il est dedans
  function gatesTouching(L, p) {
    const b = tileBounds(p.x, p.y);
    const found = [];
    for (let ty = b.y0; ty <= b.y1; ty++) {
      for (let tx = b.x0; tx <= b.x1; tx++) {
        if (ty < 0 || tx < 0 || ty >= L.h || tx >= L.w) continue;
        const g = L.gate[ty][tx];
        if (g) found.push(g);
      }
    }
    return found;
  }

  // Volets et blocs de glace que le joueur chevauche (ne jamais emmurer quelqu'un)
  function overlapsAnyBlocker(L, x, y) {
    return hitsTile(L, x, y);
  }

  function moveAxis(L, p, axis, amount) {
    let remaining = amount;
    while (Math.abs(remaining) > 1e-6) {
      const s = Math.abs(remaining) > 1 ? Math.sign(remaining) : remaining;
      p[axis] += s;
      if (hitsTile(L, p.x, p.y)) {
        p[axis] -= s;
        return true;
      }
      remaining -= s;
    }
    return false;
  }

  // État d'un joueur. input : { left, right, jump, jumpEdge, dash }
  //   jumpEdge = true uniquement au tick où la touche saut vient d'être pressée (double saut)
  //   dash = true uniquement au tick où la touche dash vient d'être pressée
  function newPlayerState(kit) {
    return {
      kit: kit || 'plain', x: 0, y: 0, vy: 0, onGround: false, face: 1,
      airJump: true, dashAvail: true, dashT: 0, dashDir: 1, dashCd: 0, jumpBuf: 0,
      input: { left: false, right: false, jump: false, jumpEdge: false, dash: false },
    };
  }

  function stepPlayer(L, p) {
    const kit = KITS[p.kit] || KITS.plain;
    const inp = p.input;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir) p.face = dir;
    if (p.dashCd > 0) p.dashCd--;

    // Élan de l'Archer : trajectoire droite pendant quelques ticks, gravité suspendue
    if (kit.dash && inp.dash && p.dashT === 0 && p.dashAvail && p.dashCd === 0) {
      p.dashT = PHYS.dashTicks;
      p.dashDir = dir || p.face || 1;
      p.dashAvail = false;
      p.dashCd = PHYS.dashCooldown;
      p.vy = 0;
    }
    if (p.dashT > 0) {
      moveAxis(L, p, 'x', p.dashDir * PHYS.dashSpeed);
      p.dashT--;
      p.onGround = false;
      return;
    }

    moveAxis(L, p, 'x', dir * PHYS.speed);

    // Une pression de saut juste avant l'atterrissage est gardée en mémoire quelques ticks
    if (inp.jumpEdge) p.jumpBuf = 8;
    if ((inp.jump || p.jumpBuf > 0) && p.onGround) {
      p.vy = PHYS.jump;
      p.jumpBuf = 0;
    } else if (kit.doubleJump && inp.jumpEdge && !p.onGround && p.airJump) {
      p.vy = PHYS.jump;
      p.airJump = false;
      p.jumpBuf = 0;
    }
    if (p.jumpBuf > 0) p.jumpBuf--;
    p.vy = Math.min(p.vy + PHYS.gravity, PHYS.maxFall);
    p.onGround = false;
    if (moveAxis(L, p, 'y', p.vy)) {
      if (p.vy > 0) {
        p.onGround = true;
        p.airJump = true;
        p.dashAvail = true;
      }
      p.vy = 0;
    }
    // Ressort : on rebondit très haut en retombant dessus
    if (p.vy >= 0 && onSpring(L, p)) {
      p.vy = PHYS.spring;
      p.onGround = false;
      p.airJump = true;
      p.dashAvail = true;
      p.jumpBuf = 0;
      p.bounced = 6; // pour l'animation côté client
    }
  }

  function onSpring(L, p) {
    const tx = Math.floor((p.x + PW / 2) / TILE);
    const ty = Math.floor((p.y + PH - 0.01) / TILE);
    if (ty < 0 || tx < 0 || ty >= L.h || tx >= L.w) return false;
    return L.spring[ty][tx];
  }

  function touchesRect(p, r) {
    return p.x < r.x + r.w && p.x + PW > r.x && p.y < r.y + r.h && p.y + PH > r.y;
  }

  function hitsSpikes(L, p) {
    return L.spikes.some((s) => touchesRect(p, s));
  }

  /* ---------- Projectiles ---------- */
  // Lance un projectile depuis le centre du joueur vers le point visé (aimX, aimY)
  function launchProjectile(kind, p, aimX, aimY) {
    const cx = p.x + PW / 2;
    const cy = p.y + PH / 2;
    let dx = aimX - cx;
    let dy = aimY - cy;
    let d = Math.hypot(dx, dy);
    if (d < 1) { dx = p.face || 1; dy = 0; d = 1; }
    const spec = PROJ[kind];
    return {
      kind,
      x: cx + (dx / d) * 10,
      y: cy + (dy / d) * 10,
      vx: (dx / d) * spec.speed,
      vy: (dy / d) * spec.speed,
      life: spec.life,
    };
  }

  // Fait avancer un projectile d'un tick. Retourne null s'il vole encore, sinon l'événement :
  //   { type: 'crystal' | 'target', index } | { type: 'wall' | 'absorb' | 'expire' }
  function stepProjectile(L, pr) {
    const spec = PROJ[pr.kind];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(pr.vx), Math.abs(pr.vy)) / 3));
    for (let i = 0; i < n; i++) {
      pr.x += pr.vx / n;
      pr.y += pr.vy / n;
      const tx = Math.floor(pr.x / TILE);
      const ty = Math.floor(pr.y / TILE);
      if (tileSolid(L, tx, ty)) {
        if (pr.kind === 'fire' && L.wood[ty] && L.wood[ty][tx] && !L.burnt.has(ty * L.w + tx)) return { type: 'wood', tx, ty };
        return { type: 'wall' };
      }
      if (pr.kind === 'swap') continue; // l'éclair d'échange ne touche que les murs et les joueurs
      const ci = L.crystalAt[ty][tx];
      if (ci >= 0) return pr.kind === 'orb' ? { type: 'crystal', index: ci } : { type: 'absorb' };
      const ti = L.targetAt[ty][tx];
      if (ti >= 0) return pr.kind === 'arrow' || pr.kind === 'fire' ? { type: 'target', index: ti } : { type: 'absorb' };
      const fi = L.torchAt[ty][tx];
      if (fi >= 0 && pr.kind === 'fire') return { type: 'torch', index: fi };
    }
    pr.vy += spec.gravity;
    pr.life--;
    return pr.life <= 0 ? { type: 'expire' } : null;
  }

  // Trajectoire prévue (pour la visée) : liste de points jusqu'à l'impact
  function projectilePath(L, kind, p, aimX, aimY) {
    const pr = launchProjectile(kind, p, aimX, aimY);
    const pts = [[pr.x, pr.y]];
    for (let t = 0; t < PROJ[kind].life; t++) {
      const ev = stepProjectile(L, pr);
      pts.push([pr.x, pr.y]);
      if (ev) return { pts, event: ev };
    }
    return { pts, event: null };
  }

  // Les joueurs se portent (on peut monter sur la tête d'un autre) et se poussent sur les côtés
  function overlap(a, b) {
    return a.x < b.x + PW && a.x + PW > b.x && a.y < b.y + PH && a.y + PH > b.y;
  }

  function resolvePlayers(L, list) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!overlap(a, b)) continue;

        const top = a.y < b.y ? a : b;
        const bottom = top === a ? b : a;
        const depth = top.y + PH - bottom.y;
        // Plus les deux joueurs se rapprochent vite (l'un monte, l'autre descend), plus on tolère de recouvrement
        const closing = (top.vy || 0) - (bottom.vy || 0);
        const maxDepth = Math.min(PH - 4, Math.max(14, closing + 3));

        let landed = false;
        if (top.vy >= 0 && depth <= maxDepth) {
          const oldY = top.y;
          top.y = bottom.y - PH;
          if (hitsTile(L, top.x, top.y)) {
            top.y = oldY; // plafond au-dessus : on ne se pose pas, on se pousse sur le côté
          } else {
            top.vy = 0;
            top.onGround = true;
            top.airJump = true;
            top.dashAvail = true;
            landed = true;
          }
        }
        if (!landed) {
          const dx = a.x + PW / 2 - (b.x + PW / 2);
          const sgn = dx >= 0 ? 1 : -1;
          const shift = (PW - Math.abs(dx)) / 2;
          a.x += sgn * shift;
          if (hitsTile(L, a.x, a.y)) a.x -= sgn * shift;
          b.x -= sgn * shift;
          if (hitsTile(L, b.x, b.y)) b.x += sgn * shift;
        }
      }
    }
  }

  // Dégage un joueur coincé dans un mur (par sécurité) : on cherche la case libre la plus proche
  function unstick(L, p) {
    if (!hitsTile(L, p.x, p.y)) return false;
    const x0 = p.x;
    const y0 = p.y;
    for (let r = 1; r <= 48; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!hitsTile(L, x0 + dx, y0 + dy)) {
            p.x = x0 + dx;
            p.y = y0 + dy;
            p.vy = 0;
            return true;
          }
        }
      }
    }
    return false;
  }

  // Bois relié à une case de bois touchée : liste [{idx, d}] (d = distance de propagation du feu)
  function woodCluster(L, tx, ty) {
    const out = [];
    const seen = new Set();
    const q = [[tx, ty, 0]];
    seen.add(ty * L.w + tx);
    while (q.length) {
      const [x, y, d] = q.shift();
      out.push({ idx: y * L.w + x, d });
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        const k = ny * L.w + nx;
        if (seen.has(k) || !L.wood[ny][nx] || L.burnt.has(k)) continue;
        seen.add(k);
        q.push([nx, ny, d + 1]);
      }
    }
    return out;
  }

  const API = {
    TILE, PW, PH, PHYS, PROJ, SPELL, KITS, ICE_PAD, woodCluster, onSpring,
    parseLevel, tileSolid, hitsTile, gatesTouching, overlapsAnyBlocker, moveAxis,
    newPlayerState, stepPlayer, touchesRect, hitsSpikes,
    launchProjectile, stepProjectile, projectilePath, resolvePlayers, unstick,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else window.Physics = API;
})();

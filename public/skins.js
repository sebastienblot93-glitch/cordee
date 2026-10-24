// Personnages "cartoon lisse" : un vrai petit bonhomme articulé (tête, torse, bras, jambes)
// qui marche, saute, retombe, fait un dash et lance ses sorts.
// Chaque skin se dessine dans la hitbox du jeu (24 x 28 pixels, les pieds en bas) et peut dépasser en hauteur.
// Skins.draw(ctx, id, x, y, o) : (x, y) = coin haut-gauche de la hitbox.
//   o : { dir, color, t, kit, walk (0..1), air, vy, dash, cast: {ang, k}, look: {x, y} }
(function () {
  const W = 24;
  const H = 28;
  const TAU = Math.PI * 2;
  const OUT = '#1d1a3b'; // contour commun : donne l'aspect dessin animé

  /* ---------- Couleurs ---------- */
  function parse(c) {
    if (c[0] === '#') {
      let h = c.slice(1);
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      const n = parseInt(h, 16);
      return [n >> 16, (n >> 8) & 255, n & 255];
    }
    const m = c.match(/[\d.]+/g) || [0, 0, 0];
    return [+m[0], +m[1], +m[2]];
  }
  function hex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  // Éclaircit (amt > 0) ou assombrit (amt < 0) une couleur
  function shade(c, amt) {
    const [r, g, b] = parse(c);
    const t = amt < 0 ? 0 : 255;
    const a = Math.abs(amt);
    return hex(r + (t - r) * a, g + (t - g) * a, b + (t - b) * a);
  }
  function rgba(c, a) {
    const [r, g, b] = parse(c);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ---------- Outils de dessin ---------- */
  function paint(g, fill, lw) {
    g.fillStyle = fill;
    g.fill();
    if (lw !== 0) {
      g.lineWidth = lw || 1.5;
      g.strokeStyle = OUT;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.stroke();
    }
  }
  function ell(g, x, y, rx, ry, fill, lw, rot) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    paint(g, fill, lw);
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function box(g, x, y, w, h, r, fill, lw) {
    rr(g, x, y, w, h, r);
    paint(g, fill, lw);
  }
  function grad(g, x0, y0, x1, y1, c0, c1) {
    const k = g.createLinearGradient(x0, y0, x1, y1);
    k.addColorStop(0, c0);
    k.addColorStop(1, c1);
    return k;
  }
  // Membre à deux segments (le point de contrôle fait plier le genou ou le coude)
  function limb(g, ax, ay, kx, ky, bx, by, wd, fill) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo(kx, ky, bx, by);
    g.strokeStyle = OUT;
    g.lineWidth = wd + 3.2;
    g.stroke();
    g.strokeStyle = fill;
    g.lineWidth = wd;
    g.stroke();
  }
  function tri(g, x0, y0, x1, y1, x2, y2, fill, lw) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.lineTo(x2, y2);
    g.closePath();
    paint(g, fill, lw);
  }
  function star(g, x, y, r, fill, lw) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r * 0.45 : r;
      g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    g.closePath();
    paint(g, fill, lw === undefined ? 0 : lw);
  }
  function glow(g, x, y, r, color, a) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const k = g.createRadialGradient(x, y, 0, x, y, r);
    k.addColorStop(0, rgba(color, a === undefined ? 0.7 : a));
    k.addColorStop(1, rgba(color, 0));
    g.fillStyle = k;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.restore();
  }
  function shine(g, x, y, rx, ry, rot, a) {
    g.fillStyle = `rgba(255,255,255,${a === undefined ? 0.28 : a})`;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    g.fill();
  }

  /* ---------- Pose : tout vient de la vitesse, de l'air, du dash et du lancer de sort ---------- */
  const HX = 0.8; // centre de la tête
  const HY = -27.4;
  const GY = -2.5; // centre d'un pied posé au sol

  function poseOf(o) {
    const t = o.t;
    const walk = Math.min(1, o.walk);
    const P = { t, walk, air: o.air, up: o.vy < 0, dash: o.dash, ph: t * 0.34, kit: o.kit };
    const s = Math.sin(P.ph);
    const c = Math.cos(P.ph);
    P.bob = o.air ? 0 : walk > 0.05 ? -Math.abs(c) * 1.9 * walk : Math.sin(t * 0.07) * 0.55;
    P.lean = o.dash ? 0.42 : walk * 0.08 + (o.air ? (P.up ? -0.07 : 0.09) : 0);

    // jambes : [arrière, avant]
    const hipY = -9.5;
    let b;
    let f;
    if (o.dash) {
      b = { fx: -12, fy: -8.5 };
      f = { fx: -4.5, fy: -3.5 };
    } else if (o.air) {
      const fl = Math.sin(t * 0.5) * 0.7;
      if (P.up) {
        b = { fx: -4.5, fy: -5.5 + fl };
        f = { fx: 5.5, fy: -8.2 + fl };
      } else {
        b = { fx: -5.8, fy: -4.2 + fl };
        f = { fx: 5.8, fy: -5.4 - fl };
      }
    } else if (walk > 0.05) {
      f = { fx: 3.4 + s * 6.2 * walk, fy: GY - Math.max(0, c) * 3.8 * walk };
      b = { fx: -3.4 - s * 6.2 * walk, fy: GY - Math.max(0, -c) * 3.8 * walk };
    } else {
      b = { fx: -3.7, fy: GY };
      f = { fx: 3.7, fy: GY };
    }
    const mk = (hx, e) => ({ hx, hy: hipY, fx: e.fx, fy: e.fy, kx: (hx + e.fx) / 2 + 2.4, ky: (hipY + e.fy) / 2 });
    P.legs = [mk(-3.4, b), mk(3.4, f)];

    // bras : [arrière, avant]
    const shy = -19.4;
    let ab;
    let af;
    if (o.dash) {
      ab = [-9.5, -16.5];
      af = [-3.5, -17.5];
    } else if (o.air) {
      const fl = Math.sin(t * 0.6) * 1.2;
      if (P.up) {
        ab = [-9.5, -27 + fl];
        af = [10.5, -27.5 - fl];
      } else {
        ab = [-11, -20.5 + fl];
        af = [12, -21.5 - fl];
      }
    } else if (walk > 0.05) {
      ab = [-7.8 + s * 5.6 * walk, -11.8 - Math.abs(c) * 1.4 * walk];
      af = [7.8 - s * 5.6 * walk, -11.8 - Math.abs(c) * 1.4 * walk];
    } else {
      const br = Math.sin(t * 0.07) * 0.5;
      ab = [-8.4, -11.4 + br];
      af = [8.4, -11.4 + br];
    }
    P.castAng = null;
    if (o.cast) {
      const a = o.cast.ang;
      const k = o.cast.k; // 1 au début du geste, 0 à la fin
      const len = 10.5 - k * 2.2; // petit recul au départ
      af = [6.9 + Math.cos(a) * len, shy + Math.sin(a) * len];
      P.castAng = a;
      P.castK = k;
    }
    const mkA = (side, h) => {
      const sx = side * 6.9;
      return { sx, sy: shy, hx: h[0], hy: h[1], kx: (sx + h[0]) / 2 + side * 1.8, ky: (shy + h[1]) / 2 + 1.2 };
    };
    P.arms = [mkA(-1, ab), mkA(1, af)];
    return P;
  }

  /* ---------- Visage et accessoires partagés ---------- */
  function faceHuman(g, P, o, opt) {
    opt = opt || {};
    const lx = (o.look && o.look.x) || 0;
    const ly = (o.look && o.look.y) || 0;
    const blink = P.t % 230 < 7 ? 0.14 : 1;
    const ey = HY + (opt.dy === undefined ? 1.2 : opt.dy);
    [HX + 0.4, HX + 5.8].forEach((ex) => {
      if (opt.slit) {
        // yeux plissés (ninja)
        g.strokeStyle = OUT;
        g.lineWidth = 1.7;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(ex - 2.2, ey + 0.4 + (ex < HX + 3 ? 0.6 : -0.2));
        g.lineTo(ex + 2.2, ey - 0.4);
        g.stroke();
        return;
      }
      ell(g, ex, ey, 2.7, 3.5 * blink, '#fff', 1.1);
      if (blink > 0.5) {
        g.fillStyle = opt.iris || '#2a2147';
        g.beginPath();
        g.arc(ex + 0.9 + lx * 0.9, ey + 0.2 + ly * 1.0, 1.85, 0, TAU);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(ex + 0.3 + lx * 0.9, ey - 0.8 + ly * 1.0, 0.65, 0, TAU);
        g.fill();
      }
    });
    if (!opt.noBlush) {
      g.fillStyle = 'rgba(255,110,130,.34)';
      g.beginPath();
      g.ellipse(HX - 1.4, HY + 4.6, 2.1, 1.3, 0, 0, TAU);
      g.ellipse(HX + 8.2, HY + 4.2, 1.9, 1.2, 0, 0, TAU);
      g.fill();
    }
    if (!opt.noMouth) {
      if (P.air || P.castAng !== null || P.dash) {
        ell(g, HX + 4, HY + 5.6, 1.9, 2.2, '#5a1f33', 1.1);
        g.fillStyle = '#ff7f95';
        g.beginPath();
        g.ellipse(HX + 4, HY + 6.3, 1.1, 0.8, 0, 0, TAU);
        g.fill();
      } else {
        g.strokeStyle = OUT;
        g.lineWidth = 1.3;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(HX + 3.6, HY + 4.3, 2.5, 0.18 * Math.PI, 0.82 * Math.PI);
        g.stroke();
      }
    }
  }

  function humanHead(g, P, o, S, fill, opt) {
    ell(g, HX, HY, 9.7, 9.1, fill || S.tone, 1.6);
    shine(g, HX - 3.2, HY - 4.6, 3.6, 2.1, -0.5, 0.22);
    faceHuman(g, P, o, opt);
  }

  /* ---------- Armes (tenues par la main avant, orientées vers la visée) ---------- */
  function drawStaff(g, hx, hy, ang, P) {
    g.save();
    g.translate(hx, hy);
    g.rotate(ang);
    g.lineCap = 'round';
    g.strokeStyle = OUT;
    g.lineWidth = 4.6;
    g.beginPath();
    g.moveTo(-8, 0);
    g.lineTo(23, 0);
    g.stroke();
    g.strokeStyle = '#a8743a';
    g.lineWidth = 2.4;
    g.stroke();
    g.strokeStyle = '#d9a35f';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(-7, -0.6);
    g.lineTo(22, -0.6);
    g.stroke();
    // griffes + orbe
    g.strokeStyle = '#6a4a22';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(25, 0, 4.4, Math.PI * 0.55, Math.PI * 1.45, true);
    g.stroke();
    const pulse = 1 + Math.sin(P.t * 0.18) * 0.12 + (P.castAng !== null ? P.castK * 0.5 : 0);
    ell(g, 25.5, 0, 3.7 * pulse, 3.7 * pulse, '#e9ddff', 1.2);
    glow(g, 25.5, 0, 12 * pulse, '#b79cff', 0.75);
    shine(g, 24.6, -1.1, 1.3, 1, 0, 0.8);
    g.restore();
  }

  function drawBow(g, hx, hy, ang, P) {
    g.save();
    g.translate(hx, hy);
    g.rotate(ang);
    const pull = P.castAng !== null ? Math.max(0, P.castK) * 4.5 : 0;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-2.5, -13);
    g.quadraticCurveTo(8.5, 0, -2.5, 13);
    g.strokeStyle = OUT;
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = '#b6722f';
    g.lineWidth = 2.8;
    g.stroke();
    g.strokeStyle = '#e0a45e';
    g.lineWidth = 0.9;
    g.stroke();
    g.strokeStyle = '#f3efe4';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-2.5, -13);
    g.lineTo(-2.5 - pull, 0);
    g.lineTo(-2.5, 13);
    g.stroke();
    if (P.castAng !== null && P.castK > 0.25) {
      g.strokeStyle = '#e6c58a';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-2.5 - pull, 0);
      g.lineTo(9, 0);
      g.stroke();
      tri(g, 9, 0, 6, -2.4, 6, 2.4, '#f3efe4', 0);
    }
    g.restore();
  }

  function drawQuiver(g, P) {
    g.save();
    g.translate(-7.5, -17);
    g.rotate(-0.45);
    box(g, -2.6, -3, 5.6, 14, 2, '#8a5428', 1.3);
    g.fillStyle = '#6a3f1c';
    g.fillRect(-2.6, 1.5, 5.6, 1.4);
    // plumes des flèches
    [[-1.4, '#f3efe4'], [0.6, '#ff6b9d'], [2.2, '#f3efe4']].forEach(([px, col]) => {
      g.strokeStyle = OUT;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(px, -3);
      g.lineTo(px - 0.4, -7.6);
      g.stroke();
      tri(g, px - 1.5, -7.2, px + 1.1, -7.2, px - 0.2, -4.6, col, 0.9);
    });
    g.restore();
  }
  /* ---------- Les 12 personnages (des objets et des métiers devenus humains) ---------- */
  const STYLES = {};
  const blinkOf = (P, period) => (P.t % (period || 230) < 7 ? 0.14 : 1);
  const lookX = (o) => (o.look && o.look.x) || 0;
  // contour épais puis couleur : pour les formes dessinées au trait (nouilles, bretzel, fumée…)
  function thick(g, pathFn, w, fill) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pathFn();
    g.strokeStyle = OUT;
    g.lineWidth = w + 2.6;
    g.stroke();
    g.strokeStyle = fill;
    g.lineWidth = w;
    g.stroke();
  }

  /* 1. Tasse */
  STYLES.tasse = {
    tone: '#fff6ea', pants: '#5b3a29', shoe: '#2b1b12',
    body: (o, C) => shade(C.col, -0.3), arm: () => '#f6efe4',
    torso(g, P, o, C) {
      box(g, -6.6, -12.6, 13.2, 2.4, 1, '#3a2518', 1.1);
      // grain de café sur la poitrine
      ell(g, 0.6, -16.6, 2.7, 3.6, '#6b3d1f', 1.1, 0.35);
      g.strokeStyle = '#2f1a0d';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(-0.5, -19);
      g.quadraticCurveTo(2.2, -16.6, 0.4, -14.4);
      g.stroke();
    },
    head(g, P, o, C) {
      const col = C.col;
      // anse (côté dos)
      thick(g, () => g.arc(HX - 9.4, HY + 1.2, 5, -Math.PI * 0.5, Math.PI * 0.5, true), 3.2, shade(col, -0.08));
      // corps de la tasse
      g.beginPath();
      g.moveTo(HX - 9.6, HY - 8);
      g.lineTo(HX + 9.6, HY - 8);
      g.lineTo(HX + 8.7, HY + 7.4);
      g.quadraticCurveTo(HX + 8.4, HY + 10.6, HX + 5.2, HY + 10.6);
      g.lineTo(HX - 4.8, HY + 10.6);
      g.quadraticCurveTo(HX - 8.2, HY + 10.6, HX - 8.6, HY + 7.4);
      g.closePath();
      paint(g, grad(g, HX - 9, 0, HX + 9, 0, shade(col, 0.34), shade(col, -0.1)), 1.6);
      // bande décorative
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.fillRect(HX - 8.9, HY + 6.6, 17.8, 1.5);
      // bord et café
      ell(g, HX, HY - 8, 9.7, 2.8, '#fffaf2', 1.4);
      ell(g, HX, HY - 7.8, 8.2, 2, '#6f3f1e', 0);
      g.fillStyle = '#c98a55';
      g.beginPath();
      g.ellipse(HX + 1.6, HY - 7.9, 3.6, 0.8, 0, 0, TAU);
      g.fill();
      // vapeur
      g.lineCap = 'round';
      [[-3.4, 0], [2.8, 1.7]].forEach(([dx, ph]) => {
        const w = Math.sin(P.t * 0.09 + ph) * 1.8;
        g.strokeStyle = 'rgba(255,255,255,.85)';
        g.lineWidth = 1.7;
        g.beginPath();
        g.moveTo(HX + dx, HY - 10);
        g.bezierCurveTo(HX + dx + 3 + w, HY - 12.6, HX + dx - 3 - w, HY - 14.6, HX + dx + w * 0.5, HY - 18);
        g.stroke();
      });
      shine(g, HX - 5.6, HY - 1, 1.5, 5, 0.1, 0.45);
      faceHuman(g, P, o, { dy: 2.2 });
    },
  };

  /* 2. Cookie */
  STYLES.cookie = {
    tone: '#e6b46f', pants: '#8a5a2f', shoe: '#4a2a18',
    body: () => '#e0a862', arm: () => '#dca25c',
    torso(g, P, o, C) {
      box(g, -6.6, -12.6, 13.2, 2.4, 1, '#4a2a18', 1.1);
      // pépites sur le ventre
      g.fillStyle = '#4a2a18';
      [[-3, -16.4, 0.3], [3.2, -18.6, -0.4], [1.6, -14.4, 0.8]].forEach(([dx, dy, r]) => {
        g.save();
        g.translate(dx, dy);
        g.rotate(r);
        g.beginPath();
        g.ellipse(0, 0, 1.6, 1.1, 0, 0, TAU);
        g.fill();
        g.restore();
      });
      // écharpe à la couleur du joueur
      box(g, -6.8, -21.6, 13.6, 3.6, 1.8, C.col, 1.3);
      g.beginPath();
      g.moveTo(3, -18.6);
      g.quadraticCurveTo(6.8, -14, 4 + Math.sin(P.t * 0.2) * 1.2, -11);
      g.lineTo(0.6, -12.2);
      g.quadraticCurveTo(2.4, -14.6, 0.8, -18);
      g.closePath();
      paint(g, C.light, 1.2);
    },
    head(g, P, o, C) {
      const lx = lookX(o);
      const cx = HX;
      const R = 10.8;
      const bite = -2.3; // la croquée est en haut à gauche
      const pol = (a, r) => [cx + Math.cos(a) * r * 1.03, HY + Math.sin(a) * r * 0.98];
      g.beginPath();
      const a0 = bite + 0.78;
      const a1 = bite + TAU - 0.78;
      for (let i = 0; i <= 30; i++) {
        const a = a0 + ((a1 - a0) * i) / 30;
        const [px, py] = pol(a, R + (i % 2 ? 0.55 : -0.1));
        g[i ? 'lineTo' : 'moveTo'](px, py);
      }
      // trois petites dents en creux
      [[0.52, 4.6], [0.1, 4.9], [-0.32, 4.6]].forEach(([d, r], k, arr) => {
        const [qx, qy] = pol(bite - d, r);
        const e = k + 1 < arr.length ? pol(bite - (d + arr[k + 1][0]) / 2, 8.4) : pol(bite + 0.78, R);
        g.quadraticCurveTo(qx, qy, e[0], e[1]);
      });
      g.closePath();
      paint(g, grad(g, 0, HY - 10, 0, HY + 10, '#f1c47e', '#cf9150'), 1.6);
      shine(g, cx - 3, HY - 5.2, 3.6, 1.8, -0.4, 0.35);
      // pépites de chocolat
      g.fillStyle = '#4a2a18';
      [[4.6, -7.4, -0.3, 2.2], [8.4, -1.8, 0.7, 2], [-8.6, 3.8, -0.5, 1.9], [-3.4, 8, 0.3, 2], [6.6, 6.2, 0.2, 2.2], [-6.8, -2.4, 0.5, 1.5]].forEach(([dx, dy, r, s]) => {
        g.save();
        g.translate(cx + dx, HY + dy);
        g.rotate(r);
        g.beginPath();
        g.moveTo(-s, -s * 0.6);
        g.lineTo(s * 0.8, -s * 0.8);
        g.lineTo(s, s * 0.6);
        g.lineTo(-s * 0.7, s * 0.8);
        g.closePath();
        g.fill();
        g.restore();
      });
      const bl = blinkOf(P, 220);
      [cx - 0.6, cx + 5.4].forEach((ex) => {
        ell(g, ex, HY + 0.2, 2.2, 3 * bl, '#2a1608', 0);
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(ex - 0.5 + lx * 0.6, HY - 0.8, 0.8, 0, TAU);
        g.fill();
      });
      if (P.air || P.castAng !== null || P.dash) ell(g, cx + 2.6, HY + 4.8, 1.8, 2.1, '#4a1a10', 0);
      else {
        g.strokeStyle = '#4a2a18';
        g.lineWidth = 1.4;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(cx + 2.4, HY + 3.2, 3.1, 0.2 * Math.PI, 0.8 * Math.PI);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,110,130,.38)';
      g.beginPath();
      g.ellipse(cx - 4, HY + 4.2, 1.9, 1.2, 0, 0, TAU);
      g.ellipse(cx + 8.2, HY + 4.2, 1.9, 1.2, 0, 0, TAU);
      g.fill();
    },
  };

  /* 3. Magicien */
  function wand(g, hx, hy, P) {
    g.save();
    g.translate(hx, hy);
    g.rotate(-1.15 + Math.sin(P.t * 0.08) * 0.07);
    g.lineCap = 'round';
    g.strokeStyle = OUT;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-4, 0);
    g.lineTo(15, 0);
    g.stroke();
    g.strokeStyle = '#3a2a4a';
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = '#fff3c4';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(13, 0);
    g.lineTo(15, 0);
    g.stroke();
    const k = 0.7 + Math.sin(P.t * 0.2) * 0.3;
    glow(g, 17.5, 0, 9 * k + 3, '#ffe27a', 0.7);
    star(g, 17.5, 0, 3.4 * k + 1, '#fff6c8', 1);
    g.restore();
  }
  STYLES.magicien = {
    tone: '#ffd8b4', pants: '#2d2a5e', shoe: '#2b1d3a',
    body: (o, C) => shade(C.col, -0.28), arm: (o, C) => shade(C.col, -0.2),
    torsoShape(g, P, o, C) {
      const sw = Math.sin(P.t * 0.12) * 0.8 + (P.walk > 0.05 ? 1.2 : 0);
      g.beginPath();
      g.moveTo(-6.6, -20.6);
      g.quadraticCurveTo(0.6, -22.4, 7.4, -20.6);
      g.lineTo(10.8, -3.8 + sw * 0.3);
      for (let i = 0; i < 5; i++) g.quadraticCurveTo(10.8 - (i + 0.5) * 4.32, -1.4 + (i % 2 ? 1.2 : -0.6) + sw * 0.2, 10.8 - (i + 1) * 4.32, -3.8 + sw * 0.3);
      g.closePath();
      paint(g, grad(g, 0, -21, 0, -3, shade(C.col, -0.05), shade(C.col, -0.42)), 1.5);
      shine(g, -3.8, -16, 1.8, 5, 0.1, 0.22);
    },
    torso(g, P, o, C) {
      // ceinture de corde et étoiles
      box(g, -7.4, -12.8, 14.8, 2.2, 1, '#ffd24a', 1.1);
      g.strokeStyle = '#d19a1c';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(3, -10.6);
      g.quadraticCurveTo(4.6, -7, 3 + Math.sin(P.t * 0.18), -5);
      g.stroke();
      star(g, -3.4, -7.6, 1.7, '#ffe27a', 0.7);
      star(g, 4.8, -16.2, 1.7, '#ffe27a', 0.7);
      star(g, -2.6, -17.6, 1.4, '#ffe27a', 0.7);
    },
    hold: (g, P, o, C, fa) => wand(g, fa.hx, fa.hy, P),
    head(g, P, o, C) {
      const bend = Math.sin(P.t * 0.09) * 1.6;
      humanHead(g, P, o, this, undefined, { noBlush: false });
      // sourcils broussailleux
      g.strokeStyle = '#e8e8f2';
      g.lineWidth = 2.1;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(HX - 1.6, HY - 3.1);
      g.lineTo(HX + 2.6, HY - 4);
      g.moveTo(HX + 3.8, HY - 4);
      g.lineTo(HX + 8, HY - 3.1);
      g.stroke();
      // barbe
      g.beginPath();
      g.moveTo(HX - 7.6, HY + 2.2);
      g.quadraticCurveTo(HX - 8.8, HY + 11.6, HX + 0.4, HY + 16 + Math.sin(P.t * 0.12) * 0.7);
      g.quadraticCurveTo(HX + 9.6, HY + 12, HX + 9.6, HY + 2.6);
      g.quadraticCurveTo(HX + 4, HY + 5, HX + 0.8, HY + 3.4);
      g.quadraticCurveTo(HX - 3, HY + 5, HX - 7.6, HY + 2.2);
      g.closePath();
      paint(g, grad(g, 0, HY + 2, 0, HY + 16, '#ffffff', '#d4d8ea'), 1.3);
      // moustache + bouche cachée
      ell(g, HX + 4.2, HY + 3.9, 3.4, 1.4, '#f4f4fb', 1, 0);
      // chapeau
      const brim = shade(C.col, -0.2);
      ell(g, HX, HY - 6.4, 13.4, 3.3, brim, 1.4);
      g.beginPath();
      g.moveTo(HX - 8, HY - 7);
      g.quadraticCurveTo(HX - 5 + bend, HY - 20, HX + 7 + bend * 2, HY - 24.4);
      g.quadraticCurveTo(HX + 11 + bend * 2.4, HY - 20, HX + 8.6, HY - 7);
      g.quadraticCurveTo(HX, HY - 3.6, HX - 8, HY - 7);
      g.closePath();
      paint(g, grad(g, 0, HY - 24, 0, HY - 6, shade(C.col, 0.1), shade(C.col, -0.38)), 1.4);
      g.fillStyle = '#ffd24a';
      g.fillRect(HX - 8.2, HY - 9.6, 16.8, 2.1);
      star(g, HX + 0.4, HY - 12.4, 2.6, '#ffe27a', 0.9);
      shine(g, HX - 3.6, HY - 15, 1.6, 4, 0.5, 0.25);
    },
  };

  /* 4. Gilet jaune */
  STYLES.gilet = {
    tone: '#f1c9a0', pants: '#3f5fa8', shoe: '#5a4128',
    body: () => '#3b4b6e', arm: () => '#3b4b6e',
    torso(g, P, o, C) {
      // gilet de sécurité fluo
      g.beginPath();
      g.moveTo(-6.8, -21.4);
      g.lineTo(-2.2, -21.4);
      g.lineTo(0.2, -17.2);
      g.lineTo(2.6, -21.4);
      g.lineTo(6.8, -21.4);
      g.lineTo(6.8, -8.8);
      g.lineTo(-6.8, -8.8);
      g.closePath();
      paint(g, grad(g, 0, -21, 0, -9, '#fff04a', '#ffd100'), 1.5);
      // bandes réfléchissantes
      [-16.2, -12.2].forEach((y) => {
        g.fillStyle = '#d9dde6';
        g.fillRect(-6.5, y, 13, 2.1);
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.fillRect(-6.5, y, 13, 0.8);
        g.strokeStyle = OUT;
        g.lineWidth = 0.8;
        g.strokeRect(-6.5, y, 13, 2.1);
      });
      g.strokeStyle = 'rgba(150,110,0,.7)';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(0.2, -17);
      g.lineTo(0.2, -9);
      g.stroke();
      shine(g, -3.6, -19.6, 1.8, 1, 0, 0.5);
    },
    head(g, P, o, C) {
      humanHead(g, P, o, this);
      // cheveux et barbe de trois jours
      g.beginPath();
      g.moveTo(HX - 9.4, HY - 1);
      g.quadraticCurveTo(HX - 10, HY - 9.8, HX + 0.6, HY - 9.4);
      g.quadraticCurveTo(HX + 9.6, HY - 9, HX + 9.6, HY - 2.4);
      g.quadraticCurveTo(HX + 5, HY - 5.6, HX - 1.4, HY - 5);
      g.quadraticCurveTo(HX - 6, HY - 4.8, HX - 9.4, HY - 1);
      g.closePath();
      paint(g, '#5a3a22', 1.2);
      g.fillStyle = 'rgba(90,58,34,.45)';
      g.beginPath();
      g.moveTo(HX - 6.8, HY + 4);
      g.quadraticCurveTo(HX - 0.4, HY + 11.6, HX + 8.6, HY + 4.6);
      g.quadraticCurveTo(HX + 2, HY + 7, HX - 6.8, HY + 4);
      g.fill();
      // bonnet à la couleur du joueur
      g.beginPath();
      g.moveTo(HX - 9.8, HY - 3);
      g.quadraticCurveTo(HX - 10.6, HY - 13.8, HX + 0.6, HY - 13.8);
      g.quadraticCurveTo(HX + 11.2, HY - 13.8, HX + 10.4, HY - 3);
      g.closePath();
      paint(g, grad(g, 0, HY - 14, 0, HY - 3, C.light, C.col), 1.4);
      box(g, HX - 10.4, HY - 6.4, 20.8, 3.8, 1.6, C.dark, 1.3);
      ell(g, HX + 0.4, HY - 15.2, 2.6, 2.6, '#fff', 1.2);
      // sourcils
      g.strokeStyle = '#4a2f1b';
      g.lineWidth = 1.5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(HX - 1.2, HY - 2.1);
      g.lineTo(HX + 2.6, HY - 2.8);
      g.moveTo(HX + 4.2, HY - 2.8);
      g.lineTo(HX + 8, HY - 2.1);
      g.stroke();
    },
  };

  /* 5. PC */
  STYLES.pc = {
    tone: '#e4e8f2', pants: '#2f3340', shoe: '#c9ced9',
    body: () => '#cfd4e0', arm: () => '#9aa2b6',
    torsoShape(g, P, o, C) {
      rr(g, -6.8, -21.2, 13.6, 12.8, 2.6);
      paint(g, grad(g, -6.8, 0, 6.8, 0, '#e8ebf3', '#b4bacb'), 1.6);
      // bande de couleur du joueur sur le côté
      g.fillStyle = C.col;
      g.fillRect(-6, -20.4, 2, 11.2);
      // lecteur et bouton
      box(g, -2.4, -19.4, 8, 2.2, 0.8, '#8a92a6', 1);
      g.fillStyle = '#3a3f50';
      g.fillRect(-1.4, -18.6, 6, 0.7);
      box(g, -2.4, -15.4, 8, 1.4, 0.6, '#9aa2b6', 0.9);
      ell(g, 0.4, -11.8, 1.8, 1.8, '#f1f3f9', 1.1);
      const on = (P.t * 0.05) % 2 < 1.6;
      g.fillStyle = on ? '#4dff9a' : '#1d6a46';
      g.beginPath();
      g.arc(4.6, -11.8, 1, 0, TAU);
      g.fill();
      if (on) glow(g, 4.6, -11.8, 5, '#4dff9a', 0.5);
    },
    head(g, P, o, C) {
      const lx = lookX(o);
      // pied de l'écran
      box(g, HX - 3.6, HY + 6, 7.6, 4.2, 1, '#aab1c4', 1.2);
      // écran
      rr(g, HX - 11.6, HY - 9.8, 23.2, 17.2, 3.2);
      paint(g, grad(g, 0, HY - 10, 0, HY + 8, '#eceff7', '#b9bfd0'), 1.6);
      rr(g, HX - 9.6, HY - 7.8, 19.2, 12.4, 2);
      paint(g, grad(g, 0, HY - 8, 0, HY + 5, '#17356b', '#0b1a3a'), 1.2);
      glow(g, HX, HY - 1.6, 14, '#46c8ff', 0.28);
      // lignes d'écran
      g.fillStyle = 'rgba(120,200,255,.1)';
      for (let y = HY - 7; y < HY + 4; y += 2.4) g.fillRect(HX - 9.4, y, 18.8, 0.8);
      // yeux de pixels et sourire
      const bl = blinkOf(P, 210);
      g.fillStyle = '#9af0ff';
      [HX - 3.6, HX + 4.8].forEach((ex) => {
        rr(g, ex - 1.6 + lx * 0.7, HY - 4.2 + (1 - bl) * 2, 3.4, 5 * bl, 1);
        g.fill();
      });
      g.strokeStyle = '#9af0ff';
      g.lineWidth = 1.4;
      g.lineCap = 'round';
      g.beginPath();
      if (P.air || P.castAng !== null || P.dash) {
        g.ellipse(HX + 0.6, HY + 1.4, 1.5, 1.8, 0, 0, TAU);
      } else {
        g.arc(HX + 0.6, HY - 0.2, 3, 0.2 * Math.PI, 0.8 * Math.PI);
      }
      g.stroke();
      if (P.t % 60 < 30) {
        g.fillStyle = '#9af0ff';
        g.fillRect(HX + 6.6, HY + 2.2, 2.4, 0.9);
      }
      // webcam et petite diode
      g.fillStyle = '#2b2f3f';
      g.beginPath();
      g.arc(HX, HY - 8.9, 0.8, 0, TAU);
      g.fill();
      g.fillStyle = C.col;
      g.beginPath();
      g.arc(HX + 8.4, HY + 6, 0.9, 0, TAU);
      g.fill();
    },
  };

  /* 6. Spätzle */
  function noodle(g, x, y, ang, len, w, fill, wob) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    thick(g, () => {
      g.moveTo(-len / 2, 0);
      g.bezierCurveTo(-len / 4, -2.2 - wob, len / 4, 2.2 + wob, len / 2, 0);
    }, w, fill);
    g.restore();
  }
  STYLES.spaetzle = {
    tone: '#f3d98a', pants: '#d9b04c', shoe: '#7a4a22',
    body: () => '#f3d98a', arm: () => '#efd07a',
    torso(g, P, o, C) {
      // tablier à carreaux de la couleur du joueur
      g.beginPath();
      g.moveTo(-5.6, -20.4);
      g.lineTo(5.6, -20.4);
      g.lineTo(6.6, -9);
      g.lineTo(-6.6, -9);
      g.closePath();
      paint(g, C.col, 1.4);
      g.save();
      g.clip();
      g.fillStyle = 'rgba(255,255,255,.55)';
      for (let x = -6; x < 7; x += 4) g.fillRect(x, -21, 2, 13);
      for (let y = -20; y < -8; y += 4) g.fillRect(-7, y, 14, 2);
      g.restore();
      box(g, -3, -17.6, 6, 4.4, 1, 'rgba(255,255,255,.3)', 0.8);
    },
    head(g, P, o, C) {
      const lx = lookX(o);
      // tas de spätzle : plusieurs nouilles courtes et irrégulières
      const base = '#f6e09a';
      ell(g, HX, HY + 1.4, 10.4, 8.6, grad(g, 0, HY - 8, 0, HY + 10, '#f9e8ac', '#e6c46a'), 1.6);
      [[-7.4, -3.8, 0.7], [6.8, -5.6, -0.6], [-8.6, 4.4, -0.4], [9.2, 3.6, 0.5], [-1, -9, 0.1], [4.6, 8.2, 0.3], [-5, 8.6, -0.2]].forEach(([dx, dy, a], i) => {
        noodle(g, HX + dx, HY + dy, a, 8.4, 4.2, i % 2 ? base : '#f1d684', 1.4 + (i % 3) * 0.4);
      });
      ell(g, HX, HY + 1.6, 8.3, 7, grad(g, 0, HY - 6, 0, HY + 8, '#fbeab4', '#ecca75'), 0);
      g.strokeStyle = 'rgba(190,140,50,.55)';
      g.lineWidth = 0.9;
      g.lineCap = 'round';
      [[-5, -3, 3], [3, -5, 3.4], [-3, 6, 3], [5.6, 4.6, 2.6]].forEach(([dx, dy, l]) => {
        g.beginPath();
        g.moveTo(HX + dx, HY + dy);
        g.quadraticCurveTo(HX + dx + l / 2, HY + dy - 1.2, HX + dx + l, HY + dy + 0.4);
        g.stroke();
      });
      shine(g, HX - 4.6, HY - 4, 3.2, 1.6, -0.5, 0.45);
      // fromage fondu : une calotte avec quelques coulures sur les côtés
      g.beginPath();
      g.moveTo(HX - 8.8, HY - 3.6);
      g.quadraticCurveTo(HX, HY - 11.6, HX + 9.4, HY - 3.6);
      g.quadraticCurveTo(HX + 10.4, HY + 1.6 + Math.sin(P.t * 0.08) * 0.4, HX + 8, HY + 2.6);
      g.quadraticCurveTo(HX + 6.6, HY - 1, HX + 5, HY - 2.4);
      g.quadraticCurveTo(HX + 2.4, HY - 3.8, HX, HY - 3.6);
      g.quadraticCurveTo(HX - 3, HY - 3.8, HX - 4.8, HY - 2.4);
      g.quadraticCurveTo(HX - 6.4, HY + 1, HX - 8, HY + 2.8);
      g.quadraticCurveTo(HX - 10.2, HY + 1.4, HX - 8.8, HY - 3.6);
      g.closePath();
      paint(g, grad(g, 0, HY - 11, 0, HY + 2, '#ffd24a', '#f0a31c'), 1.3);
      shine(g, HX - 2, HY - 7.6, 3.4, 1.1, 0.1, 0.5);
      // oignons frits
      [[-3.6, -9.6, 0.6], [2.6, -10.4, -0.4], [6.2, -8.4, 0.9]].forEach(([dx, dy, a]) => {
        g.save();
        g.translate(HX + dx, HY + dy);
        g.rotate(a);
        thick(g, () => {
          g.moveTo(-2.6, 0);
          g.quadraticCurveTo(0, -2.4, 2.6, 0);
        }, 1.7, '#b86a1c');
        g.restore();
      });
      // persil
      g.save();
      g.translate(HX - 0.8, HY - 10.2);
      [-0.7, 0.7].forEach((a) => {
        g.save();
        g.rotate(a);
        ell(g, 0, -2.6, 1.7, 3, '#3fa34d', 1);
        g.restore();
      });
      g.restore();
      faceHuman(g, P, o, { dy: 2.2, iris: '#3a2210' });
    },
  };

  /* 7. Suzuki Swift (petite citadine, les roues roulent sur place) */
  function wheel(g, x, y, r, spin) {
    ell(g, x, y, r + 1.3, r + 1.3, '#1d1a3b', 0);
    ell(g, x, y, r, r, '#2b2b36', 1.2);
    ell(g, x, y, r * 0.62, r * 0.62, grad(g, x - r, y - r, x + r, y + r, '#f1f3f8', '#9aa2b4'), 0.9);
    g.save();
    g.translate(x, y);
    g.rotate(spin);
    g.strokeStyle = '#5a6074';
    g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos((i / 5) * TAU) * r * 0.58, Math.sin((i / 5) * TAU) * r * 0.58);
      g.stroke();
    }
    g.restore();
    ell(g, x, y, 0.9, 0.9, '#5a6074', 0);
  }
  STYLES.swift = {
    tone: '#f7f8fc', legs: false, armDy: 6.4,
    body: () => '#fff', arm: () => '#f1f3f9',
    torsoShape(g, P, o, C) {
      const col = C.col;
      g.save();
      g.scale(1.18, 1.18);
      const spin = P.t * 0.34 * (P.walk > 0.05 ? 1.4 : 0) + (P.dash ? P.t * 0.9 : 0);
      // carrosserie : petit hayon, toit court, capot plongeant
      g.beginPath();
      g.moveTo(-11.6, -6.4);
      g.lineTo(-12.4, -12.2);
      g.quadraticCurveTo(-12.2, -16.4, -9.8, -22.4);
      g.quadraticCurveTo(-9.2, -24.2, -7.4, -24.2);
      g.lineTo(0.2, -24.2);
      g.quadraticCurveTo(1.8, -24, 2.8, -22.2);
      g.lineTo(5.6, -16.4);
      g.lineTo(10.6, -15.4);
      g.quadraticCurveTo(12.9, -15, 13, -12.4);
      g.lineTo(12.8, -7.6);
      g.quadraticCurveTo(12.6, -6, 10.8, -6);
      g.lineTo(-10.4, -6);
      g.quadraticCurveTo(-11.5, -6, -11.6, -6.4);
      g.closePath();
      paint(g, grad(g, 0, -24, 0, -6, shade(col, 0.28), shade(col, -0.12)), 1.6);
      // bas de caisse et pare-chocs
      g.fillStyle = 'rgba(0,0,0,.22)';
      g.fillRect(-11.2, -8.4, 23.6, 2.3);
      g.fillStyle = '#2b2d3a';
      g.fillRect(10.6, -9.6, 2.4, 3.4);
      // vitres (c'est là que vivent les yeux)
      g.beginPath();
      g.moveTo(-9.6, -21.6);
      g.lineTo(-0.4, -22.4);
      g.quadraticCurveTo(0.8, -22, 1.6, -20.6);
      g.lineTo(4.4, -15.8);
      g.lineTo(-10.8, -15.8);
      g.quadraticCurveTo(-11, -18, -9.6, -21.6);
      g.closePath();
      paint(g, grad(g, 0, -22, 0, -15.6, '#e4f6ff', '#8ec6ee'), 1.2);
      // yeux
      const bl = blinkOf(P, 220);
      const lx = lookX(o);
      [-4.9, 0.4].forEach((ex) => {
        ell(g, ex, -18.9, 2.5, 3.1 * bl, '#fff', 1);
        if (bl > 0.5) {
          g.fillStyle = '#2a2147';
          g.beginPath();
          g.arc(ex + 0.9 + lx * 0.8, -18.7, 1.5, 0, TAU);
          g.fill();
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(ex + 0.4 + lx * 0.8, -19.5, 0.55, 0, TAU);
          g.fill();
        }
      });
      // sourire sur la portière
      g.strokeStyle = OUT;
      g.lineWidth = 1.3;
      g.lineCap = 'round';
      g.beginPath();
      if (P.air || P.castAng !== null || P.dash) g.ellipse(6.4, -11.2, 1.7, 2, 0, 0, TAU);
      else g.arc(6.2, -12.4, 2.6, 0.18 * Math.PI, 0.82 * Math.PI);
      g.stroke();
      g.fillStyle = 'rgba(255,110,130,.35)';
      g.beginPath();
      g.ellipse(2.4, -11.4, 1.6, 1, 0, 0, TAU);
      g.fill();
      // poignée, ligne de portière, rétroviseur
      g.strokeStyle = 'rgba(0,0,0,.28)';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(-3.6, -15.6);
      g.lineTo(-3.8, -8.6);
      g.stroke();
      box(g, -2.4, -14.4, 2.8, 1, 0.5, '#d9dde8', 0.8);
      ell(g, 5.4, -15.6, 1.6, 1.1, shade(col, -0.2), 1);
      // phares
      ell(g, 11.5, -12.8, 1.5, 1.9, '#fffbd0', 1);
      glow(g, 12.6, -12.8, 7, '#fff3a0', 0.4 + (P.dash ? 0.3 : 0));
      ell(g, -11.8, -11.4, 0.9, 1.9, '#ff4a5a', 0.9);
      // roues avec leur passage de roue
      [-7.2, 7.6].forEach((wx) => wheel(g, wx, -4.6, 4.5, spin));
      g.restore();
    },
    head() {},
  };

  /* 8. Cigarette roulée */
  STYLES.roulee = {
    tone: '#f5f1e6', pants: '#c89a5a', shoe: '#5a3a22',
    body: () => '#f5f1e6', arm: () => '#f2eddd',
    torsoShape(g, P, o, C) {
      rr(g, -6.6, -21.2, 13.2, 12.4, 4.4);
      paint(g, grad(g, -6.6, 0, 6.6, 0, '#fffdf6', '#e4dcc6'), 1.6);
      // bout filtre
      g.save();
      rr(g, -6.6, -21.2, 13.2, 12.4, 4.4);
      g.clip();
      g.fillStyle = '#d8a768';
      g.fillRect(-7, -13.8, 14, 6);
      g.fillStyle = 'rgba(120,70,20,.5)';
      [[-4, -11.4], [-1, -10], [2.4, -11.8], [4.6, -9.8], [0, -12.8], [-3.6, -9.4]].forEach(([x, y]) => g.fillRect(x, y, 1, 0.8));
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.fillRect(-7, -13.8, 14, 0.9);
      g.restore();
      rr(g, -6.6, -21.2, 13.2, 12.4, 4.4);
      g.lineWidth = 1.6;
      g.strokeStyle = OUT;
      g.stroke();
      // bague à la couleur du joueur
      g.fillStyle = C.col;
      g.fillRect(-6.5, -19.6, 13, 3);
      g.fillStyle = 'rgba(255,255,255,.4)';
      g.fillRect(-6.5, -19.6, 13, 0.9);
      g.strokeStyle = OUT;
      g.lineWidth = 0.9;
      g.strokeRect(-6.5, -19.6, 13, 3);
      // couture de colle
      g.strokeStyle = 'rgba(150,140,110,.7)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(-3.8, -16.2);
      g.lineTo(-3.6, -14);
      g.stroke();
    },
    head(g, P, o, C) {
      const sway = Math.sin(P.t * 0.07) * 0.8;
      // fumée
      g.lineCap = 'round';
      [0, 1.6, 3.2].forEach((ph, i) => {
        const w = Math.sin(P.t * 0.07 + ph) * 2.2;
        g.strokeStyle = `rgba(220,224,235,${0.75 - i * 0.18})`;
        g.lineWidth = 1.7 - i * 0.2;
        g.beginPath();
        g.moveTo(HX + 0.4 + sway, HY - 14.4 - i * 2.6);
        g.bezierCurveTo(HX + 4 + w, HY - 17.2 - i * 2.6, HX - 4 - w, HY - 19 - i * 2.6, HX + 0.4 + w * 0.5, HY - 22 - i * 2.6);
        g.stroke();
      });
      // tête : papier roulé, un peu de travers
      g.beginPath();
      g.moveTo(HX - 8, HY - 4.4);
      g.quadraticCurveTo(HX - 8.4, HY - 9.4, HX - 3.4, HY - 10.6);
      g.quadraticCurveTo(HX - 1.4, HY - 11, HX - 0.8, HY - 12.8);
      g.lineTo(HX + 1.8, HY - 12.8);
      g.quadraticCurveTo(HX + 2, HY - 10.8, HX + 4.2, HY - 10.4);
      g.quadraticCurveTo(HX + 9, HY - 9, HX + 8.8, HY - 3.6);
      g.lineTo(HX + 9, HY + 5.4);
      g.quadraticCurveTo(HX + 9, HY + 9.8, HX + 4.6, HY + 9.8);
      g.lineTo(HX - 4, HY + 9.8);
      g.quadraticCurveTo(HX - 8.4, HY + 9.8, HX - 8.4, HY + 5.4);
      g.closePath();
      paint(g, grad(g, HX - 8, 0, HX + 9, 0, '#fffdf6', '#e8e0cb'), 1.6);
      // plis de papier
      g.strokeStyle = 'rgba(150,140,110,.55)';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(HX - 5.6, HY - 7.6);
      g.quadraticCurveTo(HX - 3, HY - 5, HX - 4.6, HY - 2.4);
      g.moveTo(HX + 6.4, HY - 7);
      g.quadraticCurveTo(HX + 5, HY - 4.6, HX + 7, HY - 2);
      g.stroke();
      // torsade du bout : braise
      ell(g, HX + 0.5, HY - 13.2, 2.1, 1.5, '#ff7a1a', 1);
      glow(g, HX + 0.5, HY - 13.4, 8, '#ff9a3a', 0.45 + Math.sin(P.t * 0.15) * 0.15);
      ell(g, HX + 0.5, HY - 13.3, 1, 0.7, '#ffe27a', 0);
      // petit déchirement avec le tabac qui dépasse
      g.beginPath();
      g.moveTo(HX - 8.3, HY + 3.6);
      g.lineTo(HX - 5.4, HY + 4.8);
      g.lineTo(HX - 8.3, HY + 6.8);
      g.closePath();
      paint(g, '#7a4a22', 0.9);
      g.strokeStyle = '#7a4a22';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(HX - 5.6, HY + 5);
      g.quadraticCurveTo(HX - 4, HY + 7, HX - 2.4, HY + 6);
      g.stroke();
      faceHuman(g, P, o, { dy: 1.6 });
    },
  };

  /* 9. Archer */
  STYLES.archer = {
    tone: '#ffd8b4', pants: '#55663a', shoe: '#6a4524', noQuiver: true,
    body: () => '#3f7d3f', arm: () => '#3a7339',
    back(g, P, o, C) {
      if (o.kit === 'plain' || o.kit === 'archer') drawQuiver(g, P);
      // petite cape
      const sw = Math.sin(P.t * 0.16) * 1.2 + P.walk * 2 + (P.dash ? 5 : 0);
      g.beginPath();
      g.moveTo(-4, -20.6);
      g.quadraticCurveTo(-11 - sw, -15, -11.4 - sw, -8.6);
      g.lineTo(-7.6 - sw * 0.5, -9.6);
      g.quadraticCurveTo(-5.6, -14, -2, -16.6);
      g.closePath();
      paint(g, '#2a5a2e', 1.3);
    },
    torso(g, P, o, C) {
      // sangle de cuir et ceinture
      g.strokeStyle = OUT;
      g.lineWidth = 3.6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-5.4, -20);
      g.lineTo(5.4, -10.8);
      g.stroke();
      g.strokeStyle = '#8a5428';
      g.lineWidth = 2.1;
      g.stroke();
      box(g, -6.6, -12.4, 13.2, 2.6, 1, '#6b4a2a', 1.2);
      box(g, -1.2, -12.3, 3.2, 2.4, 0.8, '#ffd24a', 0.9);
      // col
      box(g, -6.2, -21.8, 12.4, 3, 1.4, '#2a5a2e', 1.2);
    },
    hold(g, P, o, C, fa) { drawBow(g, fa.hx, fa.hy, 0, P); },
    head(g, P, o, C) {
      humanHead(g, P, o, this);
      // cheveux
      g.beginPath();
      g.moveTo(HX - 9.6, HY - 0.6);
      g.quadraticCurveTo(HX - 11, HY - 7, HX - 4, HY - 7.6);
      g.quadraticCurveTo(HX + 1.4, HY - 5.6, HX + 3.6, HY - 5);
      g.quadraticCurveTo(HX + 7, HY - 4.8, HX + 9.4, HY - 2);
      g.lineTo(HX + 9.2, HY - 5.6);
      g.quadraticCurveTo(HX + 6, HY - 9.4, HX - 1, HY - 9.6);
      g.quadraticCurveTo(HX - 8, HY - 9.4, HX - 9.6, HY - 0.6);
      g.closePath();
      paint(g, '#7a4a22', 1.1);
      // chapeau pointu à plume
      const brim = '#2a5a2e';
      g.beginPath();
      g.moveTo(HX - 10.4, HY - 4.6);
      g.quadraticCurveTo(HX - 10.8, HY - 13.8, HX - 1.4, HY - 14.6);
      g.quadraticCurveTo(HX + 5, HY - 15.6, HX + 13.4, HY - 12.6);
      g.quadraticCurveTo(HX + 7.2, HY - 11, HX + 9.8, HY - 4.4);
      g.quadraticCurveTo(HX, HY - 8.4, HX - 10.4, HY - 4.6);
      g.closePath();
      paint(g, grad(g, 0, HY - 15, 0, HY - 4, '#4a9a4a', brim), 1.4);
      box(g, HX - 10.4, HY - 6.6, 20, 2.4, 1, '#6b4a2a', 1);
      // plume (couleur du joueur)
      const fw = Math.sin(P.t * 0.14) * 1.2;
      g.beginPath();
      g.moveTo(HX + 1.8, HY - 13.6);
      g.quadraticCurveTo(HX - 3 + fw, HY - 20, HX - 9 + fw, HY - 19.4);
      g.quadraticCurveTo(HX - 4, HY - 15.6, HX + 1.8, HY - 10.6);
      g.closePath();
      paint(g, grad(g, HX - 9, HY - 19, HX + 2, HY - 12, C.light, C.col), 1.2);
      g.strokeStyle = C.dark;
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(HX + 1, HY - 12.6);
      g.quadraticCurveTo(HX - 3, HY - 16.4, HX - 7.6 + fw, HY - 18.6);
      g.stroke();
      // sourcils
      g.strokeStyle = '#5a3418';
      g.lineWidth = 1.4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(HX - 1, HY - 2.4);
      g.lineTo(HX + 2.6, HY - 3);
      g.moveTo(HX + 4.2, HY - 3);
      g.lineTo(HX + 7.8, HY - 2.2);
      g.stroke();
    },
  };

  /* 10. Bretzel (surprise) */
  STYLES.bretzel = {
    tone: '#e6ab62', pants: '#7a4a22', shoe: '#3d2414',
    body: () => '#bf7432', arm: () => '#bf7432',
    torso(g, P, o, C) {
      box(g, -6.6, -12.6, 13.2, 2.4, 1, C.col, 1.1);
      g.fillStyle = 'rgba(255,255,255,.9)';
      [[-4, -18.4], [-1, -16.2], [2.8, -19], [4.4, -15.4], [-3.4, -14.4], [0.6, -14]].forEach(([x, y]) => g.fillRect(x, y, 1.3, 1.1));
      box(g, -6.8, -21.6, 13.6, 3.2, 1.6, C.col, 1.3);
    },
    head(g, P, o, C) {
      const k = 0.96;
      g.save();
      g.translate(HX + 2.4, HY + 2.4);
      g.scale(k, k);
      const dough = '#c77c36';
      // le ventre : la pâte claire qui remplit le grand trou du bas
      g.beginPath();
      g.moveTo(-7.8, -1);
      g.bezierCurveTo(-11, 15.5, 11, 15.5, 7.8, -1);
      g.closePath();
      g.fillStyle = grad(g, 0, -2, 0, 11, '#f0c07c', '#dc9448');
      g.fill();
      // grande boucle du bas
      thick(g, () => {
        g.moveTo(-7.8, -1);
        g.bezierCurveTo(-11, 15.5, 11, 15.5, 7.8, -1);
      }, 4.6, dough);
      // deux boudins qui se croisent au centre puis retombent en grandes boucles sur les côtés
      const strand = (m, col) => thick(g, () => {
        g.moveTo(-7.8 * m, -1);
        g.bezierCurveTo(-8.2 * m, -4.4, -3.6 * m, -4.2, 0, -5.4);
        g.bezierCurveTo(4.2 * m, -6.6, 14.4 * m, -20.4, 11.4 * m, -4.4);
        g.bezierCurveTo(10.6 * m, -2.2, 9.2 * m, -1.2, 8.2 * m, -0.6);
      }, 4.2, col);
      strand(1, '#c27632');
      strand(-1, '#cf843c');
      // reflets
      g.strokeStyle = 'rgba(255,226,172,.75)';
      g.lineWidth = 1.1;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-9.4, -9.4);
      g.bezierCurveTo(-8.2, -11.6, -6, -12.4, -4.4, -11.4);
      g.moveTo(8.6, 5);
      g.bezierCurveTo(8.2, 8.4, 6.4, 10.6, 3.6, 11.4);
      g.stroke();
      // gros sel
      g.fillStyle = '#fff';
      [[-9.6, -8], [-6.6, -12.6], [6.4, -12.4], [9.8, -8.6], [-11.2, 2], [11.4, 2.4], [-8.8, 9], [9.2, 8.6], [0.2, 12.4], [4.6, 11.6], [-4.6, 11.8], [-1.4, -4.4], [2.6, -3.6]].forEach(([dx, dy]) => g.fillRect(dx - 0.6, dy - 0.5, 1.4, 1.1));
      g.restore();
      faceHuman(g, P, o, { dy: 3.6 });
    },
  };

  /* 11. Grille-pain (surprise) : les tartines sautent quand on saute */
  STYLES.toaster = {
    tone: '#e4e8f2', pants: '#2f3340', shoe: '#ff5a5a',
    body: () => '#4a4f60', arm: () => '#b8bfd0',
    torso(g, P, o, C) {
      box(g, -6.6, -12.6, 13.2, 2.4, 1, '#2b2f3f', 1.1);
      // cadran
      ell(g, 0.4, -17, 3.4, 3.4, '#e9ecf4', 1.2);
      g.strokeStyle = '#2b2f3f';
      g.lineWidth = 1.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0.4, -17);
      g.lineTo(2.2, -18.6);
      g.stroke();
      g.fillStyle = C.col;
      g.beginPath();
      g.arc(-4.6, -19.4, 0.9, 0, TAU);
      g.fill();
    },
    head(g, P, o, C) {
      const pop = P.air ? (P.up ? 5 : 2.4) : P.walk > 0.05 ? Math.abs(Math.sin(P.ph)) * 1.4 : Math.sin(P.t * 0.07) * 0.4;
      // cordon et prise
      g.lineCap = 'round';
      const cw = Math.sin(P.t * 0.12) * 1.2;
      thick(g, () => {
        g.moveTo(HX - 11, HY + 6);
        g.bezierCurveTo(HX - 16, HY + 6 + cw, HX - 15, HY + 12, HX - 12, HY + 12.6);
      }, 1.4, '#3a3f50');
      box(g, HX - 14, HY + 11.4, 3.6, 2.6, 0.8, '#d9dde8', 1);
      // tartines
      [[-8.6, '#e2a24c'], [0.4, '#d6903a']].forEach(([dx, crust]) => {
        const top = HY - 7.6 - 3.4 - pop;
        rr(g, HX + dx, top, 8.6, 11, 2.4);
        paint(g, crust, 1.3);
        rr(g, HX + dx + 1.2, top + 1.2, 6.2, 8.6, 1.6);
        g.fillStyle = grad(g, 0, top, 0, top + 10, '#f8dc92', '#e9bd62');
        g.fill();
        g.fillStyle = 'rgba(160,100,30,.25)';
        g.fillRect(HX + dx + 1.6, top + 6, 5.4, 1.2);
      });
      // corps du grille-pain
      rr(g, HX - 11.8, HY - 6.4, 23.6, 16.4, 4.6);
      paint(g, grad(g, HX - 11, 0, HX + 11, 0, shade(C.col, 0.32), shade(C.col, -0.16)), 1.6);
      // plateau chromé avec les fentes
      rr(g, HX - 11.8, HY - 7.4, 23.6, 4.6, 2.3);
      paint(g, grad(g, 0, HY - 7.4, 0, HY - 2.8, '#f4f6fb', '#aeb5c6'), 1.4);
      g.fillStyle = '#23263a';
      g.fillRect(HX - 8.8, HY - 6, 9, 1.6);
      g.fillRect(HX + 0.2, HY - 6, 9, 1.6);
      shine(g, HX - 6.4, HY + 1.6, 1.8, 5.6, 0.1, 0.4);
      // levier
      box(g, HX + 10.2, HY - 1.6, 3.4, 8, 1.4, '#2b2f3f', 1.1);
      box(g, HX + 9.4, HY + 0.6 + (P.air ? -2.4 : 0), 4.8, 2.4, 1, '#e9ecf4', 1);
      // socle
      box(g, HX - 11.4, HY + 8.4, 22.8, 2.6, 1, '#2b2f3f', 1.2);
      faceHuman(g, P, o, { dy: 3 });
    },
  };

  /* 12. Canard en plastique (surprise) */
  STYLES.canard = {
    tone: '#ffd83a', pants: '#ff9a1f', shoe: '#ff7a00',
    body: () => '#ffd83a', arm: () => '#ffd83a',
    torso(g, P, o, C) {
      ell(g, 0.8, -14.6, 4.8, 5.4, '#fff3b0', 0);
      box(g, -6.8, -21.6, 13.6, 3.4, 1.7, C.col, 1.3);
      g.beginPath();
      g.moveTo(3.2, -19);
      g.quadraticCurveTo(6.8, -14.4, 4 + Math.sin(P.t * 0.2) * 1.2, -11.4);
      g.lineTo(0.8, -12.6);
      g.quadraticCurveTo(2.6, -15, 1, -18.4);
      g.closePath();
      paint(g, C.light, 1.2);
    },
    head(g, P, o, C) {
      // bulles de bain
      [[-9.4, -10.4, 2.4, 0], [8.6, -13.4, 1.8, 2], [-11.4, 1.6, 1.5, 4]].forEach(([dx, dy, r, ph]) => {
        const y = HY + dy + Math.sin(P.t * 0.06 + ph) * 1.2;
        g.beginPath();
        g.arc(HX + dx, y, r, 0, TAU);
        g.fillStyle = 'rgba(190,235,255,.25)';
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,.85)';
        g.lineWidth = 0.9;
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.fillRect(HX + dx - r * 0.5, y - r * 0.5, 0.9, 0.9);
      });
      // mèche
      thick(g, () => {
        g.moveTo(HX - 0.4, HY - 8.8);
        g.bezierCurveTo(HX - 2, HY - 14.4, HX + 4.6, HY - 15, HX + 3.6, HY - 11.4);
      }, 1.6, '#ffd83a');
      ell(g, HX, HY, 10.2, 9.6, grad(g, 0, HY - 9, 0, HY + 9, '#ffec78', '#f5bd1c'), 1.6);
      shine(g, HX - 3.6, HY - 4.8, 3.6, 2, -0.5, 0.5);
      faceHuman(g, P, o, { dy: -0.4, noMouth: true });
      // bec
      const open = P.air || P.castAng !== null || P.dash ? 1.4 : 0;
      g.beginPath();
      g.moveTo(HX + 5.4, HY + 3);
      g.quadraticCurveTo(HX + 11.4, HY + 1.6, HX + 14.6, HY + 4 - open * 0.3);
      g.quadraticCurveTo(HX + 14.6, HY + 5.6, HX + 12, HY + 5.4);
      g.lineTo(HX + 5.8, HY + 5.4);
      g.closePath();
      paint(g, grad(g, 0, HY + 1, 0, HY + 6, '#ffa63a', '#ff7a14'), 1.3);
      g.beginPath();
      g.moveTo(HX + 5.8, HY + 5.4 + 0.3);
      g.quadraticCurveTo(HX + 11, HY + 5.4, HX + 13.4, HY + 5.8 + open);
      g.quadraticCurveTo(HX + 11, HY + 8.4 + open, HX + 6.4, HY + 8);
      g.closePath();
      paint(g, '#ff8a22', 1.3);
      g.fillStyle = '#c4570a';
      g.beginPath();
      g.arc(HX + 11.2, HY + 3, 0.6, 0, TAU);
      g.fill();
    },
  };

  /* ---------- Assemblage du bonhomme ---------- */
  const HEADROOM = {
    tasse: 19, cookie: 12, magicien: 30, gilet: 19, pc: 11, spaetzle: 17, swift: 1, roulee: 22, archer: 19, bretzel: 12, toaster: 19, canard: 15,
  };

  function drawLeg(g, L, S, C, color, shoe) {
    limb(g, L.hx, L.hy, L.kx, L.ky, L.fx, L.fy, S.legW || 4.7, color);
    g.beginPath();
    g.ellipse(L.fx + 1.9, L.fy - 0.1, 4.2, 2.7, 0, 0, TAU);
    paint(g, shoe, 1.3);
    shine(g, L.fx + 0.6, L.fy - 1.2, 1.8, 0.8, 0, 0.3);
  }

  function drawArm(g, A, S, o, C, hand) {
    limb(g, A.sx, A.sy, A.kx, A.ky, A.hx, A.hy, S.armW || 4.1, S.arm ? S.arm(o, C) : C.col);
    ell(g, A.hx, A.hy, 2.5, 2.5, hand, 1.2);
  }

  function drawHuman(g, o, S) {
    const P = poseOf(o);
    if (S.armDy) P.arms.forEach((a) => { a.sy += S.armDy; a.hy += S.armDy; a.ky += S.armDy; });
    const C = { col: o.color, dark: shade(o.color, -0.32), light: shade(o.color, 0.38) };
    const float = S.float ? S.float(P) : 0;
    g.save();
    if (float) g.translate(0, -float);
    if (S.back) S.back(g, P, o, C);
    if (o.kit === 'archer' && !S.noQuiver) drawQuiver(g, P);

    if (S.legs !== false) {
      const furry = S.pants === null; // chat et dino : pattes de la couleur du corps
      const legCol = furry ? C.col : S.pants;
      const shoeCol = furry ? shade(C.col, 0.35) : S.shoe;
      drawLeg(g, P.legs[0], S, C, shade(legCol, -0.14), shade(shoeCol, -0.14));
      drawLeg(g, P.legs[1], S, C, legCol, shoeCol);
    }

    // haut du corps : pivote légèrement autour des hanches
    g.save();
    g.translate(0, -9.5);
    g.rotate(P.lean);
    g.translate(0, 9.5 + P.bob);

    const hand = S.tone && S.tone !== '#ffffff' ? S.tone : S.arm ? S.arm(o, C) : C.col;
    drawArm(g, P.arms[0], S, o, C, shade(hand, -0.12));

    if (S.torsoShape) {
      S.torsoShape(g, P, o, C);
    } else {
      rr(g, -6.6, -21.2, 13.2, 12.4, 4.2);
      const body = S.body(o, C);
      paint(g, grad(g, 0, -21, 0, -9, shade(body, 0.16), shade(body, -0.12)), 1.6);
      shine(g, -3.6, -18.4, 2.4, 1.4, 0, 0.22);
    }
    if (S.torso) S.torso(g, P, o, C);
    S.head(g, P, o, C);

    const fa = P.arms[1];
    drawArm(g, fa, S, o, C, hand);
    if (o.kit === 'mage') drawStaff(g, fa.hx, fa.hy, P.castAng !== null ? P.castAng : -Math.PI / 2 + 0.34, P);
    else if (o.kit === 'archer') drawBow(g, fa.hx, fa.hy, P.castAng !== null ? P.castAng : 0, P);
    ell(g, fa.hx, fa.hy, 2.5, 2.5, hand, 1.2);
    if (S.hold && o.kit === 'plain') S.hold(g, P, o, C, fa);
    g.restore();
    g.restore();
  }

  const NAMES = {
    tasse: 'Tasse', cookie: 'Cookie', magicien: 'Magicien', gilet: 'Gilet jaune', pc: 'PC', spaetzle: 'Spätzle', swift: 'Swift',
    roulee: 'Roulée', archer: 'Archer', bretzel: 'Bretzel', toaster: 'Grille-pain', canard: 'Canard',
  };
  const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e', '#94a3b8'];

  window.Skins = {
    ids: Object.keys(NAMES),
    names: NAMES,
    colors: COLORS,
    W,
    H,
    shade,
    rgba,
    // Nombre de pixels dessinés au-dessus de la hitbox (pour placer le pseudo)
    headroom(id, kit) {
      return (HEADROOM[id] !== undefined ? HEADROOM[id] : 11) + (kit === 'mage' && id !== 'magicien' ? 4 : 0);
    },
    // o : { dir, color, t, kit, walk, air, vy, dash, cast: {ang, k}, look: {x, y} }
    draw(ctx, id, x, y, o) {
      const S = STYLES[id] || STYLES.tasse;
      const dir = o.dir || 1;
      const q = {
        color: o.color || '#3b82f6', t: o.t || 0, kit: o.kit || 'plain', walk: o.walk || 0,
        air: !!o.air, vy: o.vy || 0, dash: !!o.dash, look: o.look,
      };
      if (o.cast) q.cast = { ang: Math.atan2(Math.sin(o.cast.ang), Math.cos(o.cast.ang) * dir), k: o.cast.k };
      ctx.save();
      ctx.translate(x + W / 2, y + H);
      ctx.scale(dir, 1);
      drawHuman(ctx, q, S);
      ctx.restore();
    },
  };
})();

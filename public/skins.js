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

  /* ---------- Les 13 personnages ---------- */
  const STYLES = {};

  // Aventurier : s'habille selon le rôle (Mage : robe et chapeau, Archer : capuche et carquois)
  STYLES.classic = {
    tone: '#ffd8b4', pants: '#3d4a85', shoe: '#573820',
    body: (o, C) => (o.kit === 'mage' ? '#7447e0' : o.kit === 'archer' ? '#4a9a5c' : C.col),
    arm: (o, C) => (o.kit === 'mage' ? '#7447e0' : o.kit === 'archer' ? '#4a9a5c' : C.col),
    back(g, P, o, C) {
      const sw = Math.sin(P.t * 0.16) * 1.4 + P.walk * 2.4 + (P.dash ? 6 : 0);
      g.beginPath();
      g.moveTo(-4, -20.4);
      g.quadraticCurveTo(-11 - sw, -16, -12.5 - sw, -9 + Math.sin(P.t * 0.2) * 1.2);
      g.lineTo(-9 - sw * 0.5, -10.4);
      g.quadraticCurveTo(-7, -15, -2, -17);
      g.closePath();
      paint(g, C.dark, 1.3);
    },
    torso(g, P, o, C) {
      if (o.kit === 'mage') {
        g.beginPath();
        g.moveTo(-6.6, -12);
        g.lineTo(-9.8, -3.4);
        g.quadraticCurveTo(0, -0.8, 9.8, -3.4);
        g.lineTo(6.6, -12);
        g.closePath();
        paint(g, grad(g, 0, -12, 0, -2, '#8c5cf0', '#5a2fc0'), 1.4);
        g.strokeStyle = '#ffd24a';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(-9.4, -4.4);
        g.quadraticCurveTo(0, -2, 9.4, -4.4);
        g.stroke();
        star(g, 0.5, -13.2, 3, '#ffd24a');
      }
      if (o.kit === 'archer') {
        g.strokeStyle = '#7a4a22';
        g.lineWidth = 2.6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-5.5, -19.5);
        g.lineTo(5.5, -10.6);
        g.stroke();
      }
      box(g, -6.6, -12.4, 13.2, 2.8, 1, '#6b4a2a', 1.2); // ceinture
      box(g, -1.6, -12.3, 3.4, 2.6, 0.8, '#ffd24a', 1);
      // écharpe à la couleur du joueur
      box(g, -6.6, -21.6, 13.2, 3.6, 1.8, C.col, 1.3);
      g.beginPath();
      g.moveTo(3.5, -19);
      g.quadraticCurveTo(7, -14, 4 + Math.sin(P.t * 0.2) * 1.2, -11.5);
      g.lineTo(0.6, -12.6);
      g.quadraticCurveTo(2.6, -15, 0.8, -18.4);
      g.closePath();
      paint(g, C.light, 1.2);
    },
    head(g, P, o, C) {
      humanHead(g, P, o, this);
      if (o.kit === 'mage') {
        const bend = Math.sin(P.t * 0.09) * 1.6;
        ell(g, HX, HY - 5.6, 12.8, 3.1, '#5a2fc0', 1.4);
        g.beginPath();
        g.moveTo(HX - 8.2, HY - 6.4);
        g.quadraticCurveTo(HX - 2, HY - 15, HX + 3 + bend, HY - 25.5);
        g.quadraticCurveTo(HX + 6.5, HY - 14, HX + 8.4, HY - 6.4);
        g.closePath();
        paint(g, grad(g, 0, HY - 25, 0, HY - 6, '#8c5cf0', '#6a3fd1'), 1.4);
        g.fillStyle = '#ffd24a';
        g.fillRect(HX - 8, HY - 8.8, 16.6, 2.5);
        star(g, HX + 1.4, HY - 14.5, 3, '#ffd24a');
      } else if (o.kit === 'archer') {
        // capuche verte et plume
        g.beginPath();
        g.ellipse(HX, HY - 1.4, 10.7, 9.6, 0, Math.PI * 0.98, Math.PI * 2.02);
        g.quadraticCurveTo(HX + 8, HY - 4.2, HX + 3.6, HY - 4.8);
        g.quadraticCurveTo(HX - 3, HY - 6.2, HX - 9.6, HY - 1.2);
        g.closePath();
        paint(g, grad(g, 0, HY - 11, 0, HY - 3, '#5db56f', '#3f8c55'), 1.5);
        g.beginPath();
        g.moveTo(HX + 2, HY - 9.6);
        g.quadraticCurveTo(HX - 6, HY - 20 + Math.sin(P.t * 0.1) * 1.2, HX - 12.5, HY - 12);
        g.quadraticCurveTo(HX - 5, HY - 12.4, HX + 2, HY - 9.6);
        paint(g, C.col, 1.2);
      } else {
        // cheveux bruns en bataille
        g.beginPath();
        g.ellipse(HX, HY - 1.6, 10.6, 9.6, 0, Math.PI * 0.97, Math.PI * 2.03);
        g.quadraticCurveTo(HX + 8.6, HY - 3.8, HX + 4.4, HY - 5.2);
        g.quadraticCurveTo(HX + 1, HY - 3.6, HX - 2.4, HY - 5.8);
        g.quadraticCurveTo(HX - 6.4, HY - 3.8, HX - 9.8, HY - 1.2);
        g.closePath();
        paint(g, grad(g, 0, HY - 11, 0, HY - 3, '#8a5a34', '#5e3a20'), 1.5);
        g.beginPath();
        g.moveTo(HX - 1, HY - 10.4);
        g.quadraticCurveTo(HX + 2, HY - 16.5, HX + 5.6, HY - 13.6);
        g.quadraticCurveTo(HX + 3.4, HY - 12.8, HX + 3.8, HY - 10);
        paint(g, '#6e4526', 1.3);
      }
    },
  };

  STYLES.knight = {
    tone: '#ffd8b4', pants: '#8792a8', shoe: '#6d788e',
    body: () => '#b4bfd2', arm: () => '#a3aec2',
    back(g, P, o, C) {
      const sw = Math.sin(P.t * 0.14) * 1.6 + P.walk * 3 + (P.dash ? 8 : 0);
      g.beginPath();
      g.moveTo(-4.4, -20.6);
      g.quadraticCurveTo(-12 - sw, -14, -13.5 - sw, -3.4 + Math.sin(P.t * 0.18) * 1.4);
      g.lineTo(-7.5 - sw * 0.5, -4.6);
      g.quadraticCurveTo(-5.5, -12, -2, -16);
      g.closePath();
      paint(g, grad(g, -13, -20, -3, -4, C.light, C.dark), 1.4);
    },
    torso(g, P, o, C) {
      box(g, -3.8, -20.4, 7.6, 12, 1.6, C.col, 1.2); // tabard
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fillRect(-3.8, -17.6, 7.6, 1.2);
      star(g, 0, -13, 2.4, '#ffd24a');
      box(g, -6.6, -12.4, 13.2, 2.6, 1, '#5b6579', 1.2);
      ell(g, -6.4, -19.8, 3.1, 2.4, '#c9d2e3', 1.3); // épaulières
      ell(g, 6.4, -19.8, 3.1, 2.4, '#c9d2e3', 1.3);
    },
    head(g, P, o, C) {
      const sw = Math.sin(P.t * 0.15) * 1.5;
      // plumet
      g.beginPath();
      g.moveTo(HX - 1, HY - 9.4);
      g.quadraticCurveTo(HX - 6, HY - 20, HX - 14 - sw - P.walk * 3, HY - 12 + sw);
      g.quadraticCurveTo(HX - 8, HY - 11.5, HX + 2.6, HY - 8.4);
      g.closePath();
      paint(g, C.col, 1.3);
      ell(g, HX, HY - 0.4, 10.6, 9.9, grad(g, 0, HY - 10, 0, HY + 9, '#d3dbea', '#9aa6bc'), 1.6);
      shine(g, HX - 3.6, HY - 5, 3.6, 1.8, -0.5, 0.5);
      box(g, HX - 2, HY - 2.2, 12, 3.6, 1.4, '#1b2036', 1.2); // visière
      g.fillStyle = '#fff'; // yeux qui brillent dans la fente
      g.fillRect(HX + 1.4, HY - 1, 2, 1.8);
      g.fillRect(HX + 6.6, HY - 1, 2, 1.8);
      g.strokeStyle = '#7d899f';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(HX + 4.4, HY - 9.6);
      g.lineTo(HX + 4.4, HY - 2.2);
      g.moveTo(HX + 4.4, HY + 1.4);
      g.lineTo(HX + 4.4, HY + 7);
      g.stroke();
    },
  };

  STYLES.ninja = {
    tone: '#ffd8b4', pants: '#2a2a48', shoe: '#1c1c34',
    body: () => '#303052', arm: () => '#303052',
    back(g, P, o, C) {
      const fl = Math.sin(P.t * 0.3) * 2.6 + P.walk * 2 + (P.dash ? 5 : 0);
      [0, 1].forEach((i) => {
        g.beginPath();
        g.moveTo(HX - 6, HY - 4.4);
        g.quadraticCurveTo(HX - 12 - fl, HY - 3 + i * 4, HX - 18 - fl * 1.4, HY - 5 + i * 6 + Math.sin(P.t * 0.3 + i) * 2);
        g.lineTo(HX - 16 - fl, HY - 1 + i * 6);
        g.quadraticCurveTo(HX - 11, HY - 1 + i * 3, HX - 6, HY - 1.4);
        g.closePath();
        paint(g, i ? C.dark : C.col, 1.1);
      });
    },
    torso(g, P, o, C) {
      box(g, -6.6, -12.4, 13.2, 2.6, 1, C.col, 1.2); // ceinture colorée
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-5, -19.6);
      g.lineTo(5, -13);
      g.stroke();
      box(g, -6.6, -21.4, 13.2, 3.4, 1.6, C.dark, 1.2); // écharpe
    },
    head(g, P, o, C) {
      ell(g, HX, HY, 9.7, 9.1, '#303052', 1.6);
      shine(g, HX - 3.2, HY - 4.8, 3.4, 1.8, -0.5, 0.14);
      box(g, HX - 2.2, HY - 3.6, 12.6, 6.8, 3, this.tone, 1.3); // fente des yeux
      faceHuman(g, P, o, { slit: true, noBlush: true, noMouth: true, dy: 0 });
      box(g, HX - 10.2, HY - 7.2, 20.8, 3.4, 1.2, C.col, 1.3); // bandeau
      g.fillStyle = 'rgba(255,255,255,.4)';
      g.fillRect(HX - 8, HY - 6.6, 16, 0.9);
      ell(g, HX + 5.6, HY - 5.5, 2.7, 2.2, '#c9ced8', 1.1); // plaque du bandeau
    },
  };

  STYLES.robot = {
    tone: '#b9c3d6', pants: '#8b97ad', shoe: '#5d687e', legW: 4.4,
    body: () => '#b9c3d6', arm: () => '#9aa6bd',
    torso(g, P, o, C) {
      box(g, -4.6, -19, 9.2, 6.6, 1.8, '#10142e', 1.1); // panneau
      const pulse = 0.55 + Math.sin(P.t * 0.12) * 0.35;
      g.fillStyle = rgba(C.col, 0.5 + pulse * 0.5);
      g.fillRect(-3.4, -17.2, 6.8, 1.5);
      g.fillRect(-3.4, -14.6, 3.2 + pulse * 3, 1.5);
      glow(g, 0, -16, 9, C.col, 0.25 * pulse);
      g.fillStyle = '#e4e9f4';
      [[-5.4, -20.2], [5.4, -20.2], [-5.4, -10.6], [5.4, -10.6]].forEach(([bx, by]) => {
        g.beginPath();
        g.arc(bx, by, 0.9, 0, TAU);
        g.fill();
      });
    },
    head(g, P, o, C) {
      const blink = P.t % 190 < 6 ? 0.2 : 1;
      const lx = (o.look && o.look.x) || 0;
      g.strokeStyle = OUT; // antenne
      g.lineWidth = 3.4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(HX + 1, HY - 7.6);
      g.lineTo(HX + 1.6, HY - 13.6);
      g.stroke();
      g.strokeStyle = '#8b97ad';
      g.lineWidth = 1.4;
      g.stroke();
      const on = Math.floor(P.t / 22) % 2;
      ell(g, HX + 1.6, HY - 14.6, 2.7, 2.7, on ? C.col : C.dark, 1.2);
      if (on) glow(g, HX + 1.6, HY - 14.6, 10, C.col, 0.6);
      ell(g, HX - 10.2, HY + 0.4, 1.9, 3.2, '#8b97ad', 1.2); // oreilles
      ell(g, HX + 11.6, HY + 0.4, 1.9, 3.2, '#8b97ad', 1.2);
      box(g, HX - 9.7, HY - 7.8, 19.8, 15.4, 4.6, grad(g, 0, HY - 8, 0, HY + 8, '#d3dbea', '#9fabc2'), 1.6);
      box(g, HX - 7.6, HY - 5.4, 15.8, 10.2, 3, '#0d1130', 1.2);
      shine(g, HX - 3, HY - 4.6, 4, 1.1, 0, 0.14);
      [HX + 1.2, HX + 6.6].forEach((ex) => {
        box(g, ex - 1.8 + lx * 0.7, HY - 3.2 + (1 - blink) * 2, 3.6, 5 * blink + 0.6, 1.3, C.col, 0);
        glow(g, ex + lx * 0.7, HY - 0.6, 6, C.col, 0.5);
      });
      g.fillStyle = rgba(C.col, 0.85);
      for (let i = 0; i < 4; i++) g.fillRect(HX + 1 + i * 2.4, HY + 3, 1.5, 1);
    },
  };

  // Fantôme : pas de jambes, il flotte
  STYLES.ghost = {
    tone: '#f4f4ff', legs: false, float: (P) => 3.2 + Math.sin(P.t * 0.1) * 1.6,
    body: () => '#f4f4ff', arm: () => '#eeeefc',
    torsoShape(g, P, o, C) {
      const f = P.t * 0.2;
      g.beginPath();
      g.moveTo(-7, -20);
      g.quadraticCurveTo(-10.4, -12, -10.6, -4);
      for (let i = 0; i <= 5; i++) {
        const x = -10.6 + i * 4.24;
        g.quadraticCurveTo(x + 2.12, -4 + (i % 2 ? -3 : 3.2) + Math.sin(f + i) * 1.6, x + 4.24, -4 + Math.sin(f + i + 1) * 1.2);
      }
      g.quadraticCurveTo(10.4, -12, 7, -20);
      g.closePath();
      paint(g, grad(g, 0, -20, 0, -2, '#ffffff', '#cfd2f4'), 1.5);
      shine(g, -3.4, -14, 2.2, 5, 0.15, 0.4);
    },
    head(g, P, o, C) {
      const lx = (o.look && o.look.x) || 0;
      const blink = P.t % 240 < 7 ? 0.15 : 1;
      ell(g, HX, HY, 9.9, 9.4, grad(g, 0, HY - 9, 0, HY + 9, '#ffffff', '#e1e3fb'), 1.6);
      shine(g, HX - 3.2, HY - 4.8, 3.6, 2.1, -0.5, 0.5);
      [HX + 0.4, HX + 6].forEach((ex) => ell(g, ex + lx * 0.8, HY + 0.8, 2.2, 3.4 * blink, '#16163a', 0));
      g.fillStyle = '#fff';
      [HX + 0.4, HX + 6].forEach((ex) => {
        g.beginPath();
        g.arc(ex + lx * 0.8 - 0.6, HY - 0.4, 0.8, 0, TAU);
        g.fill();
      });
      g.fillStyle = rgba(C.col, 0.6);
      g.beginPath();
      g.ellipse(HX - 1.6, HY + 4.8, 2.2, 1.4, 0, 0, TAU);
      g.ellipse(HX + 8.2, HY + 4.4, 2, 1.3, 0, 0, TAU);
      g.fill();
      ell(g, HX + 4, HY + 5.4, 1.5, P.air ? 2.2 : 1.2, '#16163a', 0);
      g.fillStyle = C.col; // petit nœud sur la tête
      g.beginPath();
      g.moveTo(HX - 3, HY - 9.4);
      g.lineTo(HX - 8.2, HY - 12.6);
      g.lineTo(HX - 8, HY - 6.6);
      g.closePath();
      g.moveTo(HX - 3, HY - 9.4);
      g.lineTo(HX + 2.2, HY - 12.6);
      g.lineTo(HX + 2, HY - 6.6);
      g.closePath();
      paint(g, C.col, 1.1);
    },
  };

  STYLES.cat = {
    tone: '#ffffff', pants: null, shoe: null,
    furOf: (C) => C.col,
    body: (o, C) => C.col, arm: (o, C) => C.col,
    back(g, P, o, C) {
      const sw = Math.sin(P.t * 0.16) * 3.6 + (P.dash ? 4 : 0);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-4.4, -9.6);
      g.bezierCurveTo(-16, -9, -15 - sw * 0.4, -20, -11.4 - sw, -23 + Math.abs(sw) * 0.3);
      g.strokeStyle = OUT;
      g.lineWidth = 6.8;
      g.stroke();
      g.strokeStyle = C.col;
      g.lineWidth = 4;
      g.stroke();
      g.strokeStyle = C.dark;
      g.lineWidth = 4;
      g.setLineDash([2, 4.5]);
      g.stroke();
      g.setLineDash([]);
    },
    torso(g, P, o, C) {
      ell(g, 1.2, -14, 4.2, 5.4, shade(C.col, 0.55), 0); // ventre clair
    },
    head(g, P, o, C) {
      const lx = (o.look && o.look.x) || 0;
      const blink = P.t % 220 < 7 ? 0.15 : 1;
      const ear = (x, flip) => {
        tri(g, x - 4.6 * flip, HY - 4, x + 0.6 * flip, HY - 15.4 + Math.sin(P.t * 0.05) * 0.4, x + 5.4 * flip, HY - 5.4, C.col, 1.5);
        tri(g, x - 2 * flip, HY - 5.4, x + 0.8 * flip, HY - 12.4, x + 3.4 * flip, HY - 6, '#ffa6bc', 0);
      };
      ear(HX - 5, 1);
      ear(HX + 6.6, 1);
      ell(g, HX, HY, 10.4, 8.9, grad(g, 0, HY - 9, 0, HY + 9, shade(C.col, 0.18), C.col), 1.6);
      g.strokeStyle = C.dark; // rayures
      g.lineWidth = 1.6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(HX + 1, HY - 8.6); g.lineTo(HX + 1.4, HY - 4.8);
      g.moveTo(HX - 2.6, HY - 8.2); g.lineTo(HX - 2.2, HY - 5.2);
      g.moveTo(HX + 4.6, HY - 8.4); g.lineTo(HX + 4.6, HY - 5.2);
      g.stroke();
      ell(g, HX + 4.4, HY + 3.8, 5.6, 3.8, shade(C.col, 0.6), 0); // museau
      [HX + 0.2, HX + 6].forEach((ex) => {
        ell(g, ex, HY + 0.4, 2.8, 3.6 * blink, '#e8f56a', 1.2);
        if (blink > 0.5) ell(g, ex + 0.8 + lx * 0.8, HY + 0.4, 1, 2.9, '#16163a', 0);
        shine(g, ex - 0.6, HY - 1.2, 0.7, 0.7, 0, 0.9);
      });
      tri(g, HX + 2.8, HY + 2.2, HX + 5.6, HY + 2.2, HX + 4.2, HY + 3.8, '#ff8aa0', 0.9);
      g.strokeStyle = OUT;
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(HX + 4.2, HY + 3.8);
      g.lineTo(HX + 4.2, HY + 4.8);
      g.moveTo(HX + 1.6, HY + 5.8); g.quadraticCurveTo(HX + 3, HY + 6.6, HX + 4.2, HY + 4.8);
      g.moveTo(HX + 6.8, HY + 5.8); g.quadraticCurveTo(HX + 5.4, HY + 6.6, HX + 4.2, HY + 4.8);
      g.moveTo(HX + 9, HY + 3.4); g.lineTo(HX + 14, HY + 2.2);
      g.moveTo(HX + 9, HY + 4.6); g.lineTo(HX + 14, HY + 5.2);
      g.moveTo(HX - 7.4, HY + 3.4); g.lineTo(HX - 12, HY + 2.2);
      g.moveTo(HX - 7.4, HY + 4.6); g.lineTo(HX - 12, HY + 5.2);
      g.stroke();
    },
  };

  STYLES.astro = {
    tone: '#ffd8b4', pants: '#eef1f8', shoe: '#8e98ae',
    body: () => '#f1f4fb', arm: () => '#e6eaf4',
    back(g, P, o, C) {
      box(g, -12.6, -22.4, 7.4, 13.4, 2.4, '#c9ced8', 1.4);
      box(g, -11.4, -20.6, 3, 4, 1, C.col, 0);
      g.strokeStyle = '#8e98ae';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-6, -17);
      g.quadraticCurveTo(-3, -14, -2, -18);
      g.stroke();
    },
    torso(g, P, o, C) {
      box(g, -4.4, -19.2, 8.8, 6.2, 1.6, '#cfd5e4', 1.1);
      [[-2.4, C.col], [0, '#ffd24a'], [2.4, '#4dd8e8']].forEach(([bx, col]) => {
        g.fillStyle = col;
        g.beginPath();
        g.arc(bx, -16.2, 1, 0, TAU);
        g.fill();
      });
      box(g, 2.4, -11.6, 4.2, 2.6, 0.6, C.col, 1);
      box(g, -6.6, -12.4, 13.2, 1.8, 0.8, '#9aa4ba', 0);
      box(g, -6.4, -21.6, 12.8, 3.2, 1.4, '#cfd5e4', 1.2); // collerette
    },
    head(g, P, o, C) {
      ell(g, HX, HY, 9.3, 8.7, this.tone, 1.4);
      faceHuman(g, P, o, { noBlush: false });
      g.fillStyle = '#7a5231'; // petite houppette
      g.beginPath();
      g.ellipse(HX + 0.6, HY - 8.6, 3.4, 1.6, 0, 0, TAU);
      g.fill();
      // casque en verre
      g.beginPath();
      g.ellipse(HX + 0.2, HY - 0.4, 12.2, 11.4, 0, 0, TAU);
      g.fillStyle = 'rgba(150,200,255,.2)';
      g.fill();
      g.lineWidth = 2.8;
      g.strokeStyle = '#e6eaf4';
      g.stroke();
      g.lineWidth = 1.2;
      g.strokeStyle = OUT;
      g.beginPath();
      g.ellipse(HX + 0.2, HY - 0.4, 13.5, 12.7, 0, 0, TAU);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.7)';
      g.lineWidth = 1.8;
      g.beginPath();
      g.arc(HX + 0.2, HY - 0.4, 9, Math.PI * 1.08, Math.PI * 1.42);
      g.stroke();
    },
  };

  STYLES.pirate = {
    tone: '#f2c39a', pants: '#6a4a30', shoe: '#1f1b2e',
    body: (o, C) => '#f4f4f8', arm: (o, C) => '#f4f4f8',
    torso(g, P, o, C) {
      g.save();
      rr(g, -6.4, -20.8, 12.8, 12, 4);
      g.clip();
      g.fillStyle = C.col;
      for (let i = 0; i < 4; i++) g.fillRect(-7, -19.6 + i * 3.4, 14, 1.8);
      g.restore();
      box(g, -6.6, -12.4, 13.2, 3, 1, '#d64545', 1.2); // ceinture rouge
      box(g, -1.6, -12.2, 3.4, 2.6, 0.8, '#ffd24a', 1);
    },
    head(g, P, o, C) {
      humanHead(g, P, o, this);
      g.fillStyle = '#4a2f1d'; // barbe de trois jours
      g.beginPath();
      g.moveTo(HX - 8.2, HY + 2);
      g.quadraticCurveTo(HX - 6, HY + 12.4, HX + 1, HY + 9.6);
      g.quadraticCurveTo(HX + 6, HY + 12, HX + 9.6, HY + 2.6);
      g.quadraticCurveTo(HX + 4, HY + 6.6, HX - 8.2, HY + 2);
      g.fill();
      g.strokeStyle = OUT; // cache-œil
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(HX - 8.6, HY - 3.6);
      g.lineTo(HX + 9.6, HY + 1.4);
      g.stroke();
      ell(g, HX + 5.8, HY + 1.2, 3.4, 3.8, '#14142a', 1.1);
      // bandana rouge à pois
      g.beginPath();
      g.ellipse(HX, HY - 1.6, 10.7, 9.6, 0, Math.PI * 0.99, Math.PI * 2.01);
      g.lineTo(HX + 9.8, HY - 4.6);
      g.quadraticCurveTo(HX, HY - 6.6, HX - 9.8, HY - 4.6);
      g.closePath();
      paint(g, '#e03a3a', 1.5);
      g.fillStyle = 'rgba(255,255,255,.85)';
      [[-5, -8.4], [0, -9.8], [5, -8.2], [-2.4, -6.4]].forEach(([dx, dy]) => {
        g.beginPath();
        g.arc(HX + dx, HY + dy, 0.9, 0, TAU);
        g.fill();
      });
      const sw = Math.sin(P.t * 0.22) * 2 + P.walk * 2;
      g.beginPath();
      g.moveTo(HX - 8.6, HY - 5.6);
      g.quadraticCurveTo(HX - 13 - sw, HY - 3, HX - 15 - sw, HY - 8 + Math.sin(P.t * 0.3));
      g.lineTo(HX - 12.6 - sw * 0.5, HY - 2.4);
      g.quadraticCurveTo(HX - 11, HY - 3.6, HX - 8.4, HY - 3.4);
      g.closePath();
      paint(g, '#e03a3a', 1.2);
      ell(g, HX - 9.6, HY + 4.6, 1.2, 1.7, '#ffd24a', 1); // boucle d'oreille
    },
  };

  STYLES.wizard = {
    tone: '#ffd8b4', pants: '#3a2a5a', shoe: '#4a2f1d',
    body: (o, C) => C.col, arm: (o, C) => C.col,
    torso(g, P, o, C) {
      g.beginPath();
      g.moveTo(-6.6, -13);
      g.lineTo(-10.4, -3.2);
      g.quadraticCurveTo(0, -0.6, 10.4, -3.2);
      g.lineTo(6.6, -13);
      g.closePath();
      paint(g, grad(g, 0, -13, 0, -2, C.col, C.dark), 1.4);
      g.strokeStyle = '#ffd24a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-10, -4.3);
      g.quadraticCurveTo(0, -1.8, 10, -4.3);
      g.stroke();
      star(g, -4, -8, 1.8, '#ffd24a');
      star(g, 4.8, -6, 1.4, '#fff3b0');
      box(g, -6.6, -12.6, 13.2, 2.4, 1, '#ffd24a', 1.1);
    },
    head(g, P, o, C) {
      humanHead(g, P, o, this);
      // sourcils et moustache blancs
      g.strokeStyle = '#f2f2f8';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(HX - 2, HY - 3.6); g.lineTo(HX + 2.8, HY - 3.2);
      g.moveTo(HX + 3.4, HY - 3.2); g.lineTo(HX + 8, HY - 3.8);
      g.stroke();
      // longue barbe
      const sw = Math.sin(P.t * 0.1) * 0.8;
      g.beginPath();
      g.moveTo(HX - 8.4, HY + 1.4);
      g.quadraticCurveTo(HX - 8, HY + 13, HX + 1 + sw, HY + 19);
      g.quadraticCurveTo(HX + 7, HY + 13, HX + 9.8, HY + 1.8);
      g.quadraticCurveTo(HX + 4.4, HY + 5.4, HX - 8.4, HY + 1.4);
      g.closePath();
      paint(g, grad(g, 0, HY, 0, HY + 19, '#ffffff', '#d7d9ea'), 1.3);
      g.beginPath();
      g.ellipse(HX + 3.8, HY + 5.2, 4.2, 1.5, 0.12, 0, TAU);
      paint(g, '#fff', 1);
      // chapeau
      const bend = Math.sin(P.t * 0.08) * 1.8;
      ell(g, HX, HY - 6, 13.4, 3.3, shade(C.col, -0.5), 1.4);
      g.beginPath();
      g.moveTo(HX - 8.8, HY - 6.8);
      g.quadraticCurveTo(HX - 2, HY - 16, HX + 4 + bend, HY - 27);
      g.quadraticCurveTo(HX + 7, HY - 15, HX + 9, HY - 6.8);
      g.closePath();
      paint(g, grad(g, 0, HY - 27, 0, HY - 6, shade(C.col, -0.2), shade(C.col, -0.55)), 1.4);
      g.fillStyle = '#ffd24a';
      g.fillRect(HX - 8.6, HY - 9.4, 17.6, 2.4);
      star(g, HX + 1.2, HY - 16, 3, '#ffd24a');
      const tw = Math.floor(P.t / 14) % 2 ? 1.2 : 0.8;
      star(g, HX + 4.4, HY - 22, tw * 1.6, '#fff3b0');
    },
  };

  STYLES.dino = {
    tone: '#ffffff', pants: null, shoe: null, legW: 5.4,
    body: (o, C) => C.col, arm: (o, C) => C.col,
    back(g, P, o, C) {
      const sw = Math.sin(P.t * 0.18) * 2.4 + (P.dash ? 3 : 0);
      g.beginPath();
      g.moveTo(-3.6, -14);
      g.quadraticCurveTo(-11, -13, -17, -7 + sw);
      g.quadraticCurveTo(-11, -8, -3, -9);
      g.closePath();
      paint(g, C.col, 1.4);
      for (let i = 0; i < 4; i++) tri(g, -5.6 - i * 2.6, -19.6 + i * 2.6, -9.6 - i * 2.2, -22.6 + i * 3, -7 - i * 2.8, -16.6 + i * 2.4, C.dark, 1.1);
    },
    torso(g, P, o, C) {
      ell(g, 1.8, -14.6, 4.2, 5.6, shade(C.col, 0.6), 0);
      g.strokeStyle = shade(C.col, 0.2);
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(-1.6, -17); g.lineTo(5, -17);
      g.moveTo(-1.8, -14.6); g.lineTo(5.4, -14.6);
      g.moveTo(-1.6, -12.2); g.lineTo(5, -12.2);
      g.stroke();
    },
    head(g, P, o, C) {
      const lx = (o.look && o.look.x) || 0;
      for (let i = 0; i < 3; i++) tri(g, HX - 6 + i * 4.4, HY - 6.6, HX - 4 + i * 4.4, HY - 14 + (i === 1 ? -1.4 : 0), HX - 1.6 + i * 4.4, HY - 6.8, C.dark, 1.2);
      ell(g, HX, HY, 10.2, 9, grad(g, 0, HY - 9, 0, HY + 9, shade(C.col, 0.18), C.col), 1.6);
      ell(g, HX + 6.2, HY + 2.6, 6.6, 5, shade(C.col, 0.22), 1.5); // museau
      shine(g, HX - 3, HY - 5, 3.6, 2, -0.5, 0.3);
      g.fillStyle = OUT; // narines
      g.beginPath();
      g.arc(HX + 10.6, HY + 1, 0.9, 0, TAU);
      g.arc(HX + 8.4, HY + 0.4, 0.9, 0, TAU);
      g.fill();
      ell(g, HX + 3.2, HY - 1.6, 3.2, 3.6, '#fff', 1.2);
      g.fillStyle = OUT;
      g.beginPath();
      g.arc(HX + 4.2 + lx * 0.8, HY - 1.4, 1.5, 0, TAU);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(HX + 3.6 + lx * 0.8, HY - 2.2, 0.55, 0, TAU);
      g.fill();
      g.strokeStyle = OUT;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(HX + 3, HY + 6.2);
      g.quadraticCurveTo(HX + 8, HY + 7.8, HX + 12, HY + 5.2);
      g.stroke();
      g.fillStyle = '#fff';
      [[5.6, 6.6], [8, 7], [10.2, 6.2]].forEach(([dx, dy]) => tri(g, HX + dx - 0.9, HY + dy - 0.6, HX + dx + 0.9, HY + dy - 0.6, HX + dx, HY + dy + 1.4, '#fff', 0.6));
      g.fillStyle = 'rgba(255,110,130,.3)';
      g.beginPath();
      g.ellipse(HX - 0.4, HY + 4.4, 2, 1.3, 0, 0, TAU);
      g.fill();
    },
  };

  STYLES.pumpkin = {
    tone: '#f08a1c', pants: '#5a3a22', shoe: '#2c1d12',
    body: (o, C) => C.col, arm: (o, C) => '#4a8a2a',
    torso(g, P, o, C) {
      box(g, -6.6, -12.6, 13.2, 2.4, 1, '#5a3a22', 1.1);
      g.fillStyle = 'rgba(255,255,255,.3)';
      g.fillRect(-4.6, -18.4, 3.6, 1.2);
      box(g, -6.8, -21.4, 13.6, 3.6, 1.8, '#4a8a2a', 1.3); // col de feuilles
    },
    head(g, P, o, C) {
      const glowK = 0.75 + Math.sin(P.t * 0.15) * 0.25;
      g.fillStyle = '#4a8a2a'; // tige
      g.strokeStyle = OUT;
      g.lineWidth = 1.4;
      rr(g, HX - 1.6, HY - 13.6, 3.8, 5, 1);
      paint(g, '#5fa334', 1.3);
      g.beginPath();
      g.moveTo(HX + 2, HY - 12.6);
      g.quadraticCurveTo(HX + 7, HY - 15, HX + 6, HY - 9.8);
      g.strokeStyle = '#4a8a2a';
      g.lineWidth = 1.6;
      g.stroke();
      g.beginPath();
      g.ellipse(HX, HY + 0.4, 12.2, 9.8, 0, 0, TAU);
      paint(g, grad(g, 0, HY - 9, 0, HY + 10, '#ffa43a', '#e0700f'), 1.6);
      g.strokeStyle = '#c4620a'; // côtes
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(HX, HY - 9.4); g.quadraticCurveTo(HX - 7.6, HY, HX, HY + 10);
      g.moveTo(HX, HY - 9.4); g.quadraticCurveTo(HX + 7.6, HY, HX, HY + 10);
      g.moveTo(HX - 5, HY - 8.2); g.quadraticCurveTo(HX - 11.4, HY, HX - 5, HY + 9);
      g.moveTo(HX + 5, HY - 8.2); g.quadraticCurveTo(HX + 11.4, HY, HX + 5, HY + 9);
      g.stroke();
      shine(g, HX - 5.4, HY - 4.6, 3.2, 1.8, -0.6, 0.3);
      // visage taillé, éclairé de l'intérieur
      glow(g, HX + 3, HY + 1, 13, '#ffd24a', 0.35 * glowK);
      g.fillStyle = `rgba(255,226,100,${0.8 + 0.2 * glowK})`;
      g.strokeStyle = '#a24a06';
      g.lineWidth = 1;
      tri(g, HX - 0.4, HY + 0.4, HX + 3.2, HY + 0.4, HX + 1.4, HY - 4, g.fillStyle, 1);
      tri(g, HX + 5, HY + 0.4, HX + 8.6, HY + 0.4, HX + 6.8, HY - 4, g.fillStyle, 1);
      g.beginPath();
      g.moveTo(HX - 1.2, HY + 4.2);
      for (let i = 0; i < 6; i++) g.lineTo(HX - 1.2 + (i + 1) * 1.9, HY + 4.2 + (i % 2 ? 0 : 3));
      g.lineTo(HX + 10.6, HY + 4.2);
      g.closePath();
      paint(g, `rgba(255,226,100,${0.8 + 0.2 * glowK})`, 1);
    },
  };

  STYLES.frog = {
    tone: '#5cc06c', pants: '#4aa85c', shoe: '#3b9a50', legW: 5,
    body: () => '#5cc06c', arm: () => '#5cc06c',
    torso(g, P, o, C) {
      ell(g, 0.8, -14.2, 4.8, 5.6, '#c4f2c4', 0);
      box(g, -6.6, -21.6, 13.2, 3.4, 1.6, C.col, 1.3); // bandana
      g.fillStyle = 'rgba(255,255,255,.75)';
      [[-4, -19.9], [0, -19.9], [4, -19.9]].forEach(([dx, dy]) => {
        g.beginPath();
        g.arc(dx, dy, 0.8, 0, TAU);
        g.fill();
      });
    },
    head(g, P, o, C) {
      const lx = (o.look && o.look.x) || 0;
      const blink = P.t % 210 < 7 ? 0.2 : 1;
      ell(g, HX, HY + 1.2, 11, 8.2, grad(g, 0, HY - 6, 0, HY + 9, '#74d684', '#4aa85c'), 1.6);
      shine(g, HX - 3.6, HY - 2.6, 3.6, 1.8, -0.4, 0.3);
      [HX - 3.8, HX + 5.4].forEach((ex) => {
        ell(g, ex, HY - 7.2, 4.8, 4.6, '#68cc78', 1.5);
        ell(g, ex + 0.4, HY - 7.6, 3.5, 3.5 * blink, '#fff', 1);
        if (blink > 0.5) {
          g.fillStyle = OUT;
          g.beginPath();
          g.arc(ex + 1.2 + lx * 0.8, HY - 7.4, 1.6, 0, TAU);
          g.fill();
        }
      });
      g.strokeStyle = '#2d6a3a';
      g.lineWidth = 1.6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(HX - 6, HY + 3.6);
      g.quadraticCurveTo(HX + 2.4, HY + 9.4, HX + 9.6, HY + 3);
      g.stroke();
      g.fillStyle = '#2d6a3a';
      g.beginPath();
      g.arc(HX + 7.8, HY - 0.4, 0.8, 0, TAU);
      g.arc(HX + 5.8, HY - 0.6, 0.8, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,110,130,.35)';
      g.beginPath();
      g.ellipse(HX - 3.4, HY + 4.2, 2, 1.2, 0, 0, TAU);
      g.ellipse(HX + 9, HY + 4, 1.8, 1.1, 0, 0, TAU);
      g.fill();
    },
  };

  STYLES.cookie = {
    tone: '#e0a862', pants: '#c98a46', shoe: '#8a5a2a',
    body: (o, C) => C.col, arm: (o, C) => '#d9a05b',
    torso(g, P, o, C) {
      box(g, -6.6, -12.6, 13.2, 2.4, 1, C.dark, 1.1);
      // nœud papillon
      tri(g, 0.4, -19.2, -5, -22.4, -5, -16, C.col, 1.2);
      tri(g, 0.4, -19.2, 5.8, -22.4, 5.8, -16, C.col, 1.2);
      ell(g, 0.4, -19.2, 1.7, 1.7, C.light, 1);
    },
    head(g, P, o, C) {
      const lx = (o.look && o.look.x) || 0;
      const cx = HX;
      g.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * TAU;
        const r = 10.6 + (i % 2 ? 0.7 : -0.1);
        const px = cx + Math.cos(a) * r * 1.02;
        const py = HY + Math.sin(a) * r * 0.97;
        g[i ? 'lineTo' : 'moveTo'](px, py);
      }
      g.closePath();
      paint(g, grad(g, 0, HY - 10, 0, HY + 10, '#f0c27c', '#cf9150'), 1.6);
      shine(g, cx - 4, HY - 5.6, 4, 2, -0.5, 0.35);
      g.fillStyle = '#4a2a18';
      [[-6.6, -4.2, 0.4], [4.4, -7.6, -0.3], [8.2, -2.4, 0.7], [-8, 2.6, -0.5], [-3.6, 7.4, 0.3], [6.4, 6.6, 0.2], [0.6, -8.8, 0]].forEach(([dx, dy, r]) => {
        g.save();
        g.translate(cx + dx, HY + dy);
        g.rotate(r);
        g.beginPath();
        g.ellipse(0, 0, 1.9, 1.4, 0, 0, TAU);
        g.fill();
        g.restore();
      });
      const blink = P.t % 220 < 7 ? 0.15 : 1;
      [cx - 1.2, cx + 4.6].forEach((ex) => {
        ell(g, ex, HY + 0.6, 2.2, 3 * blink, '#2a1608', 0);
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(ex - 0.4 + lx * 0.6, HY - 0.6, 0.8, 0, TAU);
        g.fill();
      });
      g.strokeStyle = '#4a2a18';
      g.lineWidth = 1.4;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(cx + 1.8, HY + 3.4, 3.2, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
      g.fillStyle = 'rgba(255,110,130,.35)';
      g.beginPath();
      g.ellipse(cx - 4.4, HY + 4.2, 1.9, 1.2, 0, 0, TAU);
      g.ellipse(cx + 7.6, HY + 4.2, 1.9, 1.2, 0, 0, TAU);
      g.fill();
    },
  };

  /* ---------- Assemblage du bonhomme ---------- */
  const HEADROOM = {
    classic: 11, knight: 15, ninja: 11, robot: 18, ghost: 11, cat: 15, astro: 14, pirate: 11, wizard: 30, dino: 15, pumpkin: 16, frog: 14, cookie: 11,
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
    g.restore();
    g.restore();
  }

  const NAMES = {
    classic: 'Classique', knight: 'Chevalier', ninja: 'Ninja', robot: 'Robot', ghost: 'Fantôme', cat: 'Chat',
    astro: 'Astronaute', pirate: 'Pirate', wizard: 'Sorcier', dino: 'Dino', pumpkin: 'Citrouille', frog: 'Grenouille', cookie: 'Cookie',
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
      return (HEADROOM[id] || 11) + (id === 'classic' && kit === 'mage' ? 14 : 0) + (kit === 'mage' && id !== 'classic' && id !== 'wizard' ? 4 : 0);
    },
    // o : { dir, color, t, kit, walk, air, vy, dash, cast: {ang, k}, look: {x, y} }
    draw(ctx, id, x, y, o) {
      const S = STYLES[id] || STYLES.classic;
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

// Thèmes graphiques "cartoon lisse" : un par chapitre.
//  - fond en 3 couches de profondeur (parallaxe) + ciel
//  - blocs texturés avec contour, coins arrondis et ombre portée
//  - décor animé (nuages, oiseaux, lucioles, braises, engrenages, brumes...)
// API : get, makeBackground, drawBackground, makeTiles, drawTileFx, makeDecor, drawDecor, drawFront, rng
(function () {
  const TAU = Math.PI * 2;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

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
  function shade(c, amt) {
    const [r, g, b] = parse(c);
    const t = amt < 0 ? 0 : 255;
    const a = Math.abs(amt);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (t - v) * a))).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
  }
  function rgba(c, a) {
    const [r, g, b] = parse(c);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ---------- Thèmes ---------- */
  const THEMES = {
    prairie: {
      label: 'Prairie', sky: ['#5db8f2', '#dff5ff'], light: true,
      tile: { base: '#9a6a43', dark: '#77492b', top: '#62c14f', topDark: '#3f8f38', out: '#3a2416', pattern: 'earth', grass: true },
    },
    arcane: {
      label: 'Arcanes', sky: ['#120c3a', '#41308c'], light: false,
      tile: { base: '#43439a', dark: '#2c2c70', top: '#7c7ce6', topDark: '#5757b0', out: '#120f38', pattern: 'brick', glow: '#9a8cff', runes: true },
    },
    dark: {
      label: 'Ténèbres', sky: ['#03030a', '#15132e'], light: false,
      tile: { base: '#2a2a56', dark: '#191938', top: '#40407c', topDark: '#2c2c5c', out: '#05050f', pattern: 'brick', glow: '#5a5ad0' },
    },
    sanctuary: {
      label: 'Sanctuaire', sky: ['#fbe2a0', '#f0a35a'], light: true,
      tile: { base: '#d3a96a', dark: '#a98048', top: '#f3d995', topDark: '#d7b36d', out: '#5a3a14', pattern: 'sand' },
    },
    garden: {
      label: 'Jardins', sky: ['#98e2c4', '#f3fdd8'], light: true,
      tile: { base: '#55996a', dark: '#3b7650', top: '#8fdb6e', topDark: '#5fb04f', out: '#173a22', pattern: 'earth', grass: true, flowers: true },
    },
    forge: {
      label: 'Forge', sky: ['#1d0707', '#74240f'], light: false,
      tile: { base: '#55434a', dark: '#372a2f', top: '#98715d', topDark: '#6e5146', out: '#150a0a', pattern: 'ember', glow: '#ff8a2a' },
    },
    mist: {
      label: 'Brumes', sky: ['#35516b', '#b1c9d8'], light: false,
      tile: { base: '#5d778b', dark: '#455d70', top: '#cfe3ef', topDark: '#9ab5c6', out: '#16222d', pattern: 'brick', frost: true },
    },
  };

  function get(id) { return THEMES[id] || THEMES.arcane; }

  /* ---------- Petits outils ---------- */
  const glowCache = {};
  function glowSprite(color) {
    if (glowCache[color]) return glowCache[color];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const k = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    k.addColorStop(0, rgba(color, 1));
    k.addColorStop(0.35, rgba(color, 0.45));
    k.addColorStop(1, rgba(color, 0));
    g.fillStyle = k;
    g.fillRect(0, 0, 64, 64);
    glowCache[color] = c;
    return c;
  }
  // halo additif
  function halo(g, x, y, r, color, a) {
    g.globalAlpha = a === undefined ? 1 : a;
    g.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
  }
  function vgrad(g, y0, y1, c0, c1) {
    const k = g.createLinearGradient(0, y0, 0, y1);
    k.addColorStop(0, c0);
    k.addColorStop(1, c1);
    return k;
  }

  // Une couche de fond : canvas plus large que l'écran (marge m) pour le parallaxe
  function layer(w, h, res, m, fn) {
    const c = document.createElement('canvas');
    c.width = Math.round((w + m * 2) * res);
    c.height = Math.round(h * res);
    const g = c.getContext('2d');
    g.scale(res, res);
    g.translate(m, 0);
    fn(g);
    return c;
  }
  function ridgeY(x, base, amp, freq, ph) {
    return base + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.3 + ph * 1.7) * amp * 0.35;
  }
  function ridge(g, w, h, m, base, amp, freq, ph, fill, line) {
    g.beginPath();
    g.moveTo(-m - 10, h + 2);
    for (let x = -m - 10; x <= w + m + 10; x += 6) g.lineTo(x, ridgeY(x, base, amp, freq, ph));
    g.lineTo(w + m + 10, h + 2);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (line) {
      g.beginPath();
      for (let x = -m - 10; x <= w + m + 10; x += 6) g[x === -m - 10 ? 'moveTo' : 'lineTo'](x, ridgeY(x, base, amp, freq, ph));
      g.strokeStyle = line;
      g.lineWidth = 2;
      g.stroke();
    }
  }
  function ol(g, fill, lw, out) {
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = lw || 1.5;
    g.strokeStyle = out || 'rgba(20,16,50,.55)';
    g.lineJoin = 'round';
    g.stroke();
  }
  function roundTree(g, x, y, s, leaf, trunk, out) {
    g.fillStyle = trunk;
    g.fillRect(x - 2 * s, y - 14 * s, 4 * s, 14 * s);
    [[0, -22, 11], [-8, -17, 8], [8, -17, 8], [0, -29, 8]].forEach(([dx, dy, r]) => {
      g.beginPath();
      g.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
      ol(g, leaf, 1.4, out);
    });
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath();
    g.arc(x - 3 * s, y - 26 * s, 5 * s, 0, TAU);
    g.fill();
  }
  function pine(g, x, y, s, col, out) {
    g.fillStyle = shade(col, -0.4);
    g.fillRect(x - 1.6 * s, y - 6 * s, 3.2 * s, 6 * s);
    for (let i = 0; i < 4; i++) {
      const by = y - 5 * s - i * 11 * s;
      const hw = (17 - i * 3.6) * s;
      g.beginPath();
      g.moveTo(x - hw, by);
      g.lineTo(x, by - 17 * s);
      g.lineTo(x + hw, by);
      g.closePath();
      ol(g, i % 2 ? shade(col, 0.07) : col, 1.2, out);
    }
  }
  function column(g, x, top, bottom, wd, c0, c1, out) {
    const k = g.createLinearGradient(x - wd / 2, 0, x + wd / 2, 0);
    k.addColorStop(0, c0);
    k.addColorStop(0.5, c1);
    k.addColorStop(1, c0);
    g.fillStyle = k;
    g.fillRect(x - wd / 2, top, wd, bottom - top);
    g.strokeStyle = rgba(out, 0.25);
    g.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(x + i * wd * 0.22, top + 6);
      g.lineTo(x + i * wd * 0.22, bottom - 6);
      g.stroke();
    }
    g.beginPath();
    g.rect(x - wd / 2 - 6, top - 12, wd + 12, 12);
    ol(g, c1, 1.4, out);
    g.beginPath();
    g.rect(x - wd / 2 - 5, bottom - 10, wd + 10, 10);
    ol(g, c1, 1.4, out);
  }
  function crystal(g, x, y, s, col, glowCol) {
    const pts = [[-5, 0], [-7, -16], [-2, -30], [3, -22], [7, -10], [5, 0]];
    g.beginPath();
    pts.forEach(([px, py], i) => g[i ? 'lineTo' : 'moveTo'](x + px * s, y + py * s));
    g.closePath();
    g.fillStyle = vgrad(g, y - 30 * s, y, shade(col, 0.35), col);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(14,10,46,.7)';
    g.lineJoin = 'round';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.28)';
    g.beginPath();
    g.moveTo(x - 2 * s, y - 2 * s);
    g.lineTo(x - 5 * s, y - 15 * s);
    g.lineTo(x - 2 * s, y - 26 * s);
    g.lineTo(x, y - 14 * s);
    g.closePath();
    g.fill();
    if (glowCol) halo(g, x, y - 14 * s, 26 * s, glowCol, 0.5);
  }
  function cloudShape(g, x, y, s) {
    g.beginPath();
    g.arc(x, y, s * 0.62, 0, TAU);
    g.arc(x + s * 0.72, y + s * 0.12, s * 0.5, 0, TAU);
    g.arc(x - s * 0.72, y + s * 0.16, s * 0.46, 0, TAU);
    g.arc(x + s * 0.2, y - s * 0.3, s * 0.5, 0, TAU);
    g.rect(x - s * 0.72, y + s * 0.2, s * 1.44, s * 0.42);
  }

  /* ---------- Fond : ciel + 3 couches parallaxe ---------- */
  const SUN = (w, h) => ({ x: w * 0.82, y: h * 0.2 });
  const MARGIN = 26;

  function makeBackground(id, w, h, seed, res) {
    res = res || 1;
    const th = get(id);
    const r = rng(seed * 977 + 13);
    const m = MARGIN;
    const bg = { w, h, m, res, layers: [] };

    // --- ciel (fixe) ---
    const sky = document.createElement('canvas');
    sky.width = Math.round(w * res);
    sky.height = Math.round(h * res);
    const sg = sky.getContext('2d');
    sg.scale(res, res);
    sg.fillStyle = vgrad(sg, 0, h, th.sky[0], th.sky[1]);
    sg.fillRect(0, 0, w, h);
    bg.sky = sky;
    if (id === 'prairie') {
      const p = SUN(w, h);
      sg.globalCompositeOperation = 'lighter';
      halo(sg, p.x, p.y, 130, '#fff3b0', 0.85);
      sg.globalCompositeOperation = 'source-over';
      sg.beginPath();
      sg.arc(p.x, p.y, 25, 0, TAU);
      sg.fillStyle = '#fffbd6';
      sg.fill();
      sg.lineWidth = 3;
      sg.strokeStyle = 'rgba(255,214,90,.9)';
      sg.stroke();
    } else if (id === 'arcane') {
      for (let i = 0; i < 70; i++) {
        sg.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.35})`;
        sg.beginPath();
        sg.arc(r() * w, r() * h * 0.8, 0.5 + r() * 0.9, 0, TAU);
        sg.fill();
      }
      sg.globalCompositeOperation = 'lighter';
      halo(sg, w * 0.2, h * 0.25, 120, '#c9bbff', 0.6);
      sg.globalCompositeOperation = 'source-over';
      sg.beginPath();
      sg.arc(w * 0.2, h * 0.25, 33, 0, TAU);
      sg.fillStyle = vgrad(sg, h * 0.25 - 33, h * 0.25 + 33, '#fbf8ff', '#d6ceff');
      sg.fill();
      sg.fillStyle = 'rgba(150,130,220,.35)';
      [[-10, -6, 6], [8, 8, 8], [10, -12, 4], [-12, 12, 4]].forEach(([dx, dy, rr]) => {
        sg.beginPath();
        sg.arc(w * 0.2 + dx, h * 0.25 + dy, rr, 0, TAU);
        sg.fill();
      });
    } else if (id === 'sanctuary') {
      sg.globalCompositeOperation = 'lighter';
      halo(sg, w * 0.5, h * 0.62, 260, '#fff0b0', 0.8);
      sg.globalCompositeOperation = 'source-over';
      sg.beginPath();
      sg.arc(w * 0.5, h * 0.62, 56, 0, TAU);
      sg.fillStyle = 'rgba(255,248,215,.9)';
      sg.fill();
    } else if (id === 'garden') {
      // arc-en-ciel discret
      ['#ff8f8f', '#ffc98a', '#fff29a', '#a6e8a0', '#9bd6ff', '#c3a8ff'].forEach((c, i) => {
        sg.beginPath();
        sg.arc(w * 0.62, h * 1.05, h * 0.78 - i * 7, Math.PI * 1.08, Math.PI * 1.92);
        sg.strokeStyle = rgba(c, 0.26);
        sg.lineWidth = 7;
        sg.stroke();
      });
      sg.globalCompositeOperation = 'lighter';
      halo(sg, w * 0.12, h * 0.1, 150, '#fffbd0', 0.7);
      sg.globalCompositeOperation = 'source-over';
    } else if (id === 'forge') {
      sg.fillStyle = vgrad(sg, h * 0.5, h, 'rgba(255,110,20,0)', 'rgba(255,120,30,.6)');
      sg.fillRect(0, h * 0.5, w, h * 0.5);
    } else if (id === 'mist') {
      sg.globalCompositeOperation = 'lighter';
      halo(sg, w * 0.74, h * 0.28, 150, '#f4fbff', 0.7);
      sg.globalCompositeOperation = 'source-over';
    }

    const L = (depth, fn) => bg.layers.push({ depth, img: layer(w, h, res, m, fn) });
    const xr = () => -m + r() * (w + m * 2);

    if (id === 'prairie') {
      L(0.12, (g) => {
        ridge(g, w, h, m, h * 0.5, 38, 0.007, 1, '#b3d9f0');
        ridge(g, w, h, m, h * 0.58, 26, 0.011, 4, '#a1cfe9');
        g.fillStyle = 'rgba(255,255,255,.85)'; // neige sur les pics lointains
        for (let x = -m; x < w + m; x += 4) {
          const y = ridgeY(x, h * 0.5, 38, 0.007, 1);
          if (y < h * 0.5 - 24) g.fillRect(x, y, 4, 7 + (h * 0.5 - 24 - y) * 0.3);
        }
      });
      L(0.35, (g) => {
        ridge(g, w, h, m, h * 0.68, 18, 0.012, 2, '#86d283', 'rgba(60,140,70,.55)');
        for (let i = 0; i < 14; i++) {
          const x = xr();
          roundTree(g, x, ridgeY(x, h * 0.68, 18, 0.012, 2) + 4, 0.75 + r() * 0.5, '#5ebd62', '#6a4a30', 'rgba(24,80,40,.6)');
        }
      });
      L(0.7, (g) => {
        ridge(g, w, h, m, h * 0.82, 12, 0.015, 5, '#5fbf5a', 'rgba(30,100,40,.7)');
        for (let i = 0; i < 16; i++) { // buissons et fleurs
          const x = xr();
          const y = ridgeY(x, h * 0.82, 12, 0.015, 5) + 6;
          g.beginPath();
          g.arc(x, y, 8, 0, TAU);
          g.arc(x + 9, y + 2, 6, 0, TAU);
          g.arc(x - 8, y + 2, 6, 0, TAU);
          ol(g, '#3f9e4c', 1.3, 'rgba(18,70,30,.7)');
          if (r() < 0.7) {
            g.fillStyle = ['#ff7eb6', '#ffd24a', '#fff', '#b79cff'][Math.floor(r() * 4)];
            g.beginPath();
            g.arc(x + (r() - 0.5) * 14, y - 5 - r() * 3, 2.2, 0, TAU);
            g.fill();
          }
        }
      });
    } else if (id === 'arcane') {
      L(0.14, (g) => { // îles flottantes lointaines
        [[0.16, 0.5, 1], [0.5, 0.36, 1.25], [0.84, 0.55, 0.9]].forEach(([fx, fy, s]) => {
          const x = w * fx;
          const y = h * fy;
          g.beginPath();
          g.moveTo(x - 46 * s, y);
          g.quadraticCurveTo(x, y - 12 * s, x + 46 * s, y);
          g.quadraticCurveTo(x + 30 * s, y + 24 * s, x + 4 * s, y + 52 * s);
          g.quadraticCurveTo(x - 26 * s, y + 24 * s, x - 46 * s, y);
          ol(g, '#2c2276', 1.5, 'rgba(10,6,40,.6)');
          g.beginPath(); // tour
          g.rect(x - 7 * s, y - 34 * s, 14 * s, 30 * s);
          ol(g, '#3a2f90', 1.2, 'rgba(10,6,40,.6)');
          g.beginPath();
          g.moveTo(x - 10 * s, y - 34 * s);
          g.lineTo(x, y - 52 * s);
          g.lineTo(x + 10 * s, y - 34 * s);
          g.closePath();
          ol(g, '#6a4fd8', 1.2, 'rgba(10,6,40,.6)');
          g.fillStyle = '#ffe58a';
          g.fillRect(x - 2 * s, y - 28 * s, 4 * s, 6 * s);
          halo(g, x, y - 25 * s, 14 * s, '#ffd24a', 0.35);
        });
      });
      L(0.4, (g) => { // anneaux magiques et piliers de cristal
        [[0.3, 0.6, 120], [0.72, 0.4, 80]].forEach(([fx, fy, rad]) => {
          g.strokeStyle = 'rgba(160,140,255,.16)';
          g.lineWidth = 4;
          g.beginPath();
          g.arc(w * fx, h * fy, rad, 0, TAU);
          g.stroke();
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(w * fx, h * fy, rad * 0.82, 0, TAU);
          g.stroke();
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * TAU;
            g.fillStyle = 'rgba(190,170,255,.2)';
            g.fillRect(w * fx + Math.cos(a) * rad * 0.91 - 2, h * fy + Math.sin(a) * rad * 0.91 - 4, 4, 8);
          }
        });
        for (let i = 0; i < 6; i++) crystal(g, xr(), h + 4, 1.2 + r() * 1.4, '#4a3cb0', null);
      });
      L(0.75, (g) => {
        for (let i = 0; i < 6; i++) crystal(g, xr(), h + 6, 0.8 + r() * 0.8, '#7a66e8', '#9a8cff');
      });
    } else if (id === 'dark') {
      L(0.14, (g) => {
        g.fillStyle = '#0a0a1c';
        for (let i = 0; i < 16; i++) { // stalactites
          const x = -m + (i / 15) * (w + m * 2) + (r() - 0.5) * 30;
          const len = 40 + r() * 90;
          g.beginPath();
          g.moveTo(x - 20, -2);
          g.quadraticCurveTo(x - 4, len * 0.5, x + (r() - 0.5) * 6, len);
          g.quadraticCurveTo(x + 6, len * 0.5, x + 20, -2);
          g.fill();
        }
      });
      L(0.4, (g) => {
        g.fillStyle = '#0e0d26';
        for (let i = 0; i < 12; i++) { // stalagmites
          const x = xr();
          const hh = 40 + r() * 80;
          g.beginPath();
          g.moveTo(x - 22, h + 2);
          g.quadraticCurveTo(x - 4, h - hh * 0.5, x, h - hh);
          g.quadraticCurveTo(x + 4, h - hh * 0.5, x + 22, h + 2);
          g.fill();
        }
        for (let i = 0; i < 8; i++) { // champignons lumineux
          const x = xr();
          const y = h - 6 - r() * 40;
          g.fillStyle = '#10d0c0';
          g.fillRect(x - 1, y, 2, 8);
          g.beginPath();
          g.ellipse(x, y, 6, 4, 0, Math.PI, TAU);
          g.fill();
          halo(g, x, y, 26, '#2ee6d0', 0.35);
        }
      });
      L(0.75, (g) => {
        g.fillStyle = '#080818';
        for (let i = 0; i < 7; i++) {
          const x = xr();
          const hh = 30 + r() * 50;
          g.beginPath();
          g.moveTo(x - 30, h + 2);
          g.quadraticCurveTo(x - 6, h - hh * 0.6, x, h - hh);
          g.quadraticCurveTo(x + 6, h - hh * 0.6, x + 30, h + 2);
          g.fill();
        }
      });
    } else if (id === 'sanctuary') {
      L(0.12, (g) => { // dunes et pyramides
        ridge(g, w, h, m, h * 0.7, 14, 0.008, 2, '#e9b46a');
        [[0.2, 70], [0.78, 90]].forEach(([fx, s]) => {
          g.beginPath();
          g.moveTo(w * fx - s, h * 0.72);
          g.lineTo(w * fx, h * 0.72 - s * 0.9);
          g.lineTo(w * fx + s, h * 0.72);
          g.closePath();
          g.fillStyle = '#e4a65c';
          g.fill();
          g.beginPath();
          g.moveTo(w * fx, h * 0.72 - s * 0.9);
          g.lineTo(w * fx + s, h * 0.72);
          g.lineTo(w * fx + s * 0.1, h * 0.72);
          g.closePath();
          g.fillStyle = '#d28f46';
          g.fill();
        });
      });
      L(0.4, (g) => { // colonnes, arches et bannières
        const step = 190;
        for (let x = -m + 60; x < w + m; x += step) {
          column(g, x, 60, h - 6, 34, '#c8924a', '#e8bc74', '#6a4510');
          // arche entre deux colonnes
          g.beginPath();
          g.moveTo(x + 17, 60);
          g.quadraticCurveTo(x + step / 2, -20, x + step - 17, 60);
          g.lineTo(x + step - 17, 78);
          g.quadraticCurveTo(x + step / 2, -2, x + 17, 78);
          g.closePath();
          ol(g, '#d9a95e', 1.4, 'rgba(90,56,16,.6)');
          // bannière
          const bx = x + step / 2;
          g.beginPath();
          g.moveTo(bx - 14, 24);
          g.lineTo(bx + 14, 24);
          g.lineTo(bx + 14, 96);
          g.lineTo(bx, 84);
          g.lineTo(bx - 14, 96);
          g.closePath();
          ol(g, '#b8362c', 1.4, 'rgba(70,16,12,.7)');
          g.fillStyle = '#ffd24a';
          g.beginPath();
          g.arc(bx, 48, 6, 0, TAU);
          g.fill();
          g.fillRect(bx - 1.5, 54, 3, 18);
        }
      });
      L(0.75, (g) => {
        ridge(g, w, h, m, h * 0.9, 8, 0.02, 3, '#e0a25a', 'rgba(110,70,20,.4)');
        for (let i = 0; i < 6; i++) { // pots
          const x = xr();
          const y = h - 6;
          g.beginPath();
          g.moveTo(x - 7, y - 20);
          g.quadraticCurveTo(x - 12, y - 8, x - 6, y);
          g.lineTo(x + 6, y);
          g.quadraticCurveTo(x + 12, y - 8, x + 7, y - 20);
          g.closePath();
          ol(g, '#c0642e', 1.3, 'rgba(70,26,8,.7)');
          g.fillStyle = '#ffd24a';
          g.fillRect(x - 8, y - 14, 16, 2.4);
        }
      });
    } else if (id === 'garden') {
      L(0.14, (g) => {
        for (let i = 0; i < 12; i++) { // cimes d'arbres lointains
          const x = -m + (i / 11) * (w + m * 2);
          const y = h * (0.52 + r() * 0.1);
          g.fillStyle = r() < 0.5 ? '#8fd8b0' : '#7ccaa0';
          g.beginPath();
          g.arc(x, y, 38 + r() * 20, 0, TAU);
          g.arc(x + 30, y + 12, 30, 0, TAU);
          g.arc(x - 30, y + 14, 28, 0, TAU);
          g.rect(x - 60, y + 14, 120, h);
          g.fill();
        }
      });
      L(0.4, (g) => { // grandes fleurs et champignons
        for (let i = 0; i < 9; i++) {
          const x = xr();
          const hh = 60 + r() * 90;
          g.strokeStyle = '#3f8f58';
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(x, h + 4);
          g.quadraticCurveTo(x + (r() - 0.5) * 30, h - hh * 0.5, x, h - hh);
          g.stroke();
          const col = ['#ff9bc2', '#ffd96a', '#ffffff', '#c9a8ff'][i % 4];
          const y = h - hh;
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU;
            g.beginPath();
            g.ellipse(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 7, 5, a, 0, TAU);
            ol(g, col, 1.2, 'rgba(60,30,50,.45)');
          }
          g.beginPath();
          g.arc(x, y, 5, 0, TAU);
          ol(g, '#ffc83a', 1.2, 'rgba(100,60,0,.6)');
        }
      });
      L(0.75, (g) => {
        for (let i = 0; i < 12; i++) { // feuilles pendantes
          const x = xr();
          const len = 40 + r() * 80;
          g.beginPath();
          g.moveTo(x, -4);
          g.quadraticCurveTo(x + 22, len * 0.5, x + 4, len);
          g.quadraticCurveTo(x - 20, len * 0.55, x - 8, -4);
          ol(g, i % 2 ? '#3f9e5e' : '#52b46c', 1.4, 'rgba(10,50,30,.65)');
          g.strokeStyle = 'rgba(10,60,30,.35)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(x - 2, 0);
          g.quadraticCurveTo(x + 6, len * 0.5, x + 4, len - 4);
          g.stroke();
        }
      });
    } else if (id === 'forge') {
      L(0.14, (g) => { // volcans
        [[0.18, 150, 0.46], [0.62, 190, 0.4], [0.92, 120, 0.52]].forEach(([fx, s, fy]) => {
          const x = w * fx;
          const y = h * fy;
          g.beginPath();
          g.moveTo(x - s, h + 2);
          g.lineTo(x - s * 0.18, y);
          g.lineTo(x + s * 0.18, y);
          g.lineTo(x + s, h + 2);
          g.closePath();
          g.fillStyle = '#240c0c';
          g.fill();
          g.strokeStyle = '#ff6a1c';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x - s * 0.1, y + 2);
          g.quadraticCurveTo(x - s * 0.3, y + 50, x - s * 0.22, y + 110);
          g.moveTo(x + s * 0.08, y + 2);
          g.quadraticCurveTo(x + s * 0.2, y + 40, x + s * 0.32, y + 100);
          g.stroke();
          halo(g, x, y, 70, '#ff6a1c', 0.8);
        });
      });
      L(0.4, (g) => { // usines
        for (let i = 0; i < 6; i++) {
          const x = -m + (i / 5) * (w + m * 2) + (r() - 0.5) * 40;
          const bh = 90 + r() * 90;
          const bw = 70 + r() * 40;
          g.beginPath();
          g.rect(x - bw / 2, h - bh, bw, bh + 2);
          ol(g, '#2c1818', 1.5, 'rgba(0,0,0,.6)');
          g.beginPath();
          g.rect(x + bw / 4, h - bh - 50, 16, 52); // cheminée
          ol(g, '#3a2020', 1.5, 'rgba(0,0,0,.6)');
          g.fillStyle = '#6a2a1a';
          g.fillRect(x + bw / 4, h - bh - 50, 16, 6);
          for (let k = 0; k < 4; k++) { // fenêtres
            if (r() < 0.7) {
              g.fillStyle = '#ffa03a';
              g.fillRect(x - bw / 2 + 8 + (k % 2) * 28, h - bh + 12 + Math.floor(k / 2) * 26, 14, 10);
              halo(g, x - bw / 2 + 15 + (k % 2) * 28, h - bh + 17 + Math.floor(k / 2) * 26, 18, '#ff8a2a', 0.45);
            }
          }
        }
      });
      L(0.75, (g) => { // tuyaux et chaînes
        g.fillStyle = '#1a0e0e';
        for (let i = 0; i < 5; i++) {
          const x = xr();
          const len = 60 + r() * 100;
          g.beginPath();
          g.rect(x - 7, -2, 14, len);
          ol(g, '#2a1717', 1.4, 'rgba(0,0,0,.6)');
          g.fillStyle = '#4a2a24';
          g.fillRect(x - 9, len - 8, 18, 8);
        }
        for (let i = 0; i < 6; i++) {
          const x = xr();
          const len = 50 + r() * 120;
          g.strokeStyle = '#3a2a2a';
          g.lineWidth = 3;
          g.setLineDash([5, 3]);
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, len);
          g.stroke();
          g.setLineDash([]);
        }
      });
    } else if (id === 'mist') {
      L(0.1, (g) => {
        ridge(g, w, h, m, h * 0.5, 40, 0.006, 1, 'rgba(120,150,175,.9)');
        ridge(g, w, h, m, h * 0.6, 30, 0.009, 3, 'rgba(100,132,158,.95)');
      });
      L(0.38, (g) => {
        ridge(g, w, h, m, h * 0.72, 16, 0.01, 2, '#4c6a80');
        for (let i = 0; i < 20; i++) {
          const x = xr();
          pine(g, x, ridgeY(x, h * 0.72, 16, 0.01, 2) + 8, 0.8 + r() * 0.6, '#3d5c72', 'rgba(14,26,38,.6)');
        }
      });
      L(0.75, (g) => {
        for (let i = 0; i < 7; i++) pine(g, xr(), h + 8, 1.2 + r() * 0.8, '#2a4458', 'rgba(8,16,24,.7)');
      });
    }
    return bg;
  }

  // Dessine le fond ; shift entre -1 et 1 (position moyenne des joueurs) → parallaxe
  // Le ciel et toutes les couches sont assemblés dans un seul canvas, refait seulement quand le parallaxe a bougé
  // d'au moins ~0,4 pixel (le fond ne coûte presque rien quand les joueurs ne bougent pas).
  function drawBackground(g, bg, shift) {
    const s = Math.round(Math.max(-1, Math.min(1, shift || 0)) * 50) / 50;
    if (!bg.cache) {
      bg.cache = document.createElement('canvas');
      bg.cache.width = bg.sky.width;
      bg.cache.height = bg.sky.height;
      bg.cacheShift = null;
    }
    if (bg.cacheShift !== s) {
      bg.cacheShift = s;
      const cg = bg.cache.getContext('2d');
      cg.setTransform(bg.res, 0, 0, bg.res, 0, 0);
      cg.drawImage(bg.sky, 0, 0, bg.w, bg.h);
      for (let i = 0; i < bg.layers.length; i++) {
        const l = bg.layers[i];
        cg.drawImage(l.img, -bg.m - s * bg.m * l.depth, 0, bg.w + bg.m * 2, bg.h);
      }
    }
    g.drawImage(bg.cache, 0, 0, bg.w, bg.h);
  }

  /* ---------- Blocs solides ---------- */
  function makeTiles(id, rows, T, seed, res) {
    res = res || 1;
    const th = get(id).tile;
    const H = rows.length;
    const W = rows[0].length;
    const r = rng(seed * 31 + 7);
    const solid = (tx, ty) => ty >= 0 && ty < H && tx >= 0 && tx < W && rows[ty][tx] === '#';
    const PW = W * T;
    const PH = H * T;

    // 1) texture (sans masque)
    const tex = document.createElement('canvas');
    tex.width = Math.round(PW * res);
    tex.height = Math.round(PH * res);
    const g = tex.getContext('2d');
    g.scale(res, res);
    const glows = [];

    const grassDepth = (x) => 7 + Math.sin(x * 0.33 + seed) * 2.2 + Math.sin(x * 0.91 + seed * 2) * 1.4;

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (!solid(tx, ty)) continue;
        const x = tx * T;
        const y = ty * T;
        const deep = ty > 0 && solid(tx, ty - 1) ? 1 : 0;
        const bright = deep ? 0 : 1;

        // base avec léger dégradé vertical
        g.fillStyle = vgrad(g, y, y + T, shade(th.base, bright ? 0.04 : 0), shade(th.base, -0.08));
        g.fillRect(x - 0.5, y - 0.5, T + 1, T + 1);

        if (th.pattern === 'earth') {
          for (let i = 0; i < 4; i++) { // cailloux
            const px = x + 3 + r() * 26;
            const py = y + 9 + r() * 20;
            g.beginPath();
            g.ellipse(px, py, 2.2 + r() * 2, 1.6 + r() * 1.4, r(), 0, TAU);
            g.fillStyle = shade(th.dark, 0.05);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,.16)';
            g.beginPath();
            g.ellipse(px - 0.6, py - 0.7, 1.1, 0.6, 0, 0, TAU);
            g.fill();
          }
          g.fillStyle = rgba(th.dark, 0.5);
          for (let i = 0; i < 5; i++) g.fillRect(x + r() * 30, y + 8 + r() * 22, 1.6, 1.6);
          if (r() < 0.35) { // racine
            g.strokeStyle = rgba(th.dark, 0.7);
            g.lineWidth = 1.4;
            g.beginPath();
            const rx = x + 4 + r() * 20;
            g.moveTo(rx, y + 8);
            g.quadraticCurveTo(rx + 5, y + 16, rx + (r() - 0.3) * 12, y + 26);
            g.stroke();
          }
        } else if (th.pattern === 'brick') {
          // gros moellons arrondis, décalés une rangée sur deux
          const off = (ty % 2) * 16;
          for (let row = 0; row < 2; row++) {
            const by = y + row * 16;
            const o2 = (row + ty) % 2 ? 0 : 16;
            for (let k = -1; k < 2; k++) {
              const bx = x + o2 + k * 32;
              const x0 = Math.max(x, bx);
              const x1 = Math.min(x + T, bx + 32);
              if (x1 - x0 < 1) continue;
              g.save();
              g.beginPath();
              g.rect(x, y, T, T);
              g.clip();
              g.beginPath();
              g.roundRect ? g.roundRect(bx + 1, by + 1, 30, 14, 3) : g.rect(bx + 1, by + 1, 30, 14);
              g.fillStyle = vgrad(g, by, by + 16, shade(th.base, 0.1 + r() * 0.05), shade(th.base, -0.05));
              g.fill();
              g.fillStyle = 'rgba(255,255,255,.13)';
              g.fillRect(bx + 3, by + 2, 26, 1.6);
              g.restore();
            }
          }
          g.strokeStyle = rgba(th.dark, 0.9);
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(x, y + 16);
          g.lineTo(x + T, y + 16);
          const jo = (ty % 2) ? 16 : 0;
          g.moveTo(x + jo, y);
          g.lineTo(x + jo, y + 16);
          g.moveTo(x + 16 - jo, y + 16);
          g.lineTo(x + 16 - jo, y + T);
          g.stroke();
          if (th.runes && r() < 0.16) { // runes brillantes
            const rx = x + 8 + r() * 12;
            const ry = y + 6 + r() * 16;
            g.strokeStyle = th.glow;
            g.lineWidth = 2;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(rx, ry);
            g.lineTo(rx + 6, ry);
            g.moveTo(rx + 3, ry - 4);
            g.lineTo(rx + 3, ry + 6);
            g.stroke();
            glows.push({ x: rx + 3, y: ry + 1, r: 18, c: th.glow, ph: r() * 6 });
          }
          if (id === 'dark' && r() < 0.1) glows.push({ x: x + 10 + r() * 12, y: y + 8 + r() * 14, r: 14, c: th.glow, ph: r() * 6 });
          if (th.frost && r() < 0.5) { // cristaux de givre
            g.fillStyle = 'rgba(235,248,255,.5)';
            const fx = x + r() * 26;
            const fy = y + 4 + r() * 22;
            g.beginPath();
            g.moveTo(fx, fy);
            g.lineTo(fx + 3, fy - 5);
            g.lineTo(fx + 6, fy);
            g.closePath();
            g.fill();
          }
        } else if (th.pattern === 'sand') {
          // grandes dalles de grès, joints fins
          g.strokeStyle = rgba(th.dark, 0.7);
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(x, y + T - 0.5);
          g.lineTo(x + T, y + T - 0.5);
          g.moveTo(x + T - 0.5, y);
          g.lineTo(x + T - 0.5, y + T);
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,.18)';
          g.fillRect(x + 2, y + 2, T - 6, 1.6);
          g.fillStyle = rgba(th.dark, 0.35);
          for (let i = 0; i < 7; i++) g.fillRect(x + r() * 30, y + 6 + r() * 24, 1.6, 1.6);
          if (r() < 0.2) { // glyphe gravé
            const gx = x + 8 + r() * 10;
            const gy = y + 10 + r() * 8;
            g.strokeStyle = rgba(th.dark, 0.8);
            g.lineWidth = 1.6;
            g.lineCap = 'round';
            g.beginPath();
            g.arc(gx + 4, gy + 4, 4, 0, TAU);
            g.moveTo(gx + 4, gy - 2);
            g.lineTo(gx + 4, gy + 11);
            g.moveTo(gx - 2, gy + 4);
            g.lineTo(gx + 10, gy + 4);
            g.stroke();
          }
        } else if (th.pattern === 'ember') {
          // plaques de métal rivetées avec fissures de lave
          g.strokeStyle = rgba(th.dark, 0.95);
          g.lineWidth = 1.6;
          g.strokeRect(x + 1.5, y + 1.5, T - 3, T - 3);
          g.fillStyle = 'rgba(255,255,255,.08)';
          g.fillRect(x + 3, y + 3, T - 6, 2);
          g.fillStyle = shade(th.base, 0.3);
          [[5, 5], [T - 5, 5], [5, T - 5], [T - 5, T - 5]].forEach(([dx, dy]) => {
            g.beginPath();
            g.arc(x + dx, y + dy, 1.5, 0, TAU);
            g.fill();
          });
          if (r() < 0.4) {
            const ox = x + 8 + r() * 12;
            g.strokeStyle = '#ff7a1c';
            g.lineWidth = 2;
            g.lineJoin = 'round';
            g.beginPath();
            g.moveTo(ox, y + 6);
            g.lineTo(ox + 6, y + 13);
            g.lineTo(ox + 1, y + 19);
            g.lineTo(ox + 7, y + 27);
            g.stroke();
            g.strokeStyle = '#ffd36a';
            g.lineWidth = 0.8;
            g.stroke();
            glows.push({ x: ox + 4, y: y + 16, r: 22, c: '#ff7a1c', ph: r() * 6 });
          }
        }

        // arêtes exposées : bandeau supérieur (herbe, givre, bord clair)
        if (!solid(tx, ty - 1)) {
          if (th.grass) {
            g.beginPath();
            g.moveTo(x - 0.5, y - 1);
            for (let sx = 0; sx <= T; sx += 2) g.lineTo(x + sx, y + grassDepth(x + sx));
            g.lineTo(x + T + 0.5, y - 1);
            g.closePath();
            g.fillStyle = vgrad(g, y, y + 10, th.top, th.topDark);
            g.fill();
            g.beginPath();
            for (let sx = 0; sx <= T; sx += 2) g[sx ? 'lineTo' : 'moveTo'](x + sx, y + grassDepth(x + sx));
            g.strokeStyle = shade(th.topDark, -0.3);
            g.lineWidth = 1.4;
            g.stroke();
            g.fillStyle = 'rgba(255,255,255,.28)';
            g.fillRect(x + 1, y + 1.5, T - 2, 1.6);
          } else {
            g.fillStyle = vgrad(g, y, y + 8, th.top, th.topDark);
            g.fillRect(x - 0.5, y - 0.5, T + 1, 8);
            g.fillStyle = 'rgba(255,255,255,.3)';
            g.fillRect(x, y + 1, T, 1.6);
            g.fillStyle = rgba(th.out, 0.25);
            g.fillRect(x, y + 7.5, T, 1.2);
            if (th.frost) { // stalactites de glace
              g.fillStyle = th.top;
              for (let i = 0; i < 3; i++) {
                const ix = x + 3 + i * 11 + r() * 3;
                g.beginPath();
                g.moveTo(ix, y + 6);
                g.lineTo(ix + 4, y + 6);
                g.lineTo(ix + 2, y + 6 + 4 + r() * 5);
                g.closePath();
                g.fill();
              }
            }
          }
        }
        // ombres intérieures sur les côtés et le dessous
        if (!solid(tx - 1, ty)) { g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x, y, 3, T); }
        if (!solid(tx + 1, ty)) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + T - 4, y, 4, T); }
        if (!solid(tx, ty + 1)) {
          g.fillStyle = vgrad(g, y + T - 8, y + T, 'rgba(0,0,0,0)', 'rgba(0,0,0,.3)');
          g.fillRect(x, y + T - 8, T, 8);
        }
      }
    }

    // 2) masque : tuiles avec coins convexes arrondis
    const RAD = 7;
    const mask = (ctx, pad) => {
      ctx.beginPath();
      for (let ty = 0; ty < H; ty++) {
        for (let tx = 0; tx < W; tx++) {
          if (!solid(tx, ty)) continue;
          const U = !solid(tx, ty - 1);
          const D = !solid(tx, ty + 1);
          const Lf = !solid(tx - 1, ty);
          const R = !solid(tx + 1, ty);
          const x0 = tx * T - (Lf ? 0 : pad);
          const y0 = ty * T - (U ? 0 : pad);
          const x1 = (tx + 1) * T + (R ? 0 : pad);
          const y1 = (ty + 1) * T + (D ? 0 : pad);
          const tl = U && Lf ? RAD : 0;
          const tr = U && R ? RAD : 0;
          const br = D && R ? RAD : 0;
          const bl = D && Lf ? RAD : 0;
          ctx.moveTo(x0 + tl, y0);
          ctx.lineTo(x1 - tr, y0);
          if (tr) ctx.arcTo(x1, y0, x1, y0 + tr, tr); else ctx.lineTo(x1, y0);
          ctx.lineTo(x1, y1 - br);
          if (br) ctx.arcTo(x1, y1, x1 - br, y1, br); else ctx.lineTo(x1, y1);
          ctx.lineTo(x0 + bl, y1);
          if (bl) ctx.arcTo(x0, y1, x0, y1 - bl, bl); else ctx.lineTo(x0, y1);
          ctx.lineTo(x0, y0 + tl);
          if (tl) ctx.arcTo(x0, y0, x0 + tl, y0, tl); else ctx.lineTo(x0, y0);
          ctx.closePath();
        }
      }
    };

    // 3) assemblage : ombre portée + texture masquée + contour
    const out = document.createElement('canvas');
    out.width = Math.round(PW * res);
    out.height = Math.round(PH * res);
    const o = out.getContext('2d');
    o.scale(res, res);
    // tampon masqué
    const body = document.createElement('canvas');
    body.width = out.width;
    body.height = out.height;
    const b = body.getContext('2d');
    b.scale(res, res);
    b.save();
    mask(b, 0.6);
    b.clip();
    b.drawImage(tex, 0, 0, PW, PH);
    b.restore();
    // ombre douce portée sur le fond
    o.save();
    o.shadowColor = 'rgba(10,6,30,.38)';
    o.shadowBlur = 9;
    o.shadowOffsetY = 4;
    o.drawImage(body, 0, 0, PW, PH);
    o.restore();
    o.drawImage(body, 0, 0, PW, PH);

    // contour sur les arêtes exposées uniquement
    o.strokeStyle = th.out;
    o.lineWidth = 2.4;
    o.lineCap = 'round';
    o.lineJoin = 'round';
    o.beginPath();
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (!solid(tx, ty)) continue;
        const U = !solid(tx, ty - 1);
        const D = !solid(tx, ty + 1);
        const Lf = !solid(tx - 1, ty);
        const R = !solid(tx + 1, ty);
        const x0 = tx * T;
        const y0 = ty * T;
        const x1 = x0 + T;
        const y1 = y0 + T;
        const tl = U && Lf ? RAD : 0;
        const tr = U && R ? RAD : 0;
        const br = D && R ? RAD : 0;
        const bl = D && Lf ? RAD : 0;
        if (U) { o.moveTo(x0 + tl, y0); o.lineTo(x1 - tr, y0); }
        if (D) { o.moveTo(x0 + bl, y1); o.lineTo(x1 - br, y1); }
        if (Lf) { o.moveTo(x0, y0 + tl); o.lineTo(x0, y1 - bl); }
        if (R) { o.moveTo(x1, y0 + tr); o.lineTo(x1, y1 - br); }
        if (tl) { o.moveTo(x0, y0 + tl); o.arcTo(x0, y0, x0 + tl, y0, tl); }
        if (tr) { o.moveTo(x1 - tr, y0); o.arcTo(x1, y0, x1, y0 + tr, tr); }
        if (br) { o.moveTo(x1, y1 - br); o.arcTo(x1, y1, x1 - br, y1, br); }
        if (bl) { o.moveTo(x0 + bl, y1); o.arcTo(x0, y1, x0, y1 - bl, bl); }
      }
    }
    o.stroke();

    // brins d'herbe, fleurs et cristaux de givre qui dépassent du bloc
    const r2 = rng(seed * 57 + 3);
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (!solid(tx, ty) || solid(tx, ty - 1)) continue;
        const x = tx * T;
        const y = ty * T;
        if (th.grass) {
          for (let i = 0; i < 5; i++) {
            const bx = x + 3 + i * 6 + r2() * 3;
            const hh = 3 + r2() * 4;
            o.beginPath();
            o.moveTo(bx, y + 3);
            o.quadraticCurveTo(bx + 0.5, y - hh * 0.5, bx + 1.5 + (r2() - 0.5) * 2, y - hh);
            o.quadraticCurveTo(bx + 3, y - hh * 0.5, bx + 3.4, y + 3);
            o.closePath();
            o.fillStyle = th.top;
            o.fill();
            o.lineWidth = 1;
            o.strokeStyle = shade(th.topDark, -0.3);
            o.stroke();
          }
          if (th.flowers && r2() < 0.34) {
            const fx = x + 6 + r2() * 20;
            const col = ['#ff7eb6', '#ffd24a', '#fff', '#b79cff'][Math.floor(r2() * 4)];
            o.strokeStyle = '#2f7a3a';
            o.lineWidth = 1.6;
            o.beginPath();
            o.moveTo(fx, y + 3);
            o.lineTo(fx, y - 5);
            o.stroke();
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * TAU;
              o.beginPath();
              o.arc(fx + Math.cos(a) * 2.5, y - 7 + Math.sin(a) * 2.5, 2, 0, TAU);
              o.fillStyle = col;
              o.fill();
              o.lineWidth = 0.8;
              o.strokeStyle = 'rgba(60,20,40,.5)';
              o.stroke();
            }
            o.beginPath();
            o.arc(fx, y - 7, 1.6, 0, TAU);
            o.fillStyle = '#ffc83a';
            o.fill();
          } else if (th.flowers === undefined && r2() < 0.12) {
            const mx = x + 6 + r2() * 20; // petit champignon
            o.fillStyle = '#f3ead2';
            o.fillRect(mx - 1, y - 3, 2.4, 5);
            o.beginPath();
            o.ellipse(mx, y - 3, 3.6, 2.6, 0, Math.PI, TAU);
            o.fillStyle = '#e04a4a';
            o.fill();
            o.lineWidth = 1;
            o.strokeStyle = 'rgba(70,16,16,.8)';
            o.stroke();
          }
        }
        if (th.frost && r2() < 0.4) {
          const fx = x + 5 + r2() * 20;
          o.beginPath();
          o.moveTo(fx, y + 2);
          o.lineTo(fx + 2.4, y - 5 - r2() * 3);
          o.lineTo(fx + 5, y + 2);
          o.closePath();
          o.fillStyle = '#e8f6ff';
          o.fill();
          o.lineWidth = 1;
          o.strokeStyle = 'rgba(30,60,90,.7)';
          o.stroke();
        }
      }
    }
    out.glows = glows;
    return out;
  }

  // Lueurs pulsantes dessinées sur les blocs (runes, lave, champignons...)
  function drawTileFx(g, tiles, frame) {
    const list = tiles && tiles.glows;
    if (!list || !list.length) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const a = 0.28 + 0.22 * Math.sin(frame * 0.045 + o.ph);
      halo(g, o.x, o.y, o.r, o.c, a);
    }
    g.restore();
  }

  /* ---------- Décor animé ---------- */
  function makeDecor(id, w, h, seed) {
    const r = rng(seed * 131 + 5);
    const items = [];
    const n = { prairie: 40, arcane: 100, dark: 40, sanctuary: 60, garden: 56, forge: 70, mist: 40 }[id] || 30;
    for (let i = 0; i < n; i++) items.push({ x: r() * w, y: r() * h, s: 0.5 + r(), p: r() * TAU, k: r(), i });
    return items;
  }

  function wrap(v, m) { return ((v % m) + m) % m; }

  function bird(g, x, y, s, flap, col) {
    g.strokeStyle = col;
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - 6 * s, y - flap * 4 * s);
    g.quadraticCurveTo(x - 2 * s, y + 1 * s, x, y);
    g.quadraticCurveTo(x + 2 * s, y + 1 * s, x + 6 * s, y - flap * 4 * s);
    g.stroke();
  }

  function butterfly(g, x, y, t, col, col2) {
    const f = Math.abs(Math.sin(t));
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(x - 3.2, y - 1, 3.6 * f + 0.8, 4.2, -0.3, 0, TAU);
    g.ellipse(x + 3.2, y - 1, 3.6 * f + 0.8, 4.2, 0.3, 0, TAU);
    g.fill();
    g.fillStyle = col2;
    g.beginPath();
    g.ellipse(x - 2.4, y + 3, 2.4 * f + 0.6, 2.4, 0, 0, TAU);
    g.ellipse(x + 2.4, y + 3, 2.4 * f + 0.6, 2.4, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#2a2147';
    g.fillRect(x - 0.7, y - 3, 1.4, 8);
  }

  function gear(g, cx, cy, rad, teeth, rot, fill, line) {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.beginPath();
    for (let k = 0; k < teeth; k++) {
      const a0 = (k / teeth) * TAU;
      const a1 = ((k + 0.28) / teeth) * TAU;
      const a2 = ((k + 0.5) / teeth) * TAU;
      const a3 = ((k + 0.78) / teeth) * TAU;
      g.lineTo(Math.cos(a0) * rad, Math.sin(a0) * rad);
      g.lineTo(Math.cos(a1) * (rad + 11), Math.sin(a1) * (rad + 11));
      g.lineTo(Math.cos(a2) * (rad + 11), Math.sin(a2) * (rad + 11));
      g.lineTo(Math.cos(a3) * rad, Math.sin(a3) * rad);
    }
    g.closePath();
    g.arc(0, 0, rad * 0.35, 0, TAU, true);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = line;
    g.stroke();
    g.restore();
  }

  function spark4(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.quadraticCurveTo(x, y, x, y + r);
    g.quadraticCurveTo(x, y, x - r, y);
    g.quadraticCurveTo(x, y, x, y - r);
    g.fill();
  }

  function drawDecor(g, id, items, frame, w, h) {
    const t = frame;
    if (id === 'prairie') {
      const sp = SUN(w, h);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.translate(sp.x, sp.y);
      g.rotate(t * 0.0012);
      for (let k = 0; k < 12; k++) { // rayons du soleil
        g.rotate(TAU / 12);
        g.fillStyle = `rgba(255,240,170,${0.07 + 0.03 * Math.sin(t * 0.02 + k)})`;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(-10, -360);
        g.lineTo(10, -360);
        g.fill();
      }
      g.restore();
      // nuages
      for (let i = 0; i < 8; i++) {
        const o = items[i];
        const s = 20 + o.s * 22;
        const x = wrap(o.x + t * 0.14 * o.s, w + 200) - 100;
        const y = 24 + (o.y % 150) * 0.85;
        g.save();
        g.translate(0, 5);
        cloudShape(g, x, y, s);
        g.fillStyle = 'rgba(120,170,215,.35)';
        g.fill();
        g.restore();
        cloudShape(g, x, y, s);
        g.fillStyle = 'rgba(255,255,255,.96)';
        g.fill();
      }
      // montgolfière
      {
        const o = items[9];
        const x = wrap(o.x * 0.5 + t * 0.09, w + 160) - 80;
        const y = h * 0.28 + Math.sin(t * 0.012) * 8;
        g.beginPath();
        g.ellipse(x, y, 16, 19, 0, 0, TAU);
        g.fillStyle = '#ff6b6b';
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = 'rgba(70,20,30,.7)';
        g.stroke();
        g.fillStyle = '#ffe27a';
        g.beginPath();
        g.ellipse(x, y, 6, 19, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#8a5a30';
        g.fillRect(x - 5, y + 26, 10, 7);
        g.strokeStyle = 'rgba(70,40,20,.8)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x - 9, y + 16); g.lineTo(x - 4, y + 26);
        g.moveTo(x + 9, y + 16); g.lineTo(x + 4, y + 26);
        g.stroke();
      }
      // oiseaux
      for (let i = 10; i < 15; i++) {
        const o = items[i];
        bird(g, wrap(o.x + t * (0.45 + o.s * 0.2), w + 100) - 50, h * 0.2 + (o.y % 90) + Math.sin(t * 0.03 + o.p) * 6, 0.8 + o.s * 0.3, Math.sin(t * 0.22 + o.p), 'rgba(40,50,80,.65)');
      }
      // papillons & pollen
      for (let i = 15; i < 20; i++) {
        const o = items[i];
        butterfly(g, wrap(o.x + t * 0.35 * o.s, w + 40) - 20, h * 0.55 + (o.y % (h * 0.3)) + Math.sin(t * 0.05 + o.p) * 12, t * 0.3 + o.p, i % 2 ? '#ff9ad0' : '#ffd24a', '#fff');
      }
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 20; i < 40; i++) {
        const o = items[i];
        halo(g, wrap(o.x + t * 0.2 * o.s + Math.sin(t * 0.02 + o.p) * 12, w), wrap(o.y - t * 0.12 * o.s, h), 4 + o.s * 2, '#fff7b0', 0.45);
      }
      g.restore();
    } else if (id === 'arcane') {
      // aurore magique
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 3; b++) {
        g.beginPath();
        g.moveTo(0, 0);
        for (let x = 0; x <= w; x += 20) g.lineTo(x, 40 + b * 18 + Math.sin(x * 0.011 + t * 0.012 + b * 2) * 22);
        g.lineTo(w, 0);
        g.closePath();
        const k = g.createLinearGradient(0, 0, 0, 100);
        k.addColorStop(0, rgba(['#7d5bff', '#3de0d0', '#ff7ad9'][b], 0.0));
        k.addColorStop(0.6, rgba(['#7d5bff', '#3de0d0', '#ff7ad9'][b], 0.09));
        k.addColorStop(1, rgba(['#7d5bff', '#3de0d0', '#ff7ad9'][b], 0.0));
        g.fillStyle = k;
        g.fill();
      }
      g.restore();
      items.forEach((o, i) => {
        if (i < 50) { // étoiles scintillantes
          const a = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.03 * o.s + o.p));
          g.fillStyle = `rgba(255,255,255,${a})`;
          if (o.k > 0.8) spark4(g, o.x, o.y * 0.8, 2 + a * 3);
          else g.fillRect(o.x, o.y * 0.8, 1.5 + o.s, 1.5 + o.s);
        } else if (i < 62) { // runes qui montent
          const y = h - ((o.y + t * 0.3 * o.s) % (h + 40)) + 20;
          g.globalAlpha = 0.28;
          g.strokeStyle = '#b79cff';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(o.x, y, 14 * o.s, 0, TAU);
          g.moveTo(o.x - 8 * o.s, y); g.lineTo(o.x + 8 * o.s, y);
          g.moveTo(o.x, y - 8 * o.s); g.lineTo(o.x, y + 8 * o.s);
          g.stroke();
          g.globalAlpha = 1;
        }
      });
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 62; i < 100; i++) { // poussière magique
        const o = items[i];
        halo(g, o.x + Math.sin(t * 0.02 + o.p) * 14, wrap(o.y - t * 0.3 * o.s, h), 5 + o.s * 3, i % 2 ? '#a58bff' : '#6ae6e0', 0.5);
      }
      g.restore();
      // étoile filante
      const cyc = t % 520;
      if (cyc < 40) {
        const k = cyc / 40;
        g.save();
        g.globalCompositeOperation = 'lighter';
        const sx = w * 0.7 - k * 320;
        const sy = 30 + k * 160;
        const gr = g.createLinearGradient(sx, sy, sx + 90, sy - 50);
        gr.addColorStop(0, 'rgba(255,255,255,.9)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = gr;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + 90, sy - 50);
        g.stroke();
        g.restore();
      }
    } else if (id === 'dark') {
      items.forEach((o, i) => {
        if (i < 5) { // yeux qui clignent dans le noir
          const on = Math.sin(t * 0.012 + o.p * 5) > 0.55;
          if (on) {
            g.save();
            g.globalCompositeOperation = 'lighter';
            halo(g, o.x + 2, o.y + 1, 14, '#ff3a3a', 0.5);
            halo(g, o.x + 11, o.y + 1, 14, '#ff3a3a', 0.5);
            g.restore();
            g.fillStyle = 'rgba(255,70,70,.95)';
            g.beginPath();
            g.ellipse(o.x + 2, o.y + 1, 3, 2, 0, 0, TAU);
            g.ellipse(o.x + 11, o.y + 1, 3, 2, 0, 0, TAU);
            g.fill();
          }
        } else if (i < 10) { // brume basse
          g.fillStyle = 'rgba(120,120,210,.05)';
          const x = wrap(o.x + t * 0.2 * o.s, w + 300) - 150;
          g.beginPath();
          g.ellipse(x, o.y, 130, 26, 0, 0, TAU);
          g.fill();
        } else { // spores lumineuses
          g.save();
          g.globalCompositeOperation = 'lighter';
          halo(g, o.x + Math.sin(t * 0.015 + o.p) * 18, wrap(o.y - t * 0.1 * o.s, h), 5 + o.s * 3, i % 3 ? '#4ae6d0' : '#8a7bff', 0.4 + 0.3 * Math.sin(t * 0.04 + o.p));
          g.restore();
        }
      });
    } else if (id === 'sanctuary') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) { // rayons de lumière
        const x = 80 + i * 230 + Math.sin(t * 0.008 + i) * 20;
        g.fillStyle = `rgba(255,230,150,${0.07 + 0.035 * Math.sin(t * 0.02 + i * 2)})`;
        g.beginPath();
        g.moveTo(x, 0); g.lineTo(x + 70, 0); g.lineTo(x + 190, h); g.lineTo(x + 60, h);
        g.fill();
      }
      for (let i = 0; i < 60; i++) { // poussière d'or
        const o = items[i];
        halo(g, o.x + Math.sin(t * 0.02 + o.p) * 10, wrap(o.y - t * 0.14 * o.s, h), 3 + o.s * 2.4, '#ffe9a0', 0.4 + 0.3 * Math.sin(t * 0.05 + o.p));
      }
      g.restore();
      for (let i = 0; i < 3; i++) { // oiseaux au loin
        const o = items[i];
        bird(g, wrap(o.x + t * 0.35, w + 100) - 50, 40 + o.y % 80, 0.8, Math.sin(t * 0.2 + o.p), 'rgba(110,60,20,.55)');
      }
    } else if (id === 'garden') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 4; k++) { // rayons filtrant à travers le feuillage
        g.fillStyle = `rgba(255,255,200,${0.05 + 0.03 * Math.sin(t * 0.015 + k)})`;
        const x = 60 + k * 260 + Math.sin(t * 0.006 + k) * 18;
        g.beginPath();
        g.moveTo(x, 0); g.lineTo(x + 50, 0); g.lineTo(x + 170, h); g.lineTo(x + 70, h);
        g.fill();
      }
      g.restore();
      items.forEach((o, i) => {
        if (i < 22) { // pétales
          const y = wrap(o.y + t * 0.5 * o.s, h + 20) - 10;
          const x = o.x + Math.sin(t * 0.03 + o.p) * 16;
          g.fillStyle = i % 3 === 0 ? '#ffb3d1' : i % 3 === 1 ? '#fff0a0' : '#ffffff';
          g.save();
          g.translate(x, y);
          g.rotate(t * 0.04 + o.p);
          g.beginPath();
          g.ellipse(0, 0, 4, 2, 0, 0, TAU);
          g.fill();
          g.restore();
        } else if (i < 30) { // papillons
          butterfly(g, wrap(o.x + t * 0.6 * o.s, w + 40) - 20, h * 0.3 + (o.y % (h * 0.5)) + Math.sin(t * 0.05 + o.p) * 14, t * 0.3 + o.p, i % 2 ? '#ff9ad0' : '#ffd24a', '#fff');
        } else { // lucioles de pollen
          g.save();
          g.globalCompositeOperation = 'lighter';
          halo(g, o.x + Math.sin(t * 0.02 + o.p) * 20, wrap(o.y - t * 0.1 * o.s, h), 5 + o.s * 3, '#fffbb0', 0.35 + 0.3 * Math.sin(t * 0.05 + o.p));
          g.restore();
        }
      });
    } else if (id === 'forge') {
      g.save();
      [[140, 120, 56, 10, 1], [820, 190, 76, 12, -1], [500, 360, 44, 8, 1]].forEach(([cx, cy, rad, tn, d]) => {
        gear(g, cx, cy, rad, tn, t * 0.006 * d, 'rgba(20,6,6,.5)', 'rgba(0,0,0,.35)');
      });
      g.restore();
      items.forEach((o, i) => {
        if (i < 12) { // fumée qui monte
          const k = wrap(o.y * 2 + t * (0.3 + o.s * 0.3), h + 80) / (h + 80);
          const y = h + 30 - k * (h + 60);
          g.fillStyle = `rgba(40,20,20,${0.2 * (1 - k)})`;
          g.beginPath();
          g.arc(o.x + Math.sin(t * 0.01 + o.p) * 20 + k * 40, y, 14 + k * 30, 0, TAU);
          g.fill();
        } else { // braises
          const y = h - wrap(o.y * 2 + t * (0.5 + o.s * 0.6), h + 20) + 10;
          const x = o.x + Math.sin(t * 0.04 + o.p) * 10;
          g.save();
          g.globalCompositeOperation = 'lighter';
          halo(g, x, y, 5 + o.s * 3, o.k > 0.5 ? '#ff8a2a' : '#ffc24a', 0.5 + o.k * 0.4);
          g.restore();
        }
      });
    } else if (id === 'mist') {
      items.forEach((o, i) => {
        if (i < 10) {
          g.fillStyle = 'rgba(225,238,248,.13)';
          const x = wrap(o.x + t * 0.3 * o.s, w + 500) - 250;
          g.beginPath();
          g.ellipse(x, o.y, 230, 34, 0, 0, TAU);
          g.fill();
        } else if (i < 20) { // oiseaux sombres
          bird(g, wrap(o.x + t * 0.4, w + 100) - 50, 30 + (o.y % 100), 0.9, Math.sin(t * 0.18 + o.p), 'rgba(20,34,48,.6)');
        } else { // gouttelettes et lucioles pâles
          g.save();
          g.globalCompositeOperation = 'lighter';
          halo(g, o.x + Math.sin(t * 0.013 + o.p) * 20, wrap(o.y - t * 0.08 * o.s, h), 4 + o.s * 2.4, '#d4ecff', 0.3 + 0.25 * Math.sin(t * 0.04 + o.p));
          g.restore();
        }
      });
    }
  }

  // Au-dessus des joueurs : brume (Brumes), chaleur (Forge), feuilles (Jardins)
  function drawFront(g, id, items, frame, w, h) {
    if (id === 'mist') {
      for (let i = 0; i < items.length; i += 2) {
        const o = items[i];
        g.fillStyle = 'rgba(235,245,250,.09)';
        const x = wrap(o.x * 1.7 - frame * 0.5 * o.s, w + 500) - 250;
        g.beginPath();
        g.ellipse(x, o.y * 0.9 + 20, 270, 30, 0, 0, TAU);
        g.fill();
      }
    } else if (id === 'forge') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const k = g.createLinearGradient(0, h * 0.75, 0, h);
      k.addColorStop(0, 'rgba(255,100,20,0)');
      k.addColorStop(1, `rgba(255,100,20,${0.12 + 0.05 * Math.sin(frame * 0.05)})`);
      g.fillStyle = k;
      g.fillRect(0, h * 0.75, w, h * 0.25);
      g.restore();
    }
  }

  window.Themes = { get, makeBackground, drawBackground, makeTiles, drawTileFx, makeDecor, drawDecor, drawFront, rng, glowSprite, halo };
})();

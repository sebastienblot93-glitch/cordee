// Thèmes graphiques : un par chapitre (ciel, décor animé, style des blocs).
(function () {
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

  const THEMES = {
    prairie: {
      label: 'Prairie', sky: ['#6fc3f5', '#d8f2ff'], light: true,
      tile: { base: '#8b5e3c', dark: '#6d4529', top: '#58b84a', topDark: '#3f8f38', line: 'rgba(0,0,0,.12)', pattern: 'earth', grass: true },
    },
    arcane: {
      label: 'Arcanes', sky: ['#150f40', '#3b2a80'], light: false,
      tile: { base: '#3b3b86', dark: '#2b2b66', top: '#6f6fd6', topDark: '#5555aa', line: 'rgba(255,255,255,.07)', pattern: 'brick', glow: '#8a7bff' },
    },
    dark: {
      label: 'Ténèbres', sky: ['#04040c', '#14122c'], light: false,
      tile: { base: '#24244a', dark: '#171734', top: '#3a3a72', topDark: '#2a2a58', line: 'rgba(255,255,255,.05)', pattern: 'brick' },
    },
    sanctuary: {
      label: 'Sanctuaire', sky: ['#f9dc92', '#f1a85d'], light: true,
      tile: { base: '#c6a064', dark: '#a37f44', top: '#ecd08c', topDark: '#d2b06a', line: 'rgba(90,60,10,.18)', pattern: 'brick' },
    },
    garden: {
      label: 'Jardins', sky: ['#9fe3c6', '#f0fcd6'], light: true,
      tile: { base: '#4f8f5e', dark: '#37704a', top: '#86d46a', topDark: '#5fb04f', line: 'rgba(0,40,0,.14)', pattern: 'earth', grass: true, flowers: true },
    },
    forge: {
      label: 'Forge', sky: ['#240a0a', '#6a2012'], light: false,
      tile: { base: '#4b3a3c', dark: '#332628', top: '#8d6a58', topDark: '#6b4f44', line: 'rgba(0,0,0,.25)', pattern: 'ember' },
    },
    mist: {
      label: 'Brumes', sky: ['#3d5a74', '#a9c3d3'], light: false,
      tile: { base: '#566e80', dark: '#41586a', top: '#9ab5c6', topDark: '#7a97aa', line: 'rgba(255,255,255,.09)', pattern: 'brick' },
    },
  };

  function get(id) { return THEMES[id] || THEMES.arcane; }

  /* ----- Fond fixe (pré-rendu une seule fois par niveau) ----- */
  function makeBackground(id, w, h, seed) {
    const th = get(id);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const r = rng(seed * 977 + 13);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, th.sky[0]);
    sky.addColorStop(1, th.sky[1]);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    if (id === 'prairie' || id === 'garden') {
      const cols = id === 'prairie' ? ['#8fd48a', '#6cbf6c'] : ['#7ccfa6', '#5eb890'];
      [[0.62, cols[0], 0.8], [0.74, cols[1], 1.3]].forEach(([base, col, f], k) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) g.lineTo(x, h * base + Math.sin(x * 0.012 * f + k * 2) * 26 + Math.sin(x * 0.03 + k) * 8);
        g.lineTo(w, h);
        g.fill();
      });
      if (id === 'prairie') { // soleil
        const sg = g.createRadialGradient(w * 0.82, h * 0.18, 8, w * 0.82, h * 0.18, 90);
        sg.addColorStop(0, 'rgba(255,248,200,1)');
        sg.addColorStop(0.3, 'rgba(255,236,150,.8)');
        sg.addColorStop(1, 'rgba(255,236,150,0)');
        g.fillStyle = sg;
        g.fillRect(0, 0, w, h);
      } else { // grandes feuilles qui pendent
        g.fillStyle = 'rgba(40,120,70,.55)';
        for (let i = 0; i < 9; i++) {
          const x = r() * w;
          const len = 40 + r() * 90;
          g.beginPath();
          g.moveTo(x, 0);
          g.quadraticCurveTo(x + 24, len * 0.5, x + 6, len);
          g.quadraticCurveTo(x - 20, len * 0.55, x - 8, 0);
          g.fill();
        }
      }
    } else if (id === 'sanctuary') {
      g.fillStyle = 'rgba(160,100,30,.22)';
      for (let x = 70; x < w; x += 150) { // colonnes lointaines
        g.fillRect(x, 40, 34, h);
        g.fillRect(x - 6, 30, 46, 14);
        g.fillRect(x - 6, h - 40, 46, 14);
        for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(255,230,160,.18)'; g.fillRect(x + 6 + k * 10, 50, 3, h - 90); g.fillStyle = 'rgba(160,100,30,.22)'; }
      }
    } else if (id === 'mist') {
      g.fillStyle = 'rgba(30,50,70,.55)';
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 12) g.lineTo(x, h * 0.55 + Math.abs(Math.sin(x * 0.011) + Math.sin(x * 0.027 + 2) * 0.5) * 80);
      g.lineTo(w, h);
      g.fill();
    } else if (id === 'forge') {
      const lg = g.createLinearGradient(0, h * 0.6, 0, h);
      lg.addColorStop(0, 'rgba(255,120,30,0)');
      lg.addColorStop(1, 'rgba(255,120,30,.55)');
      g.fillStyle = lg;
      g.fillRect(0, h * 0.6, w, h * 0.4);
    } else if (id === 'arcane') {
      const mg = g.createRadialGradient(w * 0.2, h * 0.25, 4, w * 0.2, h * 0.25, 70);
      mg.addColorStop(0, 'rgba(240,236,255,.95)');
      mg.addColorStop(0.45, 'rgba(200,190,255,.35)');
      mg.addColorStop(1, 'rgba(200,190,255,0)');
      g.fillStyle = mg;
      g.fillRect(0, 0, w, h);
    }
    return c;
  }

  /* ----- Blocs solides (pré-rendus) ----- */
  function makeTiles(id, rows, T, seed) {
    const th = get(id).tile;
    const H = rows.length;
    const W = rows[0].length;
    const c = document.createElement('canvas');
    c.width = W * T; c.height = H * T;
    const g = c.getContext('2d');
    const r = rng(seed * 31 + 7);
    const solid = (tx, ty) => ty >= 0 && ty < H && tx >= 0 && tx < W && rows[ty][tx] === '#';
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (!solid(tx, ty)) continue;
        const x = tx * T;
        const y = ty * T;
        g.fillStyle = th.base;
        g.fillRect(x, y, T, T);
        // ombre en bas, léger dégradé
        const gr = g.createLinearGradient(0, y, 0, y + T);
        gr.addColorStop(0, 'rgba(255,255,255,.07)');
        gr.addColorStop(1, 'rgba(0,0,0,.18)');
        g.fillStyle = gr;
        g.fillRect(x, y, T, T);
        g.strokeStyle = th.line;
        g.lineWidth = 1;
        if (th.pattern === 'brick') {
          g.beginPath();
          g.moveTo(x, y + T / 2); g.lineTo(x + T, y + T / 2);
          const off = (ty + tx) % 2 ? 8 : 24;
          g.moveTo(x + off, y); g.lineTo(x + off, y + T / 2);
          g.moveTo(x + 32 - off, y + T / 2); g.lineTo(x + 32 - off, y + T);
          g.stroke();
        } else if (th.pattern === 'earth') {
          g.fillStyle = th.dark;
          for (let i = 0; i < 5; i++) g.fillRect(x + r() * 28, y + 6 + r() * 24, 3 + r() * 3, 2 + r() * 2);
        } else if (th.pattern === 'ember') {
          g.beginPath();
          g.moveTo(x + 4, y + 6); g.lineTo(x + 14, y + 16); g.lineTo(x + 10, y + 26);
          g.stroke();
          if (r() < 0.5) {
            g.strokeStyle = 'rgba(255,140,40,.7)';
            g.lineWidth = 2;
            g.beginPath();
            const ox = r() * 18;
            g.moveTo(x + 6 + ox, y + 8); g.lineTo(x + 12 + ox, y + 18); g.lineTo(x + 8 + ox, y + 28);
            g.stroke();
          }
        }
        if (th.glow && r() < 0.18) { // petites runes brillantes
          g.fillStyle = th.glow;
          g.globalAlpha = 0.7;
          g.fillRect(x + 12, y + 14, 8, 2);
          g.fillRect(x + 15, y + 11, 2, 8);
          g.globalAlpha = 1;
        }
        // arêtes exposées
        if (!solid(tx, ty - 1)) {
          g.fillStyle = th.top;
          g.fillRect(x, y, T, 6);
          g.fillStyle = th.topDark;
          g.fillRect(x, y + 6, T, 2);
          if (th.grass) {
            g.fillStyle = th.top;
            for (let i = 0; i < 6; i++) {
              const bx = x + 2 + i * 5 + r() * 2;
              g.beginPath();
              g.moveTo(bx, y + 6); g.lineTo(bx + 2, y - 3 - r() * 3); g.lineTo(bx + 4, y + 6);
              g.fill();
            }
            if (th.flowers && r() < 0.28) {
              const fx = x + 6 + r() * 20;
              g.fillStyle = ['#ff7eb6', '#ffd24a', '#fff', '#b79cff'][Math.floor(r() * 4)];
              g.beginPath(); g.arc(fx, y - 3, 3, 0, Math.PI * 2); g.fill();
              g.fillStyle = '#ffd24a'; g.fillRect(fx - 1, y - 4, 2, 2);
              g.fillStyle = '#3f8f38'; g.fillRect(fx - 0.5, y - 1, 1.5, 4);
            }
          }
        }
        g.fillStyle = 'rgba(255,255,255,.13)';
        if (!solid(tx - 1, ty)) g.fillRect(x, y, 2, T);
        if (!solid(tx + 1, ty)) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + T - 2, y, 2, T); }
        if (!solid(tx, ty + 1)) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, y + T - 3, T, 3); }
      }
    }
    return c;
  }

  /* ----- Décor animé ----- */
  function makeDecor(id, w, h, seed) {
    const r = rng(seed * 131 + 5);
    const items = [];
    const n = { prairie: 7, arcane: 70, dark: 10, sanctuary: 36, garden: 26, forge: 46, mist: 6 }[id] || 20;
    for (let i = 0; i < n; i++) items.push({ x: r() * w, y: r() * h, s: 0.5 + r(), p: r() * 6.28, k: r() });
    return items;
  }

  function drawDecor(g, id, items, frame, w, h) {
    const t = frame;
    if (id === 'prairie') {
      g.fillStyle = 'rgba(255,255,255,.9)';
      items.forEach((o) => {
        const x = ((o.x + t * 0.12 * o.s) % (w + 140)) - 70;
        const y = 30 + (o.y % 150) * 0.9;
        const s = 22 + o.s * 22;
        g.beginPath();
        g.arc(x, y, s * 0.6, 0, 6.3); g.arc(x + s * 0.7, y + 4, s * 0.5, 0, 6.3); g.arc(x - s * 0.7, y + 5, s * 0.45, 0, 6.3);
        g.fill();
      });
    } else if (id === 'arcane') {
      items.forEach((o, i) => {
        if (i < 56) {
          g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.03 * o.s + o.p));
          g.fillStyle = '#fff';
          g.fillRect(o.x, o.y, 1.5 + o.s, 1.5 + o.s);
        } else {
          const y = h - ((o.y + t * 0.25 * o.s) % (h + 40)) + 20;
          g.globalAlpha = 0.28;
          g.strokeStyle = '#b79cff';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(o.x, y, 14 * o.s, 0, 6.3);
          g.moveTo(o.x - 8 * o.s, y); g.lineTo(o.x + 8 * o.s, y);
          g.moveTo(o.x, y - 8 * o.s); g.lineTo(o.x, y + 8 * o.s);
          g.stroke();
        }
      });
      g.globalAlpha = 1;
    } else if (id === 'dark') {
      items.forEach((o, i) => {
        if (i < 5) { // yeux qui clignent dans le noir
          const on = Math.sin(t * 0.012 + o.p * 5) > 0.55;
          if (on) {
            g.fillStyle = 'rgba(255,60,60,.8)';
            g.fillRect(o.x, o.y, 4, 3);
            g.fillRect(o.x + 9, o.y, 4, 3);
          }
        } else {
          g.fillStyle = 'rgba(120,120,200,.05)';
          const x = ((o.x + t * 0.2 * o.s) % (w + 300)) - 150;
          g.beginPath();
          g.ellipse(x, o.y, 120, 26, 0, 0, 6.3);
          g.fill();
        }
      });
    } else if (id === 'sanctuary') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) { // rayons de lumière
        const x = 80 + i * 230 + Math.sin(t * 0.008 + i) * 20;
        g.fillStyle = `rgba(255,230,150,${0.06 + 0.03 * Math.sin(t * 0.02 + i * 2)})`;
        g.beginPath();
        g.moveTo(x, 0); g.lineTo(x + 70, 0); g.lineTo(x + 190, h); g.lineTo(x + 60, h);
        g.fill();
      }
      g.restore();
      g.fillStyle = 'rgba(255,240,180,.8)';
      items.forEach((o) => { // poussière d'or
        const y = (o.y - t * 0.15 * o.s + h * 3) % h;
        g.fillRect(o.x + Math.sin(t * 0.02 + o.p) * 8, y, 2, 2);
      });
    } else if (id === 'garden') {
      items.forEach((o, i) => {
        if (i < 18) { // pétales
          const y = ((o.y + t * 0.5 * o.s) % (h + 20)) - 10;
          const x = o.x + Math.sin(t * 0.03 + o.p) * 16;
          g.fillStyle = i % 3 === 0 ? '#ffb3d1' : i % 3 === 1 ? '#fff0a0' : '#ffffff';
          g.save();
          g.translate(x, y);
          g.rotate(t * 0.04 + o.p);
          g.beginPath();
          g.ellipse(0, 0, 4, 2, 0, 0, 6.3);
          g.fill();
          g.restore();
        } else { // papillons
          const x = (o.x + t * 0.6 * o.s) % (w + 40) - 20;
          const y = h * 0.3 + (o.y % (h * 0.5)) + Math.sin(t * 0.05 + o.p) * 14;
          const flap = Math.abs(Math.sin(t * 0.3 + o.p));
          g.fillStyle = i % 2 ? '#ff9ad0' : '#ffd24a';
          g.beginPath();
          g.ellipse(x - 3, y, 4 * flap + 1, 4, 0, 0, 6.3);
          g.ellipse(x + 3, y, 4 * flap + 1, 4, 0, 0, 6.3);
          g.fill();
        }
      });
    } else if (id === 'forge') {
      g.save();
      g.globalAlpha = 0.18;
      g.strokeStyle = '#000';
      g.lineWidth = 6;
      [[140, 120, 70, 1], [820, 180, 90, -1], [500, 360, 55, 1]].forEach(([cx, cy, rad, d]) => { // engrenages
        g.save();
        g.translate(cx, cy);
        g.rotate(t * 0.006 * d);
        g.beginPath();
        g.arc(0, 0, rad, 0, 6.3);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * 6.283;
          g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
          g.lineTo(Math.cos(a) * (rad + 16), Math.sin(a) * (rad + 16));
        }
        g.stroke();
        g.restore();
      });
      g.restore();
      items.forEach((o) => { // braises
        const y = h - ((o.y * 2 + t * (0.5 + o.s * 0.6)) % (h + 20)) + 10;
        const x = o.x + Math.sin(t * 0.04 + o.p) * 10;
        g.fillStyle = `rgba(255,${120 + Math.floor(o.k * 100)},40,${0.35 + o.k * 0.5})`;
        g.fillRect(x, y, 2 + o.s, 2 + o.s);
      });
    } else if (id === 'mist') {
      items.forEach((o) => {
        g.fillStyle = 'rgba(220,235,245,.12)';
        const x = ((o.x + t * 0.3 * o.s) % (w + 500)) - 250;
        g.beginPath();
        g.ellipse(x, o.y, 220, 34, 0, 0, 6.3);
        g.fill();
      });
    }
  }

  // Brume légère devant les blocs (Brumes) / voile chaud (Forge)
  function drawFront(g, id, items, frame, w, h) {
    if (id === 'mist') {
      items.forEach((o, i) => {
        if (i % 2) return;
        g.fillStyle = 'rgba(235,245,250,.10)';
        const x = ((o.x * 1.7 - frame * 0.5 * o.s) % (w + 500) + w + 500) % (w + 500) - 250;
        g.beginPath();
        g.ellipse(x, o.y * 0.9 + 20, 260, 30, 0, 0, 6.3);
        g.fill();
      });
    }
  }

  window.Themes = { get, makeBackground, makeTiles, makeDecor, drawDecor, drawFront, rng };
})();

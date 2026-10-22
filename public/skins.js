// Apparences des personnages. Chaque skin se dessine dans une boîte de 24 x 28 pixels.
(function () {
  const W = 24;
  const H = 28;

  // Éclaircit (amt > 0) ou assombrit (amt < 0) une couleur #rrggbb
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16;
    let g = (n >> 8) & 255;
    let b = n & 255;
    const target = amt < 0 ? 0 : 255;
    const a = Math.abs(amt);
    r = Math.round(r + (target - r) * a);
    g = Math.round(g + (target - g) * a);
    b = Math.round(b + (target - b) * a);
    return `rgb(${r},${g},${b})`;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Deux yeux blancs avec pupille qui regarde dans la direction du déplacement
  function eyes(ctx, x, y, dir, ox = 5, oy = 7, size = 5) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + ox, y + oy, size, size);
    ctx.fillRect(x + W - ox - size, y + oy, size, size);
    ctx.fillStyle = '#16163a';
    const px = dir > 0 ? 2 : 0;
    ctx.fillRect(x + ox + px, y + oy + 2, 3, 3);
    ctx.fillRect(x + W - ox - size + px, y + oy + 2, 3, 3);
  }

  const DRAW = {
    classic(ctx, x, y, o) {
      ctx.fillStyle = o.color;
      ctx.fillRect(x, y, W, H);
      ctx.fillStyle = shade(o.color, -0.25);
      ctx.fillRect(x, y + H - 4, W, 4);
      eyes(ctx, x, y, o.dir);
    },

    knight(ctx, x, y, o) {
      ctx.fillStyle = '#9aa5b8';
      ctx.fillRect(x, y, W, H);
      ctx.fillStyle = o.color; // tabard
      ctx.fillRect(x + 8, y + 13, 8, 15);
      ctx.fillStyle = '#7b879c';
      ctx.fillRect(x, y + H - 5, W, 5);
      rr(ctx, x - 1, y - 2, W + 2, 15, 5); // casque
      ctx.fillStyle = '#b9c3d4';
      ctx.fill();
      ctx.fillStyle = '#1e2233'; // visière
      ctx.fillRect(x + 4, y + 5, 16, 3);
      ctx.fillRect(x + 11, y + 5, 2, 8);
      ctx.fillStyle = o.color; // plumet
      ctx.beginPath();
      ctx.moveTo(x + 10, y - 2);
      ctx.quadraticCurveTo(x + (o.dir > 0 ? 2 : 22), y - 14, x + (o.dir > 0 ? -2 : 26), y - 4 + Math.sin(o.t * 0.15) * 1.5);
      ctx.lineTo(x + 14, y - 2);
      ctx.fill();
    },

    ninja(ctx, x, y, o) {
      ctx.fillStyle = '#25253d';
      ctx.fillRect(x, y, W, H);
      ctx.fillStyle = '#1a1a2c';
      ctx.fillRect(x, y + 17, W, 11);
      ctx.fillStyle = '#f0d0b0'; // fente des yeux
      ctx.fillRect(x + 3, y + 8, 18, 6);
      eyes(ctx, x, y, o.dir, 5, 8, 4);
      ctx.fillStyle = o.color; // bandeau
      ctx.fillRect(x - 1, y + 3, W + 2, 4);
      const tail = o.dir > 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x + (o.dir > 0 ? 0 : W), y + 4);
      ctx.lineTo(x + (o.dir > 0 ? -9 : W + 9), y + 1 + Math.sin(o.t * 0.3) * 3 + tail);
      ctx.lineTo(x + (o.dir > 0 ? -7 : W + 7), y + 8 + Math.sin(o.t * 0.3 + 1) * 3);
      ctx.fill();
    },

    robot(ctx, x, y, o) {
      ctx.fillStyle = '#aab4c4';
      rr(ctx, x, y, W, H, 4);
      ctx.fill();
      ctx.fillStyle = '#7e8aa0';
      ctx.fillRect(x + 2, y + H - 6, W - 4, 6);
      ctx.fillStyle = '#10142a'; // écran
      rr(ctx, x + 3, y + 4, 18, 12, 3);
      ctx.fill();
      ctx.fillStyle = o.color;
      const blink = Math.floor(o.t / 90) % 4 === 0 && o.t % 90 < 6;
      const ex = o.dir > 0 ? 2 : 0;
      ctx.fillRect(x + 6 + ex, y + 7, 4, blink ? 1 : 6);
      ctx.fillRect(x + 14 + ex, y + 7, 4, blink ? 1 : 6);
      ctx.fillStyle = '#d6dcea'; // rivets
      [[2, 2], [W - 4, 2], [2, H - 4], [W - 4, H - 4]].forEach(([a, b]) => ctx.fillRect(x + a, y + b, 2, 2));
      ctx.fillStyle = '#7e8aa0'; // antenne
      ctx.fillRect(x + 11, y - 6, 2, 6);
      ctx.fillStyle = Math.floor(o.t / 20) % 2 ? o.color : shade(o.color, -0.5);
      ctx.beginPath();
      ctx.arc(x + 12, y - 7, 3, 0, Math.PI * 2);
      ctx.fill();
    },

    ghost(ctx, x, y, o) {
      const bob = Math.sin(o.t * 0.1) * 1.5;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#f4f4ff';
      ctx.beginPath();
      ctx.moveTo(x, y + H);
      ctx.lineTo(x, y + 9 + bob);
      ctx.quadraticCurveTo(x, y - 3 + bob, x + W / 2, y - 3 + bob);
      ctx.quadraticCurveTo(x + W, y - 3 + bob, x + W, y + 9 + bob);
      ctx.lineTo(x + W, y + H);
      for (let i = 4; i >= 0; i--) {
        ctx.lineTo(x + (i * W) / 4 + (i % 2 ? -3 : 0), y + H - (i % 2 ? 0 : 5) + Math.sin(o.t * 0.2 + i) * 1.5);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#16163a';
      const ex = o.dir > 0 ? 2 : 0;
      ctx.beginPath();
      ctx.ellipse(x + 8 + ex, y + 9 + bob, 2.6, 3.6, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 16 + ex, y + 9 + bob, 2.6, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = o.color;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.arc(x + 4.5, y + 14 + bob, 2.5, 0, Math.PI * 2);
      ctx.arc(x + 19.5, y + 14 + bob, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    },

    cat(ctx, x, y, o) {
      const wag = Math.sin(o.t * 0.2) * 5;
      ctx.strokeStyle = o.color; // queue
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const bx = o.dir > 0 ? x : x + W;
      ctx.moveTo(bx, y + 24);
      ctx.quadraticCurveTo(bx + (o.dir > 0 ? -12 : 12), y + 22, bx + (o.dir > 0 ? -9 : 9), y + 8 + wag);
      ctx.stroke();
      ctx.fillStyle = o.color;
      ctx.fillRect(x, y, W, H);
      ctx.beginPath(); // oreilles
      ctx.moveTo(x, y + 2); ctx.lineTo(x + 3, y - 9); ctx.lineTo(x + 10, y + 2);
      ctx.moveTo(x + W, y + 2); ctx.lineTo(x + W - 3, y - 9); ctx.lineTo(x + W - 10, y + 2);
      ctx.fill();
      ctx.fillStyle = shade(o.color, 0.5);
      ctx.fillRect(x + 7, y + 17, 10, 11);
      ctx.fillStyle = '#e8f56a';
      ctx.fillRect(x + 4, y + 7, 6, 6);
      ctx.fillRect(x + 14, y + 7, 6, 6);
      ctx.fillStyle = '#16163a';
      const ex = o.dir > 0 ? 1 : 0;
      ctx.fillRect(x + 6 + ex, y + 7, 2, 6);
      ctx.fillRect(x + 16 + ex, y + 7, 2, 6);
      ctx.fillStyle = '#f08a9a';
      ctx.fillRect(x + 11, y + 14, 3, 2);
      ctx.strokeStyle = '#16163a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      [[-5, 0], [-5, 3]].forEach(([dx, dy]) => { ctx.moveTo(x + 5, y + 15 + dy); ctx.lineTo(x + dx - 2, y + 14 + dy * 2); });
      [[29, 0], [29, 3]].forEach(([dx, dy]) => { ctx.moveTo(x + 19, y + 15 + dy); ctx.lineTo(x + dx - 2, y + 14 + dy * 2); });
      ctx.stroke();
    },

    astro(ctx, x, y, o) {
      ctx.fillStyle = '#c9ceda'; // sac à dos
      ctx.fillRect(o.dir > 0 ? x - 4 : x + W, y + 8, 4, 14);
      ctx.fillStyle = '#f4f6fb';
      ctx.fillRect(x, y, W, H);
      ctx.fillStyle = '#d3d8e6';
      ctx.fillRect(x, y + H - 5, W, 5);
      ctx.fillStyle = o.color; // écusson
      ctx.fillRect(x + 14, y + 19, 6, 4);
      const g = ctx.createLinearGradient(x, y + 3, x + W, y + 16);
      g.addColorStop(0, '#26347a');
      g.addColorStop(1, '#0c1233');
      ctx.fillStyle = g;
      rr(ctx, x + 2, y + 2, W - 4, 15, 6);
      ctx.fill();
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(x + 5, y + 5, 5, 2);
      ctx.fillStyle = '#fff';
      const ex = o.dir > 0 ? 2 : 0;
      ctx.fillRect(x + 7 + ex, y + 9, 3, 4);
      ctx.fillRect(x + 14 + ex, y + 9, 3, 4);
    },

    pirate(ctx, x, y, o) {
      ctx.fillStyle = o.color;
      ctx.fillRect(x, y, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.75)'; // marinière
      for (let i = 0; i < 3; i++) ctx.fillRect(x, y + 16 + i * 4, W, 2);
      ctx.fillStyle = '#e03a3a'; // bandana
      ctx.fillRect(x - 1, y - 1, W + 2, 7);
      ctx.beginPath();
      ctx.moveTo(o.dir > 0 ? x : x + W, y + 2);
      ctx.lineTo(o.dir > 0 ? x - 7 : x + W + 7, y + 7 + Math.sin(o.t * 0.25) * 2);
      ctx.lineTo(o.dir > 0 ? x - 1 : x + W + 1, y + 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 4, y + 8, 5, 5);
      ctx.fillRect(x + 15, y + 8, 5, 5);
      ctx.fillStyle = '#16163a';
      ctx.fillRect(x + 4 + (o.dir > 0 ? 2 : 0), y + 10, 3, 3);
      ctx.fillRect(x + 14, y + 7, 7, 7); // cache-œil
      ctx.fillRect(x, y + 7, W, 1);
      ctx.fillRect(x + 8, y + 18, 8, 2); // sourire
    },

    wizard(ctx, x, y, o) {
      ctx.fillStyle = o.color;
      ctx.fillRect(x, y, W, H);
      ctx.fillStyle = '#f2f2f8'; // barbe
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 13); ctx.lineTo(x + W - 2, y + 13); ctx.lineTo(x + W / 2, y + 28);
      ctx.fill();
      eyes(ctx, x, y, o.dir, 5, 7, 4);
      ctx.fillStyle = shade(o.color, -0.45); // chapeau pointu
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + W + 4, y + 4);
      ctx.lineTo(x + W / 2 + 3 + Math.sin(o.t * 0.08) * 1.5, y - 18);
      ctx.lineTo(x + W / 2 - 3, y - 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(x + 1, y + 1, W - 2, 3);
      const tw = Math.floor(o.t / 15) % 2 ? 3 : 2;
      ctx.fillRect(x + 9, y - 8, tw, tw);
    },

    dino(ctx, x, y, o) {
      const green = shade(o.color, -0.05);
      ctx.fillStyle = green;
      const tx = o.dir > 0 ? x - 8 : x + W;
      ctx.beginPath(); // queue
      ctx.moveTo(o.dir > 0 ? x : x + W, y + 16);
      ctx.lineTo(tx, y + 24 + Math.sin(o.t * 0.2) * 2);
      ctx.lineTo(o.dir > 0 ? x : x + W, y + 26);
      ctx.fill();
      ctx.fillRect(x, y, W, H);
      ctx.fillStyle = shade(o.color, 0.45);
      ctx.fillRect(x + 6, y + 15, 14, 13);
      ctx.fillStyle = shade(o.color, -0.35);
      for (let i = 0; i < 4; i++) { // crête
        const px = o.dir > 0 ? x + 2 + i * 5 : x + W - 2 - i * 5;
        ctx.beginPath();
        ctx.moveTo(px - 3, y); ctx.lineTo(px, y - 7); ctx.lineTo(px + 3, y);
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 12, y + 5, 7, 7);
      ctx.fillStyle = '#16163a';
      ctx.fillRect(x + 15 + (o.dir > 0 ? 1 : -2), y + 7, 3, 4);
      ctx.fillRect(x + 20, y + 14, 3, 2);
    },

    pumpkin(ctx, x, y, o) {
      ctx.fillStyle = '#f08a1c';
      ctx.beginPath();
      ctx.ellipse(x + W / 2, y + 15, 13, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c4620a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + W / 2, y + 2); ctx.quadraticCurveTo(x + 4, y + 15, x + W / 2, y + 28);
      ctx.moveTo(x + W / 2, y + 2); ctx.quadraticCurveTo(x + W - 4, y + 15, x + W / 2, y + 28);
      ctx.stroke();
      ctx.fillStyle = '#4a8a2a'; // tige
      ctx.fillRect(x + 10, y - 4, 4, 6);
      ctx.fillStyle = o.color; // écharpe
      ctx.fillRect(x + 3, y + 22, 18, 3);
      ctx.fillStyle = '#ffe36a'; // visage taillé
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 12); ctx.lineTo(x + 10, y + 12); ctx.lineTo(x + 7.5, y + 7);
      ctx.moveTo(x + 14, y + 12); ctx.lineTo(x + 19, y + 12); ctx.lineTo(x + 16.5, y + 7);
      ctx.fill();
      ctx.fillRect(x + 6, y + 16, 12, 3);
      ctx.fillStyle = '#c4620a';
      ctx.fillRect(x + 9, y + 16, 2, 3);
      ctx.fillRect(x + 14, y + 16, 2, 3);
    },

    frog(ctx, x, y, o) {
      ctx.fillStyle = '#58b868';
      rr(ctx, x, y + 3, W, H - 3, 6);
      ctx.fill();
      ctx.fillStyle = '#b8f0b8';
      ctx.fillRect(x + 5, y + 17, 14, 11);
      ctx.fillStyle = '#fff'; // yeux globuleux
      ctx.beginPath();
      ctx.arc(x + 6, y + 3, 5.5, 0, Math.PI * 2);
      ctx.arc(x + W - 6, y + 3, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16163a';
      ctx.beginPath();
      ctx.arc(x + 6 + (o.dir > 0 ? 1.5 : -1.5), y + 3, 2.5, 0, Math.PI * 2);
      ctx.arc(x + W - 6 + (o.dir > 0 ? 1.5 : -1.5), y + 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2d6a3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + W / 2, y + 13, 7, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = o.color; // tache
      ctx.fillRect(x + 9, y + 8, 6, 3);
    },
  };

  const NAMES = {
    classic: 'Classique', knight: 'Chevalier', ninja: 'Ninja', robot: 'Robot', ghost: 'Fantôme', cat: 'Chat',
    astro: 'Astronaute', pirate: 'Pirate', wizard: 'Sorcier', dino: 'Dino', pumpkin: 'Citrouille', frog: 'Grenouille',
  };
  const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e', '#94a3b8'];

  window.Skins = {
    ids: Object.keys(DRAW),
    names: NAMES,
    colors: COLORS,
    W,
    H,
    shade,
    // o : { dir, color, t }
    draw(ctx, id, x, y, o) {
      (DRAW[id] || DRAW.classic)(ctx, x, y, { dir: o.dir || 1, color: o.color || '#3b82f6', t: o.t || 0 });
    },
  };
})();

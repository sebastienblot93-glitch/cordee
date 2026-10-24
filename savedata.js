// Format et fusion des données de progression (records, étoiles, niveau atteint).
// Ce fichier est utilisé tel quel par le serveur ET par le navigateur : la fusion est donc identique des deux côtés.
// Règle : on garde toujours le meilleur de deux sauvegardes, donc fusionner deux fois la même chose ne change rien.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaveData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_LEVELS = 200;
  const MAX_NAME = 60;

  const blank = () => ({ v: 1, best: {}, stars: {}, furthest: -1, fat: 0, tut: 0, stats: { days: {}, fails: {} } });
  const MAX_DAYS = 500;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const sorted = (o) => Object.keys(o).sort().reduce((r, k) => { r[k] = o[k]; return r; }, {});
  const int = (x, lo, hi, def) => {
    const n = Math.round(Number(x));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
  };
  const okName = (n) => typeof n === 'string' && n.length > 0 && n.length <= MAX_NAME && n !== '__proto__' && n !== 'constructor' && n !== 'prototype';

  // Nettoie une sauvegarde reçue (fichier importé, requête réseau…) : renvoie toujours un objet propre
  function sanitize(o) {
    const out = blank();
    if (!o || typeof o !== 'object' || o.v !== 1) return out;
    let count = 0;
    Object.keys(o.best && typeof o.best === 'object' ? o.best : {}).forEach((name) => {
      const b = o.best[name];
      if (!okName(name) || !b || typeof b !== 'object' || count >= MAX_LEVELS) return;
      count++;
      const t = Number(b.t);
      out.best[name] = {
        t: Number.isFinite(t) && t > 0 && t < 100000 ? Math.round(t * 10) / 10 : null,
        m: int(b.m, 0, 4, 0),
        nd: !!b.nd,
        nh: !!b.nh,
        p: !!b.p,
        n: int(b.n, 0, 1e6, 0),
        at: int(b.at, 0, 8.64e15, 0),
      };
    });
    count = 0;
    Object.keys(o.stars && typeof o.stars === 'object' ? o.stars : {}).forEach((name) => {
      if (!okName(name) || !o.stars[name] || count >= MAX_LEVELS) return;
      count++;
      out.stars[name] = 1;
    });
    out.furthest = int(o.furthest, -1, MAX_LEVELS, -1);
    out.fat = int(o.fat, 0, 8.64e15, 0);
    out.tut = o.tut ? 1 : 0; // tutoriel terminé (ou passé) par ce duo
    // Statistiques : s = secondes jouées ce jour-là, d = chutes ; fails = chutes par niveau
    const st = o.stats && typeof o.stats === 'object' ? o.stats : {};
    const days = st.days && typeof st.days === 'object' ? st.days : {};
    count = 0;
    Object.keys(days).sort().reverse().forEach((k) => {
      const d = days[k];
      if (!DAY_RE.test(k) || !d || typeof d !== 'object' || count >= MAX_DAYS) return;
      count++;
      out.stats.days[k] = { s: int(d.s, 0, 86400, 0), d: int(d.d, 0, 1e5, 0) };
    });
    out.stats.days = sorted(out.stats.days);
    const fails = st.fails && typeof st.fails === 'object' ? st.fails : {};
    count = 0;
    Object.keys(fails).forEach((k) => {
      if (!okName(k) || count >= MAX_LEVELS) return;
      count++;
      out.stats.fails[k] = int(fails[k], 0, 1e6, 0);
    });
    out.stats.fails = sorted(out.stats.fails);
    return out;
  }

  // Fusionne deux sauvegardes (a et b sont déjà propres) et renvoie une nouvelle sauvegarde
  function merge(a, b) {
    const out = blank();
    const names = new Set([...Object.keys(a.best), ...Object.keys(b.best)]);
    names.forEach((name) => {
      const x = a.best[name];
      const y = b.best[name];
      if (!x || !y) { out.best[name] = Object.assign({}, x || y); return; }
      const ts = [x.t, y.t].filter((v) => typeof v === 'number');
      out.best[name] = {
        t: ts.length ? Math.min(...ts) : null,
        m: Math.max(x.m, y.m),
        nd: x.nd || y.nd,
        nh: x.nh || y.nh,
        p: x.p || y.p,
        n: Math.max(x.n, y.n), // même partie enregistrée par les deux joueurs : on ne la compte qu'une fois
        at: Math.max(x.at, y.at),
      };
    });
    // Statistiques : le plus grand des deux (les deux joueurs enregistrent la même partie, on ne la compte qu'une fois)
    const mx = (x, y, f) => {
      const r = {};
      new Set([...Object.keys(x), ...Object.keys(y)]).forEach((k) => { r[k] = f(x[k], y[k]); });
      return sorted(r);
    };
    out.stats.days = mx(a.stats.days, b.stats.days, (p, q) => (p && q ? { s: Math.max(p.s, q.s), d: Math.max(p.d, q.d) } : Object.assign({}, p || q)));
    out.stats.fails = mx(a.stats.fails, b.stats.fails, (p, q) => Math.max(p || 0, q || 0));
    out.tut = a.tut || b.tut ? 1 : 0;
    Object.keys(a.stars).forEach((n) => { out.stars[n] = 1; });
    Object.keys(b.stars).forEach((n) => { out.stars[n] = 1; });
    // « Niveau atteint » : c'est la modification la plus récente qui gagne (permet aussi de l'effacer)
    if (a.fat !== b.fat) {
      const w = a.fat > b.fat ? a : b;
      out.furthest = w.furthest;
      out.fat = w.fat;
    } else {
      out.furthest = Math.max(a.furthest, b.furthest);
      out.fat = a.fat;
    }
    return out;
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  return { blank, sanitize, merge, same };
});

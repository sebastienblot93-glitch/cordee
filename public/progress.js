// Progression : médailles, records, étoiles, écran de fin de niveau et reprise de partie.
// Tout est enregistré dans le navigateur (localStorage) : les données restent là d'une session à l'autre,
// tant que les données du site ne sont pas effacées. Un export / import (fichier) permet de les sauvegarder ailleurs.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'cordee.save.v1';
  const MEDALS = {
    gold: { name: 'Or', emoji: '🥇', rank: 3 },
    silver: { name: 'Argent', emoji: '🥈', rank: 2 },
    bronze: { name: 'Bronze', emoji: '🥉', rank: 1 },
  };
  const RANK_MEDAL = [null, 'bronze', 'silver', 'gold'];
  // Titres débloqués avec les étoiles
  const TITLES = [[0, 'Promeneur'], [3, 'Randonneur'], [8, 'Éclaireur'], [14, 'Grimpeur'], [20, 'Alpiniste'], [26, 'Maître de cordée'], [30, 'Étoile du Sommet']];

  /* ---------- Sauvegarde ---------- */
  const blank = () => ({ v: 1, best: {}, stars: {}, furthest: -1 });
  let data = blank();
  function load() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY));
      if (j && j.v === 1) data = Object.assign(blank(), j, { best: j.best || {}, stars: j.stars || {} });
    } catch { /* ignore */ }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }
  load();

  // Fusionne une sauvegarde importée avec la sauvegarde actuelle : on garde le meilleur des deux
  function merge(o) {
    if (!o || o.v !== 1 || typeof o !== 'object') return false;
    Object.entries(o.best || {}).forEach(([name, b]) => {
      if (!b || typeof b !== 'object') return;
      const a = data.best[name];
      if (!a) { data.best[name] = b; return; }
      const t = [a.t, b.t].filter((x) => typeof x === 'number');
      data.best[name] = {
        t: t.length ? Math.min(...t) : null,
        m: Math.max(a.m || 0, b.m || 0), nd: !!(a.nd || b.nd), nh: !!(a.nh || b.nh), p: !!(a.p || b.p),
        n: (a.n || 0) + (b.n || 0), at: Math.max(a.at || 0, b.at || 0),
      };
    });
    Object.keys(o.stars || {}).forEach((n) => { data.stars[n] = 1; });
    if (typeof o.furthest === 'number') data.furthest = Math.max(data.furthest, o.furthest);
    persist();
    return true;
  }

  /* ---------- Catalogue des niveaux (noms, chapitres, seuils de médailles) ---------- */
  let catalog = { levels: [], chapters: [] };
  let cur = null; // niveau en cours : { index, name, gold, silver, timer, star, help }
  function fetchCatalog() {
    fetch('/api/levels', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { catalog = j; renderAll(); askResume(); })
      .catch(() => { setTimeout(fetchCatalog, 4000); });
  }

  /* ---------- Outils ---------- */
  const r1 = (x) => Math.round(x * 10) / 10;
  function fmt(sec, dec) {
    if (sec == null) return '—';
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${(dec ? s.toFixed(1) : String(Math.floor(s))).padStart(dec ? 4 : 2, '0')}`;
  }
  function medalFor(sec, gold, silver) {
    return sec <= gold ? 'gold' : sec <= silver ? 'silver' : 'bronze';
  }
  function titleFor(n) {
    let t = TITLES[0][1];
    TITLES.forEach(([k, name]) => { if (n >= k) t = name; });
    return t;
  }
  const starCount = () => Object.keys(data.stars).length;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  /* ---------- Panneau des records ---------- */
  function renderRecords(root) {
    root.innerHTML = '';
    const lv = catalog.levels;
    if (!lv.length) { root.append(el('p', 'side-empty', 'Chargement…')); return; }
    const done = lv.filter((l) => data.best[l.name] && data.best[l.name].t != null);
    const cnt = { 3: 0, 2: 0, 1: 0 };
    done.forEach((l) => { cnt[data.best[l.name].m || 1]++; });
    const total = done.reduce((s, l) => s + data.best[l.name].t, 0);
    const head = el('div', 'side-sum');
    head.append(el('div', 'sum-medals', `🥇 ${cnt[3]}   🥈 ${cnt[2]}   🥉 ${cnt[1]}`));
    head.append(el('div', 'sum-line', `${done.length}/${lv.length} niveaux terminés${done.length ? ` · temps cumulé ${fmt(total, true)}` : ''}`));
    root.append(head);
    let lastCh = -1;
    let box = null;
    lv.forEach((l, i) => {
      if (l.chapter !== lastCh) {
        lastCh = l.chapter;
        root.append(el('div', 'side-ch', `${l.chapter + 1}. ${(catalog.chapters[l.chapter] || {}).name || ''}`));
        box = el('div', 'side-list');
        root.append(box);
      }
      const b = data.best[l.name];
      const row = el('div', `rec-row${cur && cur.name === l.name ? ' cur' : ''}${b ? ' done' : ''}`);
      row.title = `${l.name}\n🥇 ≤ ${fmt(l.gold)} · 🥈 ≤ ${fmt(l.silver)} · chrono ${fmt(l.timer)}`;
      row.append(el('span', 'rec-medal', b ? MEDALS[RANK_MEDAL[b.m || 1]].emoji : '·'));
      row.append(el('span', 'rec-name', `${i + 1}. ${l.name}`));
      row.append(el('span', 'rec-time', b && b.t != null ? fmt(b.t, true) : `🥇 ${fmt(l.gold)}`));
      const flags = el('span', 'rec-flags');
      const f1 = el('span', b && b.nd ? 'on' : '', '❤');
      f1.title = 'Sans chute';
      const f2 = el('span', b && b.nh ? 'on' : '', '🧠');
      f2.title = 'Sans indice';
      flags.append(f1, f2);
      row.append(flags);
      box.append(row);
    });
    const leg = el('p', 'side-legend', '❤ sans chute · 🧠 sans indice · l’or se joue au temps affiché');
    root.append(leg);
    root.append(saveButtons());
  }

  /* ---------- Panneau des étoiles ---------- */
  function renderStars(root) {
    root.innerHTML = '';
    const lv = catalog.levels;
    if (!lv.length) { root.append(el('p', 'side-empty', 'Chargement…')); return; }
    const n = starCount();
    const head = el('div', 'side-sum');
    head.append(el('div', 'sum-medals', `★ ${n} / ${lv.length}`));
    const bar = el('div', 'star-bar');
    const fill = el('i');
    fill.style.width = `${Math.round((n / lv.length) * 100)}%`;
    bar.append(fill);
    head.append(bar);
    head.append(el('div', 'sum-line', `Titre : ${titleFor(n)}`));
    root.append(head);
    root.append(el('p', 'side-legend', 'Chaque niveau cache une étoile, hors du chemin. Elle compte dès que tu la touches.'));
    let lastCh = -1;
    let box = null;
    lv.forEach((l) => {
      if (l.chapter !== lastCh) {
        lastCh = l.chapter;
        root.append(el('div', 'side-ch', `${l.chapter + 1}. ${(catalog.chapters[l.chapter] || {}).name || ''}`));
        box = el('div', 'star-grid');
        root.append(box);
      }
      const found = !!data.stars[l.name];
      const chip = el('span', `star-chip${found ? ' found' : ''}${cur && cur.name === l.name ? ' cur' : ''}`, `${found ? '★' : '☆'} ${l.name}`);
      chip.title = found ? 'Étoile trouvée !' : 'Étoile à trouver dans ce niveau';
      box.append(chip);
    });
    root.append(saveButtons());
  }

  function saveButtons() {
    const box = el('div', 'side-save');
    const ex = el('button', 'ghost mini', 'Exporter');
    ex.type = 'button';
    ex.title = 'Télécharge un fichier avec tes records et tes étoiles (à garder en lieu sûr)';
    ex.onclick = exportSave;
    const im = el('button', 'ghost mini', 'Importer');
    im.type = 'button';
    im.title = 'Recharge un fichier exporté (fusionné avec ce que tu as déjà)';
    im.onclick = () => $('save-file').click();
    box.append(ex, im);
    return box;
  }
  function exportSave() {
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cordee-sauvegarde.json';
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importSave(file) {
    const rd = new FileReader();
    rd.onload = () => {
      let ok = false;
      try { ok = merge(JSON.parse(String(rd.result))); } catch { ok = false; }
      renderAll();
      hooks.toast(ok ? 'Sauvegarde importée !' : 'Fichier de sauvegarde invalide.');
    };
    rd.readAsText(file);
  }

  function renderAll() {
    renderRecords($('records-body'));
    renderStars($('stars-body'));
    if ($('panel-modal').classList.contains('show')) {
      renderRecords($('modal-records'));
      renderStars($('modal-stars'));
    }
  }

  /* ---------- Fenêtre « Records / Étoiles » (écrans étroits) ---------- */
  function openModal(tab) {
    renderRecords($('modal-records'));
    renderStars($('modal-stars'));
    $('panel-modal').classList.add('show');
    showTab(tab || 'records');
  }
  function showTab(tab) {
    $('modal-records').style.display = tab === 'records' ? '' : 'none';
    $('modal-stars').style.display = tab === 'stars' ? '' : 'none';
    $('tab-records').classList.toggle('on', tab === 'records');
    $('tab-stars').classList.toggle('on', tab === 'stars');
  }
  $('btn-records').onclick = () => openModal('records');
  $('btn-stars').onclick = () => openModal('stars');
  $('tab-records').onclick = () => showTab('records');
  $('tab-stars').onclick = () => showTab('stars');
  $('modal-close').onclick = () => $('panel-modal').classList.remove('show');
  $('panel-modal').addEventListener('mousedown', (e) => { if (e.target === $('panel-modal')) $('panel-modal').classList.remove('show'); });
  $('save-file').onchange = (e) => { if (e.target.files[0]) importSave(e.target.files[0]); e.target.value = ''; };

  /* ---------- Reprise de partie ---------- */
  let askedResume = false;
  let pendingResume = null;
  function askResume() {
    if (askedResume) return;
    askedResume = true;
    if (data.furthest < 1) return;
    const l = catalog.levels[data.furthest];
    if (!l) { askedResume = false; return; }
    const chap = (catalog.chapters[l.chapter] || {}).name || '';
    $('resume-text').textContent = `Dernier niveau atteint : ${data.furthest + 1}. ${l.name} (${chap}).`;
    $('btn-resume-yes').textContent = `Reprendre au niveau ${data.furthest + 1}`;
    $('resume').classList.add('show');
  }
  $('btn-resume-yes').onclick = () => {
    pendingResume = data.furthest;
    $('resume').classList.remove('show');
    hooks.toast(`Reprise : le niveau ${pendingResume + 1} sera présélectionné dans le salon.`);
  };
  $('btn-resume-no').onclick = () => {
    data.furthest = -1; // on ne veut pas reprendre : la sauvegarde de progression est supprimée (records et étoiles restent)
    persist();
    pendingResume = null;
    $('resume').classList.remove('show');
  };

  /* ---------- Écran de fin de niveau ---------- */
  let resultTimer = null;
  let resultAt = 0;
  const RESULT_MS = 15000;
  function hideResult() {
    $('result').classList.remove('show');
    clearInterval(resultTimer);
  }

  function showResult(res, finished, isHost) {
    const l = cur;
    const box = $('result');
    const sec = res.time / 60;
    const skipped = !!res.skipped;
    let medal = null;
    let info = null;
    if (!skipped && l) {
      medal = medalFor(sec, l.gold, l.silver);
      const noDeath = res.deaths === 0;
      const noHelp = !l.help;
      const b = data.best[l.name];
      const prev = b && b.t != null ? b.t : null;
      const newBest = prev === null || sec < prev - 0.001;
      const nb = Object.assign({ t: null, m: 0, nd: false, nh: false, p: false, n: 0 }, b || {});
      if (newBest) { nb.t = r1(sec); nb.at = Date.now(); }
      nb.m = Math.max(nb.m, MEDALS[medal].rank);
      nb.nd = nb.nd || noDeath;
      nb.nh = nb.nh || noHelp;
      nb.p = nb.p || (medal === 'gold' && noDeath && noHelp);
      nb.n++;
      data.best[l.name] = nb;
      persist();
      info = { prev, newBest, noDeath, noHelp };
    }
    if (finished) { data.furthest = -1; persist(); } // partie terminée : plus rien à reprendre
    renderAll();

    $('res-title').textContent = finished ? 'Bravo, vous avez terminé tous les niveaux !' : skipped ? 'Niveau passé' : 'Niveau réussi !';
    const medalEl = $('res-medal');
    medalEl.className = `medal ${medal || 'none'}`;
    medalEl.textContent = medal ? MEDALS[medal].emoji : '➜';
    $('res-medal-name').textContent = medal ? `Médaille ${MEDALS[medal].name.toLowerCase()}` : 'Passé par le chef de room : pas de record';
    $('res-time').textContent = fmt(sec, true);
    const sub = $('res-sub');
    sub.textContent = '';
    if (info) {
      if (info.newBest && info.prev !== null) sub.textContent = `Nouveau record ! (avant : ${fmt(info.prev, true)})`;
      else if (info.newBest) sub.textContent = 'Premier record enregistré !';
      else sub.textContent = `Record : ${fmt(info.prev, true)}`;
      sub.className = info.newBest ? 'new' : '';
    }
    // objectif suivant
    const goal = $('res-goal');
    if (info && l) {
      if (medal === 'bronze') goal.textContent = `Argent à ≤ ${fmt(l.silver)} · or à ≤ ${fmt(l.gold)}`;
      else if (medal === 'silver') goal.textContent = `Il vous manquait ${r1(sec - l.gold)} s pour l’or (≤ ${fmt(l.gold)})`;
      else goal.textContent = 'Temps d’or !';
    } else goal.textContent = '';
    const badges = $('res-badges');
    badges.innerHTML = '';
    if (info) {
      const add = (ok, yes, no) => badges.append(el('li', ok ? 'ok' : 'ko', ok ? yes : no));
      add(info.noDeath, '❤ Sans chute', `✗ ${res.deaths} chute${res.deaths > 1 ? 's' : ''}`);
      add(info.noHelp, '🧠 Sans indice', '✗ Indice consulté');
      if (l.star) add(res.star, '★ Étoile trouvée', '☆ Étoile manquée');
    }
    $('res-total').textContent = '';
    if (finished) {
      const cnt = { 3: 0, 2: 0, 1: 0 };
      catalog.levels.forEach((x) => { const b = data.best[x.name]; if (b) cnt[b.m || 1]++; });
      $('res-total').textContent = `Médailles : 🥇 ${cnt[3]}  🥈 ${cnt[2]}  🥉 ${cnt[1]} · Étoiles : ★ ${starCount()}/${catalog.levels.length} (${titleFor(starCount())})`;
    }
    $('res-replay').style.display = isHost ? '' : 'none';
    $('res-next').style.display = isHost ? '' : 'none';
    $('res-next').textContent = finished ? 'Retour au salon (N)' : 'Niveau suivant (N)';
    $('res-guest').style.display = isHost ? 'none' : '';
    resultAt = performance.now();
    const tick = () => {
      const left = Math.max(0, Math.ceil((RESULT_MS - (performance.now() - resultAt)) / 1000));
      $('res-wait').textContent = finished ? `Retour au salon dans ${left} s` : `Niveau suivant dans ${left} s`;
    };
    tick();
    clearInterval(resultTimer);
    resultTimer = setInterval(tick, 250);
    box.classList.remove('show');
    void box.offsetWidth; // relance l'animation
    box.classList.add('show');
    return medal;
  }
  $('res-replay').onclick = () => hooks.replay();
  $('res-next').onclick = () => hooks.next();

  /* ---------- Interface pour client.js ---------- */
  const hooks = { toast() {}, replay() {}, next() {} };
  window.Progress = {
    setHooks(h) { Object.assign(hooks, h); },
    fmt,
    // Début (ou redémarrage) d'un niveau
    onStart(msg) {
      cur = { index: msg.index, name: msg.name, gold: msg.gold, silver: msg.silver, timer: msg.timer, star: !!msg.star, help: false };
      if (msg.index > data.furthest) { data.furthest = msg.index; persist(); }
      hideResult();
      renderAll();
    },
    noteHelp() { if (cur) cur.help = true; },
    hasHelp: () => !!(cur && cur.help),
    // Médaille que l'on aurait en finissant maintenant (temps écoulé en secondes)
    tier(elapsed) {
      if (!cur || !cur.gold) return null;
      return medalFor(elapsed, cur.gold, cur.silver);
    },
    goldAt: () => (cur ? cur.gold : 0),
    silverAt: () => (cur ? cur.silver : 0),
    onStar(name) {
      const first = !data.stars[name];
      data.stars[name] = 1;
      persist();
      renderAll();
      return first;
    },
    hasStar: (name) => !!data.stars[name],
    starTotal: starCount,
    onResult: showResult,
    hideResult,
    takeResume() { const r = pendingResume; pendingResume = null; return r; },
    peekResume: () => pendingResume,
  };

  fetchCatalog();
  renderAll();
})();

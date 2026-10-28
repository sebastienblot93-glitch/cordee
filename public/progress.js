// Progression : médailles, records, étoiles, écran de fin de niveau et reprise de partie.
// Les données sont gardées dans le navigateur (localStorage) ET, si un « code d'équipe » est saisi, sur le serveur
// (base gratuite Upstash) : on retrouve alors records, étoiles et niveau atteint d'une session à l'autre et d'un ordinateur à l'autre.
// Un export / import (fichier) reste possible en secours.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'cordee.save.v1';
  const MEDALS = {
    diamond: { name: 'Diamant', emoji: '💎', rank: 4 },
    gold: { name: 'Or', emoji: '🥇', rank: 3 },
    silver: { name: 'Argent', emoji: '🥈', rank: 2 },
    bronze: { name: 'Bronze', emoji: '🥉', rank: 1 },
  };
  const RANK_MEDAL = [null, 'bronze', 'silver', 'gold', 'diamond'];
  // Titres débloqués avec les étoiles
  const TITLES = [[0, 'Promeneur'], [3, 'Randonneur'], [8, 'Éclaireur'], [14, 'Grimpeur'], [20, 'Alpiniste'], [26, 'Maître de cordée'], [30, 'Étoile du Sommet'], [34, 'Briseur de Citadelle']];

  /* ---------- Sauvegarde ---------- */
  const SD = window.SaveData;
  const TEAM_KEY = 'cordee.team';
  // Chaque code d'équipe a sa propre sauvegarde : records, étoiles et reprise ne se mélangent jamais d'un code à l'autre.
  // Sans code, on utilise la sauvegarde « de ce navigateur » (clé d'origine).
  let team = '';
  try { team = localStorage.getItem(TEAM_KEY) || ''; } catch { /* ignore */ }
  const keyFor = (t) => (t ? `${KEY}.${t}` : KEY);
  function loadLocal(t) {
    try {
      const j = JSON.parse(localStorage.getItem(keyFor(t)));
      if (j) return SD.sanitize(j);
    } catch { /* ignore */ }
    return SD.blank();
  }
  let data = loadLocal(team);
  function saveLocal() {
    try { localStorage.setItem(keyFor(team), JSON.stringify(data)); } catch { /* ignore */ }
  }
  function persist() {
    saveLocal();
    schedulePush();
  }
  function setFurthest(v) {
    data.furthest = v;
    data.fat = Date.now();
  }

  // Fusionne une sauvegarde (fichier importé, copie du serveur) avec la sauvegarde actuelle : on garde le meilleur des deux
  function merge(o, quiet) {
    if (!o || typeof o !== 'object' || o.v !== 1) return false;
    const m = SD.merge(data, SD.sanitize(o));
    const changed = !SD.same(m, data);
    data = m;
    if (changed) { if (quiet) saveLocal(); else persist(); }
    return true;
  }

  /* ---------- Sauvegarde en ligne (code d'équipe) ---------- */
  const TEAM_RE = /^[a-z0-9_-]{6,48}$/;
  // état : off (pas de code) | sync (en cours) | ok | error ; durable : la base du serveur est configurée
  const net = { state: team ? 'sync' : 'off', durable: null, err: '', bad: '' };
  let pushTimer = null;
  let retryTimer = null;
  let inflight = false;
  let dirty = false;
  let firstSync = !team; // la première synchronisation (réussie ou non) a eu lieu
  function describeNet() {
    const n = Object.keys(data.best).filter((k) => data.best[k].t != null).length;
    const stars = Object.keys(data.stars).length;
    if (net.bad) return { cls: 'bad', text: net.bad };
    if (net.state === 'off') {
      if (net.durable === false) return { cls: 'warn', text: 'Sauvegarde en ligne non activée sur ce serveur : vos données restent dans ce navigateur.' };
      return { cls: '', text: 'Tapez le même code sur chaque ordinateur : records, étoiles et niveau atteint se retrouvent à chaque session.' };
    }
    if (net.state === 'sync') return { cls: '', text: `☁ Synchronisation du code « ${team} »…` };
    if (net.state === 'error') return { cls: 'bad', text: `☁ ${net.err || 'Serveur indisponible.'} Vos données restent dans ce navigateur et seront envoyées dès que possible.` };
    if (net.durable === false) return { cls: 'warn', text: `⚠ Code « ${team} » reconnu, mais le serveur n’a pas de base de données configurée : les données risquent d’être perdues au prochain redémarrage du serveur.` };
    return { cls: 'ok', text: `☁ Sauvegarde en ligne active (« ${team} ») · ${n} niveau${n > 1 ? 'x' : ''} terminé${n > 1 ? 's' : ''}, ★ ${stars}.` };
  }
  function renderNet() {
    const d = describeNet();
    const st = $('team-status');
    if (st) { st.className = `team-status ${d.cls}`; st.textContent = d.text; }
    document.querySelectorAll('.sync-line').forEach((e) => {
      e.className = `sync-line ${d.cls}`;
      e.textContent = net.state === 'off' ? 'Sauvegarde : ce navigateur seulement' : net.state === 'ok' && net.durable !== false ? '☁ Sauvegarde en ligne active' : net.state === 'sync' ? '☁ Synchronisation…' : net.state === 'ok' ? '⚠ Base du serveur non configurée' : '☁ Hors ligne, envoi plus tard';
    });
  }
  function schedulePush() {
    if (!team) return;
    dirty = true;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(sync, 1200);
  }
  // Envoie notre copie au serveur, qui la fusionne avec la sienne et renvoie le résultat (même requête pour lire et écrire)
  function sync() {
    if (!team) { firstSync = true; tryAskResume(); return Promise.resolve(); }
    if (inflight) { dirty = true; return Promise.resolve(); }
    inflight = true;
    dirty = false;
    clearTimeout(retryTimer);
    if (net.state !== 'ok') { net.state = 'sync'; renderNet(); }
    const reqTeam = team;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const to = setTimeout(() => ctl && ctl.abort(), 12000);
    return fetch(`/api/team/${encodeURIComponent(team)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ data }), signal: ctl ? ctl.signal : undefined,
    })
      .then((r) => r.json().catch(() => ({ ok: false })).then((j) => { if (!j.ok) throw new Error(j.error || 'Serveur indisponible.'); return j; }))
      .then((j) => {
        if (reqTeam !== team) return; // le code a changé entretemps : cette réponse concerne l'ancienne équipe
        merge(j.data, true);
        net.state = 'ok';
        net.durable = !!j.durable;
        renderAll();
      })
      .catch((e) => {
        if (reqTeam !== team) return;
        net.state = 'error';
        net.err = e && e.name !== 'AbortError' && e.message && e.message !== 'Failed to fetch' ? e.message : 'Serveur injoignable.';
        retryTimer = setTimeout(sync, 20000);
      })
      .finally(() => {
        clearTimeout(to);
        inflight = false;
        firstSync = true;
        renderNet();
        if (dirty) schedulePush();
        tryAskResume();
      });
  }
  // À la fermeture de la fenêtre : dernier envoi (sendBeacon continue même quand la page se ferme)
  function flush() {
    if (!team || !dirty) return;
    dirty = false;
    try {
      navigator.sendBeacon(`/api/team/${encodeURIComponent(team)}`, new Blob([JSON.stringify({ data })], { type: 'application/json' }));
    } catch { /* ignore */ }
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  function setTeam(raw) {
    const code = String(raw || '').trim().toLowerCase();
    if (code && !TEAM_RE.test(code)) {
      net.bad = 'Code invalide : 6 à 48 caractères (lettres, chiffres, - ou _).';
      renderNet();
      return false;
    }
    net.bad = '';
    if (code !== team) {
      // autre équipe : on met la sauvegarde actuelle de côté et on charge celle de la nouvelle équipe (vide si elle est nouvelle)
      saveLocal();
      team = code;
      data = loadLocal(team);
      clearTimeout(pushTimer);
      dirty = false;
      askedResume = false;
      pendingResume = null;
      $('resume').classList.remove('show');
      firstSync = !team;
    }
    if ($('team-code')) $('team-code').value = code;
    try { if (code) localStorage.setItem(TEAM_KEY, code); else localStorage.removeItem(TEAM_KEY); } catch { /* ignore */ }
    net.err = '';
    net.state = code ? 'sync' : 'off';
    clearTimeout(retryTimer);
    renderNet();
    renderAll();
    if (code) { dirty = true; sync(); } else { firstSync = true; tryAskResume(); }
    return true;
  }

  /* ---------- Catalogue des niveaux (noms, chapitres, seuils de médailles) ---------- */
  let catalog = { levels: [], chapters: [] };
  let catalogOk = false;
  let cur = null; // niveau en cours : { index, name, gold, silver, timer, star, help }
  function fetchCatalog() {
    fetch('/api/levels', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { j.levels = (j.levels || []).filter((l) => !l.tutorial); catalog = j; catalogOk = true; renderAll(); tryAskResume(); })
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
  function medalFor(sec, gold, silver, diamond) {
    return diamond && sec <= diamond ? 'diamond' : sec <= gold ? 'gold' : sec <= silver ? 'silver' : 'bronze';
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
    const cnt = { 4: 0, 3: 0, 2: 0, 1: 0 };
    done.forEach((l) => { cnt[data.best[l.name].m || 1]++; });
    const total = done.reduce((s, l) => s + data.best[l.name].t, 0);
    const head = el('div', 'side-sum');
    head.append(el('div', 'sum-medals', `💎 ${cnt[4]}  🥇 ${cnt[3]}  🥈 ${cnt[2]}  🥉 ${cnt[1]}`));
    head.append(el('div', 'sum-line', `${done.length}/${lv.length} niveaux terminés${done.length ? ` · temps cumulé ${fmt(total, true)}` : ''}`));
    root.append(head);
    root.append(el('div', 'sync-line'));
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
      row.title = `${l.name}\n💎 ≤ ${fmt(l.diamond)} · 🥇 ≤ ${fmt(l.gold)} · 🥈 ≤ ${fmt(l.silver)} · chrono ${fmt(l.timer)}`;
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
    renderStats(root);
    root.append(saveButtons());
  }

  /* ---------- Statistiques du duo (discret : replié par défaut) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let statsDirty = false;
  let statsOpen = false;
  function today() {
    const k = dayKey(new Date());
    return data.stats.days[k] || (data.stats.days[k] = { s: 0, d: 0 });
  }
  // Jours consécutifs jouées (au moins une minute), série en cours et meilleure série
  function streaks() {
    const ok = (k) => data.stats.days[k] && data.stats.days[k].s >= 60;
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    if (!ok(dayKey(d))) d.setDate(d.getDate() - 1); // pas encore joué aujourd'hui : la série d'hier compte toujours
    let cur = 0;
    while (ok(dayKey(d))) { cur++; d.setDate(d.getDate() - 1); }
    let best = 0;
    let run = 0;
    let prev = null;
    Object.keys(data.stats.days).filter(ok).forEach((k) => {
      const t = new Date(`${k}T12:00:00`).getTime();
      run = prev !== null && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1;
      prev = t;
      if (run > best) best = run;
    });
    return { cur, best: Math.max(best, cur) };
  }
  function fmtDuration(sec) {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`;
  }
  function renderStats(root) {
    const days = Object.values(data.stats.days);
    const secs = days.reduce((s, d) => s + d.s, 0);
    const deaths = days.reduce((s, d) => s + d.d, 0);
    const st = streaks();
    const fails = Object.entries(data.stats.fails).sort((a, b) => b[1] - a[1])[0];
    const box = document.createElement('details');
    box.className = 'side-stats';
    box.open = statsOpen;
    box.addEventListener('toggle', () => { statsOpen = box.open; });
    box.append(el('summary', '', '📊 Statistiques du duo'));
    const rows = [
      ['⏱ Temps de jeu', secs ? fmtDuration(secs) : '—'],
      ['💥 Chutes', String(deaths)],
      ['🔥 Série', st.cur ? `${st.cur} jour${st.cur > 1 ? 's' : ''}${st.best > st.cur ? ` (record ${st.best})` : ''}` : (st.best ? `0 (record ${st.best})` : '—')],
      ['😖 Le plus raté', fails && fails[1] ? `${fails[0]} (${fails[1]})` : '—'],
    ];
    rows.forEach(([k, v]) => {
      const r = el('div', 'stat-row');
      r.append(el('span', 'stat-k', k), el('span', 'stat-v', v));
      box.append(r);
    });
    root.append(box);
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
    root.append(el('div', 'sync-line'));
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
      if (ok) sync();
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
    renderNet();
  }

  /* ---------- Fenêtre « Records / Étoiles » (écrans étroits) ---------- */
  function openModal(tab) {
    renderRecords($('modal-records'));
    renderStars($('modal-stars'));
    $('panel-modal').classList.add('show');
    showTab(tab || 'records');
    renderNet();
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
  // On propose de reprendre une fois le catalogue chargé ET la sauvegarde en ligne lue, et seulement depuis le menu
  function tryAskResume() {
    if (!catalogOk || !firstSync || askedResume || pendingResume !== null) return;
    const menu = $('screen-menu');
    if (menu && !menu.classList.contains('active')) return;
    askResume();
  }
  function askResume() {
    if (data.furthest < 1) return;
    const l = catalog.levels[data.furthest];
    if (!l) return;
    askedResume = true;
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
    setFurthest(-1); // on ne veut pas reprendre : la sauvegarde de progression est supprimée (records et étoiles restent)
    persist();
    pendingResume = null;
    $('resume').classList.remove('show');
  };

  function tutorialDone() {
    if (data.tut) return;
    data.tut = 1;
    persist();
  }

  /* ---------- Écran de fin de niveau ---------- */
  let resultTimer = null;
  let resultAt = 0;
  const RESULT_MS = 15000;
  function hideResult() {
    $('result').classList.remove('show');
    clearInterval(resultTimer);
  }

  function showResult(res, finished, isHost) {
    if (res && res.tutorial) { tutorialDone(); hooks.toast('Tutoriel terminé ! Direction le niveau 1…'); return null; }
    const l = cur;
    const box = $('result');
    const sec = res.time / 60;
    const skipped = !!res.skipped;
    let medal = null;
    let info = null;
    if (!skipped && l) {
      medal = medalFor(sec, l.gold, l.silver, l.diamond);
      const noDeath = res.deaths === 0;
      const noHelp = !l.help && !res.help; // l'indice consulté par l'un des joueurs compte pour tout le duo
      const b = data.best[l.name];
      const prev = b && b.t != null ? b.t : null;
      const newBest = prev === null || sec < prev - 0.001;
      const nb = Object.assign({ t: null, m: 0, nd: false, nh: false, p: false, n: 0 }, b || {});
      if (newBest) { nb.t = r1(sec); nb.at = Date.now(); }
      nb.m = Math.max(nb.m, MEDALS[medal].rank);
      nb.nd = nb.nd || noDeath;
      nb.nh = nb.nh || noHelp;
      nb.p = nb.p || ((medal === 'gold' || medal === 'diamond') && noDeath && noHelp);
      nb.n++;
      data.best[l.name] = nb;
      persist();
      info = { prev, newBest, noDeath, noHelp };
    }
    if (finished) { setFurthest(-1); persist(); } // partie terminée : plus rien à reprendre
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
      else if (medal === 'gold') goal.textContent = `Diamant à ≤ ${fmt(l.diamond, true)} : ${r1(sec - l.diamond)} s à gagner`;
      else goal.textContent = 'Coordination parfaite : diamant !';
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
      const cnt = { 4: 0, 3: 0, 2: 0, 1: 0 };
      catalog.levels.forEach((x) => { const b = data.best[x.name]; if (b) cnt[b.m || 1]++; });
      $('res-total').textContent = `Médailles : 💎 ${cnt[4]}  🥇 ${cnt[3]}  🥈 ${cnt[2]}  🥉 ${cnt[1]} · Étoiles : ★ ${starCount()}/${catalog.levels.length} (${titleFor(starCount())})`;
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
  $('res-lobby').onclick = () => hooks.lobby();

  /* ---------- Interface pour client.js ---------- */
  const hooks = { toast() {}, replay() {}, next() {}, lobby() {}, help() {} };
  window.Progress = {
    setHooks(h) { Object.assign(hooks, h); },
    fmt,
    // Début (ou redémarrage) d'un niveau
    onStart(msg) {
      if (cur && cur.tutorial && !(msg.chapter && msg.chapter.tutorial)) tutorialDone(); // on quitte le tutoriel (terminé ou passé)
      if (msg.chapter && msg.chapter.tutorial) { // le tutoriel ne compte ni pour les records, ni pour la reprise, ni pour les statistiques
        cur = { index: msg.index, name: msg.name, tutorial: true, help: false };
        hideResult();
        return;
      }
      cur = { index: msg.index, name: msg.name, diamond: msg.diamond, gold: msg.gold, silver: msg.silver, timer: msg.timer, star: !!msg.star, help: false };
      if (msg.index > data.furthest) { setFurthest(msg.index); persist(); }
      hideResult();
      renderAll();
    },
    // Temps de jeu (secondes) et chutes : enregistrés en local, envoyés avec la sauvegarde d'équipe au plus une fois par minute
    addPlay(sec) {
      if (cur && cur.tutorial) return;
      today().s = Math.min(86400, today().s + sec);
      statsDirty = true;
    },
    onDeath(n) {
      if (cur && cur.tutorial) return;
      const k = n || 1;
      today().d += k;
      if (cur) data.stats.fails[cur.name] = (data.stats.fails[cur.name] || 0) + k;
      statsDirty = true;
    },
    streaks,
    team: () => team,
    noteHelp() {
      if (!cur || cur.help) return;
      cur.help = true;
      hooks.help();
    },
    hasHelp: () => !!(cur && cur.help),
    // Médaille que l'on aurait en finissant maintenant (temps écoulé en secondes)
    tier(elapsed) {
      if (!cur || !cur.gold) return null;
      return medalFor(elapsed, cur.gold, cur.silver, cur.diamond);
    },
    goldAt: () => (cur ? cur.gold : 0),
    silverAt: () => (cur ? cur.silver : 0),
    onStar(name) {
      if (cur && cur.tutorial) return false;
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
    // Tutoriel : proposé uniquement à la toute première partie d'un duo (aucun record, aucune étoile, jamais fait ni passé)
    needsTutorial() {
      return !data.tut && !Object.keys(data.best).length && !Object.keys(data.stars).length && data.furthest < 1 && firstSync;
    },
    tutorialDone,
    takeResume() { const r = pendingResume; pendingResume = null; return r; },
    peekResume: () => pendingResume,
  };

  setInterval(() => {
    if (!statsDirty) return;
    statsDirty = false;
    persist();
    if ($('side-records') || $('panel-modal').classList.contains('show')) renderAll();
  }, 60000);

  /* ---------- Champ « code d'équipe » du menu ---------- */
  const teamInput = $('team-code');
  if (teamInput) {
    teamInput.value = team;
    const validate = () => { if (teamInput.value.trim().toLowerCase() !== team) setTeam(teamInput.value); };
    $('team-save').onclick = () => { if (!setTeam(teamInput.value)) return; if (team) sync(); };
    teamInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); validate(); } e.stopPropagation(); });
    teamInput.addEventListener('keyup', (e) => e.stopPropagation());
    teamInput.addEventListener('change', validate);
  }
  fetch('/api/storage', { cache: 'no-store' })
    .then((r) => r.json())
    .then((j) => { if (net.durable === null) net.durable = !!j.durable; renderNet(); })
    .catch(() => {});

  fetchCatalog();
  renderAll();
  sync();
})();

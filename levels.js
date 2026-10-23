// Chaque niveau est dessiné avec rect(x, y, largeur, hauteur, caractère) et put(x, y, caractère).
// La grille fait 30 cases de large et 15 de haut. x=0 est à gauche, y=0 en haut.
// Le sol est la ligne 14 : on marche donc sur la ligne 13.
//
// Légende : # bloc | S départ | D porte | K clé | C checkpoint | ^ pics
//           1 2 3 plaques au sol | a b c portes liées aux groupes 1 2 3
//           x y z cristaux (orbe du Mage) | o p q cibles (flèche de l'Archer)
//           w v u volets en rythme | h bloc caché | r zone de rune (glace du Mage)
//           j ressort | t bois (brûlé par la flèche de feu) | f g e torches des groupes 1 2 3
//           l bloc lié (disparaît si les joueurs s'éloignent de plus de 7 cases)
//           s pont synchro (apparaît 6 s quand les deux joueurs sautent en même temps)
//
// Options d'un niveau (4e argument de make) :
//   abilities : true  -> rôles Mage / Archer actifs (sinon tout le monde est identique)
//   dark      : true  -> niveau dans le noir, seul le Mage éclaire
//   and       : [1]   -> la porte du groupe 1 exige TOUS ses déclencheurs en même temps
//   latch     : {1: 300} -> la porte reste ouverte 300 ticks après avoir été débloquée
//   hold      : {1: 0}   -> durée d'un cristal ou d'une cible (ticks, 0 = pour toujours, 360 par défaut)
//   shutters  : {1: {period, open, phase}} -> rythme des volets
//   sequence  : {group, order, timeout} -> cristaux à toucher dans l'ordre
//   labels    : indices peints dans le décor
//   fire      : true  -> l'Archer dispose de la flèche de feu (bouton Feu / clic droit / K)
//   swap      : true  -> le Mage dispose de l'éclair d'échange (bouton Échange / touche E)
//   link      : true  -> niveau avec blocs liés : fil visible entre les joueurs et jauge de distance
//   sync      : true  -> niveau avec ponts synchro : il faut sauter en même temps
//   carry     : true  -> on peut porter (F) puis lancer (F) son coéquipier
//   heavy     : [1]   -> la plaque du groupe 1 exige deux joueurs dessus
//
// Repères de saut : seul, on monte de 2 cases. À deux (l'un sur la tête de l'autre) de 3 cases.
// L'Archer, avec son double saut, monte de 5 cases et franchit environ 15 cases de vide avec le dash.
const W = 30;
const H = 15;

function make(name, hint, draw, opts = {}) {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const rect = (x, y, w, h, c = '#') => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g[y + j][x + i] = c;
  };
  const put = (x, y, c) => {
    g[y][x] = c;
  };
  rect(0, 0, W, 1);
  rect(0, H - 1, W, 1);
  rect(0, 0, 1, H);
  rect(W - 1, 0, 1, H);
  draw({ rect, put });
  return { name, hint, rows: g.map((r) => r.join('')), ...opts };
}

const LEVELS = [
  /* ===== Chapitre 1 : en équipe, sans pouvoirs (porter, lancer, rester liés) ===== */
  make('Échauffement', 'Ramassez la clé tout en haut, puis rejoignez tous la porte.', ({ rect, put }) => {
    [[5, 12], [11, 10], [17, 8], [23, 6]].forEach(([x, y]) => rect(x, y, 4, 1));
    put(24, 5, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }),

  make('Le mur', 'Montez-vous sur la tête pour passer le mur, puis tenez la plaque pour ouvrir.', ({ rect, put }) => {
    rect(14, 11, 1, 3, 'a'); // mur de 3 cases : trop haut pour sauter seul
    put(18, 13, '1'); // plaque de l'autre côté du mur
    rect(21, 12, 5, 1); // plafond d'un tunnel bas
    put(23, 13, 'K'); // clé au fond du tunnel
    put(28, 13, 'D');
    put(2, 13, 'S');
  }),

  make('Courte-échelle', 'Une corniche trop haute, même sur la tête de l’autre ! Placez-vous contre votre coéquipier, appuyez sur F pour le porter, puis F encore pour le lancer sur la corniche. Là-haut, il pèse sur la plaque pour ouvrir la grande porte. Deuxième lancer pour la clé !', ({ rect, put }) => {
    rect(6, 10, 5, 1); // corniche à 4 cases : la tête de l'autre ne suffit pas
    put(9, 9, '1'); // plaque sur la corniche
    rect(14, 1, 1, 13, 'a'); // grande porte
    rect(20, 10, 7, 1); // 2e corniche (large : le lancer porte loin)
    put(23, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { carry: true, latch: { 1: 600 } }),

  make('La corde', 'Un fil magique vous relie : les blocs verts disparaissent si vous vous éloignez de plus de 7 cases (le fil vire au rouge avant la rupture). Avancez ensemble. Un joueur tient la plaque pour ouvrir la porte, l’autre passe : attendez-vous, puis rattrapez-vous vite !', ({ rect, put }) => {
    rect(3, 14, 24, 1, '^'); // fosse de pics
    rect(4, 12, 3, 1, 'l');
    rect(9, 11, 3, 1, 'l');
    rect(14, 10, 3, 1, 'l');
    put(14, 9, 'C');
    put(15, 9, '1'); // plaque : ouvre la porte
    rect(18, 1, 1, 13, 'a');
    rect(20, 11, 3, 1, 'l');
    rect(24, 12, 3, 1, 'l');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { link: true, latch: { 1: 300 } }),

  /* ===== Chapitre 2 : Arcanes, un Mage et un Archer ===== */
  make('L’étincelle', 'Le Mage choisit l’Orbe (bouton sous le jeu), puis clique sur le cristal pour le toucher. L’Archer, lui, saute deux fois pour atteindre la clé.', ({ rect, put }) => {
    rect(11, 5, 1, 9, 'a'); // grande porte, ouverte quelques secondes par le cristal
    put(8, 9, 'x');
    rect(15, 10, 3, 1); // corniche à 4 cases : seul l'Archer l'atteint
    put(16, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, hold: { 1: 300 } }),

  make('Le tireur', 'Le Mage ouvre la première porte (orbe sur le cristal). L’Archer tire par le hublot du mur sur la cible : la flèche retombe, visez un peu plus haut.', ({ rect, put }) => {
    put(4, 8, 'y'); // cristal du Mage
    rect(8, 1, 1, 13, 'b'); // première porte
    rect(15, 1, 2, 13); // mur
    rect(15, 8, 2, 3, '.'); // hublot de 3 cases
    rect(15, 11, 2, 3, 'a'); // porte au pied du mur
    put(22, 8, 'o'); // cible derrière le mur
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, hold: { 1: 0, 2: 0 } }),

  make('Le gouffre', 'Un gouffre trop large pour sauter. Le Mage choisit la Glace (bouton sous le jeu) et clique sur les runes ; seul l’Archer atteint la clé.', ({ rect, put }) => {
    rect(6, 14, 18, 1, '^'); // fond du gouffre : pics (18 cases, même l'Archer ne passe pas seul)
    put(10, 13, 'r');
    put(15, 13, 'r');
    put(20, 13, 'r');
    rect(24, 10, 3, 1); // corniche à 4 cases : double saut obligatoire
    put(25, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true }),

  /* ===== Chapitre 3 : Ténèbres ===== */
  make('Dans le noir', 'Seul le Mage éclaire. Le Mage ouvre la porte de départ, puis des plateformes invisibles traversent les pics : l’Archer saute deux fois pour prendre la clé tout en haut.', ({ rect, put }) => {
    rect(5, 14, 20, 1, '^');
    rect(4, 1, 1, 13, 'a'); // porte de départ
    put(2, 6, 'x'); // cristal du Mage
    rect(7, 12, 2, 1, 'h');
    rect(11, 10, 2, 1, 'h');
    rect(15, 11, 2, 1, 'h');
    rect(19, 9, 2, 1, 'h');
    rect(23, 11, 2, 1, 'h');
    put(11, 9, 'C');
    put(23, 10, 'C');
    rect(26, 6, 3, 1); // corniche très haute : double saut de l'Archer
    put(27, 5, 'K');
    put(3, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, dark: true, hold: { 1: 0 } }),

  make('Le fil d’Ariane', 'Dans le noir, des blocs liés forment le chemin : restez près de la lumière du Mage, ils disparaissent si vous vous éloignez. Le Mage touche le cristal pour ouvrir la porte. L’Archer saute deux fois pour prendre la clé tout là-haut.', ({ rect, put }) => {
    rect(3, 14, 24, 1, '^');
    rect(4, 12, 3, 1, 'l');
    rect(9, 11, 3, 1, 'l');
    put(10, 8, 'x'); // cristal du Mage
    rect(14, 1, 1, 13, 'a');
    rect(16, 11, 3, 1, 'l');
    put(17, 10, 'C');
    rect(21, 10, 3, 1, 'l');
    rect(24, 7, 3, 1, 'l'); // trop haut pour le Mage : double saut de l'Archer
    put(25, 6, 'K');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, dark: true, link: true, hold: { 1: 0 } }),

  /* ===== Chapitre 4 : Sanctuaire (synchronisation et casse-têtes) ===== */
  make('Le sceau', 'Casse-tête : un indice n’apparaît que pour l’Archer (sur la corniche). Il le dicte au Mage, qui touche les trois cristaux dans le bon ordre.', ({ rect, put }) => {
    rect(2, 10, 3, 1); // corniche à 4 cases : l'Archer y lit l'indice
    put(4, 8, 'z');
    put(15, 4, 'z');
    put(24, 7, 'z');
    rect(12, 12, 3, 1);
    rect(19, 11, 3, 1);
    rect(26, 5, 1, 9, 'c');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, {
    abilities: true,
    sequence: { group: 3, order: [2, 0, 1], timeout: 1800 },
    labels: [{ tx: 3, ty: 8, shapes: [2, 0, 1], role: 'archer', radius: 130 }],
  }),

  make('Synchro', 'Plaque, cristal et cible doivent être actifs en même temps : le Mage tient la plaque et tire sur le cristal, l’Archer vise la meurtrière quand elle s’ouvre.', ({ rect, put }) => {
    rect(5, 14, 7, 1, '^');
    put(7, 13, 'r');
    put(10, 13, 'r');
    put(13, 13, 'C');
    put(16, 13, '1');
    put(16, 2, 'x'); // cristal juste au-dessus de la plaque
    rect(19, 1, 2, 13); // mur jusqu'au plafond
    rect(19, 10, 2, 1, 'w'); // meurtrière à volet
    rect(19, 11, 2, 3, 'a'); // porte au pied du mur
    put(22, 10, 'o');
    rect(24, 10, 3, 1);
    put(25, 9, 'K');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, and: [1], latch: { 1: 300 }, hold: { 1: 240 }, shutters: { 1: { period: 150, open: 80, phase: 0 } } }),

  make('Le grand saut', 'Sautez TOUS LES DEUX EN MÊME TEMPS (moins d’une seconde d’écart) : un pont et un escalier dorés apparaissent 6 secondes au-dessus des pics. Courez jusqu’à la clé ! Si vous tombez, recommencez le saut ensemble.', ({ rect, put }) => {
    rect(4, 14, 22, 1, '^');
    rect(5, 12, 9, 1, 's'); // 1er pont
    rect(14, 12, 3, 1); // îlot
    put(15, 11, 'C');
    rect(17, 11, 2, 1, 's'); // escalier doré
    rect(19, 10, 2, 1, 's');
    rect(21, 9, 2, 1, 's');
    rect(23, 8, 2, 1, 's');
    rect(25, 8, 4, 1); // plateau
    put(27, 7, 'K');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { sync: true }),

  make('Le relais', 'Casse-tête à deux : une plaque ne reste pressée que tant qu’on est dessus. L’un tient la plaque du bas pour laisser passer l’autre, qui ouvre à son tour la porte du haut. À la fin, posez-vous chacun sur une plaque.', ({ rect, put }) => {
    put(7, 13, '1'); // plaque du bas : ouvre la porte du couloir bas
    rect(4, 12, 3, 1); // escalier vers le couloir du haut
    rect(8, 10, 3, 1);
    rect(12, 8, 8, 1); // plancher entre les deux couloirs
    rect(15, 9, 1, 5, 'a'); // porte du couloir bas
    rect(15, 1, 1, 7, 'b'); // porte du couloir haut
    put(21, 13, '2'); // plaque de la zone d'arrivée : ouvre la porte du haut
    put(23, 13, '3'); // deux plaques éloignées : il faut être deux, une chacune
    put(26, 13, '3');
    rect(27, 1, 1, 13, 'c');
    put(28, 13, 'D');
    put(1, 13, 'S');
  }, { and: [3], latch: { 3: 150 } }),

  /* ===== Chapitre 5 : Jardins suspendus (ressorts) ===== */
  make('Tremplin', 'Le ressort propulse très haut : retombez dessus pour atteindre la clé. Le Mage ouvre la porte rose (orbe sur le cristal), l’Archer baisse la porte bleue (flèche sur la cible).', ({ rect, put }) => {
    put(5, 13, 'j');
    rect(7, 8, 4, 1); // corniche à 6 cases : seul le ressort y mène
    put(9, 7, 'K');
    put(12, 4, 'x');
    rect(14, 1, 1, 13, 'a');
    put(17, 5, 'p');
    rect(21, 1, 1, 13, 'b');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, hold: { 1: 600, 2: 0 } }),

  make('Haute voltige', 'Deux ressorts en escalier mènent à la clé. L’Archer vise la cible par le hublot pour ouvrir le mur, le Mage touche le cristal de l’autre côté.', ({ rect, put }) => {
    put(3, 13, 'j');
    rect(5, 8, 4, 1);
    put(7, 7, 'j');
    rect(11, 3, 6, 1);
    put(14, 2, 'K');
    rect(19, 1, 2, 13);
    rect(19, 4, 2, 3, '.'); // hublot
    rect(19, 11, 2, 3, 'a');
    put(24, 8, 'o');
    rect(26, 1, 1, 13, 'b');
    put(23, 3, 'y');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, hold: { 1: 0, 2: 600 } }),

  make('Nénuphars', 'Ne tombez pas dans les pics ! Un ressort sur un nénuphar mène à la clé. De l’îlot d’arrivée, le Mage touche le cristal et l’Archer la cible : les deux portes s’ouvrent.', ({ rect, put }) => {
    rect(4, 14, 22, 1, '^');
    rect(6, 12, 3, 1);
    rect(12, 12, 2, 1);
    put(12, 11, 'j');
    rect(15, 6, 4, 1);
    put(17, 5, 'K');
    rect(21, 10, 3, 1);
    put(22, 9, 'C');
    put(23, 5, 'x');
    put(25, 8, 'p');
    rect(26, 1, 1, 13, 'a');
    rect(27, 1, 1, 13, 'b');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, hold: { 1: 600, 2: 600 } }),

  /* ===== Chapitre 6 : La Forge (flèche de feu, bois, torches) ===== */
  make('Premier feu', 'Le bois barre la route : l’Archer l’embrase avec la flèche de feu (bouton Feu, puis clic sur le bois). Le Mage touche le cristal, puis l’Archer allume la torche.', ({ rect, put }) => {
    rect(10, 1, 2, 13, 't'); // mur de bois : tout le bois relié brûle
    put(14, 5, 'x');
    put(15, 13, 'K');
    rect(18, 1, 1, 13, 'a');
    put(22, 6, 'g');
    rect(25, 1, 1, 13, 'b');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, hold: { 1: 900, 2: 0 } }),

  make('Les quatre feux', 'La porte exige quatre flammes en même temps : le cristal du Mage et les trois torches de l’Archer. Soyez rapides, elles s’éteignent !', ({ rect, put }) => {
    rect(8, 12, 1, 2);
    rect(18, 12, 1, 2);
    put(5, 4, 'f');
    put(13, 4, 'f');
    put(22, 5, 'f');
    put(16, 8, 'x');
    rect(25, 1, 1, 13, 'a');
    put(27, 13, 'K');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, and: [1], latch: { 1: 600 }, hold: { 1: 600 } }),

  make('Pont de braise', 'Le fil vous relie : restez proches ! L’Archer brûle le mur de bois (bouton Feu) puis allume la torche ; le Mage touche le cristal avec l’orbe. Les deux portes s’ouvrent alors.', ({ rect, put }) => {
    rect(3, 14, 22, 1, '^');
    rect(4, 12, 3, 1, 'l');
    rect(9, 11, 3, 1, 'l');
    rect(13, 1, 2, 13, 't'); // mur de bois
    rect(16, 11, 3, 1, 'l');
    put(17, 10, 'C');
    rect(20, 10, 3, 1, 'l');
    put(22, 7, 'f'); // torche de l'Archer
    put(20, 6, 'y'); // cristal du Mage
    rect(23, 11, 2, 1, 'l');
    rect(25, 1, 1, 13, 'a');
    rect(26, 1, 1, 13, 'b');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, link: true, hold: { 1: 0, 2: 0 } }),

  make('Brasier', 'Un pont de glace pour le Mage, un mur de bois pour l’Archer, une clé haut perchée. Torche et cristal ouvrent la dernière porte.', ({ rect, put }) => {
    rect(10, 1, 2, 13, 't');
    rect(13, 14, 9, 1, '^');
    put(14, 13, 'r');
    put(17, 13, 'r');
    put(20, 13, 'r');
    rect(16, 8, 3, 1);
    put(17, 7, 'K');
    put(22, 5, 'f');
    put(24, 3, 'x');
    rect(25, 1, 1, 13, 'a');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, and: [1], latch: { 1: 400 }, hold: { 1: 500 } }),

  /* ===== Chapitre 7 : Les Brumes (échange) ===== */
  make('Échange', 'L’Archer franchit le gouffre en dash. Visez-le avec l’éclair d’échange (bouton Échange, puis clic sur l’Archer) : le Mage prend sa place de l’autre côté ! Puis le Mage touche le cristal.', ({ rect, put }) => {
    rect(6, 14, 12, 1, '^');
    put(21, 10, 'x');
    put(22, 13, 'K');
    rect(24, 1, 1, 13, 'a');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, swap: true, hold: { 1: 900 } }),

  make('Le pilier', 'Le cristal est posé sur un pilier inatteignable pour le Mage. Le Mage monte sur la corniche, l’Archer bondit sur le pilier : échangez vos places !', ({ rect, put }) => {
    put(3, 13, 'j');
    rect(5, 8, 4, 1);
    put(11, 13, 'j');
    rect(14, 6, 3, 8);
    put(16, 5, 'x');
    rect(19, 1, 2, 13);
    rect(19, 11, 2, 3, 'a');
    put(24, 13, 'K');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, swap: true, hold: { 1: 900 } }),

  make('Brouillard', 'Dans le noir, l’Archer passe le gouffre, le Mage le rejoint par l’échange (bouton Échange), puis le bois brûle. Le Mage touche le cristal derrière le mur.', ({ rect, put }) => {
    rect(6, 14, 12, 1, '^');
    put(18, 13, 'C');
    rect(21, 1, 2, 13, 't');
    put(24, 5, 'x');
    put(24, 13, 'K');
    rect(25, 1, 1, 13, 'a');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, swap: true, fire: true, dark: true, hold: { 1: 900 } }),

  make('Cordée', 'Dernière épreuve : le bois, la glace et l’échange. Chacun son tour, personne ne passe seul.', ({ rect, put }) => {
    rect(3, 1, 1, 13, 't');
    put(5, 5, 'x');
    rect(6, 1, 1, 13, 'a');
    put(8, 13, 'C');
    rect(9, 14, 6, 1, '^');
    put(10, 13, 'r');
    put(13, 13, 'r');
    put(11, 5, 'g');
    rect(16, 1, 1, 13, 'b');
    put(17, 13, 'C');
    rect(18, 14, 7, 1, '^');
    put(21, 7, 'z');
    put(25, 13, 'K');
    put(26, 13, 'C');
    rect(27, 1, 1, 13, 'c');
    put(28, 13, 'D');
    put(1, 13, 'S');
  }, { abilities: true, swap: true, fire: true, hold: { 1: 600, 2: 0, 3: 0 } }),
];

// Chapitres : thème graphique, texte d'introduction et nombre de niveaux (dans l'ordre de LEVELS)
const CHAPTERS = [
  { name: 'La prairie', theme: 'prairie', count: 4, blurb: 'Pas de pouvoirs ici : portez-vous, lancez-vous, restez liés par le fil. Ici, tout se joue à deux.', powers: ['F : porter ton coéquipier, puis F encore pour le lancer', 'Blocs verts liés : ils disparaissent si vous vous éloignez de plus de 7 cases'] },
  { name: 'Les Arcanes', theme: 'arcane', count: 3, blurb: 'Un Mage, un Archer : chacun son pouvoir, et personne ne s’en sort seul. Les tirs n’ont pas besoin d’être parfaits.', powers: ['Mage : orbe sur les cristaux, glace sur les runes', 'Archer : flèche sur les cibles, double saut, dash'] },
  { name: 'Les Ténèbres', theme: 'dark', count: 2, blurb: 'Le noir est total. Seule la lumière du Mage montre le chemin, et le fil vous garde ensemble.' },
  { name: 'Le Sanctuaire', theme: 'sanctuary', count: 4, blurb: 'Sauts synchronisés, casse-têtes, ordre des cristaux : le temple teste votre coordination.', powers: ['Ponts dorés : sautez tous les deux en même temps pour les faire apparaître'] },
  { name: 'Les Jardins suspendus', theme: 'garden', count: 3, blurb: 'Des ressorts jaillissent des fleurs. Attention aux pics en bas !', powers: ['Ressort : retombez dessus pour être propulsé à 6 cases'] },
  { name: 'La Forge', theme: 'forge', count: 4, blurb: 'Le bois brûle, les torches s’allument. Mais attention : le feu se propage à tout le bois relié.', powers: ['Archer : bouton Feu, puis clic dans le jeu (brûle le bois, allume les torches)'] },
  { name: 'Les Brumes', theme: 'mist', count: 4, blurb: 'Le brouillard efface les distances. Il faudra échanger vos places.', powers: ['Mage : bouton Échange, puis clic sur l’autre joueur (vous échangez vos places)'] },
];

let _c = 0;
CHAPTERS.forEach((ch, i) => {
  for (let k = 0; k < ch.count; k++) LEVELS[_c++].chapter = i;
});

// Minuteur (en secondes) : chaque niveau en a un. Si le temps est écoulé, le niveau redémarre.
// Pour changer une durée, modifiez simplement ce tableau (nom du niveau : secondes).
// Un niveau absent du tableau reçoit DEFAULT_TIMER ; mettre 0 désactive le minuteur de ce niveau.
const DEFAULT_TIMER = 120;
const TIMERS = {
  'Échauffement': 120, 'Le mur': 90, 'Courte-échelle': 150, 'La corde': 150, // chapitre 1 : la prairie
  'L’étincelle': 120, 'Le tireur': 120, 'Le gouffre': 120, // chapitre 2 : les Arcanes
  'Dans le noir': 150, 'Le fil d’Ariane': 180, // chapitre 3 : les Ténèbres
  'Le sceau': 150, 'Synchro': 150, 'Le grand saut': 150, 'Le relais': 180, // chapitre 4 : le Sanctuaire
  'Tremplin': 120, 'Haute voltige': 130, 'Nénuphars': 130, // chapitre 5 : les Jardins
  'Premier feu': 130, 'Les quatre feux': 150, 'Pont de braise': 180, 'Brasier': 150, // chapitre 6 : la Forge
  'Échange': 130, 'Le pilier': 130, 'Brouillard': 160, 'Cordée': 200, // chapitre 7 : les Brumes
};
LEVELS.forEach((l) => { l.timer = TIMERS[l.name] !== undefined ? TIMERS[l.name] : DEFAULT_TIMER; });

module.exports = { LEVELS, CHAPTERS };

// Chaque niveau est dessiné avec rect(x, y, largeur, hauteur, caractère) et put(x, y, caractère).
// La grille fait 30 cases de large et 15 de haut. x=0 est à gauche, y=0 en haut.
// Le sol est la ligne 14 : on marche donc sur la ligne 13.
//
// Légende : # bloc | S départ | D porte | K clé | C checkpoint | ^ pics
//           1 2 3 plaques au sol | a b c portes liées aux groupes 1 2 3
//           x y z cristaux (orbe du Mage) | o p q cibles (flèche de l'Archer)
//           w v u volets en rythme | h bloc caché | r zone de rune (glace du Mage)
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
  /* ===== Chapitre 1 : en équipe, sans pouvoirs (2 niveaux d'initiation) ===== */
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


  /* ===== Chapitre 2 : Arcanes, un Mage et un Archer ===== */
  make('L’étincelle', 'Le Mage lance une orbe sur le cristal (clic gauche). L’Archer, lui, saute deux fois pour atteindre la clé.', ({ rect, put }) => {
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

  make('Le gouffre', 'Un gouffre trop large pour sauter. Le Mage pose de la glace sur les runes (clic droit) ; seul l’Archer atteint la clé.', ({ rect, put }) => {
    rect(6, 14, 18, 1, '^'); // fond du gouffre : pics (18 cases, même l'Archer ne passe pas seul)
    put(10, 13, 'r');
    put(15, 13, 'r');
    put(20, 13, 'r');
    rect(24, 10, 3, 1); // corniche à 4 cases : double saut obligatoire
    put(25, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true }),

  make('L’escalier de glace', 'Le Mage bâtit un escalier de glace (clic droit) pour atteindre la clé tout en haut. L’Archer tire sur la cible en haut à droite pour ouvrir la porte de sortie.', ({ rect, put }) => {
    put(7, 12, 'r');
    put(10, 10, 'r');
    put(13, 8, 'r');
    rect(16, 7, 5, 1); // grande corniche tout en haut
    put(18, 6, 'K');
    put(24, 5, 'o'); // cible de l'Archer
    rect(26, 1, 1, 13, 'a'); // porte devant la sortie
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, hold: { 1: 0 } }),

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

  make('Le va-et-vient', 'Le Mage ouvre la porte (orbe sur le cristal). Seul l’Archer peut sauter de pilier en pilier chercher la clé et revenir. Rendez-vous à la porte de départ.', ({ rect, put }) => {
    rect(5, 14, 17, 1, '^'); // fosse de pics
    rect(5, 1, 1, 13, 'a'); // porte entre la rive de départ et la fosse
    put(2, 4, 'x'); // cristal du Mage
    rect(8, 10, 1, 4); // piliers à 4 cases de haut
    rect(13, 10, 1, 4);
    rect(18, 10, 1, 4);
    put(18, 9, 'K');
    put(3, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, hold: { 1: 0 } }),

  make('Le judas', 'Le Mage monte sur les marches, puis tire une orbe dans le judas du mur pour ouvrir la porte. L’Archer file chercher la clé de l’autre côté.', ({ rect, put }) => {
    rect(3, 12, 3, 1); // marches de 2 cases
    rect(7, 10, 3, 1);
    rect(15, 1, 2, 13); // mur
    rect(15, 4, 2, 3, '.'); // judas de 3 cases, trop haut pour passer à pied
    rect(15, 7, 2, 7, 'a'); // porte au pied du mur
    put(18, 4, 'x'); // cristal derrière le mur
    rect(22, 10, 4, 1); // corniche à 4 cases : double saut de l'Archer
    put(23, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, hold: { 1: 0 } }),

  make('Tir d’adresse', 'La flèche doit passer par la meurtrière quand le volet s’ouvre. Visez et tirez en plein saut.', ({ rect, put }) => {
    rect(18, 1, 2, 13); // grand mur
    rect(18, 6, 2, 1, 'w'); // meurtrière à volet
    rect(18, 9, 2, 5, 'a'); // porte au pied du mur
    put(23, 6, 'o'); // cible derrière le mur
    put(22, 2, 'y'); // cristal du Mage
    rect(26, 6, 1, 8, 'b');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, shutters: { 1: { period: 150, open: 40, phase: 0 } } }),

  make('Le sceau', 'Un indice n’apparaît que pour l’Archer. Le Mage doit toucher les trois cristaux dans le bon ordre.', ({ rect, put }) => {
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
    sequence: { group: 3, order: [2, 0, 1], timeout: 900 },
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
  }, { abilities: true, and: [1], latch: { 1: 300 }, hold: { 1: 100 }, shutters: { 1: { period: 120, open: 45, phase: 0 } } }),
];

module.exports = { LEVELS };

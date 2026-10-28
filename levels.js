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
  make('Le sas', 'Trois salles, deux grilles. Une grille ne reste ouverte que si quelqu’un tient une plaque : à qui de rester en arrière ? La clé est sur une corniche trop haute pour sauter seul.', ({ rect, put }) => {
    put(8, 10, '*'); // étoile cachée : sur une marche haute de la salle de départ
    rect(8, 11, 2, 1); // marche (3 cases : il faut faire la courte-échelle)
    put(3, 13, '2'); // plaque P2 (ouvre la grille B)
    put(6, 13, '1'); // plaque P1 (ouvre la grille A)
    rect(10, 1, 1, 13, 'a'); // grille A
    put(12, 13, '1'); // plaque P1' (salle 2)
    rect(13, 14, 3, 1, '^'); // fosse à pointes
    rect(17, 11, 3, 1); // corniche de la clé : trop haute pour un seul saut
    put(18, 10, 'K');
    rect(20, 1, 1, 13, 'b'); // grille B
    put(22, 13, '2'); // plaque P2' (salle 3)
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { latch: { 1: 240, 2: 240 } }),

  make('Funambules', 'Un fil magique vous relie : les blocs verts n’existent que si vous restez à moins de 7 cases l’un de l’autre. À chaque palier, l’un tient la plaque pour la grille pendant que l’autre grimpe. Qui passe en premier ?', ({ rect, put }) => {
    put(26, 1, '*'); // étoile cachée : sous le plafond du dernier palier
    // palier A (le sol)
    put(5, 13, '1');
    rect(7, 1, 1, 13, 'a');
    put(9, 14, '^');
    put(9, 12, 'l');
    put(14, 14, '^');
    put(19, 14, '^');
    // palier B
    rect(10, 11, 4, 3);
    put(10, 10, '2');
    put(11, 10, '2');
    rect(12, 1, 1, 10, 'b');
    put(14, 9, 'l');
    // palier C
    rect(15, 8, 4, 6);
    put(15, 7, '3');
    put(16, 7, '3');
    rect(17, 1, 1, 7, 'c');
    put(19, 6, 'l');
    // palier D (arrivée)
    rect(20, 5, 9, 9);
    put(21, 4, '3');
    put(22, 4, '3');
    put(24, 4, 'K');
    put(27, 4, 'D');
    put(2, 13, 'S');
  }, { link: true, latch: { 1: 100, 2: 100, 3: 100 } }),


  make('La tour', 'Deux tours, deux lancers. Placez-vous contre votre coéquipier, F pour le porter, F encore pour le lancer sur la corniche (garde → ou ← enfoncée pendant le vol). Là-haut, il tient la plaque pendant que l’autre passe.', ({ rect, put }) => {
    put(3, 5, '*'); // étoile cachée : haut de la première salle
    // première tour : corniche haute (4 cases), plaque P1 qui ouvre la grille A
    rect(6, 10, 5, 1);
    put(7, 9, '1');
    put(8, 9, '1');
    rect(12, 1, 1, 13, 'a');
    // deuxième salle : escalier libre jusqu'à la marche 3
    rect(13, 12, 2, 1);
    rect(15, 10, 2, 1);
    rect(17, 8, 2, 1);
    // la grande plate-forme (arrivée) : inaccessible sans lancer ou sans l'escalier de droite
    rect(26, 4, 3, 1);
    put(26, 3, '2');
    put(28, 3, 'K');
    put(27, 3, 'D');
    rect(23, 4, 1, 10, 'b'); // grille B au pied de l'escalier de droite
    rect(26, 12, 2, 1);
    rect(24, 10, 2, 1);
    rect(26, 8, 2, 1);
    rect(24, 6, 2, 1);
    put(2, 13, 'S');
  }, { carry: true, latch: { 1: 180, 2: 120 } }),


  make('Les remparts', 'Le rempart est trop haut : lancez-en un par-dessus (F pour porter, F pour lancer). De l’autre côté, sa plaque ouvre la poterne. Puis la courte-échelle jusqu’à la corniche (plaque et clé), et enfin le gouffre : le fil vous lie, passez ensemble !', ({ rect, put }) => {
    put(28, 3, '*'); // étoile cachée : coin haut droit
    // le rempart : 2 cases d'épaisseur, 4 de haut, une poterne (grille A) en bas
    rect(9, 10, 2, 2);
    rect(9, 12, 2, 2, 'a');
    put(11, 13, '1');
    put(12, 13, '1');
    // la corniche de la plaque B et de la clé (3 cases : courte-échelle)
    rect(13, 11, 3, 1);
    put(13, 10, 'K');
    put(14, 10, '2');
    put(15, 10, '2');
    rect(19, 1, 1, 13, 'b');
    // le gouffre
    rect(20, 14, 7, 1, '^');
    rect(21, 12, 2, 1, 'l');
    rect(24, 12, 2, 1, 'l');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { carry: true, link: true, latch: { 1: 180, 2: 120 } }),

  /* ===== Chapitre 2 : Arcanes, un Mage et un Archer ===== */
  make('Verrou', 'La grille exige TROIS choses en même temps : le Mage sur sa plaque, son orbe sur le cristal ET la flèche de l’Archer sur la cible. L’Archer monte sur la corniche d’un double saut. Allez vite : les flammes s’éteignent !', ({ rect, put }) => {
    put(13, 2, '*'); // étoile cachée : haut de la première salle
    put(3, 13, '1'); // plaque du Mage
    put(7, 6, 'x'); // cristal visible depuis la plaque
    rect(9, 10, 3, 1); // corniche de l'Archer (4 cases : double saut)
    put(13, 4, 'o'); // cible visible depuis la corniche
    rect(15, 1, 1, 13, 'a'); // la grille
    rect(21, 9, 3, 1); // corniche de la clé (5 cases : double saut)
    put(22, 8, 'K');
    put(26, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, and: [1], hold: { 1: 150 }, latch: { 1: 150 } }),

  make('Pont de glace', 'Un gouffre immense. Le Mage fait naître des blocs de glace sur les runes (clic droit, 3 blocs au plus, ils fondent en 10 s). L’Archer, lui, le franchit d’un double saut et d’un dash. Un cristal derrière le gouffre ouvre la grille.', ({ rect, put }) => {
    put(27, 1, '*'); // étoile cachée
    rect(7, 14, 10, 1, '^'); // gouffre de 10 cases
    put(9, 13, 'r');
    put(12, 13, 'r');
    put(15, 13, 'r');
    put(19, 9, 'x'); // cristal derrière le gouffre
    rect(22, 1, 1, 13, 'a');
    put(24, 13, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, hold: { 1: 0 } }),

  make('Meurtrière', 'Le mur ne s’ouvre que par la meurtrière, et elle ne s’ouvre que par moments. L’Archer tire sur la cible au bon moment ; le Mage touche le cristal pendant que la cible est active. Puis passez la grille ensemble.', ({ rect, put }) => {
    put(27, 2, '*'); // étoile cachée
    put(4, 8, 'x'); // cristal du Mage
    rect(12, 1, 2, 13);
    rect(12, 8, 2, 1, 'w'); // meurtrière à volet
    rect(12, 9, 2, 5, 'a'); // porte au pied du mur
    put(19, 11, 'o'); // cible derrière le mur, plus bas que la meurtrière
    put(26, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, and: [1], hold: { 1: 240 }, latch: { 1: 150 }, shutters: { 1: { period: 150, open: 70, phase: 0 } } }),

  /* ===== Chapitre 3 : Ténèbres ===== */
  make('Lueur', 'Seul le Mage éclaire. Des dalles invisibles traversent les pics : suivez la lumière ! Depuis la dernière dalle, l’orbe du Mage touche le cristal et ouvre la grille. Plus loin, l’escalier de blocs liés ne tient que si vous restez ensemble.', ({ rect, put }) => {
    put(5, 3, '*'); // étoile cachée : haut de la salle de départ
    rect(3, 14, 10, 1, '^'); // gouffre
    rect(4, 12, 2, 1, 'h'); // dalles invisibles
    rect(7, 11, 2, 1, 'h');
    rect(10, 12, 2, 1, 'h');
    put(13, 13, 'C');
    put(11, 8, 'x'); // cristal au-dessus de la dernière dalle
    rect(15, 1, 1, 13, 'a');
    rect(17, 12, 2, 1, 'l'); // escalier lié
    rect(19, 10, 2, 1, 'l');
    rect(21, 8, 2, 1, 'l');
    rect(23, 6, 2, 1, 'l');
    rect(25, 5, 4, 1); // mezzanine
    put(26, 4, 'K');
    put(17, 13, 'C');
    put(2, 13, 'S');
    put(27, 13, 'D');
  }, { abilities: true, dark: true, link: true, hold: { 1: 0 } }),

  make('Le fil d’Ariane', 'Dans le noir, deux grands vides. Le Mage fait naître des blocs de glace sur les runes (clic droit) : trois à la fois, et ils fondent en 10 s ! Au bout, la plaque lourde exige DEUX poids. L’Archer ramasse la clé, cachée en hauteur.', ({ rect, put }) => {
    put(14, 4, '*'); // étoile cachée
    rect(5, 14, 8, 1, '^');
    rect(13, 12, 3, 2); // plate-forme 2
    rect(16, 14, 8, 1, '^');
    put(7, 13, 'r');
    put(10, 13, 'r');
    put(18, 13, 'r');
    put(21, 13, 'r');
    rect(24, 12, 5, 2); // plate-forme 3
    put(24, 11, '1');
    put(25, 11, '1');
    rect(26, 1, 1, 10, 'a');
    put(2, 13, 'S');
    rect(14, 9, 2, 1, 'h'); // pas invisibles vers la clé
    put(15, 8, 'K');
    put(27, 11, 'D');
  }, { abilities: true, dark: true, heavy: [1], latch: { 1: 240 } }),

  /* ===== Chapitre 4 : Sanctuaire (synchronisation et casse-têtes) ===== */
  make('Le sceau', 'Six symboles s’affichent uniquement pour l’Archer, sur sa corniche. Il les dicte au Mage, qui touche les trois cristaux dans cet ordre (moins de 7 secondes entre deux tirs, une erreur remet tout à zéro). Au-delà : une plaque, une clé en hauteur, et une grille qui se referme vite.', ({ rect, put }) => {
    put(17, 1, '*'); // étoile cachée
    rect(2, 9, 4, 1); // corniche de l’indice : l’Archer seul y monte
    put(17, 3, 'z'); // cristal n°0
    put(9, 5, 'z'); // cristal n°1
    put(13, 9, 'z'); // cristal n°2
    rect(19, 1, 1, 13, 'c'); // grille du sceau
    put(21, 13, '2'); // plaque
    rect(22, 10, 3, 1); // corniche de la clé : l’Archer seul
    put(23, 9, 'K');
    rect(25, 1, 1, 13, 'b'); // grille de sortie
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, {
    abilities: true,
    sequence: { group: 3, order: [1, 2, 0, 2, 1, 0], timeout: 420 },
    labels: [{ tx: 3, ty: 7, shapes: [1, 2, 0, 2, 1, 0], role: 'archer', radius: 130 }],
    latch: { 2: 100 },
  }),

  make('Synchro', 'Deux verrous à la suite. 1) Quelqu’un tient la plaque pendant que l’autre touche le cristal. 2) Plaque, cristal ET cible (derrière une meurtrière qui ne s’ouvre que par moments) doivent être actifs en même temps. Les grilles se rouvrent peu de temps : courez !', ({ rect, put }) => {
    put(23, 2, '*'); // étoile cachée
    put(5, 13, '1');
    put(5, 2, 'x'); // cristal au-dessus de la première plaque
    rect(9, 1, 1, 13, 'a');
    put(11, 13, 'C');
    put(13, 13, '2');
    put(13, 2, 'y'); // cristal du second verrou
    rect(22, 1, 2, 13); // mur jusqu’au plafond
    rect(22, 10, 2, 1, 'v'); // meurtrière à volet
    rect(22, 11, 2, 3, 'b'); // grille au pied du mur
    put(26, 12, 'p'); // cible derrière le mur
    rect(14, 10, 3, 1); // corniche de la clé : l’Archer seul
    put(15, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, {
    abilities: true,
    and: [1, 2],
    latch: { 1: 110, 2: 130 },
    hold: { 1: 300, 2: 260 },
    shutters: { 2: { period: 150, open: 70, phase: 0 } },
  }),

  make('Le grand saut', 'Sautez TOUS LES DEUX EN MÊME TEMPS (moins d’une demi-seconde d’écart) : un chemin doré apparaît 6 secondes au-dessus des pics. Prenez la clé, revenez sur vos pas (nouveau saut commun) et franchissez la porte, tout à gauche. Si vous tombez, vous repartez de l’îlot.', ({ rect, put }) => {
    put(14, 3, '*'); // étoile cachée
    rect(6, 14, 22, 1, '^');
    rect(7, 12, 4, 1, 's');
    rect(12, 11, 3, 1, 's');
    rect(16, 10, 3, 1, 's');
    rect(20, 10, 3, 1); // îlot
    put(21, 9, 'C');
    rect(24, 9, 2, 1, 's');
    rect(26, 7, 3, 1); // plateau
    put(27, 6, 'K');
    put(4, 13, 'D');
    put(1, 13, 'S');
  }, { sync: true }),

  make('Le relais', 'Seul l’Archer peut grimper sur la corniche de la plaque de gauche. Seul le Mage passe sous la haute plateforme. Chacun tient une plaque pour ouvrir le passage de l’autre, puis il faut être DEUX sur la plaque lourde pour sortir.', ({ rect, put }) => {
    put(10, 5, '*'); // étoile cachée
    rect(4, 10, 3, 1); // corniche : l’Archer seul
    put(5, 9, '1'); // plaque A (ouvre la grille du couloir bas)
    rect(8, 8, 13, 1); // haute plateforme
    rect(9, 9, 1, 5, 'a'); // grille du couloir bas
    put(12, 13, '2'); // plaque B (ouvre la grille du couloir haut)
    rect(14, 1, 1, 7, 'b'); // grille du couloir haut
    put(19, 7, 'K');
    rect(15, 14, 5, 1, '^'); // pics sous la plateforme
    put(22, 13, '3'); // plaques lourdes
    put(23, 13, '3');
    rect(25, 1, 1, 13, 'c');
    put(27, 13, 'D');
    put(1, 13, 'S');
  }, { abilities: true, heavy: [3], latch: { 3: 100 } }),

  /* ===== Chapitre 5 : Jardins suspendus (ressorts) ===== */
  make('Tremplin', 'Les ressorts propulsent à 6 cases. Une plaque ne reste enfoncée que si on est dessus : l’un monte sur la terrasse et tient la plaque, l’autre passe la grille, puis on inverse. Quand la plaque se relâche, vous n’avez que quelques secondes pour passer. Attention aux pics !', ({ rect, put }) => {
    put(10, 4, '*'); // étoile cachée
    put(4, 13, 'j'); // ressort 1
    rect(6, 9, 5, 1); // terrasse 1
    put(8, 8, '1'); // plaque 1 (ouvre la grille a)
    rect(9, 14, 3, 1, '^');
    rect(12, 1, 1, 13, 'a');
    put(15, 13, 'j'); // ressort 2
    rect(17, 9, 4, 1); // terrasse 2
    put(18, 8, 'K');
    put(20, 8, '2'); // plaque 2 (ouvre la grille b)
    rect(22, 1, 1, 13, 'b');
    rect(23, 14, 2, 1, '^');
    put(26, 13, 'D');
    put(2, 13, 'S');
  }, { latch: { 1: 110, 2: 110 } }),

  make('Haute voltige', 'Trois plaques lourdes : il faut être DEUX dessus pour les enfoncer, et les grilles se referment vite. Posez-vous ensemble sur la première, filez jusqu’au premier ressort ; sur la corniche, deuxième plaque, puis ressort et clé tout en haut ; troisième plaque, et redescendez à deux sans traîner !', ({ rect, put }) => {
    put(26, 2, '*'); // étoile cachée
    put(4, 13, '1');
    put(5, 13, '1');
    rect(8, 1, 1, 13, 'a');
    put(10, 13, 'j');
    rect(13, 9, 4, 1);
    put(13, 8, '3');
    put(14, 8, '3');
    put(16, 8, 'j');
    rect(18, 1, 1, 8, 'c');
    rect(19, 4, 6, 1);
    put(20, 3, 'K');
    put(22, 3, '2');
    put(23, 3, '2');
    rect(25, 1, 1, 13, 'b');
    rect(10, 14, 6, 1, '^');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { heavy: [1, 2, 3], latch: { 1: 90, 2: 150, 3: 80 } }),

  make('Nénuphars', 'Les nénuphars coulent et remontent en vague (les cases pointillées sont immergées) : sautez sur le suivant dès qu’il émerge, sans vous arrêter ! Sur l’îlot, posez-vous à deux sur les plaques pour ouvrir la grille, prenez la clé, et repartez dans le rythme.', ({ rect, put }) => {
    put(14, 6, '*'); // étoile cachée
    rect(4, 14, 22, 1, '^');
    rect(5, 13, 3, 1, 'w'); // vague : w (groupe 1) puis v (2) puis u (3)...
    rect(9, 13, 3, 1, 'v');
    rect(13, 12, 3, 1, 'u');
    rect(17, 13, 4, 1); // îlot
    put(17, 12, 'C');
    put(18, 12, '1');
    put(19, 12, '1');
    put(20, 12, 'K');
    rect(21, 1, 1, 13, 'a');
    rect(23, 13, 2, 1, 'w');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { heavy: [1], latch: { 1: 150 }, shutters: { 1: { period: 240, open: 100, phase: 100 }, 2: { period: 240, open: 100, phase: 20 }, 3: { period: 240, open: 100, phase: 180 } } }),

  /* ===== Chapitre 6 : La Forge (flèche de feu, bois, torches) ===== */
  make('Premier feu', 'Le bois barre la route : l’Archer l’embrase avec la flèche de feu (bouton Feu, puis clic sur le bois). Le Mage touche le cristal, puis l’Archer allume la torche.', ({ rect, put }) => {
    put(27, 7, '*'); // étoile cachée
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
    put(16, 5, '*'); // étoile cachée
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

  make('Le passeur', 'Le gouffre est trop large pour le Mage. L’Archer le porte (F) jusqu’au bord, puis le lance (F encore) : le Mage garde la touche → enfoncée pendant le vol pour aller loin ! L’Archer franchit le gouffre seul (double saut + dash), brûle le mur de bois, et le Mage touche le cristal.', ({ rect, put }) => {
    put(13, 7, '*'); // étoile cachée
    rect(6, 14, 10, 1, '^'); // gouffre de 10 cases : seul l'Archer le franchit seul
    put(5, 13, 'C');
    put(17, 13, 'C');
    rect(21, 1, 2, 13, 't'); // mur de bois
    put(23, 6, 'x'); // cristal derrière le mur
    rect(25, 1, 1, 13, 'a');
    put(24, 13, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, carry: true, hold: { 1: 0 } }),
  make('Brasier', 'Le mur de bois barre la route : brûlez-le. Dans la salle, trois choses doivent être vraies EN MÊME TEMPS : vous deux sur la plaque lourde, le cristal du Mage et la torche de l’Archer. Tirez depuis la plaque, vite : les flammes s’éteignent !', ({ rect, put }) => {
    put(25, 3, '*'); // étoile cachée
    rect(8, 1, 2, 13, 't'); // mur de bois
    put(12, 13, '1'); // plaque lourde
    put(13, 13, '1');
    put(11, 5, 'x'); // cristal du Mage
    put(15, 6, 'f'); // torche de l'Archer
    rect(20, 1, 1, 13, 'a');
    rect(22, 10, 3, 1); // corniche : seul l'Archer l'atteint
    put(23, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, heavy: [1], and: [1], hold: { 1: 240 }, latch: { 1: 150 } }),
  /* ===== Chapitre 7 : Les Brumes (échange) ===== */
  make('Échange', 'L’Archer franchit le gouffre en dash. Visez-le avec l’éclair d’échange (bouton Échange, puis clic sur l’Archer) : le Mage prend sa place de l’autre côté ! Puis le Mage touche le cristal.', ({ rect, put }) => {
    put(19, 7, '*'); // étoile cachée
    rect(6, 14, 12, 1, '^');
    put(21, 10, 'x');
    put(22, 13, 'K');
    rect(24, 1, 1, 13, 'a');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, swap: true, hold: { 1: 900 } }),

  make('Le pilier', 'Le cristal est posé sur un pilier inatteignable pour le Mage. Le Mage monte sur la corniche, l’Archer bondit sur le pilier : échangez vos places !', ({ rect, put }) => {
    put(24, 7, '*'); // étoile cachée
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
    put(19, 7, '*'); // étoile cachée
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
    put(9, 6, '*'); // étoile cachée
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

  /* ===== Chapitre 8 : Le Sommet (très difficile) ===== */
  make('Camp de base', 'Trois épreuves d’affilée, sans pouvoirs. 1) Posez-vous À DEUX sur la plaque lourde et passez la porte avant qu’elle ne se referme. 2) Le fil : restez à moins de 7 cases pour que les blocs verts tiennent. 3) Sautez ENSEMBLE pour faire apparaître l’escalier doré : clé, puis porte !', ({ rect, put }) => {
    put(19, 6, '*'); // étoile cachée
    put(4, 13, '1'); // plaque lourde
    put(5, 13, '1');
    rect(7, 1, 1, 13, 'a');
    put(8, 13, 'C');
    rect(9, 14, 9, 1, '^');
    rect(9, 13, 2, 1, 'l');
    rect(12, 12, 2, 1, 'l');
    rect(15, 11, 2, 1, 'l');
    put(19, 13, 'C');
    rect(20, 14, 7, 1, '^');
    rect(20, 12, 2, 1, 's');
    rect(22, 11, 2, 1, 's');
    rect(24, 10, 2, 1, 's');
    put(25, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { heavy: [1], link: true, sync: true, latch: { 1: 90 } }),
  make('Métronome', 'Les dalles plongent à tour de rôle, en vague : une dalle se solidifie juste quand la précédente va couler. Enchaînez les sauts sans vous arrêter ! Au milieu, posez-vous à deux sur les plaques pour ouvrir la porte, puis repartez dans le rythme.', ({ rect, put }) => {
    put(20, 9, '*'); // étoile cachée
    rect(4, 14, 22, 1, '^'); // pics de x=4 à x=25
    rect(5, 13, 3, 1, 'u'); // vague : u (groupe 3) puis v (2) puis w (1)...
    rect(10, 13, 3, 1, 'v');
    rect(15, 13, 3, 1, 'w');
    rect(19, 13, 3, 1); // îlot central
    put(19, 12, '1'); // plaques lourdes
    put(20, 12, '1');
    put(21, 12, 'C');
    rect(22, 1, 1, 13, 'a'); // porte devant la suite
    rect(23, 13, 3, 1, 'u');
    put(24, 12, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { heavy: [1], latch: { 1: 150 }, shutters: { 1: { period: 240, open: 140, phase: 220 }, 2: { period: 240, open: 140, phase: 60 }, 3: { period: 240, open: 140, phase: 140 } } }),

  make('Tempête', 'Trois verrous. 1) Cristal ET cible ensemble : le Mage touche le cristal, l’Archer la cible, en moins de 3 secondes. 2) Le gouffre : la glace du Mage (runes). 3) La meurtrière du mur s’ouvre en rythme : l’Archer tire par la fente sur la cible, le chrono est serré.', ({ rect, put }) => {
    put(18, 3, '*'); // étoile cachée
    put(6, 4, 'x'); // cristal (groupe 1)
    put(4, 8, 'o'); // cible (groupe 1)
    rect(8, 1, 1, 13, 'a');
    put(9, 13, 'C');
    rect(10, 14, 10, 1, '^'); // gouffre
    put(13, 13, 'r');
    put(17, 13, 'r');
    put(20, 13, 'C');
    rect(24, 1, 2, 13); // mur
    rect(24, 10, 2, 1, 'w'); // meurtrière à volet
    rect(24, 11, 2, 3, 'b'); // porte au pied du mur
    put(27, 10, 'p'); // cible derrière le mur
    rect(21, 10, 2, 1); // corniche : seul l'Archer l'atteint
    put(22, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, and: [1], hold: { 1: 180, 2: 900 }, latch: { 1: 150 }, shutters: { 1: { period: 150, open: 80, phase: 0 } } }),
  make('Cheminée', 'Une montée de trois corniches à 4 cases d’écart : seul l’Archer y monte (double saut). Le Mage doit échanger sa place avec lui à chaque étage (bouton Échange, puis clic sur l’Archer). Les pics en dessous : ne tombez pas ! En haut : clé, cristal, puis la descente.', ({ rect, put }) => {
    put(28, 1, '*'); // étoile cachée
    rect(9, 14, 17, 1, '^'); // pics de x=9 à x=25
    rect(3, 10, 4, 1); // corniche A
    rect(9, 6, 4, 1); // corniche B
    put(10, 5, 'C');
    rect(14, 3, 4, 1); // corniche C (tout en haut)
    put(15, 2, 'K');
    put(17, 2, 'x'); // cristal
    rect(20, 5, 3, 1); // descente
    rect(23, 9, 2, 1);
    rect(25, 1, 1, 13, 'a');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, swap: true, hold: { 1: 600 } }),
  make('Pointe de givre', 'Le sommet approche. Brûlez le mur de bois (Archer). Dans la salle, cristal ET torche en même temps (moins de 4 secondes d’écart). Puis la montée : le Mage pose trois blocs de glace sur les runes (ils fondent en 10 s), et vous grimpez tous les deux avant qu’ils ne disparaissent !', ({ rect, put }) => {
    put(26, 1, '*'); // étoile cachée
    rect(7, 1, 2, 13, 't'); // mur de bois
    put(11, 5, 'x'); // cristal
    put(13, 7, 'f'); // torche
    rect(16, 1, 1, 13, 'a');
    put(18, 12, 'r'); // marches de glace
    put(20, 10, 'r');
    put(22, 8, 'r');
    rect(24, 8, 2, 6); // gros mur : le sommet est de l'autre côté
    put(24, 7, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, and: [1], hold: { 1: 220 }, latch: { 1: 120 } }),
  make('Le Sommet', 'L’ultime ascension. Le fil vous lie dans l’escalier. En haut, une seule porte, quatre conditions EN MÊME TEMPS : vous deux sur la plaque lourde, le cristal, la torche et la cible. Puis le dernier gouffre : sautez ensemble !', ({ rect, put }) => {
    put(6, 1, '*'); // étoile cachée
    rect(3, 12, 3, 1, 'l'); // escalier lié
    rect(7, 10, 3, 1, 'l');
    rect(10, 8, 7, 1); // plate-forme du sommet
    put(11, 7, '1'); // plaque lourde
    put(12, 7, '1');
    put(14, 3, 'x'); // cristal
    put(16, 5, 'f'); // torche
    put(16, 2, 'o'); // cible
    rect(18, 1, 1, 13, 'a');
    put(19, 13, 'C');
    rect(20, 14, 7, 1, '^');
    rect(20, 12, 2, 1, 's');
    rect(22, 11, 2, 1, 's');
    rect(24, 10, 2, 1, 's');
    put(25, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, link: true, sync: true, heavy: [1], and: [1], hold: { 1: 360 }, latch: { 1: 240 } }),

  /* ===== Chapitre 9 : La Citadelle (boss final) ===== */
  make('Les Douves', 'Chaque seconde compte. 1) L’Archer embrase le mur de bois. 2) Le Mage pose trois blocs de glace sur les runes (ils fondent en 10 s) : traversez en courant. 3) Dans l’îlot : cristal, cible ET torche en même temps ouvrent la grille. 4) Des dalles plongent à tour de rôle au-dessus des pics : montez de dalle en dalle. L’Archer prend la clé sur la corniche.', ({ rect, put }) => {
    put(21, 9, '*'); // étoile cachée, sur la corniche de l'îlot
    rect(3, 1, 1, 13, 't'); // mur de bois (flèche de feu)
    rect(6, 14, 10, 1, '^'); // douves A : pics de x=6 à x=15 (trop large pour le Mage)
    put(8, 13, 'r'); // runes : pont de glace
    put(10, 13, 'r');
    put(12, 13, 'r');
    put(16, 13, 'C'); // checkpoint de l'îlot
    put(16, 6, 'x'); // cristal du Mage
    put(17, 4, 'o'); // cible de l'Archer
    put(16, 9, 'f'); // torche de l'Archer
    rect(18, 1, 1, 13, 'a'); // grille de l'îlot
    rect(20, 10, 2, 1); // corniche de l'étoile
    put(20, 13, 'C');
    rect(22, 14, 6, 1, '^'); // douves B : pics de x=22 à x=27
    rect(22, 12, 2, 1, 'u'); // dalles à tour de rôle (on monte de 2 cases à chaque fois)
    rect(25, 10, 2, 1, 'v');
    rect(23, 6, 2, 1); // corniche de la clé (double saut de l'Archer)
    put(24, 5, 'K');
    rect(28, 8, 1, 6); // pilier de la sortie
    put(28, 7, 'D');
    put(1, 13, 'S');
  }, { abilities: true, fire: true, and: [1], hold: { 1: 170 }, latch: { 1: 240 }, shutters: { 2: { period: 240, open: 140, phase: 60 }, 3: { period: 240, open: 140, phase: 140 } } }),

  make('Les Oubliettes', 'Deux épreuves. 1) L’Archer monte sur la corniche de gauche : lui seul voit la séquence de 5 symboles. Il la dicte, le Mage touche les trois cristaux dans cet ordre (moins de 5 secondes entre deux tirs, une erreur remet tout à zéro). 2) Au-delà de la grille, les pics : l’Archer saute sur la dalle, le Mage échange sa place avec lui (bouton Échange, puis clic sur l’Archer), et ainsi de suite jusqu’en haut. Attention : la dalle du milieu disparaît par moments !', ({ rect, put }) => {
    put(24, 2, '*'); // étoile cachée, au-dessus de la dernière dalle
    rect(2, 10, 3, 1); // corniche de l'indice (l'Archer seul)
    put(7, 3, 'z'); // cristaux de la séquence (numérotés de haut en bas)
    put(13, 6, 'z');
    put(16, 10, 'z');
    put(12, 13, 'C');
    rect(18, 1, 1, 13, 'c'); // grille : s'ouvre quand la séquence est juste
    put(17, 13, 'C');
    rect(19, 14, 10, 1, '^'); // pics de x=19 à x=28
    rect(19, 11, 2, 1); // dalle 1 : 3 cases au-dessus du sol (Archer seulement)
    rect(22, 8, 2, 1, 'u'); // dalle 2 : elle disparaît par moments
    rect(25, 5, 2, 1); // dalle 3
    put(26, 4, 'K');
    rect(27, 9, 3, 1); // terrasse de la porte
    put(28, 8, 'D');
    put(2, 13, 'S');
  }, {
    abilities: true,
    swap: true,
    sequence: { group: 3, order: [2, 0, 1, 0, 2], timeout: 300 },
    labels: [{ tx: 3, ty: 8, shapes: [2, 0, 1, 0, 2], role: 'archer', radius: 130 }],
    shutters: { 3: { period: 360, open: 90, phase: 0 } },
  }),

  make('Le Donjon', 'La dernière épreuve avant le Gardien, et la plus dure. 1) L’Archer embrase le mur de bois. 2) Posez-vous À DEUX sur la plaque lourde et passez la grille avant qu’elle ne retombe. 3) Salle des sceaux : le Mage touche le cristal pendant que l’Archer tire sur la cible ET allume la torche, le tout en moins de 2 secondes. 4) Les dalles montent en vague au-dessus des pics, d’une à l’autre sans vous arrêter. L’Archer prend la clé sur la corniche.', ({ rect, put }) => {
    put(26, 6, '*'); // étoile cachée, au-dessus de la corniche de la clé
    rect(3, 1, 1, 13, 't'); // mur de bois (flèche de feu)
    put(5, 13, '1'); // plaque lourde
    put(6, 13, '1');
    rect(10, 1, 1, 13, 'a'); // grille : la plaque est à 4 cases
    put(11, 13, 'C');
    put(13, 5, 'y'); // cristal du Mage (groupe 2)
    put(16, 3, 'p'); // cible de l'Archer
    put(17, 8, 'g'); // torche de l'Archer
    rect(19, 1, 1, 13, 'b'); // grille de la salle des sceaux
    put(18, 13, 'C');
    put(20, 13, 'C');
    rect(21, 14, 7, 1, '^'); // pics de x=21 à x=27
    rect(22, 13, 2, 1, 'u'); // dalles en vague, de plus en plus hautes
    rect(24, 12, 2, 1, 'v');
    rect(26, 11, 2, 1, 'w');
    rect(28, 10, 1, 4); // pilier de la porte
    put(28, 9, 'D');
    rect(23, 9, 3, 1); // corniche de la clé (double saut de l'Archer)
    put(24, 8, 'K');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, heavy: [1], and: [2], hold: { 2: 120 }, latch: { 1: 80, 2: 80 }, shutters: { 1: { period: 240, open: 140, phase: 220 }, 2: { period: 240, open: 140, phase: 60 }, 3: { period: 240, open: 140, phase: 140 } } }),

  make('Le Gardien', 'Le boss est protégé par un bouclier. Il tombe quand le Mage touche le cristal (à gauche) ET que l’Archer touche la cible (à droite) en même temps : retouchez-les avant qu’ils ne s’éteignent, et tirez sur le cœur du Gardien tant qu’il est vulnérable ! Chaque attaque est annoncée : rochers (zones rouges), onde de choc (sautez !), boules de feu (un tir les éteint).', ({ rect, put }) => {
    put(3, 5, '*'); // étoile cachée, tout en haut à gauche (l'Archer y monte par double saut, le Mage par l'éclair d'échange)
    rect(2, 10, 3, 1);
    rect(2, 6, 3, 1);
    rect(25, 10, 3, 1);
    put(1, 12, 'x'); // cristal du Mage
    put(28, 12, 'o'); // cible de l’Archer
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, swap: true, and: [1], hold: { 1: 210 }, boss: { cx: 480, cy: 160, hp: 48, hearts: 8, name: 'Le Gardien' } }),

  /* ===== Tutoriel : toutes les touches, avec des bulles explicatives (hors parcours : il est proposé à la toute première partie) ===== */
  make('Tutoriel', 'Suivez les consignes affichées en haut, une par une : quand vous avez tout essayé, tous les deux, la grille du fond s’ouvre.', ({ rect, put }) => {
    rect(4, 12, 1, 2); // muret : on apprend à sauter
    put(6, 13, 'C');
    rect(7, 14, 6, 1, '^'); // fosse trop large pour un simple saut : le dash
    put(13, 13, 'C');
    put(15, 9, 'x'); // cristal du Mage
    put(17, 9, 'o'); // cible de l'Archer
    rect(19, 1, 1, 13, 'a'); // grille : cristal ET cible ensemble
    put(21, 9, 'g'); // torche de l'Archer
    rect(23, 1, 1, 13, 'b'); // grille de la torche
    put(24, 13, 'r'); // rune du Mage
    rect(24, 10, 2, 1); // corniche : double saut de l'Archer
    rect(26, 1, 1, 13, 'c'); // grille finale : s'ouvre quand toutes les étapes sont faites par les deux joueurs
    put(27, 13, 'K');
    put(28, 13, 'D');
    put(2, 13, 'S');
  }, {
    abilities: true, fire: true, swap: true, carry: true, and: [1], hold: { 1: 0, 2: 0 },
    tutorial: { group: 3 },
  }),

];

// Chapitres : thème graphique, texte d'introduction et nombre de niveaux (dans l'ordre de LEVELS)
const CHAPTERS = [
  { name: 'La prairie', theme: 'prairie', count: 4, blurb: 'Pas de pouvoirs ici : portez-vous, lancez-vous, restez liés par le fil. Ici, tout se joue à deux.', powers: ['F : porter ton coéquipier, puis F encore pour le lancer', 'Blocs verts liés : ils disparaissent si vous vous éloignez de plus de 7 cases'] },
  { name: 'Les Arcanes', theme: 'arcane', count: 3, blurb: 'Un Mage, un Archer : chacun son pouvoir, et personne ne s’en sort seul. Les tirs n’ont pas besoin d’être parfaits.', powers: ['Mage : orbe sur les cristaux, glace sur les runes', 'Archer : flèche sur les cibles, double saut, dash'] },
  { name: 'Les Ténèbres', theme: 'dark', count: 2, blurb: 'Le noir est total. Seule la lumière du Mage montre le chemin, et le fil vous garde ensemble.' },
  { name: 'Le Sanctuaire', theme: 'sanctuary', count: 4, blurb: 'Sauts synchronisés, casse-têtes, ordre des cristaux : le temple teste votre coordination.', powers: ['Ponts dorés : sautez tous les deux en même temps pour les faire apparaître'] },
  { name: 'Les Jardins suspendus', theme: 'garden', count: 3, blurb: 'Des ressorts jaillissent des fleurs. Attention aux pics en bas !', powers: ['Ressort : retombez dessus pour être propulsé à 6 cases', 'Plaque lourde : il faut être deux dessus pour l’enfoncer'] },
  { name: 'La Forge', theme: 'forge', count: 4, blurb: 'Le bois brûle, les torches s’allument. Mais attention : le feu se propage à tout le bois relié.', powers: ['Archer : bouton Feu, puis clic dans le jeu (brûle le bois, allume les torches)', 'F : porter et lancer son coéquipier au-dessus des gouffres'] },
  { name: 'Les Brumes', theme: 'mist', count: 4, blurb: 'Le brouillard efface les distances. Il faudra échanger vos places.', powers: ['Mage : bouton Échange, puis clic sur l’autre joueur (vous échangez vos places)'] },
  { name: 'Le Sommet', theme: 'summit', count: 6, blurb: 'Le dernier chapitre : six épreuves très difficiles, chronos serrés. Les trois premières sont dures, les trois dernières extrêmes. Parlez-vous, répartissez-vous, et ne lâchez rien.', powers: ['Plaque lourde : il faut être deux dessus pour l’enfoncer', 'Tout ce que vous avez appris, d’affilée'] },
  { name: 'La Citadelle', theme: 'citadel', count: 4, blurb: 'Le dernier rempart. Un gardien veille, et il ne se laissera pas faire.', powers: ['Bouclier du boss : cristal du Mage ET cible de l’Archer en même temps', 'Barre de vie du boss en haut, cœurs de l’équipe en dessous'] },
  { name: 'Tutoriel', theme: 'prairie', count: 1, tutorial: true, blurb: 'Avant de partir à l’ascension : apprenez toutes les touches, à deux. Vous pouvez aussi passer le tutoriel.', powers: ['Une consigne à la fois, validée dès que vous faites la touche', 'Le chef de room peut passer le tutoriel'] },
];

let _c = 0;
CHAPTERS.forEach((ch, i) => {
  for (let k = 0; k < ch.count && _c < LEVELS.length; k++) LEVELS[_c++].chapter = i;
});

// Minuteur (en secondes) : chaque niveau en a un. Si le temps est écoulé, le niveau redémarre.
// Pour changer une durée, modifiez simplement ce tableau (nom du niveau : secondes).
// Un niveau absent du tableau reçoit DEFAULT_TIMER ; mettre 0 désactive le minuteur de ce niveau.
const DEFAULT_TIMER = 90;
const TIMERS = {
  'Échauffement': 45, 'Le mur': 50, 'Courte-échelle': 80, 'La corde': 80, // chapitre 1 : la prairie
  'L’étincelle': 60, 'Le tireur': 70, 'Le gouffre': 65, // chapitre 2 : les Arcanes
  'Dans le noir': 85, 'Le fil d’Ariane': 90, // chapitre 3 : les Ténèbres
  'Le sceau': 90, 'Synchro': 80, 'Le grand saut': 70, 'Le relais': 95, // chapitre 4 : le Sanctuaire
  'Tremplin': 65, 'Haute voltige': 80, 'Nénuphars': 60, // chapitre 5 : les Jardins
  'Premier feu': 70, 'Les quatre feux': 75, 'Le passeur': 90, 'Brasier': 85, // chapitre 6 : la Forge
  'Échange': 70, 'Le pilier': 75, 'Brouillard': 90, 'Cordée': 110, // chapitre 7 : les Brumes
  'Camp de base': 70, 'Métronome': 75, 'Tempête': 80, 'Cheminée': 100, 'Pointe de givre': 100, 'Le Sommet': 110, // chapitre 8 : le Sommet
  'Tutoriel': 0, 'Les Douves': 80, 'Les Oubliettes': 85, 'Le Donjon': 100, 'Le Gardien': 240, // chapitre 9 : la Citadelle
};
LEVELS.forEach((l) => { l.timer = TIMERS[l.name] !== undefined ? TIMERS[l.name] : DEFAULT_TIMER; });

// Médailles : temps (en secondes, depuis le début du niveau) à ne pas dépasser.
//   or      : temps ≤ ratio d'or × minuteur      argent : temps ≤ ratio d'argent × minuteur      bronze : niveau réussi
// Un ratio par chapitre : les premiers chapitres sont plus exigeants (on y va vite), le dernier plus généreux (minuteurs déjà serrés).
// Diamant : le palier ultime, un temps de coordination parfaite (environ 58 % du temps d'or, déduit des parcours des bots
// de test auxquels on laisse de la marge : un humain ne rejoue pas un bot).
// Pour régler un niveau à la main : MEDALS = { 'Nom du niveau': [secondes pour l\u2019or, secondes pour l\u2019argent, secondes pour le diamant (facultatif)] }
const GOLD_RATIOS = [0.4, 0.45, 0.45, 0.5, 0.5, 0.5, 0.5, 0.55, 0.6];
const SILVER_RATIOS = [0.65, 0.7, 0.7, 0.75, 0.75, 0.75, 0.75, 0.8, 0.85];
// Le combat de boss dure plus longtemps qu'un niveau : temps fixés à la main [or, argent, diamant]
const MEDALS = { 'Le Gardien': [110, 170, 65] };
LEVELS.forEach((l) => {
  const m = MEDALS[l.name];
  const g = GOLD_RATIOS[l.chapter] || 0.5;
  const sv = SILVER_RATIOS[l.chapter] || 0.75;
  const t = l.timer || 90;
  l.gold = m ? m[0] : Math.max(10, Math.round(t * g));
  l.silver = m ? m[1] : Math.max(l.gold + 5, Math.round(t * sv));
  l.diamond = m && m[2] ? m[2] : Math.max(6, Math.min(l.gold - 3, Math.round(l.gold * 0.58)));
});

module.exports = { LEVELS, CHAPTERS };

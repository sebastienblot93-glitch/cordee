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
// Les rôles sont fixés au salon : il n'y a plus de changement de personnage en jeu. Chaque niveau doit donc être réussi
// avec le Mage ET l'Archer tels quels, quel que soit le joueur qui prend quel rôle (les bots de test vérifient les deux cas).
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


  make('La tour', 'Trois tours, trois lancers. Placez-vous contre votre coéquipier, F pour le porter, F encore pour le lancer sur la corniche (garde → ou ← enfoncée pendant le vol). Là-haut, il tient la plaque pendant que l’autre passe, puis il redescend. Les grilles restent ouvertes une fois levées… et la porte de sortie est restée au départ : une fois la clé prise, redescendez tout en bas !', ({ rect, put }) => {
    put(3, 6, '*'); // étoile cachée : haut du sas de départ
    // sas de départ : petite corniche (4 cases) avec la plaque P3 qui ouvre la grille C
    rect(1, 10, 2, 1);
    put(1, 9, '3');
    put(2, 9, '3');
    rect(5, 1, 1, 13, 'c');
    // première tour : corniche haute (4 cases), plaque P1 qui ouvre la grille A
    rect(7, 10, 4, 1);
    put(8, 9, '1');
    put(9, 9, '1');
    rect(12, 1, 1, 13, 'a');
    // deuxième salle : escalier libre jusqu'à la marche 3
    rect(13, 12, 2, 1);
    rect(15, 10, 2, 1);
    rect(17, 8, 2, 1);
    // la grande plate-forme (arrivée) : inaccessible sans lancer ou sans l'escalier de droite
    rect(26, 4, 3, 1);
    put(26, 3, '2');
    put(28, 3, 'K');
    rect(23, 4, 1, 10, 'b'); // grille B au pied de l'escalier de droite
    rect(26, 12, 2, 1);
    rect(24, 10, 2, 1);
    rect(26, 8, 2, 1);
    rect(24, 6, 2, 1);
    put(2, 13, 'D'); // la sortie est au départ
    put(4, 13, 'S');
  }, { carry: true, latch: { 1: 99999, 2: 99999, 3: 99999 } }),


  make('Les remparts', 'Le rempart est trop haut : lancez-en un par-dessus (F pour porter, F pour lancer). De l’autre côté, sa plaque ouvre la poterne. Puis la courte-échelle jusqu’à la corniche (plaque et clé), et enfin le gouffre : le fil vous lie, passez ensemble !', ({ rect, put }) => {
    rect(27, 11, 2, 1, '#'); put(27, 10, '*'); // étoile cachée : sur une corniche trop haute pour un seul (courte-échelle)
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
  make('Verrou', 'Deux verrous à la suite. 1) La grille exige TROIS choses en même temps : le Mage sur sa plaque, son orbe sur le cristal ET la flèche de l’Archer sur la cible. L’Archer monte sur la corniche d’un double saut. 2) Plus loin, les rôles s’inversent : l’Archer tient sa plaque et tire sur la cible, pendant que le Mage touche son cristal. Allez vite : les flammes s’éteignent !', ({ rect, put }) => {
    put(13, 2, '*'); // étoile cachée : haut de la première salle
    put(3, 13, '1'); // plaque du Mage
    put(7, 6, 'x'); // cristal visible depuis la plaque
    rect(9, 10, 3, 1); // corniche de l'Archer (4 cases : double saut)
    put(13, 4, 'o'); // cible visible depuis la corniche
    rect(15, 1, 1, 13, 'a'); // la grille
    rect(21, 9, 3, 1); // corniche de la clé (5 cases : double saut)
    put(22, 8, 'K');
    put(18, 13, '2'); // plaque de l'Archer
    put(20, 4, 'p'); // cible visible depuis la plaque 2
    put(23, 5, 'y'); // cristal du Mage
    rect(25, 1, 1, 13, 'b'); // la deuxième grille
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, and: [1, 2], hold: { 1: 150, 2: 150 }, latch: { 1: 150, 2: 150 } }),

  make('Pont de glace', 'Un gouffre immense. Le Mage fait naître des blocs de glace sur les runes (clic droit, 3 blocs au plus, ils fondent en 10 s). L’Archer, lui, le franchit d’un double saut et d’un dash. Un cristal derrière le gouffre ouvre la grille. De l’autre côté, deux clés : l’une au sol, l’autre tout en haut de la tour, atteignable seulement par un escalier de glace (trois blocs, vite !). La porte de sortie est restée au départ : il faut repasser le gouffre !', ({ rect, put }) => {
    rect(2, 10, 3, 1, '#'); put(3, 9, '*'); // étoile cachée : corniche au-dessus du départ (double saut de l’Archer)
    rect(7, 14, 10, 1, '^'); // gouffre de 10 cases
    put(9, 13, 'r');
    put(12, 13, 'r');
    put(15, 13, 'r');
    put(19, 9, 'x'); // cristal derrière le gouffre
    rect(22, 1, 1, 13, 'a');
    put(25, 13, 'K'); // clé 1 : au sol
    // la tour : escalier de glace (runes) jusqu'à la corniche de la clé 2
    put(24, 12, 'r');
    put(26, 10, 'r');
    put(24, 8, 'r');
    rect(26, 6, 3, 1);
    put(27, 5, 'K');
    put(2, 13, 'D'); // la sortie est au départ : aller-retour
    put(5, 13, 'S');
  }, { abilities: true, hold: { 1: 0 } }),

  make('Meurtrière', 'Deux murs, deux meurtrières, chacune à son rythme. Mur 1 : l’Archer tire sur la cible au bon moment pendant que le Mage touche son cristal. Mur 2 : même chose avec la deuxième meurtrière (rythme différent) et le cristal en hauteur. Puis passez les deux grilles ensemble.', ({ rect, put }) => {
    rect(1, 10, 2, 1, '#'); put(2, 9, '*'); // étoile cachée : corniche au-dessus du départ (double saut de l’Archer)
    put(4, 8, 'x'); // cristal du Mage (mur 1)
    rect(12, 1, 2, 13);
    rect(12, 10, 2, 1, 'w'); // meurtrière à volet n°1
    rect(12, 11, 2, 3, 'a'); // porte au pied du mur 1
    put(15, 10, 'o'); // cible derrière le mur 1, plus bas que la meurtrière
    put(17, 5, 'y'); // cristal du Mage (mur 2), entre les deux murs
    rect(22, 1, 2, 13);
    rect(22, 11, 2, 1, 'v'); // meurtrière à volet n°2 (autre rythme), plus basse
    rect(22, 12, 2, 2, 'b'); // porte au pied du mur 2
    put(25, 11, 'p'); // cible derrière le mur 2
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, and: [1, 2], hold: { 1: 240, 2: 240 }, latch: { 1: 150, 2: 150 }, shutters: { 1: { period: 150, open: 70, phase: 0 }, 2: { period: 190, open: 60, phase: 80 } } }),

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

  make('Fil de lumière', 'Dans le noir, deux grands vides. Le Mage fait naître des blocs de glace sur les runes (clic droit) : trois à la fois, et ils fondent en 10 s ! Au bout, la plaque lourde exige DEUX poids. L’Archer ramasse la clé, cachée en hauteur.', ({ rect, put }) => {
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
  make('Les symboles', 'Six symboles s’affichent uniquement pour l’Archer, sur sa corniche (repère « INDICE » ; le code lu reste noté en haut de l’écran). Il les dicte au Mage (rond, triangle, carré), qui touche les trois cristaux dans cet ordre (moins de 7 secondes entre deux tirs, une erreur remet tout à zéro). Au-delà : une plaque, une clé en hauteur, et une grille qui se referme vite.', ({ rect, put }) => {
    rect(15, 10, 3, 1, '#'); put(16, 9, '*'); // étoile cachée
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
    labels: [{ tx: 3, ty: 7, shapes: [1, 2, 0, 2, 1, 0], role: 'archer', radius: 170 }],
    latch: { 2: 100 },
  }),

  make('Triple verrou', 'Deux verrous à la suite. 1) Quelqu’un tient la plaque pendant que l’autre touche le cristal. 2) Plaque, cristal ET cible (derrière une meurtrière qui ne s’ouvre que par moments) doivent être actifs en même temps. Deux clés : une sur la corniche (Archer), l’autre tout au fond. La porte de sortie est restée au départ : une fois ouvertes, les grilles le restent, retournez-y vite !', ({ rect, put }) => {
    put(19, 7, '*'); // étoile cachée : sur une corniche haute (Archer)
    rect(18, 8, 3, 1);
    put(5, 13, '1');
    put(5, 2, 'x'); // cristal au-dessus de la première plaque
    rect(9, 1, 1, 13, 'a');
    put(11, 13, 'C');
    put(13, 13, '2');
    put(13, 2, 'y'); // cristal du second verrou
    rect(22, 1, 2, 13); // mur jusqu’au plafond
    rect(22, 10, 2, 1, 'v'); // meurtrière à volet
    rect(22, 11, 2, 3, 'b'); // grille au pied du mur
    put(25, 12, 'p'); // cible derrière le mur
    rect(14, 10, 3, 1); // corniche de la clé : l’Archer seul
    put(15, 9, 'K');
    put(27, 13, 'K'); // seconde clé : au fond, derrière la deuxième grille
    put(2, 13, 'D'); // la sortie est au départ : aller-retour
    put(4, 13, 'S');
  }, {
    abilities: true,
    and: [1, 2],
    latch: { 1: 99999, 2: 99999 }, // une fois ouvertes, les grilles le restent (on doit pouvoir revenir)
    hold: { 1: 300, 2: 260 },
    shutters: { 2: { period: 150, open: 70, phase: 0 } },
  }),

  make('Les ponts d’or', 'Sautez TOUS LES DEUX EN MÊME TEMPS (moins d’une demi-seconde d’écart) : un chemin doré apparaît 6 secondes au-dessus des pics. Prenez la clé, revenez sur vos pas (nouveau saut commun) et franchissez la porte, tout à gauche. Si vous tombez, vous repartez de l’îlot.', ({ rect, put }) => {
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

  make('La navette', 'Seul l’Archer peut grimper sur la corniche de la plaque de gauche. Seul le Mage passe sous la haute plateforme. Chacun tient une plaque pour ouvrir le passage de l’autre, puis il faut être DEUX sur la plaque lourde pour atteindre la seconde clé. La porte de sortie est restée au départ : les grilles ouvertes le restent, faites la navette dans l’autre sens !', ({ rect, put }) => {
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
    put(27, 13, 'K'); // seconde clé : derrière la grille des plaques lourdes
    put(2, 13, 'D'); // la sortie est au départ : aller-retour
    put(4, 13, 'S');
  }, { abilities: true, heavy: [3], latch: { 1: 99999, 2: 99999, 3: 99999 } }),

  /* ===== Chapitre 5 : Jardins suspendus (ressorts) ===== */
  make('Les trampolines', 'Les ressorts propulsent à 6 cases. Une plaque ne reste enfoncée que si on est dessus : l’un monte sur la terrasse et tient la plaque, l’autre passe la grille, puis on inverse. Quand la plaque se relâche, vous n’avez que quelques secondes pour passer. Attention aux pics !', ({ rect, put }) => {
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

  make('Le cirque', 'Trois plaques lourdes : il faut être DEUX dessus pour les enfoncer. Posez-vous ensemble sur la première, filez jusqu’au premier ressort ; sur la corniche, deuxième plaque, puis ressort et clé tout en haut ; troisième plaque. La sortie est restée au départ : les grilles ouvertes le restent, mais il faut repasser par les ressorts, à deux !', ({ rect, put }) => {
    put(26, 2, '*'); // étoile cachée
    put(5, 13, '1');
    put(6, 13, '1');
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
    put(27, 13, 'K'); // seconde clé : au fond
    put(2, 13, 'D'); // la sortie est au départ : aller-retour
    put(4, 13, 'S');
  }, { heavy: [1, 2, 3], latch: { 1: 99999, 2: 99999, 3: 99999 } }),

  make('Les lotus', 'Les nénuphars coulent et remontent en vague (les cases pointillées sont immergées) : sautez sur le suivant dès qu’il émerge, sans vous arrêter ! Sur l’îlot, posez-vous à deux sur les plaques pour ouvrir la grille, prenez la clé, et repartez dans le rythme. Une seconde clé vous attend au bout, et la porte de sortie est restée au départ : il faudra repasser tous les nénuphars dans l’autre sens !', ({ rect, put }) => {
    put(14, 10, '*'); // étoile cachée
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
    put(27, 13, 'K'); // seconde clé : au fond
    put(2, 13, 'D'); // la sortie est au départ : aller-retour
    put(3, 13, 'S');
  }, { heavy: [1], latch: { 1: 99999 }, shutters: { 1: { period: 240, open: 100, phase: 100 }, 2: { period: 240, open: 100, phase: 20 }, 3: { period: 240, open: 100, phase: 180 } } }),

  /* ===== Chapitre 6 : La Forge (flèche de feu, bois, torches) ===== */
  make('Le bûcher', 'Le bois barre la route : l’Archer l’embrase avec la flèche de feu (bouton Feu, puis clic sur le bois). Derrière : cristal du Mage et torche de l’Archer doivent brûler en même temps. Puis un second mur de bois, une clé, et une dernière torche.', ({ rect, put }) => {
    rect(14, 10, 2, 1, '#'); put(15, 9, '*'); // étoile cachée
    rect(6, 1, 2, 13, 't'); // mur de bois n°1
    put(11, 4, 'x'); // cristal
    put(14, 6, 'f'); // torche
    rect(17, 1, 1, 13, 'a');
    rect(20, 1, 2, 13, 't'); // mur de bois n°2
    put(23, 13, 'K');
    put(24, 5, 'g'); // dernière torche
    rect(25, 1, 1, 13, 'b');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, and: [1], hold: { 1: 420, 2: 0 }, latch: { 1: 200 } }),

  make('Les quatre braseros', 'La porte exige quatre flammes en même temps : le cristal du Mage et les trois torches de l’Archer. Elles s’éteignent vite, et le bois qui protège la dernière torche doit brûler d’abord !', ({ rect, put }) => {
    rect(13, 10, 3, 1, '#'); put(14, 9, '*'); // étoile cachée
    rect(8, 12, 1, 2);
    rect(18, 12, 1, 2);
    put(5, 4, 'f');
    put(13, 4, 'f');
    rect(21, 1, 2, 13, 't'); // bois devant la 3e torche
    put(24, 4, 'f');
    put(16, 8, 'x');
    rect(26, 1, 1, 13, 'a');
    put(24, 13, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, and: [1], latch: { 1: 600 }, hold: { 1: 540 } }),

  make('Le bateleur', 'Le gouffre est trop large pour le Mage. L’Archer le porte (F) jusqu’au bord, puis le lance (F encore) : le Mage garde la touche → enfoncée pendant le vol pour aller loin ! L’Archer franchit le gouffre seul (double saut + dash), brûle le mur de bois, et le Mage touche le cristal. La clé est sur une corniche d’Archer… mais la porte de sortie est restée au départ : retraversez le gouffre, dans l’autre sens !', ({ rect, put }) => {
    put(13, 7, '*'); // étoile cachée
    put(5, 13, 'C');
    rect(6, 14, 10, 1, '^'); // gouffre de 10 cases
    put(16, 13, 'C');
    rect(20, 1, 2, 13, 't'); // mur de bois
    put(23, 6, 'x'); // cristal derrière le mur
    rect(25, 1, 1, 13, 'a');
    rect(26, 10, 3, 1); // corniche de la clé, derrière la grille
    put(27, 9, 'K');
    put(2, 13, 'D'); // la sortie est au départ : il faudra retraverser le gouffre
    rect(3, 1, 1, 13, 't'); // second mur de bois devant la sortie
    put(4, 13, 'S');
  }, { abilities: true, fire: true, carry: true, hold: { 1: 0 } }),

  make('La fonderie', 'Le mur de bois barre la route : brûlez-le. Chaque salle a sa grille, et pour l’ouvrir trois choses doivent être vraies EN MÊME TEMPS : vous deux sur la plaque lourde, le cristal du Mage et la torche de l’Archer. Tirez depuis la plaque, vite : les flammes s’éteignent ! Trois salles, puis la clé de l’Archer au fond… et la porte de sortie est restée au départ : il faut tout traverser dans l’autre sens.', ({ rect, put }) => {
    put(19, 9, '*'); // étoile cachée (corniche de la salle 2)
    rect(6, 1, 2, 13, 't'); // mur de bois
    put(9, 13, '1'); // plaque lourde n°1
    put(10, 13, '1');
    put(9, 3, 'x'); // cristal n°1 du Mage
    put(12, 6, 'f'); // torche n°1 de l'Archer
    rect(13, 1, 1, 13, 'a'); // grille n°1
    put(15, 13, '2'); // plaque lourde n°2
    put(16, 13, '2');
    put(16, 4, 'y'); // cristal n°2
    put(14, 7, 'g'); // torche n°2
    rect(18, 10, 2, 1); // corniche (étoile)
    rect(20, 1, 1, 13, 'b'); // grille n°2
    put(22, 13, '3'); // plaque lourde n°3
    put(23, 13, '3');
    put(23, 5, 'z'); // cristal n°3
    put(21, 8, 'e'); // torche n°3
    rect(25, 1, 1, 13, 'c'); // grille n°3
    rect(26, 10, 3, 1); // corniche du fond : seul l'Archer l'atteint
    put(27, 9, 'K');
    put(2, 13, 'D'); // la sortie est au départ : aller-retour
    put(4, 13, 'S');
  }, { abilities: true, fire: true, heavy: [1, 2, 3], and: [1, 2, 3], hold: { 1: 240, 2: 240, 3: 240 }, latch: { 1: 99999, 2: 99999, 3: 99999 } }),

  /* ===== Chapitre 7 : Les Brumes (éclair d’échange) ===== */
  make('Le passage', 'Le bois d’abord, puis cristal ET torche ensemble. Ensuite le gouffre est trop large pour le Mage : l’Archer le franchit au dash, puis le Mage vise l’Archer avec l’éclair d’échange (bouton Échange, puis clic sur lui) et prend sa place de l’autre côté — l’Archer se retrouve alors de l’autre côté, à vous de le faire revenir !', ({ rect, put }) => {
    put(9, 9, '*'); // étoile cachée
    rect(6, 1, 2, 13, 't'); // mur de bois
    put(9, 13, 'C');
    put(11, 5, 'f'); // torche
    put(10, 9, 'x'); // cristal
    rect(13, 1, 1, 13, 'a');
    put(14, 13, 'C');
    rect(15, 14, 9, 1, '^'); // gouffre de 9 cases
    put(24, 13, 'C');
    put(25, 13, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, fire: true, swap: true, and: [1], hold: { 1: 420 }, latch: { 1: 200 } }),

  make('La colonne', 'Le cristal est derrière une fenêtre en haut du mur, hors de portée du Mage. L’Archer grimpe sur la corniche, puis le Mage échange sa place avec lui (éclair d’échange). À l’autre bout : une clé en hauteur et deux plaques lourdes.', ({ rect, put }) => {
    put(24, 2, '*'); // étoile cachée
    rect(1, 12, 3, 1); // marche basse (le Mage y monte)
    rect(8, 8, 4, 1); // corniche d’où l’on vise la fenêtre : 4 cases au-dessus de la marche, Archer seul
    rect(14, 1, 2, 4); // mur, fenêtre aux lignes 5 et 6
    rect(14, 7, 2, 3);
    rect(14, 10, 2, 4, 'a'); // porte au pied du mur
    put(19, 5, 'x'); // cristal derrière la fenêtre
    rect(22, 10, 3, 1); // corniche de la clé
    put(23, 9, 'K');
    put(17, 13, '2'); // plaques lourdes
    put(18, 13, '2');
    rect(26, 1, 1, 13, 'b');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, swap: true, heavy: [2], hold: { 1: 0 }, latch: { 2: 120 } }),

  make('La brume épaisse', 'Dans le noir, l’Archer passe le gouffre, le Mage le rejoint par l’échange (bouton Échange), puis le bois brûle. Le Mage touche le cristal derrière le mur ; la clé est sur une corniche.', ({ rect, put }) => {
    put(19, 7, '*'); // étoile cachée
    put(5, 13, 'C');
    rect(6, 14, 10, 1, '^');
    put(16, 13, 'C');
    rect(21, 1, 2, 13, 't');
    put(24, 5, 'x');
    rect(23, 10, 3, 1);
    put(24, 9, 'K');
    rect(26, 1, 1, 13, 'a');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, swap: true, fire: true, dark: true, hold: { 1: 0 } }),

  make('Le col', 'Dernière épreuve du chapitre : le gouffre (dash et échange), le bois, cristal et torche ensemble, puis la montée sur des marches de glace que le Mage fait naître — trois blocs, dix secondes. Personne ne passe seul.', ({ rect, put }) => {
    put(17, 1, '*'); // étoile cachée
    put(3, 13, 'C');
    rect(4, 14, 8, 1, '^'); // gouffre de 8 cases
    put(12, 13, 'C');
    rect(14, 1, 2, 13, 't'); // mur de bois
    put(17, 4, 'x'); // cristal
    put(18, 6, 'f'); // torche
    rect(20, 1, 1, 13, 'a');
    put(21, 12, 'r'); // marches de glace
    put(22, 10, 'r');
    put(23, 8, 'r');
    rect(24, 6, 5, 8); // grand mur : la sortie est au sommet
    put(25, 5, 'K');
    put(27, 5, 'D');
    put(1, 13, 'S');
  }, { abilities: true, swap: true, fire: true, and: [1], hold: { 1: 400 }, latch: { 1: 200 } }),

  /* ===== Chapitre 8 : Le Sommet (très difficile) ===== */
  make('Bivouac', 'Sans pouvoirs, deux étages. Bas : 1) plaque lourde (à deux), la grille se referme vite ; 2) le fil : blocs verts au-dessus des pics, restez à moins de 7 cases ; 3) sautez ENSEMBLE pour faire apparaître l’escalier doré. Haut : la clé, puis un mur de 4 cases — portez-vous (F) et lancez-vous de l’autre côté, la plaque ouvre la grille pour le second.', ({ rect, put }) => {
    put(17, 10, '*'); // étoile cachée : au-dessus des blocs liés
    rect(1, 7, 28, 1); // plancher intermédiaire
    rect(26, 7, 2, 1, '.'); // trou vers l’étage
    put(4, 13, '1'); // plaques lourdes
    put(5, 13, '1');
    rect(8, 8, 1, 6, 'a');
    put(9, 13, 'C');
    rect(11, 14, 9, 1, '^');
    rect(12, 13, 2, 1, 'l'); // blocs liés
    rect(15, 12, 2, 1, 'l');
    rect(17, 13, 2, 1, 'l');
    put(21, 13, 'C');
    rect(22, 12, 2, 1, 's'); // escalier doré
    rect(24, 10, 2, 1, 's');
    rect(26, 9, 2, 1, 's');
    put(25, 6, 'C');
    rect(14, 3, 1, 4, 'c'); // mur-grille de 4 cases
    put(12, 6, '3');
    put(6, 6, 'K');
    put(2, 6, 'D');
    put(2, 13, 'S');
  }, { heavy: [1], link: true, sync: true, carry: true, latch: { 1: 100, 3: 150 } }),


  make('Le carillon', 'Deux étages. Bas : cristal ET cible en moins de 3 s ouvrent la grille, puis trois blocs de glace (10 s) sur les runes au-dessus des pics. Le même escalier de glace mène au trou du plafond. Haut : brûlez le mur de bois, puis cristal, cible ET torche en même temps ouvrent la dernière grille.', ({ rect, put }) => {
    put(17, 9, '*'); // étoile cachée
    rect(1, 7, 28, 1); // dalle intermédiaire
    rect(26, 7, 2, 1, '.'); // trou vers l’étage
    put(2, 13, 'S');
    put(6, 9, 'x'); // cristal (groupe 1)
    put(4, 10, 'o'); // cible (groupe 1)
    rect(8, 8, 1, 6, 'a');
    put(9, 13, 'C');
    rect(10, 14, 10, 1, '^'); // gouffre x=10..19
    put(12, 13, 'r');
    put(15, 13, 'r');
    put(18, 13, 'r');
    put(20, 13, 'C');
    put(22, 12, 'r'); // escalier de glace vers le trou
    put(24, 10, 'r');
    put(26, 9, 'r');
    rect(14, 1, 2, 6, 't'); // mur de bois
    put(8, 2, 'y'); // cristal (groupe 2)
    put(5, 3, 'p'); // cible (groupe 2)
    put(11, 4, 'g'); // torche (groupe 2)
    rect(8, 4, 3, 1); // corniche de la clé
    put(9, 3, 'K');
    rect(3, 1, 1, 6, 'b');
    put(2, 6, 'D');
  }, { abilities: true, fire: true, and: [1, 2], hold: { 1: 170, 2: 200 }, latch: { 1: 150, 2: 150 } }),

  make('Le boyau', 'Dans le noir, trois couloirs superposés. 1) Plaques lourdes à deux, puis un pont lié au-dessus des pics : ne vous éloignez pas à plus de 7 cases l’un de l’autre. 2) Le ressort vous envoie à l’étage ; l’Archer brûle le mur de bois, le Mage touche le cristal puis courez avant que la grille ne retombe. 3) Un dernier ressort ; la plaque ouvre une grille lointaine.', ({ rect, put }) => {
    put(26, 3, '*'); // étoile cachée
    rect(1, 10, 25, 1); // dalle 1 (trou à x=26..27)
    put(28, 10, '#');
    rect(4, 6, 25, 1); // dalle 2 (trou à x=1..3)
    rect(1, 2, 28, 1); // plafond
    put(2, 13, 'S');
    put(4, 13, '1');
    put(5, 13, '1');
    rect(9, 11, 1, 3, 'a');
    put(10, 13, 'C');
    rect(12, 14, 11, 1, '^'); // pics x=12..22
    rect(12, 13, 3, 1, 'l');
    rect(16, 13, 3, 1, 'l');
    rect(20, 13, 3, 1, 'l');
    put(24, 13, 'C');
    put(26, 13, 'j'); // ressort vers l’étage
    rect(19, 7, 2, 3, 't'); // mur de bois
    rect(12, 10, 3, 1, '^'); // trou à pics dans la dalle
    put(15, 7, 'y'); // cristal du groupe 2
    rect(5, 7, 1, 3, 'b'); // grille b
    put(2, 9, 'j'); // ressort vers le dernier étage
    put(6, 5, '3'); // plaque
    rect(20, 3, 1, 3, 'c'); // grille lointaine
    put(24, 5, 'K');
    put(27, 5, 'D');
  }, { abilities: true, fire: true, dark: true, link: true, heavy: [1], latch: { 1: 80, 2: 150, 3: 130 } }),

  make('Le code', 'Huit symboles ne s’affichent que pour l’Archer, sur sa corniche (repère « INDICE », le code reste noté en haut de l’écran). Il les dicte (rond, triangle, carré, losange) ; le Mage doit toucher les quatre cristaux dans cet ordre (moins de 5 s entre deux tirs, une erreur remet tout à zéro). Les piliers cachent les cristaux : il faut courir d’une salle à l’autre par les tunnels. Alors seulement la dernière grille s’ouvre.', ({ rect, put }) => {
    put(20, 10, '*'); // étoile cachée : salle 3
    rect(9, 5, 2, 7); // pilier 1 (tunnel en bas)
    rect(17, 5, 2, 7); // pilier 2
    rect(24, 5, 2, 7, '#'); // pilier 3
    rect(24, 12, 1, 2, 'c'); // grille du sceau dans le tunnel 3
    rect(2, 9, 4, 1); // corniche de l’indice : l’Archer seul
    put(13, 2, 'z'); // cristal n°0
    put(6, 3, 'z'); // cristal n°1
    put(21, 3, 'z'); // cristal n°2
    put(3, 10, 'z'); // cristal n°3
    rect(26, 10, 3, 1); // corniche de la clé
    put(27, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, {
    abilities: true,
    sequence: { group: 3, order: [2, 1, 3, 0, 2, 0, 3, 1], timeout: 300 },
    labels: [{ tx: 3, ty: 7, shapes: [2, 1, 3, 0, 2, 0, 3, 1], role: 'archer', radius: 170 }],
  }),

  make('La cadence', 'L’Archer prend la clé sur sa corniche, puis franchit le gouffre en dash. Le Mage le vise avec l’éclair d’échange (bouton Échange / touche E) pour prendre sa place de l’autre côté ; l’Archer refait ensuite le saut. Le mur a une fente qui s’ouvre en rythme : tirez sur la cible derrière, la porte basse s’ouvre. Enfin, à deux sur les plaques lourdes : la grille retombe vite, courez vers la porte !', ({ rect, put }) => {
    put(4, 7, '*'); // étoile cachée : au-dessus de la corniche de la clé
    rect(3, 10, 3, 1); // corniche de la clé
    put(4, 9, 'K');
    rect(10, 14, 10, 1, '^'); // gouffre x=10..19
    put(9, 13, 'C');
    put(20, 13, 'C');
    rect(22, 1, 2, 13); // mur épais
    rect(22, 12, 2, 1, 'w'); // fente à volet
    rect(22, 13, 2, 1, 'b'); // porte basse
    put(25, 12, 'p'); // cible derrière le mur
    put(24, 13, '1'); // plaques lourdes devant la sortie
    put(25, 13, '1');
    rect(26, 1, 1, 13, 'a'); // dernière grille
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, { abilities: true, swap: true, heavy: [1], latch: { 1: 60 }, hold: { 2: 900 }, shutters: { 1: { period: 150, open: 80, phase: 0 } } }),

  make('La cime', 'L’ultime ascension, en trois étages. 1) Plaques lourdes (la grille retombe vite), pont lié sur les pics, puis sautez ensemble pour l’escalier doré. 2) L’Archer brûle le mur de bois ; cristal, cible ET torche en même temps ouvrent la grille ; le Mage bâtit l’escalier de glace jusqu’au trou. 3) Un mur de 3 cases : l’Archer saute dessus, le Mage échange sa place avec lui ; puis les plaques lourdes et la dernière grille.', ({ rect, put }) => {
    put(8, 3, '*'); // étoile cachée : dernier étage
    rect(1, 10, 21, 1); // dalle 1 (trou à x=22..28)
    rect(4, 6, 25, 1); // dalle 2 (trou à x=1..3)
    // étage 1
    put(2, 13, 'S');
    put(4, 13, '1');
    put(5, 13, '1');
    rect(9, 11, 1, 3, 'a');
    put(10, 13, 'C');
    rect(12, 14, 8, 1, '^'); // pics x=12..19
    rect(12, 13, 3, 1, 'l');
    rect(16, 13, 3, 1, 'l');
    put(20, 13, 'C');
    rect(26, 12, 2, 1, 's'); // escalier doré
    rect(23, 11, 2, 1, 's');
    // étage 2
    rect(14, 7, 2, 3, 't'); // mur de bois
    put(11, 7, 'y'); // cristal (groupe 2)
    put(8, 8, 'p'); // cible (groupe 2)
    put(12, 8, 'g'); // torche (groupe 2)
    rect(6, 7, 1, 3, 'b'); // grille b
    put(3, 8, 'r'); // escalier de glace
    put(1, 7, 'r');
    // étage 3
    rect(12, 3, 2, 3); // mur de 3 cases : l’Archer monte dessus, le Mage échange sa place
    put(22, 5, 'C');
    put(23, 5, 'K');
    put(24, 5, '3');
    put(25, 5, '3');
    rect(26, 3, 1, 3, 'c');
    put(27, 5, 'D');
  }, { abilities: true, fire: true, swap: true, sync: true, link: true, heavy: [1, 3], and: [2], hold: { 2: 220 }, latch: { 1: 60, 2: 150, 3: 60 } }),

  /* ===== Chapitre 9 : La Citadelle (boss final) ===== */
  make('Le pont-levis', 'Posez-vous à deux sur les plaques : la herse retombe vite. L’Archer prend la clé et brûle le mur de bois. Les douves : le Mage pose trois blocs de glace sur les runes (ils fondent en 10 s) — traversez tous les deux avant. Enfin cristal, cible ET torche en même temps ouvrent la dernière grille.', ({ rect, put }) => {
    put(18, 10, '*'); // étoile cachée : au-dessus du bloc de glace central
    put(2, 13, 'S');
    put(3, 13, '1');
    put(4, 13, '1');
    rect(7, 1, 1, 13, 'a'); // herse
    put(8, 13, 'C');
    rect(8, 10, 2, 1); // corniche de la clé
    put(9, 9, 'K');
    rect(11, 1, 2, 13, 't'); // mur de bois
    put(13, 13, 'C');
    rect(14, 14, 9, 1, '^'); // douves x=14..22
    put(15, 13, 'r');
    put(18, 13, 'r');
    put(21, 13, 'r');
    put(23, 13, 'C');
    put(24, 3, 'y'); // cristal (groupe 2)
    put(25, 6, 'p'); // cible (groupe 2)
    put(23, 8, 'g'); // torche (groupe 2)
    rect(26, 1, 1, 13, 'b');
    put(27, 13, 'D');
  }, { abilities: true, fire: true, heavy: [1], and: [2], hold: { 2: 200 }, latch: { 1: 50, 2: 150 } }),

  make('Le cachot', 'Dans le noir, cinq cristaux cachés derrière des piliers. L’Archer lit le code sur sa corniche (repère « INDICE », le code reste noté en haut de l’écran) et le dicte (rond, triangle, carré, losange, croix) ; le Mage touche les cristaux dans l’ordre : moins de 6 s entre deux tirs, une erreur remet tout à zéro. Les tunnels sont bas : courez de salle en salle. À la fin la dernière grille s’ouvre.', ({ rect, put }) => {
    put(19, 10, '*'); // étoile cachée
    rect(8, 4, 2, 8); // pilier 1 (tunnel en bas)
    rect(15, 2, 2, 10); // pilier 2
    rect(22, 4, 2, 8, '#'); // pilier 3
    rect(22, 12, 1, 2, 'c'); // grille de sortie dans le tunnel 3
    rect(1, 10, 3, 1); // corniche de lecture : l’Archer seul
    put(4, 3, 'z');
    put(13, 3, 'z');
    put(19, 3, 'z');
    put(5, 9, 'z');
    put(12, 8, 'z');
    rect(26, 10, 3, 1); // corniche de la clé
    put(27, 9, 'K');
    put(27, 13, 'D');
    put(2, 13, 'S');
  }, {
    abilities: true,
    dark: true,
    sequence: { group: 3, order: [3, 0, 4, 2, 1, 3, 2, 0, 4, 1], timeout: 360 },
    labels: [{ tx: 2, ty: 8, shapes: [3, 0, 4, 2, 1, 3, 2, 0, 4, 1], role: 'archer', radius: 130 }],
  }),

  make('La salle du trône', 'Dernière épreuve avant le Gardien. Étage du bas : plaques lourdes (la herse retombe vite), mur de 3 cases (l’Archer lance le Mage par-dessus, F pour porter et lancer), pics (blocs de glace du Mage), puis le ressort vers l’étage. En haut : l’Archer brûle le mur de bois, la clé, et enfin cristal, cible ET torche en même temps.', ({ rect, put }) => {
    put(22, 5, '*'); // étoile cachée : étage du haut
    rect(1, 8, 25, 1); // dalle (trou à x=26..27)
    put(28, 8, '#');
    put(2, 13, 'S');
    put(3, 13, '1');
    put(4, 13, '1');
    rect(7, 9, 1, 5, 'a'); // herse
    put(8, 13, 'C');
    rect(11, 11, 2, 3); // mur de 3 cases
    put(14, 13, 'C');
    rect(16, 14, 7, 1, '^'); // pics x=16..22
    put(18, 13, 'r');
    put(21, 13, 'r');
    put(23, 13, 'C');
    rect(26, 13, 2, 1); // marche du ressort
    put(26, 12, 'j'); // ressort vers l’étage
    rect(19, 1, 2, 7, 't'); // mur de bois (étage du haut)
    put(15, 7, 'K');
    put(11, 3, 'z'); // cristal (groupe 3)
    put(8, 5, 'q'); // cible (groupe 3)
    put(13, 4, 'e'); // torche (groupe 3)
    rect(5, 1, 1, 7, 'c');
    put(2, 7, 'D');
  }, { abilities: true, fire: true, carry: true, heavy: [1], and: [3], hold: { 3: 220 }, latch: { 1: 45, 3: 150 } }),

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

// Resserrage des mécanismes à retardement (verrous `latch`, maintiens `hold`, délai des séquences) : facteur par niveau,
// réglé d'après les parcours des bots de test (chaque niveau reste réussi à ce réglage, avec marge pour un humain).
const TIGHTEN = {
  'Funambules': 0.75, 'La tour': 0.75, 'Les remparts': 0.95, 'Verrou': 0.85, 'Meurtrière': 0.75,
  'Fil de lumière': 0.75, 'Les symboles': 0.75, 'Triple verrou': 0.75, 'La navette': 0.75,
  'Les trampolines': 0.95, 'Le cirque': 0.85, 'Les lotus': 0.75, 'Le bûcher': 0.75, 'Les quatre braseros': 0.75,
  'La fonderie': 0.75, 'Le passage': 0.75, 'La colonne': 0.95, 'Le col': 0.75, 'Bivouac': 0.75, 'Le carillon': 0.75,
  'Le code': 0.75, 'La cadence': 0.75, 'La cime': 0.95, 'Le pont-levis': 0.75, 'Le cachot': 0.75, 'La salle du trône': 0.75,
};
LEVELS.forEach((l) => {
  const f = TIGHTEN[l.name];
  if (!f) return;
  for (const k of ['latch', 'hold']) if (l[k]) for (const g of Object.keys(l[k])) if (l[k][g] > 0) l[k][g] = Math.max(20, Math.round(l[k][g] * f));
  if (l.sequence && l.sequence.timeout) l.sequence.timeout = Math.max(60, Math.round(l.sequence.timeout * f));
});

// Minuteur (en secondes) : chaque niveau en a un. Si le temps est écoulé, le niveau redémarre.
// Pour changer une durée, modifiez simplement ce tableau (nom du niveau : secondes).
// Un niveau absent du tableau reçoit DEFAULT_TIMER ; mettre 0 désactive le minuteur de ce niveau.
const DEFAULT_TIMER = 90;
const TIMERS = {
  'Le sas': 70, 'Funambules': 60, 'La tour': 100, 'Les remparts': 60, // chapitre 1 : la prairie
  'Verrou': 60, 'Pont de glace': 60, 'Meurtrière': 60, // chapitre 2 : les Arcanes
  'Lueur': 105, 'Fil de lumière': 65, // chapitre 3 : les Ténèbres
  'Les symboles': 65, 'Triple verrou': 65, 'Les ponts d’or': 70, 'La navette': 80, // chapitre 4 : le Sanctuaire
  'Les trampolines': 65, 'Le cirque': 85, 'Les lotus': 170, // chapitre 5 : les Jardins
  'Le bûcher': 60, 'Les quatre braseros': 75, 'Le bateleur': 75, 'La fonderie': 65, // chapitre 6 : la Forge
  'Le passage': 60, 'La colonne': 60, 'La brume épaisse': 85, 'Le col': 75, // chapitre 7 : les Brumes
  'Bivouac': 85, 'Le carillon': 95, 'Le boyau': 150, 'Le code': 150, 'La cadence': 65, 'La cime': 125, // chapitre 8 : le Sommet
  'Tutoriel': 0, 'Le pont-levis': 60, 'Le cachot': 135, 'La salle du trône': 95, 'Le Gardien': 240, // chapitre 9 : la Citadelle
};
LEVELS.forEach((l) => { l.timer = TIMERS[l.name] !== undefined ? TIMERS[l.name] : DEFAULT_TIMER; });

// Médailles : temps (en secondes, depuis le début du niveau) à ne pas dépasser.
// Les paliers se déduisent du temps de référence REF : le meilleur parcours que les bots de test réussissent (le temps qu'il faut
// réellement pour résoudre le niveau, en comptant l'attente des mécanismes), pas d'un pourcentage du minuteur.
//   diamant : ≈ 1,8 × REF  ET aucune chute (coordination quasi parfaite)       or : ≈ 3 × REF      argent : ≈ 5 × REF      bronze : niveau réussi
// Pour régler un niveau à la main : MEDALS = { 'Nom du niveau': [secondes pour l\u2019or, secondes pour l\u2019argent, secondes pour le diamant (facultatif)] }
const REF = {
  'Le sas': 10.2, 'Funambules': 7.4, 'La tour': 13.7, 'Les remparts': 8.9,
  'Verrou': 8.0, 'Pont de glace': 8.2, 'Meurtrière': 8.1,
  'Lueur': 13.3, 'Fil de lumière': 8.3,
  'Les symboles': 9.1, 'Triple verrou': 9.3, 'Les ponts d’or': 10.1, 'La navette': 11.0,
  'Les trampolines': 8.9, 'Le cirque': 12.2, 'Les lotus': 27.0,
  'Le bûcher': 7.5, 'Les quatre braseros': 10.0, 'Le bateleur': 10.9, 'La fonderie': 9.3,
  'Le passage': 8.6, 'La colonne': 8.1, 'La brume épaisse': 10.6, 'Le col': 10.4,
  'Bivouac': 12.0, 'Le carillon': 13.3, 'Le boyau': 23.1, 'Le code': 24.3, 'La cadence': 9.2, 'La cime': 17.9,
  'Le pont-levis': 8.6, 'Le cachot': 16.8, 'La salle du trône': 13.6,
};
// Le combat de boss dure plus longtemps qu'un niveau : temps fixés à la main [or, argent, diamant]
const MEDALS = { 'Le Gardien': [110, 170, 65] };
LEVELS.forEach((l) => {
  const m = MEDALS[l.name];
  const ref = REF[l.name] || (l.timer || 90) / 8;
  l.diamond = m && m[2] ? m[2] : Math.round(ref * 1.8 + 1);
  l.gold = m ? m[0] : Math.max(l.diamond + 4, Math.round(ref * 3 + 2));
  l.silver = m ? m[1] : Math.max(l.gold + 6, Math.round(ref * 5 + 4));
});

module.exports = { LEVELS, CHAPTERS };

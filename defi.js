// Le Défi : une suite de salles séparées, inspirée de Celeste. On passe d'une salle à la suivante en franchissant la porte
// (le chrono et le compteur de chutes continuent). Chaque salle est dessinée avec la même grille que les autres niveaux.
// Chaque salle a son titre, son indice, son décor (theme) et ses options (latch, hold, shutters…).
module.exports = function (make) {
  const salle = (title, theme, hint, draw, opts = {}) => {
    const m = make('', hint, draw, opts);
    delete m.name;
    return Object.assign({ title, theme }, m);
  };
  const S = [];

  /* ---- 1. La spirale : trois étages de sauts au bord du possible, reliés par des ressorts ---- */
  S.push(salle('La spirale', 'prairie', 'Trois étages de sauts très longs (saut + dash en plein vol, touche Maj), reliés par des ressorts. Le drapeau se valide quand vous l’avez touché tous les deux.', ({ rect, put }) => {
    rect(1, 14, 28, 1, '^');
    // étage du bas (on se tient sur la ligne 12)
    rect(1, 13, 3, 1); put(2, 12, 'S');
    rect(9, 13, 2, 1);
    rect(16, 13, 2, 1);
    rect(23, 13, 2, 1);
    rect(27, 13, 2, 1); put(28, 12, 'j');
    // étage du milieu (ligne 8), on revient vers la gauche
    rect(24, 9, 3, 1); put(24, 8, 'C');
    rect(17, 9, 2, 1);
    rect(10, 9, 2, 1);
    rect(1, 9, 4, 1); put(1, 8, 'j');
    // étage du haut (ligne 4), on repart vers la droite
    rect(3, 5, 2, 1); put(3, 4, 'C');
    rect(10, 5, 2, 1);
    rect(17, 5, 2, 1);
    rect(24, 5, 2, 1);
    rect(27, 5, 2, 1); put(27, 4, 'D');
  }));

  /* ---- 2. Le conduit : deux tunnels bas superposés, des fosses, et le dash comme seul salut ---- */
  S.push(salle('Le conduit', 'forge', 'Des tunnels trop bas pour sauter haut : courez, sautez et dashez (Maj) au dernier moment pour franchir les fosses. Le ressort mène au tunnel du haut, qu’il faut parcourir dans l’autre sens.', ({ rect, put }) => {
    rect(1, 1, 28, 2); // plafond
    rect(1, 8, 26, 1); // dalle entre les deux tunnels (ouverte à droite : le ressort)
    // tunnel du bas (on se tient sur la ligne 12) : on va vers la droite
    rect(1, 14, 28, 1, '^');
    rect(1, 13, 3, 1); put(2, 12, 'S');
    rect(8, 13, 2, 1);
    rect(14, 13, 2, 1);
    rect(20, 13, 2, 1);
    rect(26, 13, 3, 1); put(28, 12, 'j');
    // tunnel du haut (ligne 7) : on revient vers la gauche, des bandes de pointes sur le sol
    rect(22, 7, 4, 1, '^'); rect(16, 7, 4, 1, '^'); rect(10, 7, 4, 1, '^'); rect(4, 7, 4, 1, '^');
    put(26, 7, 'C'); put(2, 7, 'D');
  }));

  /* ---- 3. Le battement : des nénuphars de pierre qui battent la mesure (aller en bas, retour en haut) ---- */
  S.push(salle('Le battement', 'sanctuary', 'Les dalles apparaissent l’une après l’autre, mais sont déjà parties quand la suivante arrive : il faut s’élancer dans le vide, juste avant. Prenez la clé, rebondissez sur le ressort, et revenez par le haut : la porte est en haut à gauche.', ({ rect, put }) => {
    rect(1, 14, 28, 1, '^');
    // aller (ligne 12) : le sol, puis des dalles en rythme w (1), v (2), u (3)
    rect(1, 13, 3, 1); put(2, 12, 'S');
    rect(6, 13, 2, 1, 'w');
    rect(11, 13, 2, 1, 'v');
    rect(16, 13, 2, 1, 'u');
    rect(21, 13, 2, 1, 'w');
    rect(25, 13, 4, 1); put(26, 12, 'K'); put(28, 12, 'j');
    // retour (ligne 7) : une plateforme fixe, puis des dalles en rythme, vers la porte
    rect(24, 8, 4, 1);
    rect(19, 8, 2, 1, 'w');
    rect(14, 8, 2, 1, 'v');
    rect(9, 8, 2, 1, 'u');
    rect(4, 8, 2, 1, 'w');
    rect(1, 8, 2, 1); put(2, 7, 'D'); put(25, 7, 'C');
  }, { shutters: { 1: { period: 315, open: 215, phase: 215 }, 2: { period: 315, open: 215, phase: 110 }, 3: { period: 315, open: 215, phase: 5 } } })); // « open » = durée où la dalle est effacée (passable) ; elle est solide les 100 ticks restants : la dalle 2 apparaît 105 ticks après la 1

  /* ---- 9. Le grand puits : trois salles en une, et la sortie est au pied du puits ---- */
  S.push(salle('Le grand puits', 'citadel', 'Salle 1 : zigzag de piliers au-dessus des pointes, puis un vide que seul l’Archer franchit : le Mage s’échange avec lui (bouton Échange), puis posez-vous à deux sur les plaques. Salle 2 : l’Archer embrase le bois, le Mage bâtit un pont de glace sur les runes, puis cristal et torche en même temps ouvrent la trappe. Salle 3 : de pilier en pilier jusqu’à la clé, puis rebondissez sur le ressort pour remonter, et refaites tout le chemin en sens inverse !', ({ rect, put }) => {
    // ---- Salle 1 : le puits de pointes (x 1..11), on y monte en zigzag, la sortie est au pied du puits
    rect(1, 14, 3, 1); // le seuil
    rect(4, 14, 8, 1, '^'); // pointes au fond
    put(7, 12, '#'); // A
    put(8, 12, '^');
    rect(1, 10, 2, 1); // B
    put(7, 8, '#'); // C
    put(8, 8, '^');
    rect(1, 6, 2, 1); // D : dernier perchoir, avec un drapeau
    put(1, 5, 'C');
    put(7, 7, 'C');
    rect(3, 1, 8, 1, '^'); // pointes au plafond, au-dessus du grand saut
    rect(10, 6, 2, 1); // F : plateforme des plaques, 7 cases de vide plus loin
    put(10, 5, '1');
    put(11, 5, '1');
    rect(12, 1, 2, 13); // le mur
    rect(12, 2, 2, 4, 'a'); // grille A
    // ---- Salle 2 : le laboratoire (x 14..28, étage)
    rect(14, 6, 15, 1); // plancher
    put(14, 5, 'C');
    rect(16, 1, 2, 5, 't'); // bois
    rect(19, 6, 6, 1, '^'); // fosse
    put(21, 6, 'r'); // runes : le Mage y pose de la glace
    put(23, 6, 'r');
    rect(19, 1, 6, 2); // plafond bas au-dessus de la fosse
    put(25, 2, 'y'); // cristal
    put(27, 3, 'g'); // torche
    rect(27, 6, 2, 1, 'b'); // trappe B vers la salle 3
    // ---- Salle 3 : la chute (x 14..28, rez-de-chaussée)
    rect(14, 14, 14, 1, '^');
    rect(25, 10, 4, 1); // Q0 : réception sous la trappe
    put(25, 9, 'C');
    put(28, 9, 'j'); // ressort : le retour vers la salle 2
    put(20, 11, '#'); // Q1
    put(15, 12, '#'); // Q2
    put(14, 10, '#'); // pilier de la clé
    put(14, 9, 'K');
    put(2, 13, 'D');
    put(3, 13, 'S');
  }, { heavy: [1], and: [2], latch: { 1: 99999, 2: 99999 }, hold: { 2: 240 } }));

  return {
    name: 'Le Défi', hint: S[0].hint, rows: S[0].rows, screens: S,
    abilities: true, fire: true, swap: true, carry: true, challenge: true,
  };
};

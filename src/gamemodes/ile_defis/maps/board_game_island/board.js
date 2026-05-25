const BOARD_CASES = [
  // ================= ZONE 1 : PLAGE & JUNGLE (Cases 1 - 30) =================
  { id: 1, x: 100, y: 900, type: 'Départ', name: 'Départ', zone: 'plage', next: [2] },
  { id: 2, x: 180, y: 850, type: 'Bleue', name: 'Plage', zone: 'plage', next: [3] },
  { id: 3, x: 260, y: 810, type: 'Rouge', name: 'Plage', zone: 'plage', next: [4] },
  { id: 4, x: 340, y: 780, type: 'Bleue', name: 'Plage', zone: 'plage', next: [5] },
  { id: 5, x: 420, y: 760, type: 'Bleue', name: 'Plage', zone: 'plage', next: [6] },
  { id: 6, x: 500, y: 750, type: 'Elan', name: 'Super Élan', zone: 'plage', next: [7] }, // Case Élan (+2)
  { id: 7, x: 580, y: 760, type: 'Bleue', name: 'Jungle', zone: 'plage', next: [8] },
  { id: 8, x: 660, y: 780, type: 'Echange', name: 'Case Échange', zone: 'plage', next: [9] }, // Case Échange
  { id: 9, x: 740, y: 810, type: 'Glissade', name: 'Glissade', zone: 'plage', next: [10] }, // Case Glissade (-2)
  { id: 10, x: 820, y: 850, type: 'Bleue', name: 'Plage d\'eau', zone: 'plage', next: [11] }, // Réception chute eau Plage
  { id: 11, x: 900, y: 900, type: 'Bleue', name: 'Jungle', zone: 'plage', next: [12] },
  { id: 12, x: 980, y: 850, type: 'Liane', name: 'Saut Liane', zone: 'plage', next: [13] }, // Saut Liane
  { id: 13, x: 1060, y: 810, type: 'Bleue', name: 'Jungle', zone: 'plage', next: [14] },
  { id: 14, x: 1140, y: 780, type: 'Intersection', name: 'Embranchement Plage', zone: 'plage', next: [15, 20] }, // Intersection (Gauche: 15, Droite: 20)
  
  // Chemin de Gauche (Sûr et long)
  { id: 15, x: 1200, y: 700, type: 'Elan', name: 'Petit Élan', zone: 'plage', next: [16] },
  { id: 16, x: 1280, y: 650, type: 'Bleue', name: 'Chemin ombragé', zone: 'plage', next: [17] },
  { id: 17, x: 1360, y: 610, type: 'Bleue', name: 'Chemin ombragé', zone: 'plage', next: [18] },
  { id: 18, x: 1440, y: 580, type: 'Rouge', name: 'Chemin ombragé', zone: 'plage', next: [19] },
  { id: 19, x: 1520, y: 610, type: 'Bleue', name: 'Sortie chemin', zone: 'plage', next: [20] },

  // Reconnexion & Reste de la Plage
  { id: 20, x: 1600, y: 700, type: 'Portail', name: 'Portail de la Plage', zone: 'plage', next: [21] }, // Portail 1 (4+)
  { id: 21, x: 1680, y: 750, type: 'Glissade', name: 'Glissade Sournoise', zone: 'plage', next: [22] }, // Case Glissade (-3) placée après le portail !
  { id: 22, x: 1760, y: 810, type: 'Bleue', name: 'Sable chaud', zone: 'plage', next: [23] },
  { id: 23, x: 1820, y: 880, type: 'Bleue', name: 'Sable chaud', zone: 'plage', next: [24] },
  { id: 24, x: 1760, y: 940, type: 'Bleue', name: 'Sable chaud', zone: 'plage', next: [25] },
  { id: 25, x: 1680, y: 980, type: 'Echange', name: 'Case Échange', zone: 'plage', next: [26] },
  { id: 26, x: 1600, y: 990, type: 'Bleue', name: 'Vers le volcan', zone: 'plage', next: [27] },
  { id: 27, x: 1520, y: 980, type: 'Bleue', name: 'Entrée des roches', zone: 'plage', next: [28] },
  { id: 28, x: 1440, y: 940, type: 'Rocher', name: 'Rocher de la Plage', zone: 'plage', next: [29] }, // Case Rocher
  { id: 29, x: 1360, y: 880, type: 'Bleue', name: 'Montée des marches', zone: 'plage', next: [30] },
  { id: 30, x: 1280, y: 850, type: 'Bleue', name: 'Frontière Plage', zone: 'plage', next: [31] },

  // ================= ZONE 2 : PASSAGE VOLCAN (Cases 31 - 50) =================
  { id: 31, x: 100, y: 900, type: 'Bleue', name: 'Entrée du Volcan', zone: 'volcan', next: [32] }, // Réception chute cascade Volcan
  { id: 32, x: 180, y: 850, type: 'Bleue', name: 'Chemin de lave', zone: 'volcan', next: [33] },
  { id: 33, x: 260, y: 810, type: 'Elan', name: 'Élan de Lave', zone: 'volcan', next: [34] },
  { id: 34, x: 340, y: 780, type: 'Bleue', name: 'Plaques chaudes', zone: 'volcan', next: [35] },
  { id: 35, x: 420, y: 760, type: 'Rouge', name: 'Plaques chaudes', zone: 'volcan', next: [36] },
  { id: 36, x: 500, y: 750, type: 'Bleue', name: 'Pont de pierre', zone: 'volcan', next: [37] },
  { id: 37, x: 580, y: 760, type: 'Bleue', name: 'Pont de pierre', zone: 'volcan', next: [38] },
  { id: 38, x: 660, y: 780, type: 'Cascade', name: 'Le Pont de la Cascade', zone: 'volcan', next: [39] }, // Cascade (3+)
  { id: 39, x: 740, y: 810, type: 'Bleue', name: 'Après cascade', zone: 'volcan', next: [40] }, // Réception chute Cascade 2
  { id: 40, x: 820, y: 850, type: 'Bleue', name: 'Chemin escarpé', zone: 'volcan', next: [41] },
  { id: 41, x: 900, y: 900, type: 'Bleue', name: 'Chemin escarpé', zone: 'volcan', next: [42] },
  { id: 42, x: 980, y: 850, type: 'Glissade', name: 'Glissade du Volcan', zone: 'volcan', next: [43] },
  { id: 43, x: 1060, y: 810, type: 'Bleue', name: 'Chemin escarpé', zone: 'volcan', next: [44] },
  { id: 44, x: 1140, y: 780, type: 'Intersection', name: 'Embranchement Volcan', zone: 'volcan', next: [45, 48] }, // Intersection (Gauche: 45, Droite: 48)

  // Chemin de Gauche (Sûr et long)
  { id: 45, x: 1200, y: 700, type: 'Bleue', name: 'Détour de soufre', zone: 'volcan', next: [46] },
  { id: 46, x: 1280, y: 650, type: 'Rocher', name: 'Rocher du Volcan', zone: 'volcan', next: [47] },
  { id: 47, x: 1360, y: 610, type: 'Bleue', name: 'Détour de soufre', zone: 'volcan', next: [48] },

  // Reconnexion & Reste du Volcan
  { id: 48, x: 1440, y: 580, type: 'Portail', name: 'Portail du Volcan', zone: 'volcan', next: [49] }, // Portail 2 (4+)
  { id: 49, x: 1520, y: 610, type: 'Glissade', name: 'Glissade Sournoise 2', zone: 'volcan', next: [50] }, // Glissade (-3)
  { id: 50, x: 1600, y: 700, type: 'Bleue', name: 'Frontière Sommet', zone: 'volcan', next: [51] },

  // ================= ZONE 3 : LE SOMMET (Cases 51 - 73) =================
  { id: 51, x: 100, y: 900, type: 'Bleue', name: 'Départ du Sommet', zone: 'sommet', next: [52] },
  { id: 52, x: 180, y: 850, type: 'Liane', name: 'Grande Liane', zone: 'sommet', next: [53] },
  { id: 53, x: 260, y: 810, type: 'Bleue', name: 'Marches de pierre', zone: 'sommet', next: [54] },
  { id: 54, x: 340, y: 780, type: 'Bleue', name: 'Marches de pierre', zone: 'sommet', next: [55] },
  { id: 55, x: 420, y: 760, type: 'Rouge', name: 'Froid polaire', zone: 'sommet', next: [56] },
  { id: 56, x: 500, y: 750, type: 'Elan', name: 'Super Élan Céleste', zone: 'sommet', next: [57] },
  { id: 57, x: 580, y: 760, type: 'Bleue', name: 'Corniche venteuse', zone: 'sommet', next: [58] },
  { id: 58, x: 660, y: 780, type: 'Echange', name: 'Case Échange Céleste', zone: 'sommet', next: [59] },
  { id: 59, x: 740, y: 810, type: 'Bleue', name: 'Corniche venteuse', zone: 'sommet', next: [60] },
  { id: 60, x: 820, y: 850, type: 'Glissade', name: 'Glissade des Nuages', zone: 'sommet', next: [61] },
  { id: 61, x: 900, y: 900, type: 'Bleue', name: 'Pont suspendu', zone: 'sommet', next: [62] },
  { id: 62, x: 980, y: 850, type: 'Bleue', name: 'Pont suspendu', zone: 'sommet', next: [63] },
  { id: 63, x: 1060, y: 810, type: 'Bleue', name: 'Porte du temple', zone: 'sommet', next: [64] },
  { id: 64, x: 1140, y: 780, type: 'Rocher', name: 'Rocher du Sommet', zone: 'sommet', next: [65] },
  { id: 65, x: 1200, y: 700, type: 'Bleue', name: 'Antichambre du temple', zone: 'sommet', next: [66] },
  { id: 66, x: 1280, y: 650, type: 'Bleue', name: 'Antichambre du temple', zone: 'sommet', next: [67] },
  { id: 67, x: 1360, y: 610, type: 'Bleue', name: 'Escalier d\'Or', zone: 'sommet', next: [68] },
  { id: 68, x: 1440, y: 580, type: 'Glissade', name: 'Glissade Céleste', zone: 'sommet', next: [69] },
  { id: 69, x: 1520, y: 610, type: 'Bleue', name: 'Escalier d\'Or', zone: 'sommet', next: [70] },
  { id: 70, x: 1600, y: 700, type: 'Bleue', name: 'Entrée de l\'arène', zone: 'sommet', next: [71] },
  { id: 71, x: 1680, y: 750, type: 'Bleue', name: 'Entrée de l\'arène', zone: 'sommet', next: [72] },
  { id: 72, x: 1760, y: 810, type: 'Bleue', name: 'Face au Dragon', zone: 'sommet', next: [73] },
  { id: 73, x: 1820, y: 880, type: 'Dragon', name: 'L\'Antre du Dragon', zone: 'sommet', next: [] }
];

function getCase(id) {
  return BOARD_CASES.find(c => c.id === id);
}

module.exports = {
  name: 'L\'île au Défi',
  BOARD_CASES,
  getCase
};

// parcours/exercices.ts — Le voyage lui-même : six chapitres, vingt-six étapes, six épreuves.
//
// CE QUI DISTINGUE UN EXERCICE D'UNE PAGE DE DOCUMENTATION. Une documentation explique ; un
// exercice fait faire, puis explique ce qu'on vient de faire. L'ordre est tout : la leçon n'est
// montrée qu'une fois le geste accompli, parce qu'une phrase sur la sonie lue avant d'avoir vu un
// vu-mètre bouger n'est qu'une phrase, et qu'après, c'est un souvenir.
//
// CHAQUE CHAPITRE SE FERME SUR UNE ÉPREUVE, et c'est la charnière du parcours. Les exercices
// disent quoi poser ; l'épreuve ne dit rien du chemin et exige un résultat mesuré — « un son à
// −14 LUFS sans dépasser −1 dBTP ». On peut y arriver au normaliseur, au compresseur suivi d'un
// gain, ou à la main : c'est l'élève qui choisit, et la mesure qui tranche. C'est la seule partie
// du parcours qui prouve quelque chose.
//
// LES LEÇONS DISENT « POURQUOI », JAMAIS « COMMENT ». Le comment est dans l'indice, qu'on ouvre si
// l'on veut ; la leçon, elle, porte la raison — pourquoi le limiteur va après le compresseur,
// pourquoi un grave large s'annule en mono, pourquoi la sonie ne se gagne pas au gain. C'est ce
// qui reste quand le geste est oublié, et c'est ce qui se transporte vers un autre logiciel.
//
// CE FICHIER EST TENU PAR SON TEST. `exercices.test.ts` vérifie contre le registre vivant que
// chaque identifiant de nœud cité existe, que chaque paramètre exigé existe sur ce nœud, et que
// chaque valeur de choix est l'une des valeurs possibles. Un nœud renommé ou un réglage disparu
// fait donc tomber le test, et non l'exercice en silence six mois plus tard.

import type { Chapitre, Exercice } from "./types";

export const CHAPITRES: Chapitre[] = [
  {
    id: "premier-son",
    titre: "Le premier son", titreEn: "The first sound",
    promesse: "Un graphe n'est pas un schéma : c'est un chemin que le son parcourt vraiment. À la fin de ce chapitre, vous aurez fabriqué un son, réglé sa hauteur, et regardé sa forme.",
    promesseEn: "A graph is not a diagram: it is a path the sound really travels. By the end of this chapter you will have made a sound, set its pitch, and looked at its shape.",
  },
  {
    id: "oreille",
    titre: "L'oreille", titreEn: "The ear",
    promesse: "Trois composants disent ce qu'une écoute ne peut pas trancher : combien c'est fort, où se trouve l'énergie, et si le changement qu'on vient de faire s'entend vraiment.",
    promesseEn: "Three nodes say what listening alone cannot settle: how loud it is, where the energy sits, and whether the change you just made is really audible.",
  },
  {
    id: "niveau",
    titre: "Le niveau", titreEn: "Level",
    promesse: "Gain, compression, limitation, normalisation : quatre gestes que l'on confond souvent, et qui ne font pas du tout la même chose.",
    promesseEn: "Gain, compression, limiting, normalising: four gestures often confused with one another, and doing entirely different things.",
  },
  {
    id: "couleur",
    titre: "La couleur", titreEn: "Colour",
    promesse: "Couper, creuser, souligner : le spectre est la matière du timbre, et trois décibels au bon endroit valent mieux que douze au mauvais.",
    promesseEn: "Cutting, scooping, lifting: the spectrum is what timbre is made of, and three decibels in the right place beat twelve in the wrong one.",
  },
  {
    id: "temps",
    titre: "Le temps", titreEn: "Time",
    promesse: "Retard, écho, réverbération, silence : le temps est la seule dimension qu'on ne remonte pas, et celle où se joue l'espace.",
    promesseEn: "Delay, echo, reverb, silence: time is the one dimension you cannot travel back along, and the one where space is played out.",
  },
  {
    id: "espace",
    titre: "L'espace", titreEn: "Space",
    promesse: "Deux canaux, et tout ce qu'on en tire : placer, élargir, et garder un grave qui tienne debout une fois sommé en mono.",
    promesseEn: "Two channels, and all you can draw from them: placing, widening, and keeping a low end that still stands once summed to mono.",
  },
  {
    id: "hauteur",
    titre: "La hauteur", titreEn: "Pitch",
    promesse: "La hauteur se mesure avant de se corriger, et transposer n'est pas accélérer. Ce chapitre sépare deux gestes que l'on confond partout.",
    promesseEn: "Pitch is measured before it is corrected, and transposing is not speeding up. This chapter separates two gestures confused everywhere.",
  },
  {
    id: "matiere",
    titre: "La matière", titreEn: "Matter",
    promesse: "Fabriquer un son au lieu de le traiter : une forme d'onde, une modulation, des grains, un étirement. Quatre façons de partir de rien.",
    promesseEn: "Making a sound instead of processing one: a waveform, a modulation, grains, a stretch. Four ways of starting from nothing.",
  },
  {
    id: "musique",
    titre: "La musique", titreEn: "Music",
    promesse: "Des notes, des accords, un rythme — et ce qu'une machine sait en relire. Le graphe devient un instrument qui joue.",
    promesseEn: "Notes, chords, a rhythm — and what a machine can read back from them. The graph becomes an instrument that plays.",
  },
  {
    id: "oeuvre",
    titre: "L'œuvre", titreEn: "The finished work",
    promesse: "Assembler, fondre, nommer, sauver. Et savoir ce que l'export fait au son, parce qu'il lui fait quelque chose.",
    promesseEn: "Assembling, fading, naming, saving. And knowing what exporting does to the sound, because it does something to it.",
  },
];

// ── Critères réutilisés ───────────────────────────────────────────────────────────────────────
// Écrits une fois : un exercice qui redéfinirait « un générateur de fréquence » à sa façon finirait
// par le nommer autrement dans la liste de contrôle, et l'élève croirait qu'on lui parle d'autre
// chose.

import { EFFET, GENERATEUR, GENERATEUR_LANCE, REGARD } from "./exercices-criteres";

import { EXERCICES_COMPOSITION } from "./exercices-composition";

export const EXERCICES_PREMIERES: Exercice[] = [
  // ── Le premier son ──────────────────────────────────────────────────────────────────────────
  {
    id: "poser-source", chapitre: "premier-son",
    titre: "Poser une source", titreEn: "Place a source",
    enonce: "Pose un Générateur de fréquence dans l'atelier.",
    enonceEn: "Place a Frequency Generator in the workshop.",
    indice: "Le catalogue est à gauche. Tapez « fréquence » dans sa recherche, puis glissez la fiche sur le fond — ou double-cliquez-la.",
    indiceEn: "The catalog is on the left. Type « frequency » in its search box, then drag the card onto the canvas — or double-click it.",
    lecon: "Rien ne se produit sans composant : Attic n'a ni piste ni canal, seulement des composants qui fabriquent, transforment ou regardent du son. Un générateur est une source, et cela se voit à une chose — il n'a aucune entrée. C'est la différence entre faire du son et en traiter.",
    leconEn: "Nothing happens without a node: Attic has no tracks and no channels, only nodes that make, transform or watch sound. A generator is a source, and one thing shows it — it has no input at all. That is the difference between making sound and processing it.",
    condition: { sorte: "present", critere: GENERATEUR },
  },
  {
    id: "lancer-source", chapitre: "premier-son",
    titre: "Lancer, et entendre", titreEn: "Run, and hear",
    enonce: "Lance le graphe, puis écoute le résultat sous le composant.",
    enonceEn: "Run the graph, then listen to the result under the node.",
    indice: "Le bouton Lancer est en haut de la fenêtre. Une fois le calcul fini, un lecteur apparaît sous le générateur.",
    indiceEn: "The Run button sits at the top of the window. Once the computation ends, a player appears under the generator.",
    lecon: "Chaque composant garde et montre ce qu'il a produit. On n'a donc pas besoin d'aller jusqu'au bout d'une chaîne pour entendre : on écoute où l'on veut, au milieu si l'on veut, et c'est ainsi qu'on trouve l'endroit exact où quelque chose a mal tourné.",
    leconEn: "Every node keeps and shows what it produced. You therefore never need to reach the end of a chain to hear: you listen wherever you like, halfway if you like, and that is how you find the exact place where something went wrong.",
    condition: { sorte: "present", critere: GENERATEUR_LANCE },
  },
  {
    id: "regler-source", chapitre: "premier-son",
    titre: "Descendre d'une octave", titreEn: "Drop an octave",
    enonce: "Règle le générateur sur 220 hertz, et fais-le durer au moins trois secondes.",
    enonceEn: "Set the generator to 220 hertz, and make it last at least three seconds.",
    indice: "Sélectionnez le composant : ses réglages s'ouvrent dans l'inspecteur, à droite. Le point à côté d'un réglage modifié le remet à sa valeur d'origine.",
    indiceEn: "Select the node: its settings open in the inspector, on the right. The dot beside a changed setting puts it back to its original value.",
    lecon: "Doubler la fréquence monte d'une octave, la diviser par deux descend d'une octave : l'oreille entend des rapports et non des écarts. 440 et 220 hertz sont deux la ; 440 et 660, dans le même écart de 220 hertz, sont un la et un mi.",
    leconEn: "Doubling the frequency goes up an octave, halving it goes down one: the ear hears ratios, not differences. 440 and 220 hertz are both A; 440 and 660, the very same 220 hertz apart, are an A and an E.",
    condition: {
      sorte: "toutes",
      conditions: [
        { sorte: "present", critere: { ...GENERATEUR, parametre: { nom: "Fréquence", nomEn: "Frequency", vaut: 220 }, quoi: "le générateur", quoiEn: "the generator" } },
        { sorte: "present", critere: { ...GENERATEUR, parametre: { nom: "Durée", nomEn: "Duration", min: 3 }, quoi: "le générateur", quoiEn: "the generator" } },
      ],
    },
  },
  {
    id: "voir-le-son", chapitre: "premier-son",
    titre: "Regarder ce qu'on entend", titreEn: "Look at what you hear",
    enonce: "Branche un Visualiseur, un Analyseur de spectre ou un Spectrogramme derrière le générateur, et relance.",
    enonceEn: "Wire a Waveform Viewer, a Spectrum Analyzer or a Spectrogram behind the generator, and run again.",
    indice: "Une arête se tire d'un point de sortie, à droite d'un composant, vers un point d'entrée, à gauche d'un autre. Les couleurs disent le type : l'audio ne se branche que sur de l'audio.",
    indiceEn: "An edge is dragged from an output port, on a node's right, to an input port, on another node's left. Colours tell the type: audio only connects to audio.",
    lecon: "L'oreille juge, l'œil vérifie. Une onde carrée et une sinusoïde au même niveau se distinguent mal sur un petit haut-parleur, et ne se ressemblent en rien à l'écran. Toute la suite du parcours repose sur ce couple : écouter pour décider, regarder pour savoir de quoi l'on parle.",
    leconEn: "The ear judges, the eye checks. A square wave and a sine at the same level are hard to tell apart on a small speaker, and look nothing alike on screen. The whole journey rests on that pairing: listen to decide, look to know what you are talking about.",
    condition: { sorte: "relie", amont: GENERATEUR, aval: REGARD },
  },
  {
    id: "epreuve-premier-son", chapitre: "premier-son", epreuve: true,
    titre: "Épreuve — ta première preuve", titreEn: "Trial — your first proof",
    enonce: "Branche un son d'au moins deux secondes, audible et sans saturation, sur l'entrée « Son à mesurer » du composant « Parcours » — celui qui affiche ce texte.",
    enonceEn: "Wire a sound of at least two seconds, audible and without clipping, into the « Sound to measure » input of the « Journey » component — the one showing this text.",
    indice: "Tirez une arête depuis la sortie de votre dernier composant jusqu'à l'entrée « Son à mesurer », en haut à gauche du composant « Parcours ». Le son y est lu et non modifié : le composant le mesure et le compare aux cibles. La mesure se fait dès que le son amont a été calculé — il n'y a rien à lancer ici.",
    indiceEn: "Drag an edge from your last node's output to the « Sound to measure » input, at the top left of the « Journey » component. The sound is read there and not altered: the component measures it and compares it to the targets. Measuring happens as soon as the upstream sound has been computed — there is nothing to run here.",
    lecon: "Les deux façons de rater un son sont le silence et la saturation, et l'une comme l'autre se mesurent avant de s'entendre. C'est tout le métier : vérifier ce qu'on croit avoir fait, plutôt que de l'espérer.",
    leconEn: "The two ways to fail a sound are silence and clipping, and both can be measured before they can be heard. That is the whole craft: checking what you think you made, rather than hoping for it.",
    cibles: [
      { grandeur: "duree", min: 2, exigence: "au moins deux secondes", exigenceEn: "at least two seconds" },
      { grandeur: "lufs", min: -45, exigence: "il y a bien du son, et non du silence", exigenceEn: "there really is sound, and not silence" },
      { grandeur: "crete", max: -0.5, exigence: "la crête reste sous −0,5 dBFS", exigenceEn: "the peak stays under -0.5 dBFS" },
    ],
  },

  // ── L'oreille ───────────────────────────────────────────────────────────────────────────────
  {
    id: "poser-vumetre", chapitre: "oreille",
    titre: "Mesurer la force", titreEn: "Measure loudness",
    enonce: "Branche un VU-mètre / LUFS sur ton son, et lance.",
    enonceEn: "Wire a VU-meter / LUFS onto your sound, and run.",
    indice: "Il se trouve dans Visualisation, rubrique Analyse. Il laisse passer le son inchangé : on peut le poser au milieu d'une chaîne sans rien casser.",
    indiceEn: "It lives under Visualization, Analysis section. It passes the sound through unchanged: you can drop it in the middle of a chain without breaking anything.",
    lecon: "Fort et haut ne sont pas la même chose. La crête est le plus grand échantillon du fichier ; la sonie, en LUFS, est ce que l'oreille perçoit, mesuré avec la pondération de la norme. Deux sons culminant tous deux à 0 dBFS peuvent différer de quinze décibels à l'écoute — une batterie sèche et une nappe compressée, par exemple.",
    leconEn: "Loud and high are not the same thing. The peak is the file's largest sample; loudness, in LUFS, is what the ear perceives, measured with the standard weighting. Two sounds both topping out at 0 dBFS can differ by fifteen decibels to the ear — a dry drum kit and a compressed pad, say.",
    condition: { sorte: "present", critere: { fiches: ["vu-metre"], rendu: true, quoi: "un vu-mètre lancé", quoiEn: "a VU-meter that has run" } },
  },
  {
    id: "voir-le-spectre", chapitre: "oreille",
    titre: "Voir où est l'énergie", titreEn: "See where the energy sits",
    enonce: "Regarde ton son au Spectrogramme, puis à l'Analyseur de spectre.",
    enonceEn: "Look at your sound with the Spectrogram, then with the Spectrum Analyzer.",
    indice: "Les deux prennent la même entrée audio ; rien n'empêche de les brancher tous deux sur le même composant.",
    indiceEn: "Both take the same audio input; nothing stops you wiring both onto the same node.",
    lecon: "Le spectre montre un instant, le spectrogramme montre la durée. Un souffle constant saute aux yeux sur le second — une bande horizontale qui ne bouge jamais — alors qu'il se confond avec l'instrument sur le premier. On choisit donc selon la question : « quel timbre ? » se lit au spectre, « quand cela arrive-t-il ? » au spectrogramme.",
    leconEn: "The spectrum shows an instant, the spectrogram shows duration. Constant hiss jumps out on the second — a horizontal band that never moves — while it blends into the instrument on the first. So you pick by the question: « what timbre? » reads on the spectrum, « when does it happen? » on the spectrogram.",
    condition: { sorte: "present", critere: { fiches: ["spectrogramme", "analyseur-spectre"], rendu: true, quoi: "un spectrogramme ou un analyseur de spectre lancé", quoiEn: "a Spectrogram or Spectrum Analyzer that has run" } },
  },
  {
    id: "comparer", chapitre: "oreille",
    titre: "Comparer honnêtement", titreEn: "Compare honestly",
    enonce: "Mets un effet sur ton son, puis branche-le dans un Comparateur A/B et lance.",
    enonceEn: "Put an effect on your sound, then wire it into an A/B Comparator and run.",
    indice: "Le comparateur prend deux entrées : le son d'origine sur l'une, le son traité sur l'autre. Son réglage « Écoute » bascule de l'un à l'autre.",
    indiceEn: "The comparator takes two inputs: the original sound on one, the processed sound on the other. Its « Listen » setting switches between them.",
    lecon: "Le plus fort gagne toujours. Un effet qui ajoute un décibel paraît meilleur, même quand il n'apporte rien — c'est le biais le mieux documenté de l'écoute, et personne n'y échappe. Le comparateur aligne les niveaux avant de basculer : ce qu'on juge alors est le changement, et non le gain.",
    leconEn: "The louder one always wins. An effect that adds a decibel sounds better even when it brings nothing — the best documented bias in listening, and nobody is immune. The comparator aligns levels before switching: what you then judge is the change, and not the gain.",
    condition: {
      sorte: "toutes",
      conditions: [
        { sorte: "relie", amont: EFFET, aval: { fiches: ["comparateur-ab"], quoi: "un comparateur A/B", quoiEn: "an A/B Comparator" } },
        { sorte: "present", critere: { fiches: ["comparateur-ab"], rendu: true, quoi: "le comparateur A/B", quoiEn: "the A/B Comparator" } },
      ],
    },
  },
  {
    id: "lire-les-chiffres", chapitre: "oreille",
    titre: "Faire parler le son", titreEn: "Make the sound talk",
    enonce: "Branche Caractéristiques de piste sur ton son, et sa sortie sur une Sortie texte.",
    enonceEn: "Wire Track Features onto your sound, and its output into a Text Output.",
    indice: "La Sortie texte attend du texte, pas de l'audio : c'est la sortie de gauche du composant d'analyse qu'il faut y mener.",
    indiceEn: "Text Output expects text, not audio: it is the analysis node's left-hand output you need to lead there.",
    lecon: "Centroïde, plage dynamique, chroma, coefficients cepstraux : ce vecteur de caractéristiques est exactement ce que lisent les algorithmes qui classent, cherchent ou engendrent de la musique. Le voir écrit est la façon la plus directe de comprendre ce qu'une machine « entend » d'un son — et ce qu'elle n'en entend pas.",
    leconEn: "Centroid, dynamic range, chroma, cepstral coefficients: this feature vector is exactly what the algorithms that classify, search or generate music read. Seeing it written out is the most direct way to understand what a machine « hears » in a sound — and what it does not.",
    condition: {
      sorte: "relie",
      amont: { fiches: ["caracteristiques-piste"], quoi: "les caractéristiques de piste", quoiEn: "the Track Features node" },
      aval: { fiches: ["sortie-texte"], rendu: true, quoi: "une sortie texte lancée", quoiEn: "a Text Output that has run" },
    },
  },
  {
    id: "epreuve-fort-sans-crier", chapitre: "oreille", epreuve: true,
    titre: "Épreuve — fort sans crier", titreEn: "Trial — loud without shouting",
    enonce: "Amène un son qui s'entend fort — au moins −16 LUFS — mais dont la crête ne dépasse jamais −6 dBFS.",
    enonceEn: "Bring a sound that is heard loud — at least -16 LUFS — yet whose peak never passes -6 dBFS.",
    indice: "Un gain seul n'y parvient pas : il monte les deux en même temps. Un compresseur, ou un limiteur, réduit l'écart entre les crêtes et le reste — et c'est cet écart qui coûte la sonie.",
    indiceEn: "Gain alone will not do it: it raises both at once. A compressor, or a limiter, narrows the gap between peaks and the rest — and it is that gap which costs loudness.",
    lecon: "La sonie se gagne en réduisant l'écart entre les crêtes et le reste, jamais en montant le tout. Toute la guerre du volume tient dans cette mesure, et la fatigue qu'elle provoque aussi : un son sans écart n'a plus d'accents, et l'oreille cesse de croire à ses attaques.",
    leconEn: "Loudness is won by narrowing the gap between peaks and the rest, never by raising everything. The whole loudness war fits in that one measurement, and so does the fatigue it causes: a sound without gaps has no accents left, and the ear stops believing its attacks.",
    cibles: [
      { grandeur: "lufs", min: -16, exigence: "la sonie atteint −16 LUFS", exigenceEn: "loudness reaches -16 LUFS" },
      { grandeur: "crete", max: -6, exigence: "la crête reste sous −6 dBFS", exigenceEn: "the peak stays under -6 dBFS" },
    ],
  },

  // ── Le niveau ───────────────────────────────────────────────────────────────────────────────
  {
    id: "normaliser-en-sonie", chapitre: "niveau",
    titre: "Normaliser ce qui s'entend", titreEn: "Normalise what is heard",
    enonce: "Pose un Normaliseur, passe-le en mode Sonie (LUFS), et lance.",
    enonceEn: "Place a Normalizer, switch it to Loudness (LUFS) mode, and run.",
    indice: "Le mode se choisit dans l'inspecteur. En mode Sonie, c'est « Sonie cible » qui commande, et le réglage « Niveau » ne sert plus à rien.",
    indiceEn: "The mode is chosen in the inspector. In Loudness mode « Target loudness » is in charge, and the « Level » setting no longer does anything.",
    lecon: "Normaliser en crête aligne le plus grand échantillon ; normaliser en sonie aligne ce qui s'entend. Les plateformes de diffusion font le second, ce qui rend inutile de monter le niveau d'un morceau avant de l'envoyer : il sera ramené à leur cible, et tout ce qu'on aura gagné, c'est une dynamique écrasée.",
    leconEn: "Peak normalising aligns the largest sample; loudness normalising aligns what is heard. Streaming platforms do the second, which makes pushing a track's level before sending it pointless: it will be brought back to their target, and all you will have gained is a squashed dynamic.",
    condition: { sorte: "present", critere: { fiches: ["normaliseur"], parametre: { nom: "Mode", nomEn: "Mode", vaut: "sonie" }, rendu: true, quoi: "un normaliseur lancé", quoiEn: "a Normalizer that has run" } },
  },
  {
    id: "compresser", chapitre: "niveau",
    titre: "Rendre plus égal", titreEn: "Make it more even",
    enonce: "Ajoute un Compresseur réglé assez fort : seuil à −24 dB ou plus bas, rapport de 6 ou plus.",
    enonceEn: "Add a Compressor set firmly: threshold at -24 dB or lower, ratio of 6 or more.",
    indice: "Le seuil dit à partir de quel niveau le compresseur agit ; le rapport, de combien il réduit ce qui dépasse. Un rapport de 6 signifie que six décibels de trop n'en donnent plus qu'un.",
    indiceEn: "The threshold says from which level the compressor acts; the ratio, by how much it reduces what goes over. A ratio of 6 means six decibels too many come out as one.",
    lecon: "Un compresseur ne rend pas plus fort : il rend plus égal. C'est le gain qui suit qui rend plus fort. Confondre les deux mène à écraser un son sans savoir ce qu'on y gagne — et à s'étonner qu'il paraisse plus petit alors que le vu-mètre monte.",
    leconEn: "A compressor does not make things louder: it makes them more even. It is the gain that follows which makes them louder. Confusing the two leads to squashing a sound without knowing what it buys — and to wondering why it sounds smaller while the meter climbs.",
    condition: {
      sorte: "toutes",
      conditions: [
        { sorte: "present", critere: { fiches: ["compresseur"], parametre: { nom: "Seuil", nomEn: "Threshold", max: -24 }, quoi: "le compresseur", quoiEn: "the compressor" } },
        { sorte: "present", critere: { fiches: ["compresseur"], parametre: { nom: "Ratio", nomEn: "Ratio", min: 6 }, rendu: true, quoi: "le compresseur", quoiEn: "the compressor" } },
      ],
    },
  },
  {
    id: "limiter-en-dernier", chapitre: "niveau",
    titre: "Le filet, en dernier", titreEn: "The safety net, last",
    enonce: "Place un Limiteur après le compresseur, de sorte que le son y passe en dernier.",
    enonceEn: "Place a Limiter after the compressor, so the sound passes through it last.",
    indice: "« Après » se lit sur les arêtes : le son doit sortir du compresseur et arriver au limiteur, directement ou en traversant d'autres composants.",
    indiceEn: "« After » is read on the edges: the sound must leave the compressor and reach the limiter, directly or through other nodes on the way.",
    lecon: "Le limiteur est le dernier filet : il garantit qu'aucun échantillon ne passe au-dessus du plafond. Le mettre avant le compresseur le fait travailler sur un signal que le compresseur va ensuite remonter — le filet est alors tendu au mauvais étage, et ne retient plus rien.",
    leconEn: "The limiter is the last safety net: it guarantees no sample passes above the ceiling. Putting it before the compressor makes it work on a signal the compressor will then raise — the net is strung on the wrong floor, and catches nothing.",
    condition: {
      sorte: "relie",
      amont: { fiches: ["compresseur"], quoi: "le compresseur", quoiEn: "the compressor" },
      aval: { fiches: ["limiteur"], rendu: true, quoi: "un limiteur lancé", quoiEn: "a Limiter that has run" },
    },
  },
  {
    id: "epreuve-diffusion", chapitre: "niveau", epreuve: true,
    titre: "Épreuve — prêt pour la diffusion", titreEn: "Trial — ready for release",
    enonce: "Amène un son calibré comme une plateforme l'exige : sonie entre −15 et −13 LUFS, vrai pic sous −1 dBTP.",
    enonceEn: "Bring a sound calibrated the way a platform asks: loudness between -15 and -13 LUFS, true peak under -1 dBTP.",
    indice: "Le Normaliseur en mode Sonie fait les deux d'un coup : cible à −14, plafond à −1. S'il annonce que la cible n'est pas atteinte, c'est que le plafond a gagné — mettez un limiteur devant.",
    indiceEn: "The Normalizer in Loudness mode does both at once: target at -14, ceiling at -1. If it reports the target was not reached, the ceiling won — put a limiter in front.",
    lecon: "−14 LUFS et −1 dBTP sont la convention de la plupart des plateformes. Le vrai pic se mesure entre les échantillons, là où le signal reconstruit dépasse ce que les échantillons montrent : un fichier qui affiche 0,0 dBFS peut faire saturer le décodeur du lecteur, et c'est pour cela que le plafond est à −1 et non à 0.",
    leconEn: "-14 LUFS and -1 dBTP are the convention on most platforms. True peak is measured between the samples, where the reconstructed signal goes past what the samples show: a file reading 0.0 dBFS can clip the listener's decoder, which is why the ceiling sits at -1 and not at 0.",
    cibles: [
      { grandeur: "lufs", min: -15, max: -13, exigence: "la sonie tient entre −15 et −13 LUFS", exigenceEn: "loudness holds between -15 and -13 LUFS" },
      { grandeur: "vraiPic", max: -1, exigence: "le vrai pic reste sous −1 dBTP", exigenceEn: "true peak stays under -1 dBTP" },
    ],
  },

  // ── La couleur ──────────────────────────────────────────────────────────────────────────────
  {
    id: "creuser-le-bas", chapitre: "couleur",
    titre: "Creuser le bas", titreEn: "Scoop the bottom",
    enonce: "Pose un Égaliseur sur ton son et descends la bande 32 Hz d'au moins 12 décibels.",
    enonceEn: "Place an Equalizer on your sound and pull the 32 Hz band down by at least 12 decibels.",
    indice: "Les neuf bandes vont de 32 hertz à 8 kilohertz, par octaves. Une valeur négative retire, une positive ajoute.",
    indiceEn: "The nine bands run from 32 hertz to 8 kilohertz, by octaves. A negative value takes away, a positive one adds.",
    lecon: "Sous quarante hertz, la plupart des sons ne portent que du bruit de pieds, du souffle de micro et de l'énergie qu'aucun haut-parleur ordinaire ne restitue — mais qui consomme la marge du limiteur. Couper là ne s'entend presque pas ; ce qui s'entend, c'est la place que cela libère pour le reste.",
    leconEn: "Below forty hertz, most sounds carry only footfall, microphone rumble and energy no ordinary speaker reproduces — yet which eats the limiter's headroom. Cutting there is barely audible; what is audible is the room it frees for everything else.",
    condition: { sorte: "present", critere: { fiches: ["equaliseur"], parametre: { nom: "32 Hz", nomEn: "32 Hz", max: -12 }, rendu: true, quoi: "un égaliseur lancé", quoiEn: "an Equalizer that has run" } },
  },
  {
    id: "souligner-la-presence", chapitre: "couleur",
    titre: "Souligner la présence", titreEn: "Lift presence",
    enonce: "Sur le même égaliseur, monte la bande 4 kHz de 6 décibels au moins, et écoute ce que cela change.",
    enonceEn: "On the same equalizer, push the 4 kHz band up by at least 6 decibels, and listen to what it changes.",
    indice: "Écoutez en basculant le composant d'avant en arrière plutôt qu'en le jugeant seul : c'est là que le Comparateur A/B du chapitre précédent sert.",
    indiceEn: "Listen by switching back and forth rather than judging it alone: this is where the previous chapter's A/B Comparator earns its place.",
    lecon: "Autour de quatre kilohertz, l'oreille est la plus sensible — le conduit auditif y résonne, et la courbe d'égale sonie y creuse un puits. C'est ce qui rend cette bande si efficace, et si dangereuse : trois décibels y font le même effet que dix ailleurs, et l'agressivité y naît aussi vite que la présence.",
    leconEn: "Around four kilohertz the ear is at its most sensitive — the ear canal resonates there, and the equal-loudness curve digs a well. That is what makes the band so effective, and so dangerous: three decibels there do the work of ten elsewhere, and harshness appears as fast as presence.",
    condition: { sorte: "present", critere: { fiches: ["equaliseur"], parametre: { nom: "4 kHz", nomEn: "4 kHz", min: 6 }, rendu: true, quoi: "l'égaliseur", quoiEn: "the equalizer" } },
  },
  {
    id: "bruit-rose", chapitre: "couleur",
    titre: "Blanc contre rose", titreEn: "White against pink",
    enonce: "Pose un Générateur de bruit, mets-le en bruit rose, et compare-le au bruit blanc.",
    enonceEn: "Place a Noise Generator, set it to pink noise, and compare it with white noise.",
    indice: "Deux générateurs côte à côte, l'un blanc l'autre rose, s'écoutent l'un après l'autre sans rien rebrancher.",
    indiceEn: "Two generators side by side, one white and one pink, can be listened to one after the other without rewiring anything.",
    lecon: "Le bruit blanc porte autant d'énergie par hertz ; le bruit rose, autant par octave. Comme l'oreille entend par octaves — de 100 à 200 hertz est un pas aussi grand que de 1000 à 2000 —, c'est le rose qui paraît neutre, et le blanc qui semble siffler. Le rose est pour cela la référence des mesures de salle.",
    leconEn: "White noise carries equal energy per hertz; pink noise, equal energy per octave. Since the ear hears in octaves — 100 to 200 hertz is as wide a step as 1000 to 2000 — pink is the one that sounds neutral, and white the one that seems to hiss. That is why pink is the reference for room measurements.",
    condition: { sorte: "present", critere: { fiches: ["generateur-bruit"], parametre: { nom: "Type", nomEn: "Type", vaut: "Rose" }, rendu: true, quoi: "un générateur de bruit lancé", quoiEn: "a Noise Generator that has run" } },
  },
  {
    id: "epreuve-nettoyer-le-bas", chapitre: "couleur", epreuve: true,
    titre: "Épreuve — nettoyer le bas", titreEn: "Trial — clean the low end",
    enonce: "Amène un son dont moins de 5 % de l'énergie se trouve sous 200 hertz, sans qu'il devienne inaudible.",
    enonceEn: "Bring a sound with less than 5 % of its energy below 200 hertz, without it becoming inaudible.",
    indice: "L'égaliseur suffit si vous descendez les trois bandes basses. Un son aigu y arrive tout seul : l'épreuve est plus instructive sur un son qui contient vraiment du grave.",
    indiceEn: "The equalizer is enough if you pull the three low bands down. A treble sound passes on its own: the trial teaches more on a sound that really has low end in it.",
    lecon: "Une mesure de bande répond à une question que l'oreille pose mal. « Est-ce trop sourd ? » ne se discute pas ; « combien d'énergie sous deux cents hertz ? » se compare d'un son à l'autre, se note, et se retrouve le lendemain. C'est la différence entre un avis et un réglage.",
    leconEn: "A band measurement answers a question the ear asks badly. « Is it too muddy? » cannot be settled; « how much energy below two hundred hertz? » compares from one sound to the next, gets written down, and is still there tomorrow. That is the difference between an opinion and a setting.",
    cibles: [
      { grandeur: "partGrave", max: 5, exigence: "moins de 5 % de l'énergie sous 200 Hz", exigenceEn: "less than 5 % of the energy below 200 Hz" },
      { grandeur: "lufs", min: -40, exigence: "le son reste audible", exigenceEn: "the sound stays audible" },
    ],
  },

  // ── Le temps ────────────────────────────────────────────────────────────────────────────────
  {
    id: "echo-a-la-noire", chapitre: "temps",
    titre: "Un écho à la noire", titreEn: "An echo on the beat",
    enonce: "Pose un Echo et règle son temps autour de 500 millisecondes.",
    enonceEn: "Place an Echo and set its time around 500 milliseconds.",
    indice: "Le réglage « Temps » va de 50 à 2000 millisecondes ; « Feedback » décide du nombre de répétitions avant extinction.",
    indiceEn: "The « Time » setting runs from 50 to 2000 milliseconds; « Feedback » decides how many repeats there are before it dies away.",
    lecon: "Sous une cinquantaine de millisecondes, une répétition ne s'entend plus comme un écho mais comme un timbre : c'est l'effet de précédence, et c'est ce qui fait qu'un peigne coloré sonne comme un filtre et non comme un retard. Au-delà, elle se compte — et cinq cents millisecondes valent exactement une noire à cent vingt.",
    leconEn: "Below some fifty milliseconds, a repeat is no longer heard as an echo but as a timbre: that is the precedence effect, and it is why a coloured comb sounds like a filter rather than a delay. Beyond it, repeats can be counted — and five hundred milliseconds is exactly a quarter note at a hundred and twenty.",
    condition: { sorte: "present", critere: { fiches: ["echo"], parametre: { nom: "Temps", nomEn: "Time", min: 450, max: 550 }, rendu: true, quoi: "un écho lancé", quoiEn: "an Echo that has run" } },
  },
  {
    id: "reverbe-apres-echo", chapitre: "temps",
    titre: "La salle vient après", titreEn: "The room comes after",
    enonce: "Ajoute une Réverbération derrière l'écho, et écoute l'ordre que cela impose.",
    enonceEn: "Add a Reverb behind the echo, and listen to the order that imposes.",
    indice: "Derrière veut dire que le son sort de l'écho et entre dans la réverbération, et non l'inverse.",
    indiceEn: "Behind means the sound leaves the echo and enters the reverb, and not the other way round.",
    lecon: "L'écho répète, la réverbération diffuse : l'un rend des copies qu'on peut compter, l'autre une densité où plus rien ne se distingue. Dans cet ordre, les répétitions se produisent dans la salle — c'est ce que fait un vrai lieu. Dans l'ordre inverse, la salle est répétée, et chaque copie traîne sa propre queue.",
    leconEn: "Echo repeats, reverb diffuses: one gives copies you can count, the other a density where nothing stands apart. In this order the repeats happen in the room — which is what a real place does. Reversed, the room itself is repeated, and each copy drags its own tail along.",
    condition: {
      sorte: "relie",
      amont: { fiches: ["echo"], quoi: "l'écho", quoiEn: "the echo" },
      aval: { fiches: ["reverberation"], rendu: true, quoi: "une réverbération lancée", quoiEn: "a Reverb that has run" },
    },
  },
  {
    id: "rogner", chapitre: "temps",
    titre: "Retirer le blanc", titreEn: "Trim the blank",
    enonce: "Fais passer un son par Rogner les silences, et lance.",
    enonceEn: "Run a sound through Trim Silence, and run the graph.",
    indice: "Le composant dit dans son message combien il a retiré. Sa marge de 50 millisecondes est volontaire : un seuil seul coupe toujours le début de l'attaque.",
    indiceEn: "The node reports in its message how much it removed. Its 50 millisecond margin is deliberate: a bare threshold always cuts into the start of the attack.",
    lecon: "Ce composant mesure l'enveloppe et non l'échantillon, et c'est ce qui le rend utilisable. Une sinusoïde passe par zéro deux fois par période : un seuil appliqué aux échantillons découperait un la 440 en huit cent quatre-vingts morceaux par seconde. Beaucoup d'outils simples commettent exactement cette faute.",
    leconEn: "This node measures the envelope and not the sample, and that is what makes it usable. A sine crosses zero twice per period: a threshold applied to samples would cut a 440 hertz A into eight hundred and eighty pieces per second. Plenty of simple tools make exactly that mistake.",
    condition: { sorte: "present", critere: { fiches: ["rogner-silences"], rendu: true, quoi: "un rognage de silences lancé", quoiEn: "a Trim Silence that has run" } },
  },
  {
    id: "epreuve-quatre-secondes", chapitre: "temps", epreuve: true,
    titre: "Épreuve — quatre secondes", titreEn: "Trial — four seconds",
    enonce: "Amène un son qui dure quatre secondes, à un dixième de seconde près.",
    enonceEn: "Bring a sound that lasts four seconds, to within a tenth of a second.",
    indice: "Ajouter silence allonge, Rogner les silences raccourcit, Extraire une zone découpe, et la durée d'un générateur se règle directement.",
    indiceEn: "Add Silence lengthens, Trim Silence shortens, Extract a Region cuts, and a generator's duration is set directly.",
    lecon: "La durée est la seule chose qu'un montage doit tenir exactement. Un son qui tombe à côté de l'image, du tempo ou de la boucle est faux quelle que soit sa beauté — et c'est la raison pour laquelle tant de composants de montage annoncent leur durée d'entrée et de sortie plutôt que de vous laisser la deviner.",
    leconEn: "Duration is the one thing an edit has to hold exactly. A sound that lands beside the picture, the tempo or the loop is wrong however beautiful it is — which is why so many editing nodes announce their in and out durations rather than leaving you to guess.",
    cibles: [
      { grandeur: "duree", min: 3.9, max: 4.1, exigence: "la durée tient entre 3,9 et 4,1 secondes", exigenceEn: "duration holds between 3.9 and 4.1 seconds" },
    ],
  },

  // ── L'espace ────────────────────────────────────────────────────────────────────────────────
];

// LA BANQUE EST LA CONCATENATION DES DEUX MOITIES, dans l'ordre d'origine : voir `exercices-composition.ts`.
export const EXERCICES: Exercice[] = [...EXERCICES_PREMIERES, ...EXERCICES_COMPOSITION];

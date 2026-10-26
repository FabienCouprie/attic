import { describe, it, expect } from "vitest";
import { AudioBuffer, OfflineAudioContext } from "node-web-audio-api";
import { rendreAvecSF2 } from "./midi-soundfont";
import { raieSurParasites } from "./mesure-raie";

// Provide Web Audio globals for the renderer
globalThis.AudioBuffer = AudioBuffer as any;
globalThis.OfflineAudioContext = OfflineAudioContext as any;

function makeSineSample(freq: number, sampleRate: number, duration: number) {
  const n = Math.floor(sampleRate * duration);
  const arr = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 32767;
    arr[i] = Math.round(v);
  }
  return arr;
}

function makeConstantSample(sampleRate: number, duration: number) {
  const n = Math.floor(sampleRate * duration);
  return new Int16Array(n).fill(32767);
}

function buildSF2(opts: { sampleRate: number; rootNote: number; freq: number; duration: number }) {
  const { sampleRate, rootNote, freq, duration } = opts;
  const smpl = makeSineSample(freq, sampleRate, duration);
  return {
    programme: 0,
    nom: "test",
    presets: [] as any[],
    echantillons: [
      {
        nom: "sine",
        debut: 0,
        fin: smpl.length,
        debutBoucle: 0,
        finBoucle: 0,
        taux: sampleRate,
        noteOriginale: rootNote,
        correction: 0,
        type: 0,
      },
    ],
    instruments: [
      {
        nom: "sine-inst",
        zones: [
          {
            noteMin: 0,
            noteMax: 127,
            velMin: 0,
            velMax: 127,
            echantillonId: 0,
            boucleActive: false,
          },
        ],
      },
    ],
    smpl,
    bufferOriginal: smpl.buffer,
  };
}

function matchScore(buffer: AudioBuffer, expectedFreq: number, sampleRate = 44100) {
  const ch = buffer.getChannelData(0);
  // The renderer starts at sample index 0, so the output phase is known.
  let sum = 0;
  let sumOut = 0;
  let sumRef = 0;
  for (let i = 0; i < ch.length; i++) {
    const ref = Math.sin((2 * Math.PI * expectedFreq * i) / sampleRate);
    sum += ch[i] * ref;
    sumOut += ch[i] * ch[i];
    sumRef += ref * ref;
  }
  return sum / Math.sqrt(sumOut * sumRef);
}

describe("rendreAvecSF2 sample rate", () => {
  it("plays a 44.1 kHz sine at the correct pitch", () => {
    const sf2 = buildSF2({ sampleRate: 44100, rootNote: 69, freq: 441, duration: 2 });
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 69, velocite: 127, debut: 0, fin: 1 }], 100, 0);
    expect(matchScore(buffer, 441)).toBeGreaterThan(0.99);
  });

  it("plays a 22.05 kHz sine at the correct pitch", () => {
    const sf2 = buildSF2({ sampleRate: 22050, rootNote: 69, freq: 441, duration: 2 });
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 69, velocite: 127, debut: 0, fin: 1 }], 100, 0);
    expect(matchScore(buffer, 441)).toBeGreaterThan(0.99);
  });

  it("plays a 48 kHz sine at the correct pitch", () => {
    const sf2 = buildSF2({ sampleRate: 48000, rootNote: 69, freq: 480, duration: 2 });
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 69, velocite: 127, debut: 0, fin: 1 }], 100, 0);
    expect(matchScore(buffer, 480)).toBeGreaterThan(0.99);
  });

  it("transposes a 44.1 kHz sine by one octave", () => {
    const sf2 = buildSF2({ sampleRate: 44100, rootNote: 60, freq: 441, duration: 2 });
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 72, velocite: 127, debut: 0, fin: 1 }], 100, 0);
    expect(matchScore(buffer, 882)).toBeGreaterThan(0.99);
  });

  it("does not clip when many notes overlap", () => {
    const sf2 = buildSF2({ sampleRate: 44100, rootNote: 69, freq: 441, duration: 2 });
    const notes = Array.from({ length: 8 }, () => ({ note: 69, velocite: 127, debut: 0, fin: 1 }));
    const buffer = rendreAvecSF2(sf2 as any, notes, 100, 0);
    const maxAmp = Math.max(
      ...buffer.getChannelData(0).map((x) => Math.abs(x)),
      ...buffer.getChannelData(1).map((x) => Math.abs(x)),
    );
    expect(maxAmp).toBeLessThanOrEqual(1 + 1e-6);
    expect(matchScore(buffer, 441)).toBeGreaterThan(0.99);
  });

  it("applique un fondu de sortie pour éviter les clics de coupure", () => {
    const smpl = makeConstantSample(44100, 2);
    const sf2 = {
      programme: 0,
      nom: "test",
      presets: [] as any[],
      echantillons: [{
        nom: "constant", debut: 0, fin: smpl.length, debutBoucle: 0, finBoucle: 0,
        taux: 44100, noteOriginale: 69, correction: 0, type: 0,
      }],
      instruments: [{
        nom: "constant-inst",
        zones: [{
          noteMin: 0, noteMax: 127, velMin: 0, velMax: 127,
          echantillonId: 0, boucleActive: false,
        }],
      }],
      smpl,
      bufferOriginal: smpl.buffer,
    };
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 69, velocite: 127, debut: 0, fin: 0.5 }], 100, 0);
    const ch = buffer.getChannelData(0);
    // Le signal est fort avant le fondu, mais les derniers échantillons sont atténués vers 0.
    expect(Math.abs(ch[Math.floor(0.49 * 44100)])).toBeGreaterThan(0.1);
    expect(Math.abs(ch[ch.length - 1])).toBeLessThan(0.01);
  });
});

// ═══ CE QUE LA TRANSPOSITION LAISSE PASSER, ET CE QUE LA BOUCLE NE DOIT PAS FAIRE ENTENDRE ═══
//
// L'interpolateur de ce chemin était LINÉAIRE, et c'est la qualité même d'un sampler : chaque
// échantillon de sortie tombe entre deux échantillons de source dès qu'une note est transposée.
// Mesuré dans `interpolation.test.ts` : vingt décibels de parasites de moins avec un cubique.
//
// LES CAS CI-DESSUS NE POUVAIENT PAS LE VOIR. Leur `matchScore` est une corrélation à une sinusoïde
// de référence : elle dit la JUSTESSE de la hauteur, pas la propreté du signal — elle passait à 0,99
// avec l'interpolateur linéaire comme avec le cubique. Et la base d'empreintes du dépôt ne couvre
// ce chemin qu'à rapport UNITÉ, où les deux interpolateurs sont rigoureusement identiques.
//
// D'OÙ CES DEUX CAS : l'un mesure ce que la transposition fabrique, l'autre garde la couture de la
// boucle, qui est le risque qu'un noyau à quatre points introduit — il regarde deux points de part
// et d'autre là où le linéaire n'en regardait qu'un.
describe("ce que la transposition d'un SF2 fabrique", () => {
  // LA MESURE EST CELLE D'`audio/mesure-raie.ts`, et non plus une copie. Le commentaire qui était
  // ici disait « même mesure qu'`interpolation` », ce qui était l'aveu d'une seconde écriture.

  it("UNE NOTE TRANSPOSEE D UNE OCTAVE VERS LE BAS SORT PROPRE", () => {
    // La fréquence de sortie tombe sur un rang exact de l'analyse : sans cela, c'est la fuite de la
    // fenêtre qu'on mesure et non l'interpolation. La leçon est dans `interpolation.test.ts`, où un
    // premier jet annonçait 0,1 dB de gain — le plafond de sa propre mesure.
    const N = 2048;
    const rang = 93;
    const fSortie = (rang * 44100) / N;
    // Une octave vers le bas : la source porte donc le double.
    const sf2 = buildSF2({ sampleRate: 44100, rootNote: 72, freq: fSortie * 2, duration: 2 });
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 60, velocite: 127, debut: 0, fin: 1 }], 100, 0);
    const db = raieSurParasites(buffer.getChannelData(0), rang, N);
    console.log(`SF2, octave vers le bas · raie sur parasites : ${db.toFixed(1)} dB`);
    expect(db, [
      "",
      "Une note transposée d'une octave vers le bas sort sale.",
      "",
      "C'est l'interpolateur qui décide ici, et il doit être le cubique partagé de",
      "`audio/interpolation.ts`. Avec le linéaire qu'il remplace, cette mesure tombait d'une vingtaine",
      "de décibels — voir `interpolation.test.ts` pour le relevé des deux.",
      "",
    ].join("\n")).toBeGreaterThan(40);
  });

  it("ET LA COUTURE D UNE BOUCLE NE CLAQUE PAS : le noyau boucle avec elle", () => {
    // ═══ LE RISQUE PROPRE AU NOYAU À QUATRE POINTS ═══
    //
    // Il regarde deux échantillons de part et d'autre. Si ces quatre points ne suivent pas la
    // boucle, ceux qui tombent au-delà de sa fin — ou avant son début — sortent de la boucle, et
    // l'on entend un CLIC à chaque tour. C'est exactement le défaut que quatre points sont censés
    // éviter, et il s'introduit en les ajoutant sans y penser.
    //
    // ON MESURE LE PLUS GRAND SAUT d'un échantillon au suivant. Une sinusoïde à 441 Hz lue à
    // 44,1 kHz ne saute jamais de plus de 2π × 441 / 44100 ≈ 0,063 par pas : un clic de couture
    // sauterait d'un ordre de grandeur de plus.
    const sampleRate = 44100;
    const freq = 441;
    const n = Math.floor(sampleRate * 0.5);
    // LA BOUCLE TOMBE SUR UN NOMBRE ENTIER DE PÉRIODES, sans quoi la couture claquerait pour une
    // raison qui n'est pas l'interpolation : le signal lui-même ne se raccorderait pas.
    const periode = sampleRate / freq;
    const debutBoucle = Math.round(periode * 10);
    const finBoucle = Math.round(periode * 60);
    // ═══ ET CE QUI ENTOURE LA BOUCLE EST DU SILENCE, SANS QUOI CE CAS NE PROUVE RIEN ═══
    //
    // MON PREMIER JET REMPLISSAIT TOUT L'ÉCHANTILLON DE LA SINUSOÏDE, et les deux rebouclages y
    // étaient INVISIBLES : un signal périodique continue au-delà de sa boucle, de sorte que lire
    // deux échantillons trop loin donne la même valeur que reboucler. J'ai retiré le rebouclage
    // avant, puis l'arrière : le cas restait vert, au millième près, les deux fois.
    //
    // Avec du silence de part et d'autre, un index qui sort de la boucle rend zéro — et le saut se
    // voit. C'est la différence entre un cas qui mesure et un cas qui accompagne.
    const smpl = new Int16Array(n);
    for (let i = debutBoucle; i < finBoucle; i++) {
      // COSINUS, ET NON SINUS : les bords de la boucle valent alors ±1 et non 0. Avec un sinus, ses
      // deux bords etaient a zero comme le silence qui l entoure, de sorte que sortir de la boucle
      // lisait la MEME valeur -- et les deux rebouclages restaient invisibles au millieme pres.
      smpl[i] = Math.round(Math.cos((2 * Math.PI * freq * (i - debutBoucle)) / sampleRate) * 32767);
    }
    const sf2 = {
      programme: 0, nom: "boucle", presets: [] as any[],
      echantillons: [{
        nom: "sine", debut: 0, fin: n, debutBoucle, finBoucle,
        taux: sampleRate, noteOriginale: 69, correction: 0, type: 0,
      }],
      instruments: [{
        nom: "inst",
        zones: [{ noteMin: 0, noteMax: 127, velMin: 0, velMax: 127, echantillonId: 0, boucleActive: true }],
      }],
      smpl, bufferOriginal: smpl.buffer,
    };
    // Deux secondes sur une boucle d'un peu plus d'un dixième de seconde : la couture passe
    // une bonne vingtaine de fois.
    // ON TRANSPOSE, ET IL LE FAUT : a rapport UNITE la partie fractionnaire est nulle, le noyau rend
    // exactement l echantillon central, et les voisins ne comptent pas. Mon premier jet jouait la note
    // de reference : le rebouclage arriere retire, le cas restait vert. Une quarte vers le bas rend la
    // lecture fractionnaire, donc les quatre points comptent.
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 64, velocite: 127, debut: 0, fin: 2 }], 100, 0);
    const ch = buffer.getChannelData(0);
    // ═══ ON NE REGARDE QU'APRÈS LE PREMIER TOUR, et c'est une correction ═══
    //
    // Le balayage portait sur toute la sortie, et son plus grand saut était 0,3991 — à l'endroit où
    // le silence de l'attaque rencontre le cosinus de la boucle. C'est un pas DE MON MATÉRIAU, posé
    // par construction, et non de l'interpolation : le mesurer revenait à faire échouer le cas sur du
    // code juste. On part donc une fois la boucle entamée, là où seules les coutures se présentent.
    const ratio = 2 ** ((64 - 69) / 12);
    const depart = Math.ceil((debutBoucle + (finBoucle - debutBoucle)) / ratio) + 8;
    let pire = 0, ou = 0;
    for (let i = depart + 1; i < ch.length; i++) {
      const saut = Math.abs(ch[i] - ch[i - 1]);
      if (saut > pire) { pire = saut; ou = i; }
    }
    console.log(`SF2 bouclé · plus grand saut : ${pire.toFixed(4)} à l'échantillon ${ou}`);
    expect(pire, [
      "",
      "LA COUTURE DE LA BOUCLE CLAQUE.",
      "",
      "Le noyau à quatre points regarde deux échantillons de part et d'autre : les quatre doivent",
      "suivre la boucle. Vers l'avant, un index au-delà de la fin revient au début ; vers l'arrière,",
      "un index avant le début revient à la fin — mais seulement si l'on tourne déjà, car pendant",
      "l'attaque les échantillons d'avant sont les vrais.",
      "",
      "Une sinusoïde à 441 Hz ne saute pas de plus de 0,063 par pas.",
      "",
    ].join("\n")).toBeLessThan(0.2);
    // ═══ CE QUE CE CAS NE PROUVE PAS, ET IL FAUT LE DIRE ═══
    //
    // Relevé en plantant les deux moitiés du rebouclage, séparément :
    //
    //   intact                        0,0266
    //   rebouclage AVANT retiré       0,5579   ← ce cas tombe
    //   rebouclage ARRIÈRE retiré     0,0419   ← ce cas PASSE
    //
    // Le rebouclage avant est donc gardé, et c'est celui qui produit un vrai clic : un index deux
    // échantillons au-delà de la fin de boucle lit ce qui suit l'échantillon, ici du silence.
    //
    // L'ARRIÈRE NE L'EST PAS, et la raison est arithmétique : il ne sert qu'à l'unique échantillon
    // de sortie dont la position fractionnaire retombe dans le premier échantillon de la boucle après
    // un tour. Sur cette matière il vaut 0,0419 contre 0,0266, soit un défaut d'un échantillon par
    // tour sur le terme de plus faible poids du noyau. Il est gardé parce qu'il est JUSTE — et sur
    // une boucle qui ne tombe pas sur un nombre entier de périodes, ce qui est le cas ordinaire
    // d'une banque réelle, son effet est plus grand. Mais ce cas-ci ne le mesure pas, et un seuil
    // assez bas pour l'attraper laisserait treize pour cent de marge à l'état correct : il tomberait
    // au premier changement de matière.
  });
});

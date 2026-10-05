// plugins/syntheses-exotiques-midi.test.ts — La branche MIDI des trois synthèses, qui est l'autre
// moitié de chacune.
//
// POURQUOI CE FICHIER EST SÉPARÉ. Chacune des trois fiches de `syntheses-exotiques.ts` a DEUX
// chemins : sans MIDI elle joue la note et la durée réglées, avec MIDI elle joue la séquence
// reçue, mêle les notes à leurs instants et pondère son excitation par la vélocité. Ce sont deux
// contrats différents, et le second ne se tient pas avec les mêmes outils : il lui faut une
// séquence écrite, donc un fichier MIDI construit pour l'occasion.
//
// ET CE FICHIER EXISTE PARCE QUE LE PLANTAGE L'A RÉCLAMÉ. La batterie d'origine comptait
// vingt-neuf cas qui n'exerçaient que le premier chemin : planté, un « Volume » débranché dans la
// branche MIDI n'a rien fait tomber. La moitié de chaque composant était hors d'atteinte, et rien
// ne le disait.
//
// DEUX DE MES CAS ÉTAIENT FAUX AVANT D'ÊTRE JUSTES, et les deux raisons sont écrites sur place :
// `notesVersFichierMidi` RECALE la séquence sur sa première note, de sorte qu'une note isolée
// commençant tard est écrite au tick zéro ; et c'est donc l'écart ENTRE deux notes qui mesure leur
// placement, non le silence devant une seule.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import { fiches } from "./syntheses-exotiques";

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

function contexte(entrees: unknown[], reglages: Record<string, number | string> = {}) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: () => {},
  } as never;
}

const lancer = (id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) =>
  fiche(id).executer(contexte(entrees, reglages));

const LA2 = 110, LA3 = 220;

/** La part de l'énergie portée par une fréquence : sans ambiguïté d'octave. Voir la batterie sœur. */
function part(b: AudioBuffer, f: number): number {
  const d = b.getChannelData(0);
  const depart = Math.max(0, Math.min(Math.floor(d.length / 3), d.length - 16384));
  const n = Math.min(16384, d.length - depart);
  let re = 0, im = 0, energie = 0;
  for (let i = 0; i < n; i++) {
    const x = d[depart + i];
    const a = 2 * Math.PI * f * i / b.sampleRate;
    re += x * Math.cos(a);
    im -= x * Math.sin(a);
    energie += x * x;
  }
  return (re * re + im * im) / (n * energie + 1e-20);
}

const pic = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  }
  return m;
};

function ecartMax(a: AudioBuffer, b: AudioBuffer): number {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a.getChannelData(0)[i] - b.getChannelData(0)[i]));
  return m;
}

const chiffres = (m: string) =>
  (m.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

describe("LA BRANCHE MIDI DES TROIS SYNTHÈSES, qui est la moitié de chacune", () => {
  // CE BLOC EXISTE PARCE QUE LE PLANTAGE L'A RÉCLAMÉ. Chacune des trois fiches a DEUX chemins :
  // sans MIDI elle joue la note et la durée réglées, avec MIDI elle joue la séquence reçue, mêle
  // les notes et pondère son excitation par la vélocité. J'avais écrit vingt-neuf cas qui
  // n'exerçaient que le premier : planté, un « Volume » débranché dans la branche MIDI n'a rien
  // fait tomber. La moitié de chaque composant était hors d'atteinte.
  const TROIS = ["synthese-scanning", "terrain-onde", "voyelle-fof"];
  const sequence = (notes: { note: number; velocite: number; debut: number; fin: number }[]) =>
    notesVersFichierMidi(notes, 120);

  it("UNE SÉQUENCE DE TROIS NOTES EN FAIT JOUER TROIS, et le message les compte", async () => {
    const midi = sequence([
      { note: 45, velocite: 100, debut: 0, fin: 0.2 },
      { note: 52, velocite: 80, debut: 0.25, fin: 0.45 },
      { note: 57, velocite: 60, debut: 0.5, fin: 0.7 },
    ]);
    for (const id of ["synthese-scanning", "terrain-onde"]) {
      const res = await lancer(id, [midi]);
      expect(chiffres(res.message!)[0], `${id} : le message doit compter trois notes`).toBe(3);
    }
    // La voyelle ne compte pas ses notes mais ses bouffées : trois notes en font plus qu'une.
    const une = await lancer("voyelle-fof", [sequence([{ note: 45, velocite: 100, debut: 0, fin: 0.2 }])], { "Graine": 7 });
    const trois = await lancer("voyelle-fof", [midi], { "Graine": 7 });
    expect(chiffres(trois.message!)[0]).toBeGreaterThan(chiffres(une.message!)[0]);
  });

  it("LE SON COUVRE TOUTE LA SÉQUENCE, dernière note comprise", async () => {
    const midi = sequence([
      { note: 45, velocite: 100, debut: 0, fin: 0.2 },
      { note: 57, velocite: 100, debut: 0.6, fin: 0.9 },
    ]);
    for (const id of TROIS) {
      const out = (await lancer(id, [midi])).valeurs[0] as AudioBuffer;
      expect(out.duration, `${id} : le son s'arrête avant la fin de la séquence`)
        .toBeGreaterThanOrEqual(0.9);
      expect(out.duration, `${id} : une queue démesurée`).toBeLessThan(2);
    }
  });

  it("CHAQUE NOTE TOMBE À SON INSTANT, et il y a un creux entre deux notes écartées", async () => {
    // LE GARDE QUE LE PLANTAGE A RÉCLAMÉ : empiler toutes les notes à l'instant zéro ne faisait
    // tomber aucun cas. La durée du mélange se calcule avant le placement et restait juste ; rien
    // ne vérifiait OÙ une note atterrit, alors que c'est tout ce qu'une séquence demande.
    //
    // ET MA PREMIÈRE VERSION DE CE CAS ÉTAIT FAUSSE, non le code : elle posait UNE note tardive et
    // attendait un silence devant elle. Or `notesVersFichierMidi` recale la séquence sur sa
    // première note — une note seule commençant à un demi-seconde est écrite au tick zéro. Il faut
    // donc DEUX notes, et c'est l'écart entre elles qui se mesure.
    const deux = sequence([
      { note: 45, velocite: 100, debut: 0, fin: 0.15 },
      { note: 57, velocite: 100, debut: 0.6, fin: 0.8 },
    ]);
    const rms = (b: AudioBuffer, t0: number, t1: number) => {
      const d = b.getChannelData(0);
      const a = Math.max(0, Math.floor(t0 * b.sampleRate));
      const z = Math.min(d.length, Math.floor(t1 * b.sampleRate));
      let s = 0;
      for (let i = a; i < z; i++) s += d[i] * d[i];
      return Math.sqrt(s / Math.max(1, z - a));
    };
    for (const id of TROIS) {
      const out = (await lancer(id, [deux], { "Graine": 7 })).valeurs[0] as AudioBuffer;
      const premiere = rms(out, 0, 0.14);
      const creux = rms(out, 0.25, 0.5);
      const seconde = rms(out, 0.62, 0.78);
      expect(premiere, `${id} : la première note n'a pas sonné`).toBeGreaterThan(0.1);
      expect(seconde, `${id} : rien à l'instant de la seconde note`).toBeGreaterThan(0.1);
      expect(creux, `${id} : pas de creux entre deux notes écartées`).toBeLessThan(premiere / 2);
    }
  });

  it("LA SÉQUENCE REMPLACE LA NOTE ET LA DURÉE RÉGLÉES, qui cessent d'agir", async () => {
    // Les deux réglages ne servent que « quand aucun MIDI n'est branché », et leur documentation le
    // dit. Branché, le même MIDI doit rendre le même son quelles que soient leurs valeurs.
    const midi = sequence([{ note: 45, velocite: 100, debut: 0, fin: 0.3 }]);
    for (const id of TROIS) {
      const a = (await lancer(id, [midi], { "Note": "A2", "Durée": 3, "Graine": 7 })).valeurs[0] as AudioBuffer;
      const b = (await lancer(id, [midi], { "Note": "C5", "Durée": 0.5, "Graine": 7 })).valeurs[0] as AudioBuffer;
      expect(a.length, `${id} : « Durée » agit encore malgré le MIDI`).toBe(b.length);
      expect(ecartMax(a, b), `${id} : « Note » agit encore malgré le MIDI`).toBe(0);
    }
  });

  it("et c'est bien la note du MIDI qu'on entend", async () => {
    const la2 = (await lancer("terrain-onde", [sequence([{ note: 45, velocite: 100, debut: 0, fin: 0.6 }])])).valeurs[0] as AudioBuffer;
    const la3 = (await lancer("terrain-onde", [sequence([{ note: 57, velocite: 100, debut: 0, fin: 0.6 }])])).valeurs[0] as AudioBuffer;
    expect(part(la2, LA2), "la note 45 doit sonner à 110 Hz").toBeGreaterThan(part(la2, LA3) * 100);
    expect(part(la3, LA3), "la note 57 à 220 Hz").toBeGreaterThan(part(la3, LA2) * 100);
  });

  it("« Volume » DOSE AUSSI LA SORTIE DE LA BRANCHE MIDI", async () => {
    // LE CAS QUE LE PLANTAGE A FAIT ÉCRIRE : un « Volume » figé dans cette branche passait inaperçu.
    const midi = sequence([{ note: 45, velocite: 100, debut: 0, fin: 0.3 }]);
    for (const id of TROIS) {
      expect(pic((await lancer(id, [midi], { "Volume": 0 })).valeurs[0] as AudioBuffer), `${id}`).toBe(0);
      expect(pic((await lancer(id, [midi], { "Volume": 100 })).valeurs[0] as AudioBuffer), `${id}`)
        .toBeGreaterThan(0.5);
    }
  });

  it("LA VÉLOCITÉ PONDÈRE L'ORBITE DU TERRAIN : une note douce y est plus terne, non plus faible", async () => {
    // Le terrain est le seul des trois à faire de la vélocité un réglage de TIMBRE : elle y pondère
    // le rayon, de sorte qu'une note jouée doucement explore moins de relief. C'est pourquoi elle y
    // agit même sur une note seule, là où un niveau serait effacé par la normalisation du mélange.
    const avecVelocite = (v: number) => sequence([{ note: 45, velocite: v, debut: 0, fin: 0.4 }]);
    const doux = (await lancer("terrain-onde", [avecVelocite(20)])).valeurs[0] as AudioBuffer;
    const fort = (await lancer("terrain-onde", [avecVelocite(127)])).valeurs[0] as AudioBuffer;
    expect(ecartMax(doux, fort), "la vélocité ne change rien à l'orbite").toBeGreaterThan(0.05);
  });

  it("« SENSIBILITÉ À LA VÉLOCITÉ » ÉCARTE LES NIVEAUX D'UNE SÉQUENCE", async () => {
    // LE RÉGLAGE QUI A REMPLACÉ « FORCE », ET LA RAISON EST MATHÉMATIQUE. Un facteur appliqué
    // également à toutes les notes se simplifie EXACTEMENT dans la normalisation du mélange : une
    // amplitude d'excitation globale ne pouvait rien changer, et ne le pouvait par construction.
    // Ce qui survit à cette normalisation, c'est l'ÉCART entre les notes, et c'est donc lui qui se
    // règle. Mesuré sur deux notes jouées à 127 et à 15 : rapport 1,00 à sensibilité nulle, 1,36 à
    // trente, 2,61 à soixante-dix, 8,47 à cent.
    const deux = sequence([
      { note: 45, velocite: 127, debut: 0, fin: 0.3 },
      { note: 45, velocite: 15, debut: 0.5, fin: 0.8 },
    ]);
    const rms = (b: AudioBuffer, t0: number, t1: number) => {
      const d = b.getChannelData(0);
      const a = Math.max(0, Math.floor(t0 * b.sampleRate));
      const z = Math.min(d.length, Math.floor(t1 * b.sampleRate));
      let s = 0;
      for (let i = a; i < z; i++) s += d[i] * d[i];
      return Math.sqrt(s / Math.max(1, z - a));
    };
    for (const id of ["synthese-scanning", "voyelle-fof"]) {
      const rapport = async (sensibilite: number) => {
        const o = (await lancer(id, [deux], { "Sensibilité à la vélocité": sensibilite, "Graine": 7 })).valeurs[0] as AudioBuffer;
        return rms(o, 0.05, 0.25) / (rms(o, 0.55, 0.75) + 1e-12);
      };
      expect(await rapport(0), `${id} : à zéro les deux notes doivent sortir au même niveau`)
        .toBeCloseTo(1, 1);
      expect(await rapport(100), `${id} : à cent la douce doit être nettement plus basse`)
        .toBeGreaterThan(5);
      expect(await rapport(70), `${id} : la course doit être progressive`)
        .toBeGreaterThan(await rapport(30));
    }
  });

  it("et elle reste SANS EFFET sur une note seule, comme sa documentation le dit", async () => {
    // Le mélange est normalisé une fois : une note seule remplit donc la sortie quel que soit son
    // niveau. Ce n'est pas un reste du défaut mais la conséquence de la normalisation, et la
    // documentation du réglage l'annonce plutôt que de le taire.
    const une = sequence([{ note: 45, velocite: 60, debut: 0, fin: 0.4 }]);
    for (const id of ["synthese-scanning", "voyelle-fof"]) {
      const basse = (await lancer(id, [une], { "Sensibilité à la vélocité": 0, "Graine": 7 })).valeurs[0] as AudioBuffer;
      const pleine = (await lancer(id, [une], { "Sensibilité à la vélocité": 100, "Graine": 7 })).valeurs[0] as AudioBuffer;
      expect(ecartMax(basse, pleine), `${id} : une note seule ne doit pas bouger`).toBeLessThan(1e-5);
      expect(pic(pleine), `${id} : et elle doit remplir la sortie`).toBeCloseTo(0.72, 2);
    }
  });

  it("ET SANS MIDI ELLE NE CHANGE RIEN DU TOUT, au bit près", async () => {
    // LE GARDE QUI PROTÈGE LES PROJETS DÉJÀ ENREGISTRÉS. Le réglage est nouveau et son calcul passe
    // par le même chemin que l'ancien ; un son produit sans MIDI doit rester identique à ce qu'il
    // était, et c'est l'immense majorité des usages de ces deux nœuds.
    for (const id of ["synthese-scanning", "voyelle-fof"]) {
      const a = (await lancer(id, [null], { "Durée": 0.4, "Sensibilité à la vélocité": 0, "Graine": 7 })).valeurs[0] as AudioBuffer;
      const b = (await lancer(id, [null], { "Durée": 0.4, "Sensibilité à la vélocité": 100, "Graine": 7 })).valeurs[0] as AudioBuffer;
      expect(ecartMax(a, b), `${id} : le réglage agit hors de son domaine`).toBe(0);
    }
  });

  it("un MIDI sans aucune note retombe sur la note réglée", async () => {
    // `notesDuMidi` rend une liste vide, et l'exécuteur doit alors prendre l'autre chemin plutôt
    // que de rendre un mélange de longueur nulle.
    const vide = sequence([]);
    for (const id of TROIS) {
      const out = (await lancer(id, [vide], { "Durée": 0.3 })).valeurs[0] as AudioBuffer;
      expect(out.length, `${id} : un MIDI vide ne doit pas rendre un son vide`).toBeGreaterThan(1000);
    }
  });
});

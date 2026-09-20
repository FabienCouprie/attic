// audio/clavier-banque.test.ts — Étaler un son sur 88 touches se mesure en DURÉES, pas en hauteurs.
//
// Un échantillonneur naïf est déjà juste en hauteur : le rééchantillonnage donne le bon rapport par
// construction. Ce qu'il abîme, c'est la DURÉE — un rapport de 152 entre les deux bouts du clavier —
// et c'est donc là que se mesure l'apport des zones. La hauteur est vérifiée quand même, par le
// suiveur de hauteur : une erreur de mapping s'y verrait aussitôt, et c'est le genre de faute qu'on
// ne voit pas en écoutant deux notes.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import {
  NOTE_DO8, NOTE_LA0, banqueDepuisRendus, choisirZone, construireBanque, ecartDeZone,
  appliquerPanoramique, nomEchantillon, parametresLecture, planZones, rendreNotes, versSfz,
  voixPourNote, type Banque, type Zone,
} from "./clavier-banque";
import { hauteurMediane, suivreHauteur } from "./hauteur";

const SR = 16000;
const RACINE = 57; // La3 = 220 Hz
const hertz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Un son harmonique à une hauteur donnée, avec une attaque nette. */
function sonSource(dureeSec: number, note = RACINE): AudioBuffer {
  const n = Math.round(dureeSec * SR);
  const audio = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = audio.getChannelData(0);
  const f = hertz(note);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const attaque = Math.min(1, t / 0.005);
    const tenue = Math.exp(-t * 1.5);
    d[i] = 0.6 * attaque * tenue * (Math.sin(2 * Math.PI * f * t) + Math.sin(4 * Math.PI * f * t) / 2);
  }
  return audio;
}

/** Durée utile d'un signal : jusqu'où l'énergie reste au-dessus du millième de sa crête. */
function dureeUtile(x: Float32Array, sr: number): number {
  let crete = 0;
  for (const v of x) crete = Math.max(crete, Math.abs(v));
  if (crete <= 0) return 0;
  const seuil = crete * 0.03;
  let dernier = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > seuil) dernier = i;
  return dernier / sr;
}

const demiTons = (a: number, b: number) => Math.abs(12 * Math.log2(a / b));

describe("le plan de zones", () => {
  it("couvre les 88 touches en dix-huit ou dix-neuf zones à ±2 demi-tons", () => {
    const plan = planZones(NOTE_LA0, NOTE_DO8, 2, 60);
    expect(plan.length, `${plan.length} zones`).toBeGreaterThanOrEqual(18);
    expect(plan.length).toBeLessThanOrEqual(19);
  });

  it("couvre CHAQUE touche une fois et une seule", () => {
    const plan = planZones(NOTE_LA0, NOTE_DO8, 2, 60);
    const vues = new Map<number, number>();
    for (const z of plan) for (let n = z.basse; n <= z.haute; n++) vues.set(n, (vues.get(n) ?? 0) + 1);
    for (let n = NOTE_LA0; n <= NOTE_DO8; n++) {
      expect(vues.get(n), `touche ${n}`).toBe(1);
    }
  });

  it("NE TRANSPOSE JAMAIS DE PLUS QUE LA LARGEUR — c'est toute la promesse", () => {
    for (const largeur of [1, 2, 3, 6]) {
      const plan = planZones(NOTE_LA0, NOTE_DO8, largeur, 60);
      for (const z of plan) {
        for (let n = z.basse; n <= z.haute; n++) {
          expect(Math.abs(n - z.racine), `touche ${n}, racine ${z.racine}, largeur ${largeur}`)
            .toBeLessThanOrEqual(largeur);
        }
      }
    }
  });

  it("ancre la grille sur la note d'origine : une zone au moins n'est pas transposée", () => {
    for (const racine of [40, 57, 60, 72]) {
      const plan = planZones(NOTE_LA0, NOTE_DO8, 2, racine);
      expect(plan.some((z) => z.racine === racine), `racine ${racine}`).toBe(true);
    }
  });

  it("donne moins de zones quand on élargit, et plus quand on resserre", () => {
    const large = planZones(NOTE_LA0, NOTE_DO8, 6, 60).length;
    const serre = planZones(NOTE_LA0, NOTE_DO8, 1, 60).length;
    expect(serre).toBeGreaterThan(large * 2);
  });
});

describe("la banque", () => {
  // Un transposeur de remplacement, pour éprouver la logique de zones sans payer dix-neuf
  // vocodeurs de phase : il rééchantillonne, donc il change la durée — ce qui est justement ce que
  // le vrai procédé évite, et ce que le test de durée mesure ensuite avec le vrai.
  const transposerRapide = (a: AudioBuffer, demi: number): AudioBuffer => {
    const ratio = Math.pow(2, demi / 12);
    const n = Math.max(1, Math.round(a.length / ratio));
    const out = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: n, sampleRate: a.sampleRate });
    for (let c = 0; c < a.numberOfChannels; c++) {
      const src = a.getChannelData(c), dst = out.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const p = i * ratio, k = Math.floor(p), f = p - k;
        dst[i] = (src[k] ?? 0) * (1 - f) + (src[k + 1] ?? src[k] ?? 0) * f;
      }
    }
    return out;
  };

  it("rend une zone par plan, et la zone d'origine est le son lui-même", () => {
    const source = sonSource(0.4);
    const banque = construireBanque(source, { racineSource: RACINE, transposer: transposerRapide, suiviTouche: 0 });
    expect(banque.zones.length).toBe(planZones(NOTE_LA0, NOTE_DO8, 2, RACINE).length);
    const propre = banque.zones.find((z) => z.racine === RACINE)!;
    expect(propre.audio.length).toBe(source.length);
    expect(propre.audio.getChannelData(0)[100]).toBe(source.getChannelData(0)[100]);
  });

  it("assigne à chaque touche une zone à moins de deux demi-tons", () => {
    const banque = construireBanque(sonSource(0.3), { racineSource: RACINE, transposer: transposerRapide, suiviTouche: 0 });
    for (let n = NOTE_LA0; n <= NOTE_DO8; n++) {
      expect(Math.abs(ecartDeZone(banque, n)), `touche ${n}`).toBeLessThanOrEqual(2);
      expect(choisirZone(banque, n)).not.toBeNull();
    }
  });

  it("raccourcit vers l'aigu quand on le lui demande, et pas quand on ne le demande pas", () => {
    const source = sonSource(0.5);
    const avec = construireBanque(source, { racineSource: RACINE, transposer: transposerRapide, suiviTouche: 1 });
    const sans = construireBanque(source, { racineSource: RACINE, transposer: transposerRapide, suiviTouche: 0 });
    const aigu = (b: typeof avec) => b.zones[b.zones.length - 1].audio.length;
    const grave = (b: typeof avec) => b.zones[0].audio.length;
    expect(aigu(avec)).toBeLessThan(aigu(sans));
    expect(grave(avec)).toBeLessThanOrEqual(grave(sans));
  });
});

describe("ce que les zones rattrapent, mesuré", () => {
  it("GARDE LA DURÉE DU SON sur tout le clavier, là où un seul échantillon l'étale de 152", () => {
    // La mesure décisive. Avec le vrai procédé — le vocodeur de phase d'Attic —, chaque zone garde
    // la durée du son source ; le rééchantillonnage de ±2 demi-tons ne la fait varier que de 12 %.
    // Un échantillonneur à racine unique, lui, va de ×0,105 à ×16.
    const source = sonSource(0.5);
    const banque = construireBanque(source, { racineSource: RACINE, largeur: 2, suiviTouche: 0 });
    const dureeSource = dureeUtile(source.getChannelData(0), SR);

    const touches = [21, 33, 45, 57, 69, 81, 93, 105];
    const durees: number[] = [];
    for (const note of touches) {
      const rendu = rendreNotes([{ note, velocite: 100, debut: 0, fin: 2 }], banque, { relachement: 0.01 });
      durees.push(dureeUtile(rendu.getChannelData(0), SR));
    }
    const rapports = durees.map((d) => d / dureeSource);
    const etalement = Math.max(...rapports) / Math.min(...rapports);
    // L'étalement d'un échantillonneur naïf serait de 152 sur ces touches ; ici on exige moins de 2.
    expect(etalement, `durées ${durees.map((d) => d.toFixed(2)).join(", ")} s pour ${dureeSource.toFixed(2)} s`)
      .toBeLessThan(2);
  });

  it("JOUE LA BONNE HAUTEUR sur tout le clavier — une faute de mapping se verrait ici", () => {
    const banque = construireBanque(sonSource(0.5), { racineSource: RACINE, largeur: 2, suiviTouche: 0 });
    // Une touche sur douze : mesurer la hauteur de 88 notes coûterait cher pour ne rien apprendre
    // de plus, la grille étant régulière.
    for (const note of [33, 45, 57, 69, 81]) {
      const rendu = rendreNotes([{ note, velocite: 100, debut: 0, fin: 0.6 }], banque, {});
      const suivi = suivreHauteur(rendu.getChannelData(0), SR, { cadence: 100, fMin: 40, fMax: 4000 });
      const mesuree = hauteurMediane(suivi);
      expect(demiTons(mesuree, hertz(note)), `touche ${note} : ${mesuree.toFixed(1)} Hz pour ${hertz(note).toFixed(1)} attendus`)
        .toBeLessThan(0.3);
    }
  });

  it("TIENT la note quand la boucle est posée, et s'éteint sans elle", () => {
    const source = sonSource(0.3);
    const avec = construireBanque(source, { racineSource: RACINE, suiviTouche: 0, boucle: true, boucleDebut: 0.4 });
    const sans = construireBanque(source, { racineSource: RACINE, suiviTouche: 0, boucle: false });
    const tenue = { note: RACINE, velocite: 100, debut: 0, fin: 1.2 };
    const eAvec = rendreNotes([tenue], avec, { relachement: 0.01 });
    const eSans = rendreNotes([tenue], sans, { relachement: 0.01 });
    // À une seconde, l'échantillon de 0,3 s est fini depuis longtemps : seule la boucle sonne.
    const energie = (b: AudioBuffer, debutSec: number, finSec: number) => {
      const d = b.getChannelData(0);
      let e = 0;
      for (let i = Math.round(debutSec * SR); i < Math.min(d.length, Math.round(finSec * SR)); i++) e += d[i] * d[i];
      return e;
    };
    expect(energie(eAvec, 0.9, 1.1)).toBeGreaterThan(energie(eSans, 0.9, 1.1) * 50);
  });

  it("ne rend ni NaN ni infini, et respecte la vélocité", () => {
    const banque = construireBanque(sonSource(0.3), { racineSource: RACINE, transposer: (a) => a, suiviTouche: 0 });
    const fort = rendreNotes([{ note: 60, velocite: 127, debut: 0, fin: 0.3 }], banque, {});
    const doux = rendreNotes([{ note: 60, velocite: 30, debut: 0, fin: 0.3 }], banque, {});
    const crete = (b: AudioBuffer) => { let m = 0; for (const v of b.getChannelData(0)) m = Math.max(m, Math.abs(v)); return m; };
    expect([...fort.getChannelData(0)].every(Number.isFinite)).toBe(true);
    expect(crete(doux)).toBeLessThan(crete(fort) * 0.5);
  });

  it("superpose plusieurs notes sans se tromper de zone", () => {
    const banque = construireBanque(sonSource(0.4), { racineSource: RACINE, largeur: 2, suiviTouche: 0 });
    const accord = [48, 55, 60, 64].map((note) => ({ note, velocite: 90, debut: 0, fin: 0.5 }));
    const rendu = rendreNotes(accord, banque, {});
    expect([...rendu.getChannelData(0)].every(Number.isFinite)).toBe(true);
    let crete = 0; for (const v of rendu.getChannelData(0)) crete = Math.max(crete, Math.abs(v));
    expect(crete).toBeGreaterThan(0.1);
  });
});

describe("l'export SFZ", () => {
  // SFZ est un format texte : on peut donc RELIRE ce qu'on écrit, et c'est la meilleure garantie
  // qu'un échantillonneur y trouvera ce qu'il attend. Le test ne vérifie pas « qu'il y a du texte » :
  // il reconstruit la couverture du clavier à partir des régions et la compare au plan.
  const banqueDeTest = () => construireBanque(sonSource(0.3), {
    racineSource: RACINE, largeur: 2, transposer: (a) => a, suiviTouche: 0, boucle: true, boucleDebut: 0.5,
  });

  /** Relit un texte SFZ : une région par bloc, avec ses trois champs de clavier. */
  function relire(sfz: string) {
    const regions: { lokey: number; hikey: number; centre: number; sample: string; boucle: boolean }[] = [];
    for (const bloc of sfz.split("<region>").slice(1)) {
      const cles = /lokey=(\d+)\s+hikey=(\d+)\s+pitch_keycenter=(\d+)/.exec(bloc);
      const ech = /sample=(\S+)/.exec(bloc);
      if (!cles || !ech) continue;
      regions.push({
        lokey: Number(cles[1]), hikey: Number(cles[2]), centre: Number(cles[3]),
        sample: ech[1], boucle: /loop_mode=loop_sustain/.test(bloc),
      });
    }
    return regions;
  }

  it("écrit une région par zone, et COUVRE chaque touche une fois", () => {
    const banque = banqueDeTest();
    const regions = relire(versSfz(banque, { dossier: "ma-banque" }));
    expect(regions.length).toBe(banque.zones.length);
    const vues = new Map<number, number>();
    for (const r of regions) for (let n = r.lokey; n <= r.hikey; n++) vues.set(n, (vues.get(n) ?? 0) + 1);
    for (let n = NOTE_LA0; n <= NOTE_DO8; n++) expect(vues.get(n), `touche ${n}`).toBe(1);
  });

  it("donne à chaque région le centre de sa zone — sans quoi tout serait transposé de travers", () => {
    const banque = banqueDeTest();
    const regions = relire(versSfz(banque, { dossier: "b" }));
    for (const z of banque.zones) {
      const r = regions.find((x) => x.centre === z.racine);
      expect(r, `zone ${z.racine}`).toBeDefined();
      expect(r!.lokey).toBe(z.basse);
      expect(r!.hikey).toBe(z.haute);
    }
  });

  it("nomme un fichier distinct par zone, dans le dossier demandé", () => {
    const banque = banqueDeTest();
    const regions = relire(versSfz(banque, { dossier: "mon-son" }));
    const noms = regions.map((r) => r.sample);
    expect(new Set(noms).size).toBe(noms.length);
    for (const nom of noms) expect(nom.startsWith("mon-son/")).toBe(true);
    expect(nomEchantillon({ racine: 57, basse: 55, haute: 59 })).toBe("zone-057.wav");
  });

  it("déclare la boucle de maintien quand la banque en a une, et pas sinon", () => {
    const avec = relire(versSfz(banqueDeTest(), { dossier: "b" }));
    expect(avec.every((r) => r.boucle)).toBe(true);
    const sans = construireBanque(sonSource(0.3), {
      racineSource: RACINE, transposer: (a) => a, suiviTouche: 0, boucle: false,
    });
    const texte = versSfz(sans, { dossier: "b" });
    expect(texte).toContain("loop_mode=no_loop");
    expect(texte).not.toContain("loop_sustain");
  });

  it("écrit le relâchement demandé dans l'enveloppe globale", () => {
    const texte = versSfz(banqueDeTest(), { dossier: "b", relachement: 0.45 });
    expect(texte).toContain("ampeg_release=0.450");
  });
});

describe("une banque faite de rendus", () => {
  // L'autre chemin : la recette est rejouée à chaque hauteur, donc il n'y a RIEN à transposer. Ce
  // qu'on vérifie ici, c'est que les bornes couvrent tout le clavier — y compris aux bords, où la
  // première et la dernière zone doivent s'étendre.
  const audio = (longueur: number) => {
    const b = new AudioBuffer({ numberOfChannels: 1, length: longueur, sampleRate: SR });
    b.getChannelData(0).fill(0.5);
    return b;
  };

  it("COUVRE tout le clavier, bords compris", () => {
    const racines = [23, 28, 33, 38];
    const banque = banqueDepuisRendus(racines, racines.map(() => audio(1000)), {
      largeur: 2, noteBasse: 21, noteHaute: 40,
    });
    const vues = new Map<number, number>();
    for (const z of banque.zones) for (let k = z.basse; k <= z.haute; k++) vues.set(k, (vues.get(k) ?? 0) + 1);
    for (let k = 21; k <= 40; k++) expect(vues.get(k), `touche ${k}`).toBe(1);
  });

  it("garde chaque rendu tel quel : aucune transposition n'a lieu", () => {
    const racines = [60, 65];
    const a1 = audio(500), a2 = audio(700);
    const banque = banqueDepuisRendus(racines, [a1, a2], { largeur: 2, noteBasse: 58, noteHaute: 67 });
    expect(banque.zones[0].audio).toBe(a1);
    expect(banque.zones[1].audio).toBe(a2);
    // Et jouer la racine ne rééchantillonne rien.
    expect(ecartDeZone(banque, 60)).toBe(0);
    expect(ecartDeZone(banque, 65)).toBe(0);
  });

  it("pose les boucles quand on le demande", () => {
    const banque = banqueDepuisRendus([60], [audio(1000)], {
      largeur: 2, noteBasse: 21, noteHaute: 108, boucle: true, boucleDebut: 0.4,
    });
    expect(banque.zones[0].boucle).toBeDefined();
    expect(banque.zones[0].boucle!.debut).toBe(400);
  });

  it("ignore une racine dont le rendu manque, plutôt que de rendre une zone vide", () => {
    const banque = banqueDepuisRendus([60, 65], [audio(100)], { largeur: 2, noteBasse: 58, noteHaute: 67 });
    expect(banque.zones.length).toBe(1);
  });
});

describe("les réglages du jeu en direct", () => {
  // Le clavier d'un nœud ne passe pas par `rendreNotes` : il confie l'échantillon au matériel audio.
  // Ce qu'on lui donne se calcule ici, et une seule erreur d'unité suffit à tout gâcher — Web Audio
  // veut des SECONDES là où une zone garde ses bornes de boucle en échantillons.
  const zoneAvecBoucle = (sr: number) => {
    const audio = new AudioBuffer({ numberOfChannels: 1, length: sr, sampleRate: sr });
    return banqueDepuisRendus([60], [audio], {
      largeur: 2, noteBasse: 21, noteHaute: 108, boucle: true, boucleDebut: 0.5,
    });
  };

  it("convertit les bornes de boucle en secondes", () => {
    const banque = zoneAvecBoucle(48000);
    const p = parametresLecture(voixPourNote(banque, 60)!);
    expect(p.boucle).toBe(true);
    expect(p.boucleDebut).toBeCloseTo(0.5, 6);      // 24000 échantillons à 48 kHz
    expect(p.boucleFin).toBeCloseTo(0.95, 6);
  });

  it("ne déclare pas de boucle quand la zone n'en a pas", () => {
    const banque = banqueDepuisRendus([60], [new AudioBuffer({ numberOfChannels: 1, length: 1000, sampleRate: 44100 })],
      { largeur: 2, noteBasse: 21, noteHaute: 108 });
    const p = parametresLecture(voixPourNote(banque, 60)!);
    expect(p.boucle).toBe(false);
    expect(p.boucleDebut).toBe(0);
  });

  it("donne la vitesse de lecture attendue de part et d'autre de la racine", () => {
    const banque = zoneAvecBoucle(44100);
    expect(parametresLecture(voixPourNote(banque, 60)!).vitesse).toBeCloseTo(1, 10);
    expect(parametresLecture(voixPourNote(banque, 62)!).vitesse).toBeCloseTo(Math.pow(2, 2 / 12), 10);
    expect(parametresLecture(voixPourNote(banque, 58)!).vitesse).toBeCloseTo(Math.pow(2, -2 / 12), 10);
  });

  it("module le gain par la vélocité, sans jamais dépasser un", () => {
    const banque = zoneAvecBoucle(44100);
    expect(parametresLecture(voixPourNote(banque, 60, 127, 1)!).gain).toBeCloseTo(1, 6);
    expect(parametresLecture(voixPourNote(banque, 60, 64, 1)!).gain).toBeCloseTo(64 / 127, 6);
    expect(parametresLecture(voixPourNote(banque, 60, 200, 2)!).gain).toBeLessThanOrEqual(1);
  });
});

describe("les fréquences d'échantillonnage qui ne concordent pas", () => {
  // LE DÉFAUT MESURÉ AVANT CETTE CORRECTION : une zone enregistrée à 48 kHz, jouée dans une banque
  // rendue à 44,1 kHz, sortait 147 cents trop bas — un demi-ton et demi. Cela n'arrive pas avec les
  // banques qu'Attic fabrique, dont toutes les zones viennent du même son ; cela arrive dès qu'on lit
  // une bibliothèque SFZ, où rien n'oblige deux fichiers à partager leur fréquence.
  const ton = (hz: number, sr: number, duree = 0.5): AudioBuffer => {
    const n = Math.round(duree * sr);
    const a = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
    const d = a.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = 0.6 * Math.sin((2 * Math.PI * hz * i) / sr);
    return a;
  };
  const banqueMelangee = (): Banque => {
    const zones: Zone[] = [
      { racine: 69, basse: 60, haute: 71, audio: ton(440, 44100) },
      { racine: 81, basse: 72, haute: 90, audio: ton(880, 48000) },
    ];
    return { zones, racineSource: 69, largeur: 12, noteBasse: 60, noteHaute: 90 };
  };
  const hauteurDe = (b: AudioBuffer) =>
    hauteurMediane(suivreHauteur(b.getChannelData(0), b.sampleRate, { cadence: 100 }));
  const cents = (mesure: number, attendu: number) => 1200 * Math.log2(mesure / attendu);

  it("joue JUSTE une zone dont l'échantillon vient d'une autre fréquence", () => {
    const banque = banqueMelangee();
    const rendu = rendreNotes([{ note: 81, velocite: 100, debut: 0, fin: 0.3 }], banque, {});
    expect(rendu.sampleRate).toBe(44100);
    expect(Math.abs(cents(hauteurDe(rendu), 880))).toBeLessThan(20);
  });

  it("et ne dérange pas la zone qui était déjà à la bonne fréquence", () => {
    const rendu = rendreNotes([{ note: 69, velocite: 100, debut: 0, fin: 0.3 }], banqueMelangee(), {});
    expect(Math.abs(cents(hauteurDe(rendu), 440))).toBeLessThan(20);
  });

  it("la conversion est DEMANDÉE, pas imposée : le jeu en direct n'en veut pas", () => {
    // Le matériel audio convertit lui-même le tampon qu'on lui confie ; appliquer la conversion ici
    // la ferait deux fois, et la note sortirait 8,8 % trop haut au clavier.
    const banque = banqueMelangee();
    expect(voixPourNote(banque, 81)!.ratio).toBeCloseTo(1, 10);
    expect(parametresLecture(voixPourNote(banque, 81)!).vitesse).toBeCloseTo(1, 10);
    // Demandée, elle vaut exactement le rapport des deux fréquences.
    expect(voixPourNote(banque, 81, 100, 1, 44100)!.ratio).toBeCloseTo(48000 / 44100, 10);
  });
});

describe("le panoramique", () => {
  const bip = (canaux = 1): AudioBuffer => {
    const a = new AudioBuffer({ numberOfChannels: canaux, length: 1000, sampleRate: 44100 });
    for (let c = 0; c < canaux; c++) a.getChannelData(c).fill(0.5);
    return a;
  };
  const crete = (a: AudioBuffer, canal: number) => {
    let m = 0;
    for (const v of a.getChannelData(canal)) m = Math.max(m, Math.abs(v));
    return m;
  };

  it("rend un tampon stéréo, même depuis un mono", () => {
    expect(appliquerPanoramique(bip(1), 0).numberOfChannels).toBe(2);
  });

  it("met tout à gauche, tout à droite, et rien de travers", () => {
    const gauche = appliquerPanoramique(bip(1), -1);
    expect(crete(gauche, 0)).toBeGreaterThan(0.7);
    expect(crete(gauche, 1)).toBeLessThan(1e-6);
    const droite = appliquerPanoramique(bip(1), 1);
    expect(crete(droite, 0)).toBeLessThan(1e-6);
    expect(crete(droite, 1)).toBeGreaterThan(0.7);
  });

  it("GARDE LE NIVEAU au centre : c'est ce qu'une loi linéaire ratait de trois décibels", () => {
    const centre = appliquerPanoramique(bip(1), 0);
    expect(crete(centre, 0)).toBeCloseTo(0.5, 6);
    expect(crete(centre, 1)).toBeCloseTo(0.5, 6);
    // Et la puissance totale ne bouge pas quand on déplace le son.
    const puissance = (a: AudioBuffer) => crete(a, 0) ** 2 + crete(a, 1) ** 2;
    expect(puissance(appliquerPanoramique(bip(1), -1))).toBeCloseTo(puissance(centre), 6);
    expect(puissance(appliquerPanoramique(bip(1), 0.5))).toBeCloseTo(puissance(centre), 6);
  });

  it("borne un réglage hors plage plutôt que d'inverser les canaux", () => {
    const trop = appliquerPanoramique(bip(1), 5);
    expect(crete(trop, 0)).toBeLessThan(1e-6);
    expect(crete(trop, 1)).toBeGreaterThan(0.7);
  });
});

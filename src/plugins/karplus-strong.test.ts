// plugins/karplus-strong.test.ts — La corde de Karplus-Strong, lancée comme le moteur la lance.
//
// LE GARDE EXERCE LA FICHE, et non le module seul : le chemin qui sépare la note d'un MIDI du son
// rendu passe par la lecture du fichier, la conversion en fréquence, le décalage de chaque note et le
// mélange, et c'est là qu'une hauteur juste au module peut sortir fausse. Ce que le module promet,
// sur une grille plus large, est tenu par `audio/corde-pincee.test.ts`.
import { describe, expect, it } from "vitest";
import { fiches } from "./karplus-strong";
import { lancerFiche, type FicheLancable, type Reglages } from "../audio/lancer-fiche";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import { amplitudeDeRaie, centsEntre, raieLaPlusForte } from "../audio/mesure-raie";
import { gainUnPole, poleDeNuance } from "../audio/excitation-corde";
import { publierFrequenceDeTravail } from "../audio/frequence-de-travail";

const fiche = fiches.find((f) => f.id === "karplus-strong") as unknown as FicheLancable;
const DEMI_TON = 2 ** (1 / 12);

async function lancer(reglages: Reglages, entrees: unknown[] = [null, null]) {
  const r = await lancerFiche(fiche, reglages, { entrees });
  expect(r.levee, "le nœud a levé").toBeNull();
  return r;
}

async function canal(reglages: Reglages, entrees?: unknown[]) {
  const b = (await lancer(reglages, entrees)).valeurs[0] as AudioBuffer;
  return { x: b.getChannelData(0), sr: b.sampleRate };
}

const jouee = (x: Float32Array, sr: number, f: number, debut = 0.05, fin = 0.55) =>
  raieLaPlusForte(x, sr, debut, fin, f / DEMI_TON, f * DEMI_TON);

/** Trois notes séparées de silences, en MIDI : la3, do4 et mi4. */
const TROIS = [
  { note: 57, velocite: 100, debut: 0, fin: 0.3 },
  { note: 60, velocite: 100, debut: 0.5, fin: 0.8 },
  { note: 64, velocite: 100, debut: 1, fin: 1.3 },
];
const frequence = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

describe("la corde de Karplus-Strong, lancée comme le moteur", () => {
  it("SANS MIDI, ELLE JOUE SA NOTE À UN CENT PRÈS, à 44,1 et à 48 kHz", async () => {
    try {
      for (const sr of [44100, 48000]) {
        publierFrequenceDeTravail(sr);
        for (const [note, f] of [["A2", 110], ["C4", 261.626], ["C7", 2093.005]] as const) {
          const { x, sr: rendue } = await canal({ Note: note, Durée: 0.6 });
          expect(rendue).toBe(sr);
          const ecart = centsEntre(jouee(x, sr, f), f);
          expect(Math.abs(ecart), `${note} à ${sr} Hz : ${ecart.toFixed(3)} cents`).toBeLessThan(1);
        }
      }
    } finally {
      publierFrequenceDeTravail(44100);
    }
  });

  it("CHAQUE NOTE DU MIDI PART À SON DÉBUT, à un échantillon près, JUSTE, ET SE TAIT APRÈS SON RELÂCHEMENT", async () => {
    const relache = 0.1;
    const { x, sr } = await canal({ Excitation: "Impulsion", Relâchement: relache }, [notesVersFichierMidi(TROIS, 120), null]);
    let crete = 0;
    for (const v of x) crete = Math.max(crete, Math.abs(v));
    for (const n of TROIS) {
      const depart = Math.floor(n.debut * sr);
      // L'ATTAQUE EST LE PREMIER ÉCHANTILLON À −40 dB DE LA CRÊTE : la queue de la note d'avant, qui
      // descend de 60 dB par relâchement, est encore là, bien plus bas.
      let premier = Math.max(0, Math.floor((n.debut - 0.05) * sr));
      while (premier < x.length && Math.abs(x[premier]) < 0.01 * crete) premier++;
      expect(premier, `attaque de la note ${n.note}`).toBe(depart);
      const f = frequence(n.note), ecart = centsEntre(jouee(x, sr, f, n.debut + 0.02, n.fin), f);
      expect(Math.abs(ecart), `note ${n.note} : ${ecart.toFixed(3)} cents`).toBeLessThan(1);
      // APRÈS SA FIN, SON RELÂCHEMENT ET UNE PÉRIODE, la note est à −60 dB de la crête au plus.
      const de = Math.ceil((n.fin + relache + 1 / f) * sr), a = Math.floor((n.debut + 0.5) * sr) - 1;
      let reste = 0;
      for (let i = de; i < Math.min(a, x.length); i++) reste = Math.max(reste, Math.abs(x[i]));
      expect(20 * Math.log10(Math.max(reste, 1e-12) / crete), `silence après la note ${n.note}`).toBeLessThan(-60);
    }
  });

  it("APRÈS SA FIN, LA CORDE PERD 60 dB EN « RELÂCHEMENT » SECONDES, à 3 % près, au grave comme à l'aigu", async () => {
    // LE DÉFAUT D'UN PREMIER JET (2026-11-27) : le gain de la boucle descendait à zéro en ligne
    // droite, et passait sous 0,9 en un dixième du relâchement ; un relâchement de 0 et un de 1 s ne
    // se séparaient, mesurés par `varier`, que de 0,4 dB. La pente se lit sur le fondamental, que la
    // moyenne n'éteint presque pas d'elle-même : à 110 Hz, trois centièmes de décibel par seconde.
    for (const [note, f] of [[45, 110], [72, 523.251]] as const) {
      for (const relache of [0.25, 0.5]) {
        const { x, sr } = await canal({ Excitation: "Impulsion", Relâchement: relache },
          [notesVersFichierMidi([{ note, velocite: 127, debut: 0, fin: 0.5 }], 120), null]);
        const fk = raieLaPlusForte(x, sr, 0.1, 0.45, f / DEMI_TON, f * DEMI_TON);
        const points: [number, number][] = [];
        for (let t = 0.52; t + 0.05 <= 0.5 + relache; t += 0.01) points.push([t + 0.025, 20 * Math.log10(amplitudeDeRaie(x, sr, t, t + 0.05, fk))]);
        const mt = points.reduce((s, p) => s + p[0], 0) / points.length, md = points.reduce((s, p) => s + p[1], 0) / points.length;
        let num = 0, den = 0;
        for (const [t, d] of points) { num += (t - mt) * (d - md); den += (t - mt) ** 2; }
        const propre = f * 10 * Math.log10(1 - Math.sin((Math.PI * fk) / sr) ** 2);
        const predite = -60 / relache + propre, relevee = num / den;
        expect(Math.abs(relevee / predite - 1), `note ${note}, ${relache} s : ${relevee.toFixed(1)} contre ${predite.toFixed(1)} dB/s`).toBeLessThan(0.03);
      }
    }
  });

  it("LA VÉLOCITÉ RÈGLE LE NIVEAU ET LA NUANCE, du rapport exact qu'elles prédisent, à 0,5 dB près", async () => {
    const notes = [{ note: 57, velocite: 127, debut: 0, fin: 0.4 }, { note: 57, velocite: 32, debut: 1, fin: 1.4 }];
    const brillance = 20000;
    const { x, sr } = await canal({ Excitation: "Impulsion", Brillance: brillance, Relâchement: 0.1 }, [notesVersFichierMidi(notes, 120), null]);
    const f1 = raieLaPlusForte(x, sr, 0.02, 0.3, 210, 230);
    const forte = amplitudeDeRaie(x, sr, 0.02, 0.3, f1), douce = amplitudeDeRaie(x, sr, 1.02, 1.3, f1);
    const module = (bande: number) => gainUnPole(poleDeNuance(bande, 220, sr), f1, sr);
    const predit = 20 * Math.log10((32 / 127) * module(brillance * 32 / 127) / module(brillance));
    const releve = 20 * Math.log10(douce / forte);
    expect(Math.abs(releve - predit), `${releve.toFixed(2)} contre ${predit.toFixed(2)} dB`).toBeLessThan(0.5);
  });

  it("À UN MÉLANGE DE 0, ELLE SONNE UNE OCTAVE PLUS BAS", async () => {
    const { x, sr } = await canal({ Note: "A3", Durée: 0.6, Mélange: 0, Graine: 5 });
    expect(Math.abs(centsEntre(jouee(x, sr, 110), 110))).toBeLessThan(1);
  });

  it("« ENTRÉE AUDIO » REFUSE SANS SON BRANCHÉ, et branchée, la corde rend sa note", async () => {
    const sans = await lancer({ Excitation: "Entrée audio" });
    expect(sans.erreurRendue).toBe(true);
    expect(sans.message).toContain("Excitation");
    const sinus = new AudioBuffer({ numberOfChannels: 1, length: 44100, sampleRate: 44100 });
    sinus.copyToChannel(Float32Array.from({ length: 44100 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 44100)), 0);
    const { x, sr } = await canal({ Excitation: "Entrée audio", Note: "A3", Durée: 0.6 }, [null, sinus]);
    expect(Math.abs(centsEntre(jouee(x, sr, 220), 220))).toBeLessThan(1);
  });

  it("LA LONGUEUR D'EXCITATION AGIT SUR LE BRUIT, ET NON SUR L'IMPULSION, comme sa documentation le dit", async () => {
    const son = async (r: Reglages) => Array.from((await canal({ Note: "A3", Durée: 0.3, Graine: 8, ...r })).x);
    expect(await son({ "Longueur d'excitation": 4 })).not.toEqual(await son({ "Longueur d'excitation": 1 }));
    expect(await son({ Excitation: "Impulsion", "Longueur d'excitation": 4 }))
      .toEqual(await son({ Excitation: "Impulsion", "Longueur d'excitation": 1 }));
  });
});

describe("la graine de la corde de Karplus-Strong", () => {
  it("elle est déclarée comme une graine, à zéro par défaut", () => {
    const p = (fiche.parametres as readonly { nom: string; graine?: boolean; defaut?: unknown }[]).find((x) => x.nom === "Graine");
    expect(p?.graine).toBe(true);
    expect(p?.defaut).toBe(0);
  });

  it("LA MÊME GRAINE REJOUE LA MÊME CORDE ; une autre pince autrement ; le message l'annonce", async () => {
    const son = async (Graine: number, Mélange = 1) => Array.from((await canal({ Note: "A3", Durée: 0.3, Graine, Mélange })).x);
    expect(await son(42)).toEqual(await son(42));
    expect(await son(42)).not.toEqual(await son(43));
    expect(await son(42, 0.5)).toEqual(await son(42, 0.5));
    expect((await lancer({ Graine: 4711 })).message).toContain("4711");
  });
});

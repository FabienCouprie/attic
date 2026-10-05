// plugins/masquage-schillinger-gammes.test.ts — Les trois fiches de `masquage-schillinger-gammes.ts`,
// qu'aucun test ne nommait.
//
// POURQUOI CE FICHIER. L'en-tête du fichier dit lui-même ce qu'il est : « la logique est dans
// `audio/masquage.ts`, `audio/schillinger.ts` et `audio/gammes-monde.ts`, testées ; ce fichier n'est
// que la prise ». Les trois calculs sont tenus, et largement — l'échelle des bandes critiques,
// l'asymétrie de la fonction d'étalement, la figure 2-1-1-2, la tierce neutre du Rast. La PRISE, non :
// aucun test ne nommait `masquage`, `resultante-schillinger` ni `gammes-monde`, et les trois
// exécuteurs ne tournaient nulle part. Rien ici ne refait une mesure d'acoustique ou de théorie ; ce
// qui est tenu, c'est ce que la fiche ajoute — lire ses réglages, rendre un texte, une courbe, un
// fichier, et dire la même chose dans ses deux langues.
//
// CES TROIS FICHES RENDENT DU TEXTE, et le texte est l'endroit où une prise se trompe sans bruit.
// Elles ne passent d'ailleurs pas par `traduire` pour le composer : elles lisent `langueCourante()`
// et branchent. Les cas d'anglais sont donc là pour cela, et ils ont demandé une enveloppe de langue
// qui TIENNE PENDANT L'ATTENTE : l'exécuteur du rythme traduit son message après deux `await`, de
// sorte qu'un `localStorage` posé puis retiré autour d'un appel non attendu rendait le texte en
// anglais et le message en français. Le défaut était dans ma mesure, non dans le nœud, mais il
// aurait aussi bien pu être l'inverse.
//
// CE QUE LA PRISE DÉCIDE, ET QU'AUCUN CALCUL NE DIT :
//
//   LE MASQUAGE accorde sa courbe et son message. Le pourcentage annoncé est la MOYENNE de la
//   courbe rendue, point par trame, et les deux doivent donc rester d'accord. C'est le cas le plus
//   fort du fichier, parce qu'il relie deux sorties que rien d'autre ne relie.
//
//   LE RYTHME écrit son motif trois fois — en texte, en MIDI, en son — et les trois doivent dire la
//   même chose. Le MIDI est relu note à note : les frappes tombent sur leurs battements à 480 ticks
//   le battement, sur le canal 9 de la batterie, à la percussion choisie. Ce canal a déjà été perdu
//   une fois, et le commentaire du fichier le raconte : le motif relu par un séquenceur sortait sur
//   un piano, et la caisse claire devenait un ré.
//
//   LES GAMMES N'ONT PAS DE SORTIE MIDI, et c'est une décision écrite : « le MIDI ne porte que des
//   demi-tons ; un maqam Rast y perdrait sa tierce neutre ». Un cas la tient, faute de quoi elle
//   serait reprise un jour pour une omission.
//
// DEUX ANGLES MORTS TROUVÉS EN PLANTANT, et tous deux viennent de n'éprouver qu'une valeur par
// défaut. Figer le repère du tableau des gammes à vingt cents ne faisait rien tomber, puisque c'est
// la tolérance par défaut : le tableau et le message restaient d'accord par coïncidence. Le cas
// d'accord tourne donc maintenant à deux tolérances. Et le compte de degrés du message n'était lu
// par aucun cas, de sorte qu'on pouvait le décaler d'un sans rien casser ; il se lit désormais
// contre le tableau, qu'il doit valoir moins l'octave. QUARANTE-HUIT PLANTAGES, QUARANTE-SIX
// DÉFAUTS, QUARANTE-SIX ARRÊTÉS.
//
// LES DEUX QUI PASSENT NE SONT PAS DES DÉFAUTS, ce qu'il faut dire plutôt que masquer.
//
//   REJOUER LA DERNIÈRE TRAME DU MASQUANT au lieu de bandes vides ne change rien, parce que cette
//   trame-là est presque silencieuse : l'analyse termine sur la queue du tampon. Deux variantes plus
//   franches, rejouer les trames en boucle et les étirer sur toute la durée, tombent toutes les deux.
//
//   LE CANAL ÉCRIT SUR CHAQUE NOTE N'EST LU PAR PERSONNE. `notesVersFichierMidi` range tout le
//   fichier sur le canal reçu en troisième argument et ne regarde pas le champ des notes ;
//   `rendreBatterieMidi` ne le regarde pas davantage. Le canal du fichier, lui, est bien le neuf de
//   la batterie, et c'est ce qui compte — un cas le tient. Le champ par note est donc inerte, et
//   aucun cas ne le grave : un garde posé là ne tiendrait qu'une écriture sans effet.
//
// UN DÉFAUT TROUVÉ ICI, ET CORRIGÉ DEPUIS. LE COMPTE DE BANDES DU MESSAGE ÉTAIT PLAFONNÉ À SIX,
// parce qu'il était pris sur la liste AFFICHÉE et non sur les bandes enfouies. Le texte, lui, était
// honnête : il annonce « les bandes les plus enfouies », et six est une longueur de liste. Mais le
// message dit « N bandes enfouies », ce qui se lit comme un total. Mesuré en refaisant la boucle du
// nœud à côté : un bruit faible sous un bruit fort enfouit LES VINGT-QUATRE bandes et le nœud en
// annonçait six ; huit sinus en enfouissent dix, et il en annonçait six encore. Le compte est
// désormais celui des bandes, et la liste reste aux six pires en disant qu'elle en est une
// sélection — « (6 sur 24) », « (6 of 24) » —, faute de quoi le message et la liste se
// contrediraient à l'écran.
//
// ET LE CAS QUI LE TIENT A DÛ CHOISIR SON SIGNAL, parce que SOUS LE PLAFOND LES DEUX COMPTES
// COÏNCIDENT ENCORE : une bande, deux, cinq. C'est ce qui rendait le défaut invisible à l'usage, et
// c'est ce qui rendrait vain un cas qui n'éprouverait qu'un ou deux degrés masqués. Il faut un son
// qui enfouisse plus de six bandes, et un bruit large sous un bruit large les enfouit toutes.
// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { parseMidi } from "midi-file";
import { NB_BANDES } from "../audio/masquage";
import { GAMMES } from "../audio/gammes-monde";
import { CANAL_PERCUSSION, PERCUSSIONS_CHOIX } from "../audio/batterie-midi";
import { fiches } from "./masquage-schillinger-gammes";

const SR = 44100;
const TICKS = 480;

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
const texteDe = async (id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) =>
  String((await lancer(id, entrees, reglages)).valeurs[0]);

/**
 * La langue posée reste posée PENDANT l'attente.
 *
 * Deux des trois exécuteurs traduisent après un `await` : une enveloppe qui retirerait le
 * `localStorage` en rendant la promesse laisserait la fin de l'exécution retomber sur le français.
 */
async function avecLangue<T>(langue: string, f: () => Promise<T>): Promise<T> {
  const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} },
    configurable: true, writable: true,
  });
  try { return await f(); } finally {
    if (avant) Object.defineProperty(globalThis, "localStorage", avant);
    else delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
}

function sinus(f: number, secondes: number, amplitude: number): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = amplitude * Math.sin((2 * Math.PI * f * i) / SR);
  return b;
}
function bruit(secondes: number, amplitude: number, graine = 12345): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  let x = graine;
  for (let i = 0; i < n; i++) { x = (x * 1664525 + 1013904223) >>> 0; d[i] = amplitude * (x / 2147483648 - 1); }
  return b;
}

/** Le pourcentage que le message annonce, et le compte de bandes qui le suit. */
function chiffresDuMessage(message: unknown): { pourcent: number; bandes: number } {
  const m = String(message).match(/([\d.]+)\s*%.*?(\d+)/);
  return { pourcent: Number(m?.[1]), bandes: Number(m?.[2]) };
}

type Courbe = { valeurs: Float32Array; cadence: number };
const moyenne = (c: Courbe) => c.valeurs.reduce((a, b) => a + b, 0) / c.valeurs.length;

/** Les frappes d'un fichier MIDI : instant en ticks, note, canal. */
async function frappes(fichier: File) {
  const m = parseMidi(new Uint8Array(await fichier.arrayBuffer()));
  const sortie: { tick: number; note: number; canal: number; velocite: number }[] = [];
  for (const piste of m.tracks) {
    let t = 0;
    for (const ev of piste) {
      t += ev.deltaTime;
      if (ev.type === "noteOn") {
        const e = ev as unknown as { noteNumber: number; channel: number; velocity: number };
        sortie.push({ tick: t, note: e.noteNumber, canal: e.channel, velocite: e.velocity });
      }
    }
  }
  return { ticksParBattement: m.header.ticksPerBeat ?? 0, frappes: sortie };
}

describe("masquage", () => {
  it("refuse de travailler sans ses deux entrées, et le dit", async () => {
    for (const entrees of [[null, null], [sinus(1000, 1, 0.5), null], [null, bruit(1, 0.5)]]) {
      const r = await lancer("masquage", entrees);
      expect(String(r.message)).toContain("Aucune entrée");
      // Le moteur tient une sortie entièrement nulle pour un échec : c'est ce contrat-là qui compte,
      // et non la longueur du tableau, que l'idiome `sansEntree` du dépôt laisse à un.
      expect(r.valeurs.every((v) => v == null)).toBe(true);
    }
  });

  it("dit que les sons sont trop courts plutôt que de rendre une analyse vide", async () => {
    const r = await lancer("masquage", [sinus(1000, 0.01, 0.5), bruit(0.01, 0.5)]);
    expect(String(r.message)).toContain("trop courts");
    expect(r.valeurs.every((v) => v == null)).toBe(true);
  });

  it("ne déclare masqué que ce qu'un masquant plus fort recouvre", async () => {
    const faibleSousFort = await lancer("masquage", [sinus(1000, 1, 0.02), bruit(1, 0.9)]);
    expect(chiffresDuMessage(faibleSousFort.message).pourcent).toBeGreaterThan(50);
    // Le même couple retourné : un son fort ne se laisse pas masquer par un souffle.
    const fortSousFaible = await lancer("masquage", [sinus(1000, 1, 0.9), bruit(1, 0.02)]);
    expect(chiffresDuMessage(fortSousFaible.message).pourcent).toBe(0);
    expect(await texteDe("masquage", [sinus(1000, 1, 0.9), bruit(1, 0.02)])).toContain("Rien n'est masqué");
    // Et un masquant lointain ne recouvre rien, si fort soit-il.
    const lointain = await lancer("masquage", [sinus(1000, 1, 0.02), sinus(120, 1, 0.9)]);
    expect(chiffresDuMessage(lointain.message).pourcent).toBe(0);
  });

  it("masque moins avec un masquant tonal qu'avec un bruit, comme sa documentation l'annonce", async () => {
    const part = async (nature: string) => chiffresDuMessage(
      (await lancer("masquage", [sinus(1000, 1, 0.02), bruit(1, 0.9)], { "Nature du masquant": nature })).message,
    ).pourcent;
    const tonal = await part("tonal"), entre = await part("entre"), bruite = await part("bruit");
    expect(tonal).toBeLessThan(entre);
    expect(entre).toBeLessThan(bruite);
    // Une nature inconnue vaut « entre les deux », qui est le repli de la fiche.
    expect(await part("ni l'un ni l'autre")).toBe(entre);
  });

  it("cadence sa courbe sur la fenêtre choisie, et retombe sur la fenêtre ordinaire si elle est illisible", async () => {
    const courbe = async (finesse: string) =>
      (await lancer("masquage", [sinus(1000, 1, 0.02), bruit(1, 0.9)], { "Finesse": finesse }))
        .valeurs[1] as unknown as Courbe;
    // La cadence est la fréquence d'échantillonnage divisée par le saut, qui vaut le quart de la
    // fenêtre : une fenêtre deux fois plus longue donne deux fois moins de points.
    const ordinaire = await courbe("2048"), fine = await courbe("4096");
    expect(ordinaire.cadence).toBeCloseTo(SR / (2048 / 4), 6);
    expect(fine.cadence).toBeCloseTo(SR / (4096 / 4), 6);
    expect(fine.valeurs.length).toBeLessThan(ordinaire.valeurs.length);
    const illisible = await courbe("ni un nombre ni rien");
    expect(illisible.cadence).toBeCloseTo(ordinaire.cadence, 6);
    expect(illisible.valeurs.length).toBe(ordinaire.valeurs.length);
  });

  it("accorde sa courbe et son message : le pourcentage annoncé est la moyenne de la courbe", async () => {
    // LE CAS QUI RELIE LES DEUX SORTIES, et que rien d'autre ne relierait. La courbe porte une
    // proportion par trame, le message leur moyenne ; les deux peuvent diverger sans que rien ne
    // le dise, puisqu'on ne les regarde jamais ensemble.
    for (const masquant of [bruit(1, 0.9), bruit(0.5, 0.9), sinus(1100, 1, 0.9)]) {
      const r = await lancer("masquage", [sinus(1000, 1, 0.02), masquant]);
      const annonce = chiffresDuMessage(r.message).pourcent;
      expect(moyenne(r.valeurs[1] as unknown as Courbe) * 100).toBeCloseTo(annonce, 1);
    }
  });

  it("ne masque plus rien passé la fin du masquant", async () => {
    // Le masquant peut être plus court ; au-delà, la fiche lui substitue des bandes vides.
    const part = async (duree: number) => chiffresDuMessage(
      (await lancer("masquage", [sinus(1000, 1, 0.02), bruit(duree, 0.9)])).message,
    ).pourcent;
    const plein = await part(1), moitie = await part(0.5), bref = await part(0.1);
    // La proportion suit la part du son que le masquant couvre, à la trame de bord près : un
    // masquant de moitié masque environ la moitié, et non un tiers ni les neuf dixièmes.
    expect(moitie / plein).toBeGreaterThan(0.45);
    expect(moitie / plein).toBeLessThan(0.55);
    expect(bref).toBeLessThan(moitie / 3);
    expect(bref).toBeGreaterThan(0);
  });

  it("compte toutes les bandes enfouies, et non les six qu'il montre", async () => {
    // LE COMPTE ANNONCÉ N'EST PAS LA LONGUEUR DE LA LISTE. Les deux étaient confondus, et sous le
    // plafond ils coïncident encore — c'est ce qui rendait le défaut invisible —, de sorte qu'un
    // cas qui n'éprouverait qu'un ou deux degrés masqués ne prouverait rien. Il faut donc un son
    // qui enfouisse plus de six bandes, et un bruit large sous un bruit large les enfouit TOUTES.
    const compte = async (masque: AudioBuffer) => {
      const r = await lancer("masquage", [masque, bruit(1, 0.9)]);
      const lignes = String(r.valeurs[0]).split("\n");
      return {
        annonce: chiffresDuMessage(r.message).bandes,
        listees: lignes.filter((l) => /Hz/.test(l)).length,
        titre: lignes[1],
      };
    };
    const une = await compte(sinus(1000, 1, 0.02));
    expect(une.annonce).toBe(une.listees);
    expect(une.titre).not.toContain("sur");

    const toutes = await compte(bruit(1, 0.02, 999));
    expect(toutes.annonce).toBe(NB_BANDES);
    expect(toutes.listees).toBe(6);
    // Et le titre dit alors qu'il ne montre qu'une sélection, faute de quoi le message et la liste
    // se contrediraient à l'écran.
    expect(toutes.titre).toContain(`(6 sur ${NB_BANDES})`);
  });

  it("nomme en hertz la bande qu'il déclare enfouie", async () => {
    // La fréquence imprimée vient d'une recherche dichotomique sur l'échelle des barks : elle doit
    // tomber sur la bande du son masqué, et non sur une autre.
    const lignes = (await texteDe("masquage", [sinus(1000, 1, 0.02), bruit(1, 0.9)])).split("\n");
    const ligne = lignes.find((l) => /Hz/.test(l));
    expect(ligne).toBeTruthy();
    const hz = Number(ligne!.trim().split(/\s+/)[0]);
    expect(hz).toBeGreaterThan(900);
    expect(hz).toBeLessThan(1100);
    expect(ligne).toMatch(/dB sous le seuil/);
  });

  it("rend son analyse dans la langue de l'interface", async () => {
    const entrees = [sinus(1000, 1, 0.02), bruit(1, 0.9)];
    const fr = await avecLangue("fr", () => lancer("masquage", entrees));
    expect(String(fr.valeurs[0])).toContain("Énergie masquée");
    expect(String(fr.valeurs[0])).toContain("Bandes les plus enfouies");
    expect(String(fr.message)).toContain("bandes enfouies");
    const en = await avecLangue("en", () => lancer("masquage", entrees));
    expect(String(en.valeurs[0])).toContain("Masked energy");
    expect(String(en.valeurs[0])).toContain("Most buried bands");
    expect(String(en.message)).toContain("buried bands");
    // La mention de sélection se traduit aussi : « 6 of 24 » et non « 6 sur 24 ».
    const large = await avecLangue("en", () => lancer("masquage", [bruit(1, 0.02, 999), bruit(1, 0.9)]));
    expect(String(large.valeurs[0])).toContain(`(6 of ${NB_BANDES})`);
    const rien = await avecLangue("en", () => lancer("masquage", [sinus(1000, 1, 0.9), bruit(1, 0.02)]));
    expect(String(rien.valeurs[0])).toContain("Nothing is masked");
  });
});

describe("résultante de Schillinger", () => {
  it("rend l'analyse, le MIDI puis l'audio, dans cet ordre", () => {
    // LES RANGS SONT CE SUR QUOI POINTENT LES GRAPHES ENREGISTRÉS, et le fichier le dit : l'audio a
    // été ajouté à la fin et non à sa place « logique », pour ne pas rebrancher l'analyse ailleurs.
    expect(fiche("resultante-schillinger").sorties.map((s) => s.type)).toEqual(["texte", "midi", "audio"]);
    expect(fiche("resultante-schillinger").entrees).toEqual([]);
  });

  it("écrit la résultante en texte, avec ses frappes, ses écarts et son palindrome", async () => {
    const lignes = (await texteDe("resultante-schillinger", [])).split("\n");
    expect(lignes[0]).toContain("3 contre 2");
    expect(lignes[0]).toContain("cycle 6");
    expect(lignes[1]).toBe("Frappes : 0, 2, 3, 4");
    expect(lignes[2]).toBe("Écarts : 2-1-1-2");
    expect(lignes[3]).toContain("Palindromique");
  });

  it("porte le même motif dans le MIDI, sur le canal de batterie", async () => {
    const r = await lancer("resultante-schillinger", []);
    const { ticksParBattement, frappes: f } = await frappes(r.valeurs[1] as File);
    expect(ticksParBattement).toBe(TICKS);
    // Les instants du texte, en battements, deviennent les ticks du fichier.
    expect(f.map((x) => x.tick / ticksParBattement)).toEqual([0, 2, 3, 4]);
    expect(f.every((x) => x.canal === CANAL_PERCUSSION)).toBe(true);
    expect(f.every((x) => x.velocite === 100)).toBe(true);
    const quatreTrois = await lancer("resultante-schillinger", [], { "Pulsation A": 4, "Pulsation B": 3 });
    const g = await frappes(quatreTrois.valeurs[1] as File);
    expect(g.frappes.map((x) => x.tick / g.ticksParBattement)).toEqual([0, 3, 4, 6, 8, 9]);
  });

  it("écrit la percussion choisie, et retombe sur la caisse claire si on en demande une inconnue", async () => {
    const note = async (choix: string) => {
      const r = await lancer("resultante-schillinger", [], { "Percussion": choix });
      return (await frappes(r.valeurs[1] as File)).frappes[0].note;
    };
    // Chacun des huit choix écrit sa propre note, puisque chacun a sa propre voix au rendu.
    for (const p of PERCUSSIONS_CHOIX) expect(await note(String(p.note)), p.fr).toBe(p.note);
    expect(await note("une percussion qui n'existe pas")).toBe(38);
  });

  it("change la vitesse du son sans toucher aux battements du MIDI", async () => {
    // Un tick MIDI est un battement : c'est l'en-tête du fichier qui porte le tempo, et les frappes
    // ne doivent donc pas bouger. Le son, lui, se raccourcit.
    const rendu = async (tempo: number) => {
      const r = await lancer("resultante-schillinger", [], { "Tempo": tempo });
      return { ticks: (await frappes(r.valeurs[1] as File)).frappes.map((x) => x.tick), duree: (r.valeurs[2] as AudioBuffer).duration };
    };
    const lent = await rendu(60), vif = await rendu(240);
    expect(vif.ticks).toEqual(lent.ticks);
    expect(vif.duree).toBeLessThan(lent.duree / 2);
  });

  it("règle le niveau du son sans toucher au MIDI, comme sa documentation l'annonce", async () => {
    const rendu = async (volume: number) => {
      const r = await lancer("resultante-schillinger", [], { "Volume": volume });
      const b = r.valeurs[2] as AudioBuffer;
      let crete = 0;
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) crete = Math.max(crete, Math.abs(d[i]));
      return { crete, octets: new Uint8Array(await (r.valeurs[1] as File).arrayBuffer()) };
    };
    const muet = await rendu(0), moyen = await rendu(40), plein = await rendu(100);
    expect(muet.crete).toBe(0);
    expect(moyen.crete).toBeGreaterThan(0);
    expect(plein.crete).toBeGreaterThan(moyen.crete);
    // Le fichier, lui, est le même octet pour octet.
    expect([...moyen.octets]).toEqual([...plein.octets]);
    expect([...muet.octets]).toEqual([...plein.octets]);
  });

  it("signale deux pulsations qui partagent un facteur, plutôt que de laisser croire à un réglage sans effet", async () => {
    const partage = await texteDe("resultante-schillinger", [], { "Pulsation A": 4, "Pulsation B": 2 });
    expect(partage).toContain("partagent un facteur 2");
    expect(partage).toContain("2 fois dans le cycle");
    expect(partage).toContain("2 contre 1");
    const premieres = await texteDe("resultante-schillinger", []);
    expect(premieres).not.toContain("partagent un facteur");
  });

  it("rend son analyse dans la langue de l'interface", async () => {
    const reglages = { "Pulsation A": 4, "Pulsation B": 2 };
    const en = await avecLangue("en", () => lancer("resultante-schillinger", [], reglages));
    const lignes = String(en.valeurs[0]).split("\n");
    expect(lignes[0]).toContain("4 against 2");
    expect(lignes[1]).toContain("Attacks");
    expect(lignes[2]).toContain("Durations");
    expect(lignes[3]).toContain("Palindromic");
    expect(lignes[4]).toContain("share a factor of 2");
    // LE MESSAGE EST TRADUIT APRÈS DEUX ATTENTES : c'est lui qui a fait écrire l'enveloppe de langue.
    expect(String(en.message)).toContain("cycle of 8 beats");
    const fr = await avecLangue("fr", () => lancer("resultante-schillinger", [], reglages));
    expect(String(fr.message)).toContain("cycle de 8 battements");
  });
});

describe("gammes du monde", () => {
  it("ne rend qu'un texte, et surtout pas de MIDI", () => {
    // UNE DÉCISION ÉCRITE DANS LE FICHIER : « le MIDI ne porte que des demi-tons ; un maqam Rast y
    // perdrait sa tierce neutre et redeviendrait une gamme occidentale ». Sans ce cas, la sortie
    // serait rajoutée un jour comme une omission.
    expect(fiche("gammes-monde").sorties.map((s) => s.type)).toEqual(["texte"]);
    expect(fiche("gammes-monde").entrees).toEqual([]);
  });

  it("dresse une ligne par degré, avec les cents de la table et les hertz de la tonique", async () => {
    const g = GAMMES[0];
    const r = await lancer("gammes-monde", [], { "Gamme": g.id, "Tonique": 220 });
    const tableau = String(r.valeurs[0]).split("\n").filter((l) => /^ {2}\s*\d+\s+\d+\s/.test(l));
    expect(tableau).toHaveLength(g.cents.length);
    for (let i = 0; i < g.cents.length; i++) {
      const colonnes = tableau[i].trim().split(/\s+/);
      expect(Number(colonnes[0]), `degré ${i}`).toBe(i);
      expect(Number(colonnes[1]), `cents du degré ${i}`).toBe(g.cents[i]);
      expect(Number(colonnes[2]), `hertz du degré ${i}`).toBeCloseTo(220 * 2 ** (g.cents[i] / 1200), 1);
    }
    // Le message compte les DEGRÉS, c'est-à-dire les lignes du tableau moins l'octave qui le ferme.
    expect(Number(String(r.message).match(/^(\d+)/)?.[1])).toBe(tableau.length - 1);
  });

  it("transpose toutes les fréquences avec la tonique, sans toucher aux cents", async () => {
    const hertz = async (tonique: number) =>
      (await texteDe("gammes-monde", [], { "Gamme": "slendro", "Tonique": tonique }))
        .split("\n").filter((l) => /^ {2}\s*\d+\s+\d+\s/.test(l))
        .map((l) => Number(l.trim().split(/\s+/)[2]));
    const bas = await hertz(110), haut = await hertz(220);
    expect(bas).toHaveLength(haut.length);
    for (let i = 0; i < bas.length; i++) expect(haut[i] / bas[i], `degré ${i}`).toBeCloseTo(2, 2);
  });

  it("accorde son tableau et son décompte : autant de degrés marqués que d'injouables annoncés", async () => {
    // LA TOLÉRANCE DOIT COMMANDER LES DEUX. Le tableau marque un degré d'après elle, le message en
    // compte d'après elle : à la seule tolérance par défaut, un repère figé dans l'un des deux
    // resterait d'accord avec l'autre par hasard, et c'est ce qui est arrivé au premier jet.
    for (const tolerance of [20, 50]) {
      for (const id of ["rast", "hijaz", "slendro", "shruti22"]) {
        const r = await lancer("gammes-monde", [], { "Gamme": id, "Tolérance": tolerance });
        const marques = String(r.valeurs[0]).split("\n").filter((l) => l.includes("¤")).length;
        const annonce = Number(String(r.message).match(/·\s*(\d+)/)?.[1]);
        expect(marques, `${id} à ${tolerance} cents`).toBe(annonce);
        if (marques === 0) expect(String(r.valeurs[0]), id).toContain("tombent sur une touche");
        else expect(String(r.valeurs[0]), id).toContain("Degrés qu'aucun clavier ne peut jouer");
      }
    }
  });

  it("laisse la tolérance décider de ce qu'il appelle injouable", async () => {
    const injouables = async (tolerance: number) =>
      Number(String((await lancer("gammes-monde", [], { "Gamme": "rast", "Tolérance": tolerance })).message)
        .match(/·\s*(\d+)/)?.[1]);
    // Les tierces neutres du Rast tombent à cinquante cents d'une touche : au-delà, plus rien n'est
    // déclaré injouable.
    expect(await injouables(20)).toBe(2);
    expect(await injouables(50)).toBe(0);
  });

  it("retombe sur la première gamme quand on en demande une inconnue", async () => {
    const inconnue = await texteDe("gammes-monde", [], { "Gamme": "maqam qui n'existe pas" });
    expect(inconnue).toBe(await texteDe("gammes-monde", [], { "Gamme": GAMMES[0].id }));
  });

  it("rend sa note et ses en-têtes dans la langue de l'interface", async () => {
    const fr = await avecLangue("fr", () => lancer("gammes-monde", [], { "Gamme": "slendro" }));
    expect(String(fr.valeurs[0]).split("\n")[0]).toContain(GAMMES.find((g) => g.id === "slendro")!.note);
    expect(String(fr.valeurs[0])).toContain("clavier");
    expect(String(fr.message)).toContain("injouables au clavier");
    const en = await avecLangue("en", () => lancer("gammes-monde", [], { "Gamme": "slendro" }));
    expect(String(en.valeurs[0]).split("\n")[0]).toContain(GAMMES.find((g) => g.id === "slendro")!.noteEn);
    expect(String(en.valeurs[0])).toContain("keyboard");
    expect(String(en.message)).toContain("unplayable on a keyboard");
  });
});

describe("déclarations", () => {
  const trois = ["masquage", "resultante-schillinger", "gammes-monde"];

  it("nomment chacun de leurs réglages dans leur exécuteur", () => {
    for (const id of trois) {
      const source = fiche(id).executer.toString();
      for (const p of fiche(id).parametres) {
        expect(source.includes(`"${p.nom}"`), `${id} · ${p.nom}`).toBe(true);
      }
    }
  });

  it("sont traduites, libellés, options et notices compris", () => {
    for (const id of trois) {
      const f = fiche(id);
      expect(f.nomEn, id).toBeTruthy();
      expect(f.resumeEn, id).toBeTruthy();
      expect(f.noticeEn, id).toBeTruthy();
      for (const p of f.parametres) {
        expect(p.nomEn, `${id} · ${p.nom}`).toBeTruthy();
        expect(p.doc, `${id} · ${p.nom}`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom}`).toBeTruthy();
        if (p.type !== "choix") continue;
        expect(p.optionsEn?.length, `${id} · ${p.nom}`).toBe(p.options?.length);
        expect(p.optionIds?.length, `${id} · ${p.nom}`).toBe(p.options?.length);
        expect(p.defautEn, `${id} · ${p.nom}`).toBeTruthy();
      }
      for (const port of [...f.entrees, ...f.sorties]) {
        expect((port as { nomEn?: string }).nomEn, `${id} · ${port.nom}`).toBeTruthy();
      }
    }
  });

  it("tirent leurs options des tables, et non de listes recopiées", () => {
    const options = (id: string, nom: string) => fiche(id).parametres.find((p) => p.nom === nom);
    expect(options("gammes-monde", "Gamme")?.optionIds).toEqual(GAMMES.map((g) => g.id));
    expect(options("gammes-monde", "Gamme")?.options).toEqual(GAMMES.map((g) => g.nom));
    const percu = options("resultante-schillinger", "Percussion");
    expect(percu?.optionIds).toEqual(PERCUSSIONS_CHOIX.map((p) => String(p.note)));
    expect(percu?.options).toEqual(PERCUSSIONS_CHOIX.map((p) => p.fr));
  });
});

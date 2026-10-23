// plugins/metronome.test.ts — Ce que le métronome fait entendre, mesuré sur le son qu'il rend.
//
// LA MESURE PORTE SUR LE SON ET NON SUR L'ARITHMÉTIQUE. Le groupement des temps et la durée d'une
// unité sont éprouvés à part, dans `audio/signatures.test.ts` ; ce qui se garde ici est le câblage,
// c'est-à-dire que le composant sonne bien ce que la table décrit. Les clics sont retrouvés dans le
// tampon, et c'est leur niveau relatif qui dit le rang de chacun.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";

function ctxParams(params: Record<string, string | number>) {
  return {
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
    paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
}

async function sonner(params: Record<string, string | number>) {
  const fiche = registre.trouverDef("metronome")!;
  const res = await fiche.executer(ctxParams({ Timbre: "beep", Volume: 80, ...params }) as any);
  return { buffer: res.valeurs[0] as AudioBuffer, message: String(res.message ?? "") };
}

/**
 * Les clics du tampon : leur instant en secondes et leur crête.
 *
 * UN CLIC EST UNE MONTÉE DEPUIS LE SILENCE, et c'est ainsi qu'il est trouvé plutôt qu'aux instants
 * où on l'attend : chercher à l'endroit prévu ne prouverait pas qu'il y est. Le seuil est bas
 * devant le plus faible des trois rangs, et la fenêtre de garde dépasse la durée d'un bip.
 */
function clicsDu(buffer: AudioBuffer): { instant: number; crete: number }[] {
  const canal = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const garde = Math.floor(0.03 * sr);
  const trouves: { instant: number; crete: number }[] = [];
  let i = 0;
  while (i < canal.length) {
    if (Math.abs(canal[i]) <= 0.02) { i++; continue; }
    let crete = 0;
    for (let j = i; j < Math.min(canal.length, i + garde); j++) {
      crete = Math.max(crete, Math.abs(canal[j]));
    }
    trouves.push({ instant: i / sr, crete });
    i += garde;
  }
  return trouves;
}

/**
 * Le rang de chaque clic, lu sur sa crête rapportée à la plus forte.
 *
 * Les trois rangs valent 0,9, 0,5 et 0,28 du volume, soit 1, 0,56 et 0,31 de la plus forte crête ;
 * les seuils sont pris à mi-chemin entre ces rapports.
 */
function rangs(clics: { crete: number }[]): number[] {
  const fort = Math.max(...clics.map((c) => c.crete));
  return clics.map((c) => (c.crete > 0.78 * fort ? 0 : c.crete > 0.43 * fort ? 1 : 2));
}

describe("ce que le métronome fait entendre", () => {
  it("NEUF CROCHES S'ENTENDENT EN TROIS TEMPS", async () => {
    // Le cas qui manquait : 9/8 n'était pas offert, et le code n'aurait su en faire que neuf clics
    // plats, où personne n'entend la mesure.
    const { buffer, message } = await sonner({ Tempo: 120, Signature: "9/8", Durée: 3 });
    const clics = clicsDu(buffer);
    expect(clics.length).toBe(12);
    expect(rangs(clics)).toEqual([0, 2, 2, 1, 2, 2, 1, 2, 2, 0, 2, 2]);
    expect(message).toContain("9/8");
    expect(message, "la mesure entière et ses trois temps").toMatch(/1 mesure\(s\).*3 temps/);
  });

  it("douze croches s'entendent en quatre temps, six en deux", async () => {
    const douze = await sonner({ Tempo: 120, Signature: "12/8", Durée: 3 });
    expect(rangs(clicsDu(douze.buffer)).slice(0, 12)).toEqual([0, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2, 2]);

    // SIX CROCHES CHANGENT DE SON, et c'est voulu : la valeur était offerte et ne faisait entendre
    // qu'un accent pour six clics, là où 6/8 se bat en deux.
    const six = await sonner({ Tempo: 120, Signature: "6/8", Durée: 3 });
    expect(rangs(clicsDu(six.buffer)).slice(0, 6)).toEqual([0, 2, 2, 1, 2, 2]);
  });

  it("une mesure simple n'a pas de troisième rang", async () => {
    const { buffer } = await sonner({ Tempo: 120, Signature: "4/4", Durée: 3 });
    // Six clics : trois secondes à une noire par demi-seconde.
    const lus = rangs(clicsDu(buffer));
    expect(lus).toEqual([0, 1, 1, 1, 0, 1]);
    expect(lus.includes(2), "aucun clic faible en 4/4").toBe(false);
  });

  it("LE RAPPORT DES DEUX PREMIERS RANGS N'A PAS BOUGÉ", async () => {
    // Non-régression du son déjà livré : la crête du temps fort valait 0,9 du volume et celle des
    // autres temps 0,5, soit un rapport de 1,8. Le troisième rang s'ajoute sans toucher aux deux
    // premiers.
    const { buffer } = await sonner({ Tempo: 120, Signature: "4/4", Durée: 2, Volume: 80 });
    const clics = clicsDu(buffer);
    expect(clics[0].crete / clics[1].crete).toBeCloseTo(1.8, 1);
    expect(clics[0].crete).toBeCloseTo(0.8 * 0.9, 1);
  });

  it("LA DURÉE D'UNE UNITÉ SUIT LE DÉNOMINATEUR, blanche comprise", async () => {
    // Le défaut que la formule générale remplace : écrit `den === 8 ? moitié : entier`, une blanche
    // durait une noire et une double croche aussi. La preuve est prise sur les instants des clics.
    const noire = clicsDu((await sonner({ Tempo: 120, Signature: "4/4", Durée: 3 })).buffer);
    const croche = clicsDu((await sonner({ Tempo: 120, Signature: "6/8", Durée: 3 })).buffer);
    const blanche = clicsDu((await sonner({ Tempo: 120, Signature: "3/2", Durée: 5 })).buffer);
    const double = clicsDu((await sonner({ Tempo: 120, Signature: "12/16", Durée: 3 })).buffer);

    expect(noire[1].instant - noire[0].instant).toBeCloseTo(0.5, 2);
    expect(croche[1].instant - croche[0].instant).toBeCloseTo(0.25, 2);
    expect(blanche[1].instant - blanche[0].instant).toBeCloseTo(1, 2);
    expect(double[1].instant - double[0].instant).toBeCloseTo(0.125, 2);
  });

  it("LA MESURE GARDE SA PHASE JUSQU'AU BOUT DU SON", async () => {
    // Le rang se prend sur le compte d'UNITÉS, et le composant connaît aussi celui des TEMPS :
    // sept unités pour trois temps en 7/8. Prendre l'un pour l'autre resterait dans les bornes du
    // tableau et replacerait le temps fort toutes les trois unités au lieu de sept, ce qui ne se
    // verrait pas sur une seule mesure. Dix secondes en portent onze.
    //
    // LA DURÉE EST CHOISIE AU PLUS COURT QUI PROUVE, et c'est une leçon de la passe complète : le
    // même cas écrit sur trente secondes de son passait seul en vingt secondes et dépassait les
    // soixante du délai sous la charge de cinq cent quatre-vingts travailleurs.
    const { buffer } = await sonner({ Tempo: 240, Signature: "7/8", Durée: 10 });
    const clics = clicsDu(buffer);
    expect(clics.length).toBe(80);
    const forts = rangs(clics).flatMap((r, i) => (r === 0 ? [i] : []));
    expect(forts.length).toBe(Math.ceil(80 / 7));
    expect(forts, "un temps fort toutes les sept croches, sans glisser")
      .toEqual(forts.map((_, k) => k * 7));

    // Et les instants restent ceux de la grille, du premier au dernier clic.
    expect(clics[0].instant).toBeCloseTo(0, 3);
    expect(clics[79].instant).toBeCloseTo(79 * 0.125, 3);
  });

  it("une signature illisible retombe sur quatre temps sans jeter", async () => {
    // Un graphe sauvegardé peut porter une valeur qui n'est plus offerte.
    const { buffer, message } = await sonner({ Tempo: 120, Signature: "n'importe quoi", Durée: 2 });
    expect(rangs(clicsDu(buffer)).slice(0, 4)).toEqual([0, 1, 1, 1]);
    expect(message).toContain("BPM");
  });

  it("le message compte les mesures, les temps et les clics", async () => {
    const { message } = await sonner({ Tempo: 120, Signature: "7/8", Durée: 3 });
    // Sept croches à 0,25 s font 1,75 s par mesure : une mesure entière dans trois secondes, douze
    // clics en tout, et trois temps par mesure puisque 7/8 vaut 3+2+2.
    expect(message).toMatch(/1 mesure\(s\)/);
    expect(message).toMatch(/3 temps/);
    expect(message).toMatch(/12 clics/);
  });
});

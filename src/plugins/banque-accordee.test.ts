// plugins/banque-accordee.test.ts — Les DEUX chemins de construction déclarent une banque accordée.
//
// POURQUOI CE GARDE EXISTE, ET C'EST LA SECONDE FOIS. « Étaler sur le clavier » bâtit sa banque de
// deux façons : `audio/clavier-banque.ts` la construit dans le fil, et le composant l'ASSEMBLE
// LUI-MÊME après un passage par les ouvriers, sans appeler cette fonction. Le lot qui a donné au
// réseau isomorphe le droit de jouer un son a posé la déclaration « cette banque est accordée » sur
// le premier chemin seulement : les cas passaient au vert, et dans l'application le clavier
// adressait la banque par la hauteur et doublait l'écart. Quarante-cinq cents trop bas sur une
// case, quatre-vingt-seize trop haut sur deux autres, tous les nœuds annonçant « Terminé ».
//
// LE DÉPÔT AVAIT DÉJÀ PAYÉ EXACTEMENT CELA sur ce même composant, quand le découpage en touches
// n'avait été posé que sur un chemin. La leçon y était écrite ; le garde, non.
//
// CE CAS EXERCE LA FICHE, donc le chemin que le composant emprunte vraiment, et le compare à celui
// de la fonction. Un troisième chemin qui naîtrait sans la déclaration tomberait ici.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { accordageEgal } from "../audio/accordage";
import { construireBanque, type Banque } from "../audio/clavier-banque";

const RACINE = 60;
const DIX_NEUF = accordageEgal(19, 1200, RACINE);

/** Un son d'essai : court, mais non vide, pour que le suiveur de hauteur ait de quoi refuser. */
function sonDEssai(): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 1, length: 4096, sampleRate: 44100 });
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin((2 * Math.PI * 261.63 * i) / 44100);
  return b;
}

/** Le contexte d'exécution de la fiche, avec son audio et son accordage. */
function ctx(params: Record<string, string | number>, accordage: unknown) {
  const entrees = [sonDEssai(), accordage];
  return {
    entree: (rang: number) => entrees[rang] ?? null,
    entrees: () => entrees,
    paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
    paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
    onProgress: () => {},
    noeud: { id: "n1", data: {} },
    runtime: null,
  } as never;
}

const REGLAGES = {
  "Note d'origine": "manuel", "Note manuelle": RACINE, "Largeur de zone": 2,
  "Note basse": 55, "Note haute": 67, "Transposition": "bande",
};

describe("une banque accordée le déclare, par quelque chemin qu'elle soit bâtie", () => {
  it("LE CHEMIN DU COMPOSANT, celui qui passe par les ouvriers, la déclare", async () => {
    const f = registre.trouverDef("banque-clavier")!;
    const res = await f.executer(ctx({ ...REGLAGES, "Compter en": "degres" }, DIX_NEUF)) as never as
      { valeurs: unknown[]; erreur?: boolean; message?: string };
    expect(res.erreur, res.message).toBeFalsy();
    const b = res.valeurs[0] as Banque;
    expect(b.accordee, "c'est cette déclaration qui dit au clavier comment l'adresser")
      .toEqual({ tonique: RACINE, degres: 19 });
  });

  it("LE CHEMIN DE LA FONCTION la déclare pareil, et c'est la comparaison qui compte", () => {
    const b = construireBanque(sonDEssai(), {
      racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 55, noteHaute: 67,
      accordage: DIX_NEUF, toniqueTouche: RACINE,
    });
    expect(b.accordee).toEqual({ tonique: RACINE, degres: 19 });
  });

  it("et en demi-tons, NI L'UN NI L'AUTRE ne déclare rien", async () => {
    // Une banque qui ne sait rien d'une échelle s'adresse par la hauteur : l'absence du champ est
    // ce qui le dit, et la déclarer à tort ferait adresser par la touche une banque qui ne l'attend
    // pas.
    const f = registre.trouverDef("banque-clavier")!;
    const res = await f.executer(ctx({ ...REGLAGES, "Compter en": "demi-tons" }, null)) as never as
      { valeurs: unknown[] };
    expect((res.valeurs[0] as Banque).accordee).toBeUndefined();

    const b = construireBanque(sonDEssai(), {
      racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 55, noteHaute: 67,
    });
    expect(b.accordee).toBeUndefined();
  });
});

// plugins/retard-granulaire.test.ts — Ce que la fiche décide avant que le calcul commence.
//
// CE FICHIER EXISTE POUR UN DÉFAUT QUE L'APPLICATION A TROUVÉ ET QUE LES CAS DU MODULE NE
// POUVAIENT PAS VOIR. La queue ajoutée après le son se calcule ici, dans la fiche, à partir du
// nombre de tours que la réinjection laisse audibles. À réinjection nulle ce nombre vaut un, de
// sorte qu'un gel demandé avec deux secondes de queue n'en recevait que le temps d'un retard : le
// rendu gelé était alors indiscernable du rendu libre, les deux sortant à 0,55 s et à 10,4 LUFS.
// Le module était juste, la fiche ne lui donnait pas de quoi se faire entendre.
//
// ET LES LONGUEURS SE LISENT SUR LA BORNE QUAND UNE COURBE EST BRANCHÉE, non sur le réglage, qui
// ne sert alors à rien : une courbe de temps balayant jusqu'à une seconde demande une ligne d'une
// seconde, que le réglage à 0,25 s ne dimensionnerait pas.
import { describe, expect, it } from "vitest";
import { fiches } from "./retard-granulaire";
import { constante } from "../audio/courbe";

const SR = 16000;
const fiche: any = fiches.find((f) => f.id === "retard-granulaire")!;

function source(dureeSec: number): AudioBuffer {
  const n = Math.round(dureeSec * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / SR);
  return b;
}

/**
 * Le contexte d'un run, les défauts pris SUR LA FICHE et les choix canonisés comme l'inspecteur.
 *
 * LES DEUX PRÉCAUTIONS SONT CELLES DU BANC. Un défaut redonné à l'appel laisserait passer une
 * déclaration qui dit autre chose ; et un réglage « choix » porte une ÉTIQUETTE à l'écran et un
 * IDENTIFIANT dans le calcul, de sorte qu'un contexte qui rendrait l'étiquette brute ferait lire
 * « Oui » là où la fiche compare à « oui ».
 */
function ctxDe(
  entree: AudioBuffer | null,
  params: Record<string, number | string> = {},
  courbes: Record<number, unknown> = {},
) {
  const declare = (nom: string) => (fiche.parametres ?? []).find((p: any) => p.nom === nom);
  return {
    noeud: { id: "essai", data: { ficheId: fiche.id, parametres: params } },
    entree: (i: number) => (i === 0 ? entree : (courbes[i] ?? null)),
    paramNombre: (nom: string, defaut: number) => {
      if (typeof params[nom] === "number") return params[nom] as number;
      const p = declare(nom);
      return typeof p?.defaut === "number" ? p.defaut : defaut;
    },
    paramTexte: (nom: string, defaut: string) => {
      if (typeof params[nom] === "string") return params[nom] as string;
      const p = declare(nom);
      if (!p?.optionIds) return typeof p?.defaut === "string" ? p.defaut : defaut;
      const rang = (p.options ?? []).indexOf(p.defaut);
      return rang >= 0 ? p.optionIds[rang] : defaut;
    },
    onProgress: () => {},
  };
}

const longueur = async (
  params: Record<string, number | string> = {}, courbes: Record<number, unknown> = {},
) => {
  const r = await fiche.executer(ctxDe(source(0.3), params, courbes));
  return (r.valeurs[0] as AudioBuffer).length / SR;
};

const REGLAGES = { "Temps": 0.2, "Dispersion": 0, "Taille de grain": 80, "Queue max": 2 };

describe("la fiche du retard granulaire", () => {
  it("est enregistrée avec ses cinq ports de courbe, chacun rattaché à son réglage", () => {
    expect(fiche.entrees.map((p: any) => p.module)).toEqual(
      [undefined, "Temps", "Dispersion", "Transposition", "Réinjection", "Mélange"]);
    for (const nom of ["Temps", "Dispersion", "Transposition", "Réinjection", "Mélange"]) {
      expect((fiche.parametres ?? []).filter((p: any) => p.modulationDe === nom).length,
        `« ${nom} » doit porter ses deux bornes`).toBe(2);
    }
  });

  it("SANS RÉINJECTION, LA QUEUE VAUT UN RETARD : il n'y a qu'un tour à entendre", async () => {
    expect(await longueur({ ...REGLAGES, "Réinjection": 0 })).toBeCloseTo(0.3 + 0.2, 3);
  });

  it("ET ELLE SUIT LES TOURS QUE LA RÉINJECTION LAISSE AUDIBLES", async () => {
    // Dix-neuf tours à soixante pour cent, soit 3,8 s, que « Queue max » ramène à deux.
    expect(await longueur({ ...REGLAGES, "Réinjection": 60 })).toBeCloseTo(0.3 + 2, 3);
    // Un seul tour de plus à faible réinjection : la queue reste courte.
    expect(await longueur({ ...REGLAGES, "Réinjection": 5 })).toBeCloseTo(0.3 + 0.2 * 4, 3);
  });

  it("AU GEL, LA QUEUE VAUT TOUT CE QUE « QUEUE MAX » AUTORISE, les tours ne s'y comptant pas", async () => {
    // C'est le défaut trouvé dans l'application : sans cette règle, le gel recevait un retard.
    expect(await longueur({ ...REGLAGES, "Réinjection": 0, "Gel": "oui" })).toBeCloseTo(0.3 + 2, 3);
    expect(await longueur({ ...REGLAGES, "Réinjection": 0, "Gel": "non" })).toBeCloseTo(0.3 + 0.2, 3);
  });

  it("LA LIGNE ET LA QUEUE SE LISENT SUR LA BORNE QUAND UNE COURBE EST BRANCHÉE", async () => {
    const courbe = { 1: constante(0.5, 0.3) };
    // Le réglage est à 0,2 s et la borne haute à 1 s : c'est la borne qui dimensionne.
    expect(await longueur({ ...REGLAGES, "Réinjection": 0, "Temps max": 1 }, courbe))
      .toBeCloseTo(0.3 + 1, 3);
    // Sans courbe, la même borne ne change rien.
    expect(await longueur({ ...REGLAGES, "Réinjection": 0, "Temps max": 1 }))
      .toBeCloseTo(0.3 + 0.2, 3);
  });

  it("SANS ENTRÉE AUDIO, ELLE REND NULL et ne lève pas", async () => {
    const r = await fiche.executer(ctxDe(null));
    expect(r.valeurs).toEqual([null]);
    expect(typeof r.message).toBe("string");
  });
});

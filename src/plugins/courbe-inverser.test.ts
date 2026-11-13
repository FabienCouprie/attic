// plugins/courbe-inverser.test.ts — La case « Inverser » du composant Courbe, forme par forme.
//
// DEMANDÉE PAR FABIEN LE 2026-11-13 : la courbe retournée selon les VALEURS, chaque v devenant 1 − v.
// C'est son choix, sur le relevé des deux retournements possibles ; celui selon le temps aurait
// laissé la gaussienne centrée, le sinus et le triangle presque tels quels.
//
// CE QUE CE FICHIER TIENT, en passant par l'exécuteur de la fiche et non par le seul module : un
// réglage déclaré et mal lu au run passerait autrement au vert.
//   - Chaque forme de la liste, LUE SUR LA FICHE et non recopiée ici, est retournée valeur par
//     valeur, sous ses réglages par défaut comme sous des réglages déplacés.
//   - L'axe et les bornes : 0,5 reste 0,5, 0 devient 1 et 1 devient 0. Le cas COMPTE les points de
//     chaque sorte qu'il a vus, sans quoi il passerait au vert sans les avoir éprouvés.
//   - Décochée ou absente, la case rend la courbe d'avant au bit près : c'est ce qui garde les
//     graphes enregistrés avant elle.
//   - Cochée, elle survit à la sauvegarde et à la réouverture : elle vit dans `parametres`, que
//     `core/saisies.ts` conserve pour tout nœud, et le cas le fait passer par les deux bouts.
import { afterEach, describe, expect, it } from "vitest";
import { fiches } from "./courbe";
import { ctxDEssai } from "../core/contexte-essai";
import { configurerRegistreMeta, creerRegistre } from "../core";
import { configurerServicesDomaine, oublierServicesDomaine } from "../core/services-domaine";
import { engendrer, type Courbe, type FormeCourbe } from "../audio/courbe";
import { estCochee } from "../ui/SaisieCase";
import { projetAEcrire } from "../ui/projet-a-ecrire";
import { noeudsRelus } from "../ui/en-cours-a-relire";
import { configurerRegistreUI } from "../ui/registre-actif";

const fiche = fiches.find((f) => f.id === "generateur-courbe")!;
const reglage = (nom: string) => fiche.parametres!.find((p) => p.nom === nom);
const formes = (reglage("Forme")!.optionIds ?? []) as FormeCourbe[];

async function lancer(reglages: Record<string, number | string>): Promise<Courbe> {
  const r = await fiche.executer!(ctxDEssai([], reglages, { ficheId: "generateur-courbe" }) as never);
  return (r as { valeurs: unknown[] }).valeurs[0] as Courbe;
}

/** Tous les réglages qu'une forme consomme, écartés de leur défaut, pour que l'axe ne soit pas un cas d'école. */
const DEPLACES: Record<string, number> = {
  "Durée": 3, "Fréquence": 0.35, "Centre": 25, "Largeur": 30, "Pente": 4, "Chaos": 3.5, "Graine": 7,
  "Moyenne": 9.5, "Ordre": 5, "Degrés de liberté": 8, "Exposant": 3.6,
};
const JEUX = [{ nom: "défauts", reglages: {} }, { nom: "réglages déplacés", reglages: DEPLACES }];

describe("la case « Inverser » du composant Courbe", () => {
  it("est une case, décochée par défaut, et la liste des formes qu'elle couvre n'est pas vide", () => {
    expect(reglage("Inverser")).toMatchObject({ type: "case", defaut: 0, nomEn: "Invert" });
    expect(formes.length, "la liste vient de la fiche : vide, le cas suivant n'éprouverait rien").toBeGreaterThanOrEqual(14);
  });

  it("RETOURNE CHAQUE FORME SELON LES VALEURS, y compris le point de l'axe et les deux bornes", async () => {
    const vus = { zero: 0, un: 0, demi: 0, points: 0 };
    const fautes: string[] = [];
    for (const forme of formes) {
      for (const jeu of JEUX) {
        const droite = await lancer({ ...jeu.reglages, Forme: forme });
        const retournee = await lancer({ ...jeu.reglages, Forme: forme, Inverser: 1 });
        const cas = `${forme} (${jeu.nom})`;
        expect(retournee.valeurs.length, cas).toBe(droite.valeurs.length);
        expect(retournee.cadence, cas).toBe(droite.cadence);
        expect(droite.valeurs.length, cas).toBeGreaterThan(1);
        let bas = Infinity, haut = -Infinity, basR = Infinity, hautR = -Infinity;
        droite.valeurs.forEach((v, i) => {
          const r = retournee.valeurs[i];
          if (r !== Math.fround(1 - v)) fautes.push(`${cas} [${i}] : ${v} rend ${r}`);
          if (v === 0) { vus.zero++; if (r !== 1) fautes.push(`${cas} [${i}] : la borne 0 rend ${r}`); }
          if (v === 1) { vus.un++; if (r !== 0) fautes.push(`${cas} [${i}] : la borne 1 rend ${r}`); }
          if (v === 0.5) { vus.demi++; if (r !== 0.5) fautes.push(`${cas} [${i}] : l'axe rend ${r}`); }
          bas = Math.min(bas, v); haut = Math.max(haut, v);
          basR = Math.min(basR, r); hautR = Math.max(hautR, r);
          vus.points++;
        });
        // L'étendue se retourne avec la courbe : le plus haut devient le plus bas.
        expect(hautR, `${cas} : le haut de la courbe retournée`).toBe(Math.fround(1 - bas));
        expect(basR, `${cas} : le bas de la courbe retournée`).toBe(Math.fround(1 - haut));
      }
    }
    expect(fautes.slice(0, 10)).toEqual([]);
    // Le cas a vu ce qu'il prétend tenir : des bornes et des points sur l'axe, et pas une poignée.
    expect(vus.zero, "points à 0 éprouvés").toBeGreaterThan(0);
    expect(vus.un, "points à 1 éprouvés").toBeGreaterThan(0);
    expect(vus.demi, "points sur l'axe éprouvés").toBeGreaterThan(0);
    expect(vus.points).toBeGreaterThan(formes.length * 1000);
  });

  it("DÉCOCHÉE OU ABSENTE, la courbe sort au bit près comme avant l'option", async () => {
    for (const forme of formes) {
      const absente = await lancer({ Forme: forme });
      const decochee = await lancer({ Forme: forme, Inverser: 0 });
      // Le module appelé sans l'option, comme l'appelait l'exécuteur avant elle.
      const avant = engendrer({
        dureeSec: 10, forme, frequence: 0.5, r: 3.9, centre: 0.5, pente: 10, largeur: 0.15,
        moyenne: 4, ordre: 2, degres: 3, exposant: 1.5, graine: 1,
      });
      expect(Array.from(absente.valeurs), forme).toEqual(Array.from(avant.valeurs));
      expect(Array.from(decochee.valeurs), forme).toEqual(Array.from(avant.valeurs));
    }
  });

  describe("la sauvegarde", () => {
    afterEach(() => oublierServicesDomaine());

    it("COCHÉE, ELLE SURVIT À L'ÉCRITURE DU PROJET ET À SA RÉOUVERTURE, et la courbe relue est retournée", async () => {
      configurerRegistreMeta(creerRegistre<unknown, unknown>());
      configurerRegistreUI(creerRegistre<unknown, unknown>());
      configurerServicesDomaine({ reglagesDeProjet: () => ({}) } as never);
      const noeud = {
        id: "c", type: "atelier", position: { x: 0, y: 0 },
        data: { ficheId: "generateur-courbe", parametres: { Forme: "gamma", Inverser: 1 } },
      };
      const { json } = projetAEcrire({ nodes: [noeud], edges: [] }, () => undefined);
      const [relu] = noeudsRelus(JSON.parse(json).nodes);
      expect(relu.data.parametres).toEqual({ Forme: "gamma", Inverser: 1 });
      const droite = await lancer({ Forme: "gamma" });
      const retournee = await lancer(relu.data.parametres);
      expect(Array.from(retournee.valeurs)).toEqual(Array.from(droite.valeurs, (v) => Math.fround(1 - v)));
    });
  });

  it("l'écran et le run lisent la même valeur de la même façon", async () => {
    const valeurs: (number | string)[] = [0, 1, "0", "1", 2, -1, "pas un nombre"];
    for (const v of valeurs) {
      const r = await lancer({ Forme: "rampe", Inverser: v });
      const retournee = r.valeurs[0] === 1;
      expect(retournee, `« ${v} » au run`).toBe(estCochee(v, 0));
    }
  });
});

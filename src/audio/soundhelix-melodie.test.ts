// audio/soundhelix-melodie.test.ts — La mélodie tient sa plage, ses pas, ses notes d'accord et de
// gamme, et revient avec sa section.
//
// NIVEAU 2, PAR LA LOI, sur cinquante graines. L'harmonie d'essai a trois sortes de sections, dont
// une revient : la k-ième sorte reçoit le k-ième nombre de « Mélodies par section », et ses retours
// jouent ses mélodies à tour de rôle, de sorte que le retour k et le retour k + m rendent la même
// mélodie. Chaque note tombe dans la plage ; `+` tombe dans la gamme, `#` et un décalage écrit dans
// l'accord ; deux notes `+` qui se suivent sont à un pas de « Pas », en degrés de la gamme ; `*`
// répète la note d'avant ; aucune note ne part hors de l'activité.

import { describe, expect, it } from "vitest";
import { creerAleatoire } from "../core";
import { calculerHarmonie } from "./soundhelix-harmonie";
import { harmonieEnMidi } from "./soundhelix-harmonie-midi";
import { lireHarmonie } from "./soundhelix-midi";
import { lireMotif } from "./soundhelix-motifs";
import { joueAuTic } from "./soundhelix-activite";
import { notesDeGamme, rendreMelodie, sectionsDuMorceau } from "./soundhelix-melodie";

/** Quatre sections par tour, la première et la troisième de la même sorte, trois tours. */
const H = lireHarmonie(harmonieEnMidi(calculerHarmonie({
  motif: "Am/4,F/4,+C/4,G/4,+Am/4,F/4,+Dm/4,E/4", ticsParTemps: 4, tics: 3 * 32 * 4, registre: 3, rapprocher: false,
}), { tempo: 120, tempsParMesure: 4, ticsParTemps: 4 }));

const MOTIF = lireMotif("+/2,+/2,#/4,*/2,-/2,0/2,+/2", { jokers: "+#*", velociteMax: 1000, ticsParTemps: 4 });
const PAS = [-2, -1, 1, 2];
const classe = (p: number) => ((p % 12) + 12) % 12;

describe("la mélodie, par la loi", () => {
  it("revient avec sa section, autant de mélodies que la liste en donne à chaque sorte", () => {
    const sections = sectionsDuMorceau(H);
    const sortes = [...new Set(sections.map((s) => s.sorte))];
    expect(sortes.length).toBe(3);
    for (let graine = 1; graine <= 50; graine++) {
      const ligne = rendreMelodie({ harmonie: H, motif: MOTIF, segments: null, melodiesParSection: [1, 2, 3], min: -2, max: 12, pas: PAS,
        aleatoire: creerAleatoire(graine) });
      const parSection = sections.map((s) => ligne.filter((e) => e.tic >= s.debut && e.tic < s.fin).map((e) => `${e.tic - s.debut}:${e.hauteur}`).join(","));
      sortes.forEach((sorte, k) => {
        const m = [1, 2, 3][k];
        const retours = sections.flatMap((s, i) => (s.sorte === sorte ? [parSection[i]] : []));
        retours.forEach((r, j) => { if (j >= m) expect(r, `graine ${graine}, sorte ${k}, retour ${j}`).toBe(retours[j - m]); });
        // Et les m mélodies sont bien m : deux marches tirées au hasard ne coïncident pas.
        expect(new Set(retours).size, `graine ${graine}, sorte ${k}`).toBe(Math.min(m, retours.length));
      });
    }
  });

  it("tient la plage, la gamme, l'accord et les pas, sur cinquante graines", () => {
    const gamme = notesDeGamme(-2, 12);
    for (let graine = 1; graine <= 50; graine++) {
      const ligne = rendreMelodie({ harmonie: H, motif: MOTIF, segments: null, melodiesParSection: [2], min: -2, max: 12, pas: PAS,
        aleatoire: creerAleatoire(graine) });
      let precedente: { hauteur: number; joker: string | null } | null = null;
      let pos = 0;
      let debutSection = 0;
      for (const e of ligne) {
        if (H.sections.includes(e.tic)) { pos = 0; debutSection = e.tic; precedente = null; }
        const m = MOTIF[pos % MOTIF.length];
        pos++;
        if (e.hauteur === null) continue;
        expect(e.hauteur, `graine ${graine}, tic ${e.tic}`).toBeGreaterThanOrEqual(-2);
        expect(e.hauteur).toBeLessThanOrEqual(12);
        const accord = (H.accordAuTic(e.tic) ?? []).map(classe);
        if (precedente === null) expect(accord, `graine ${graine}, première note`).toContain(classe(e.hauteur));
        else if (m.joker === "*") expect(e.hauteur).toBe(precedente.hauteur);
        else if (m.joker === "+") {
          expect(gamme).toContain(e.hauteur);
          // Le pas se compte depuis une note de la gamme ; le sol dièse de mi majeur n'en est pas une.
          if (gamme.includes(precedente.hauteur)) {
            expect(PAS, `graine ${graine}, tic ${e.tic} (section ${debutSection})`).toContain(gamme.indexOf(e.hauteur) - gamme.indexOf(precedente.hauteur));
          }
        } else expect(accord, `graine ${graine}, tic ${e.tic}`).toContain(classe(e.hauteur));
        precedente = { hauteur: e.hauteur, joker: m.joker };
      }
    }
  });

  it("ne fait partir aucune note hors de l'activité", () => {
    const segments = [64, -64, 128, -64, 64];
    const ligne = rendreMelodie({ harmonie: H, motif: MOTIF, segments, melodiesParSection: [1], min: -2, max: 12, pas: PAS, aleatoire: creerAleatoire(9) });
    for (const e of ligne) if (e.hauteur !== null) expect(joueAuTic(segments, e.tic)).toBe(true);
    expect(ligne.some((e) => e.hauteur !== null)).toBe(true);
  });
});

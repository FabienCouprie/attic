// audio/couleurs-flux.test.ts — Deux types de flux ne doivent pas se ressembler.
//
// CE QUI A ÉTÉ REMONTÉ : les tuyaux et les points de sortie des nœuds SFZ — le flux « banque » —
// avaient la même couleur que ceux du MIDI. Les deux teintes différaient bien dans le code
// (#c99a2e contre #e9a13b), mais pas à l'œil : un ambre et un ambre. Rien ne l'interdisait, et rien
// ne l'aurait signalé à la prochaine couleur ajoutée.
//
// CE TEST MESURE au lieu de juger. Les couleurs sont converties en Lab — l'espace fait pour que les
// distances y correspondent à ce qu'un œil perçoit — et la distance ΔE de chaque paire doit rester
// au-dessus d'un seuil. Le seuil vient de la mesure : la palette la plus serrée après correction est
// à 22,3 ΔE (banque contre MIDI), et le couple fautif était à 11,9. Dix-huit laisse donc la place à
// une couleur de plus sans autoriser le retour du défaut.
import { describe, expect, it } from "vitest";
import { registre } from "./adaptateur";

/** Un composant sRGB, linéarisé. */
const lineaire = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** sRGB hexadécimal → CIE L*a*b* (illuminant D65). */
export function versLab(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, v, b] = [0, 2, 4].map((i) => lineaire(parseInt(h.slice(i, i + 2), 16) / 255));
  const X = r * 0.4124 + v * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + v * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + v * 0.1192 + b * 0.9505;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X / 0.95047), f(Y / 1), f(Z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Distance perceptuelle CIE76 entre deux couleurs. */
export function ecartCouleur(a: string, b: string): number {
  const la = versLab(a), lb = versLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/** En dessous, deux tuyaux se confondent d'un coup d'œil — mesuré sur le défaut constaté. */
const ECART_MINIMAL = 18;

/**
 * Tous les types déclarés, LUS AU REGISTRE et non recopiés.
 *
 * LA LISTE ÉCRITE À LA MAIN NE VOYAIT QUE HUIT TYPES SUR QUINZE. Elle portait « audio », « midi »,
 * « controle », « texte », « fichier », « image », « courbe » et « banque », c'est-à-dire la palette
 * du jour où ce garde a été écrit. Les sept suivants — l'objet, la vidéo, la séquence, le cercle, le
 * spectrogramme, le port exposé et l'accordage — sont arrivés sans y entrer, et le garde qui existait
 * pour empêcher deux teintes de se confondre ne les regardait pas. Lue au registre, la liste ne peut
 * plus vieillir.
 */
const TYPES = registre.tousTypesFlux().map((t) => t.id);

/**
 * Les paires dont la proximité est assumée, avec sa raison.
 *
 * `frontiere` et `fichier` sont à 6,7 ΔE, soit moins que le couple qui a fait écrire ce garde
 * (l'ambre de la banque contre celui du MIDI, à 11,9). Ce sont DEUX GRIS, et chacun l'est pour une
 * raison écrite : un nœud-frontière n'a pas de type à lui, donc sa teinte est neutre ; un fichier
 * n'a pas de nature sonore, donc la sienne aussi. Les rapprocher est le prix de ces deux choix.
 *
 * ET ILS NE SE RENCONTRENT PAS SUR UN MÊME NŒUD : un port exposé n'existe qu'à l'intérieur d'un
 * méta-composant, où il tient la place d'un port qui sera d'un autre type. La confusion que ce garde
 * empêche est celle de deux tuyaux voisins ; celle-là n'a pas de voisinage.
 */
const PROXIMITES_ASSUMEES: readonly (readonly [string, string])[] = [["frontiere", "fichier"]];

const assumee = (a: string, b: string): boolean =>
  PROXIMITES_ASSUMEES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

describe("les couleurs des types de flux", () => {
  it("la conversion en Lab est juste sur des repères connus", () => {
    // Le blanc : L* = 100, a* = b* = 0. Le noir : L* = 0. De quoi s'assurer que la mesure qui juge
    // les autres tests n'est pas elle-même fausse.
    const blanc = versLab("#ffffff");
    expect(blanc[0]).toBeCloseTo(100, 1);
    expect(blanc[1]).toBeCloseTo(0, 1);
    expect(blanc[2]).toBeCloseTo(0, 1);
    expect(versLab("#000000")[0]).toBeCloseTo(0, 1);
    expect(ecartCouleur("#ffffff", "#ffffff")).toBe(0);
  });

  it("chaque type déclaré a bien une couleur", () => {
    for (const id of TYPES) {
      expect(registre.typeFlux(id)?.couleur, `type ${id}`).toMatch(/^#[0-9a-f]{3,6}$/i);
    }
  });

  it("AUCUNE PAIRE ne se confond à l'œil", () => {
    const couleurs = TYPES.map((id) => [id, registre.couleurFlux(id)] as const);
    const trop: string[] = [];
    for (let i = 0; i < couleurs.length; i++) {
      for (let j = i + 1; j < couleurs.length; j++) {
        const ecart = ecartCouleur(couleurs[i][1], couleurs[j][1]);
        if (ecart < ECART_MINIMAL && !assumee(couleurs[i][0], couleurs[j][0])) {
          trop.push(`${couleurs[i][0]} (${couleurs[i][1]}) / ${couleurs[j][0]} (${couleurs[j][1]}) : ΔE ${ecart.toFixed(1)}`);
        }
      }
    }
    expect(trop, `paires trop proches :\n  ${trop.join("\n  ")}`).toEqual([]);
  });

  it("la banque est franchement séparée du MIDI, le défaut qui a été remonté", () => {
    const ecart = ecartCouleur(registre.couleurFlux("banque"), registre.couleurFlux("midi"));
    expect(ecart).toBeGreaterThan(20);
    // Et pas au prix d'une collision avec l'autre orange de la palette.
    expect(ecartCouleur(registre.couleurFlux("banque"), registre.couleurFlux("controle"))).toBeGreaterThan(20);
  });
});

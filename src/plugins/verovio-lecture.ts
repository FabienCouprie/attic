// plugins/verovio-lecture.ts — Ce que les graveurs par Verovio partagent : lire une notation et ses
// refus, graver chaque air et rendre la page voulue.
//
// SORTI DE `plugins/verovio.ts` le 2026-11-23, sans rien y changer, quand « Partition guitare » est
// venue prendre les mêmes entrées que « Partition gravée ». Deux nœuds qui lisent le même texte doivent
// le lire de la même manière : reconnaître le même format, refuser les mêmes fautes ABC avec les mêmes
// messages, graver les mêmes airs. Une seconde copie de cette lecture aurait divergé sans que rien ne
// le dise.
//
// Le moteur se charge par `verovio-outil.ts`, le chemin que « Lire une partition » prend aussi, et où
// sont écrites les deux précautions : un module neuf à chaque gravure, et le Humdrum dans le sien.

import { langueCourante, traduire } from "../i18n";
import { detecterFormat, pageDemandee, racineXml, type FormatNotation } from "../audio/verovio";
import { decouperMorceaux, lireMorceau } from "../audio/abc";
import { refusAbc } from "../audio/abc-fautes";
import { abcPourGravure, refusTournures } from "../audio/abc-gravure";
import { outilVerovio } from "./verovio-outil";

const en = () => langueCourante() === "en";

/** Un toolkit neuf, sur le module qui lit Humdrum quand `humdrum` est vrai. */
export const outil = (humdrum: boolean): Promise<any> => outilVerovio(humdrum);

/** Une notation lue : son format, ses airs, et le nom de chacun dans un message. */
export type Lecture = { format: FormatNotation; airs: string[]; nomAir: (i: number) => string };

/**
 * Le format, les airs, ou le refus nommé.
 *
 * CE QUE LE LECTEUR ABC D'ATTIC REFUSE, LE GRAVEUR LE REFUSE, avec les mêmes fautes nommées. Revue des
 * notations en texte, 2026-11-22 : Verovio gravait en vert une durée nulle, un accord jamais refermé ou
 * une liaison entre deux hauteurs, et tombait sur « divide by zero » pour un silence de durée nulle.
 * Chaque air du texte est lu, puisque chacun est gravé.
 *
 * CHAQUE AIR SE GRAVE SEUL, AVEC SON TITRE, quand le texte en porte plusieurs. Décision de Fabien du
 * 2026-11-22, « Engrave all, titled » : Verovio les gravait à la suite, et n'écrivait que le titre du
 * premier. Les airs sont ceux que découpe le lecteur ABC, qui écarte aussi ce qui précède le premier X:
 * et les clôtures de code d'un modèle de langue.
 */
export function lireNotation(texte: string, impose: string): Lecture | { refus: string } {
  const format: FormatNotation | null = impose === "auto" ? detecterFormat(texte) : (impose as FormatNotation);
  if (!format) {
    const racine = texte.trim().startsWith("<") ? racineXml(texte) : null;
    return { refus: racine ? traduire("msg.verovio.xml_inconnu_var_0", racine) : en()
      ? "Notation not recognised: expected ABC (X:, K:), MusicXML, MEI or Humdrum."
      : "Notation non reconnue : attendu ABC (X:, K:), MusicXML, MEI ou Humdrum." };
  }
  const airs = format === "abc" ? decouperMorceaux(texte) : [texte];
  if (airs.length === 0) return { refus: traduire("msg.abc.aucun_morceau") };
  const nomAir = (i: number) => traduire("msg.abc.partition_var_0", airs.length > 1 ? `ABC ${i + 1}` : "ABC");
  if (format === "abc") {
    for (const [i, air] of airs.entries()) {
      // Puis ce que Verovio ne sait pas dessiner du tout. Décision de Fabien du 2026-11-22, « Refuse
      // them, named » : les voix, les fins alternatives, un changement de tonalité, une liaison
      // dans un accord, un n-olet que son chiffre seul ferait mal lire.
      const refus = refusAbc(lireMorceau(air, i + 1), nomAir(i), "msg.abc.refusee_gravure_var_0_var_1") ?? refusTournures(air, nomAir(i));
      if (refus) return { refus };
    }
  }
  return { format, airs, nomAir };
}

/** Le texte que Verovio reçoit pour un air : un ABC est réécrit là où il lit faux une écriture juste. */
export const texteAGraver = (lecture: Lecture, i: number) =>
  lecture.format === "abc" ? abcPourGravure(lecture.airs[i]) : lecture.airs[i];

/** Le refus d'un texte que le graveur ne charge pas. */
export function refusDuGraveur(lecture: Lecture, i: number): string {
  const quoi = lecture.format === "abc" ? lecture.nomAir(i) : lecture.format.toUpperCase();
  return en() ? `${quoi} refused by the engraver: check the notation.` : `${quoi} refusé par le graveur : vérifiez la notation.`;
}

/** La page rendue : son SVG, l'air d'où elle vient, son rang parmi toutes, et leur nombre. */
export type PageGravee = { svg: string; air: number; page: number; total: number };

/**
 * Grave chaque air et rend la page voulue.
 *
 * `charger` reçoit le rang de l'air et rend le toolkit chargé, ou le refus nommé : c'est là qu'un
 * graveur dit ce qu'il donne à Verovio. Chaque toolkit est détruit après usage.
 *
 * La page voulue, ou la dernière de la dernière pièce quand on demande au-delà. « Page » parcourt les
 * pages de tous les airs.
 */
export async function graverAirs(
  lecture: Lecture, page: number,
  charger: (i: number) => Promise<{ tk: any } | { refus: string }>,
): Promise<PageGravee | { refus: string }> {
  const voulue = pageDemandee(page, Number.MAX_SAFE_INTEGER);
  let total = 0, rendu: { svg: unknown; air: number; page: number } | null = null;
  try {
    for (let i = 0; i < lecture.airs.length; i++) {
      const charge = await charger(i);
      if ("refus" in charge) return charge;
      const tk = charge.tk;
      try {
        const pages = tk.getPageCount();
        const ici = voulue <= total + pages ? voulue - total : i === lecture.airs.length - 1 ? pages : 0;
        if (!rendu && ici > 0) rendu = { svg: tk.renderToSVG(ici), air: i + 1, page: total + ici };
        total += pages;
      } finally {
        tk?.destroy?.();
      }
    }
  } catch (e: any) {
    return { refus: e?.message ?? String(e) };
  }
  const svg = rendu?.svg;
  if (!rendu || typeof svg !== "string" || !svg.includes("<svg")) {
    return { refus: en() ? "Empty engraving." : "Gravure vide." };
  }
  return { svg, air: rendu.air, page: rendu.page, total };
}

/** Le nom du format dans un message. */
export const nomDuFormat = (format: FormatNotation) => format === "musicxml" ? "MusicXML" : format.toUpperCase();

/** « · air 2 sur 3 » quand le texte en porte plusieurs, rien sinon. */
export const mentionAir = (lecture: Lecture, air: number) =>
  lecture.airs.length > 1 ? (en() ? ` · tune ${air} of ${lecture.airs.length}` : ` · air ${air} sur ${lecture.airs.length}`) : "";

/** « page 1 sur 3 », dans la langue de l'interface. */
export const mentionPage = (rendu: PageGravee) => en() ? `page ${rendu.page}/${rendu.total}` : `page ${rendu.page} sur ${rendu.total}`;

// audio/romains-degres.ts — Une progression écrite en chiffres romains, lue en degrés de la gamme.
//
// DEUX NŒUDS LA LISENT, le Générateur d'accords et la Groove Box, et chacun avait sa table de sept
// chiffres nus : « V7 », « vii° » et « bVII » n'y figuraient pas. Le Générateur d'accords les jouait
// en I, la Groove Box les jetait, sans un mot. Mesuré le 2026-11-21 sur « I-V7-bVII-vii°-V » : I, I,
// I, I, V d'un côté, I et V de l'autre ; et « V7-bVII » seul y devenait le I.
//
// DÉCISION DE FABIEN DU 2026-11-21, défaut G du contrôle des gammes :
//  - le degré se lit, majuscule ou minuscule, et la qualité de l'accord vient de la gamme, un degré
//    sur deux (`triades-gamme.ts`) ;
//  - un 7 demande la septième de la gamme sur ce degré ;
//  - un signe de qualité (°, ø, +, m, M, maj, min, dim, aug) se lit sans rien changer : c'est la gamme
//    qui décide, et « vii° » est la triade de la gamme sur le septième degré ;
//  - une altération (b, #) sort de la gamme : le chiffre est refusé, et le message le nomme. Un chiffre
//    que cette lecture ne connaît pas l'est aussi, pour la même raison : rien ne se joue à sa place.

const CHIFFRE = /^([b#♭♯]?)(VII|VI|IV|V|III|II|I)(.*)$/i;
const SUFFIXE = /^(maj|min|dim|aug|°|o|ø|\+|m|M)?(7)?$/;
const ORDRE = ["I", "II", "III", "IV", "V", "VI", "VII"];

/** Un degré lu : son rang depuis la tonique, de 0 à 6, et la septième si le chiffre la demande. */
export interface DegreLu { degre: number; septieme: boolean }

/** Une progression lue, et les chiffres qu'elle a refusés, par raison. */
export interface ProgressionRomaine { degres: DegreLu[]; alteres: string[]; inconnus: string[] }

/** Lit une progression écrite « I-V7-vi-IV » : un chiffre par trait d'union, les blancs ignorés. */
export function lireProgressionRomaine(texte: string): ProgressionRomaine {
  const lu: ProgressionRomaine = { degres: [], alteres: [], inconnus: [] };
  for (const brut of texte.split("-")) {
    const t = brut.trim();
    if (!t) continue;
    const m = CHIFFRE.exec(t);
    const s = m ? SUFFIXE.exec(m[3]) : null;
    if (!m || !s) { lu.inconnus.push(t); continue; }
    if (m[1]) { lu.alteres.push(t); continue; }
    lu.degres.push({ degre: ORDRE.indexOf(m[2].toUpperCase()), septieme: s[2] === "7" });
  }
  return lu;
}

/** Le chiffre d'un degré, pour un message : « V7 » quand sa septième est demandée. */
export const romainDuDegre = (d: DegreLu): string => `${ORDRE[d.degre % 7]}${d.septieme ? "7" : ""}`;

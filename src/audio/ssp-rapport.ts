// audio/ssp-rapport.ts — Le rapport et le message du nœud « SSP (Koenig) », dans les deux langues.
//
// IL JUGE CHAQUE SECTION POSÉE, et non la première composée. L'ancien rapport tirait la ligne « Onde »
// et les « Premiers points » de la section 1, alors que « Points posés » et « Écart moyen » comptaient
// toutes les sections composées, posées ou non. Les « Premiers points » n'étaient donc pas ceux qu'on
// entend en premier : sous les défauts, l'ordre 3 · 2 · 4 · 1 ouvrait le son sur 1/33 et le rapport
// annonçait −1/9 ; avec la forme en groupe, une section jamais posée y figurait. Décision de Fabien du
// 2026-11-27, « Oui, la maquette » : la ligne « Onde » compte les sections posées, un bloc « Sections »
// donne la sélection et l'onde de chacune, et les « Premiers points » sont ceux de la première entendue.

import { nomPrincipe, type Composition, type Principe, type Section } from "./ssp";

export interface EntreeRapport {
  amplitudes: readonly number[];
  temps: readonly number[];
  principeAmplitudes: Principe;
  principeTemps: Principe;
  principeForme: Principe;
  composition: Composition;
  aigu: number;
  crete: number;
  millisecondes: number;
  en: boolean;
}

type Etat = "tenue" | "constante" | "bruitee";

const etatDe = (s: Section): Etat => (s.tenue.constante !== null ? "constante" : s.tenue.hertz !== null ? "tenue" : "bruitee");

/** Les sections que le son fait entendre, chacune une fois, dans l'ordre de leur numéro. */
const posees = (c: Composition): number[] => [...new Set(c.ordre)].sort((a, b) => a - b);

/**
 * Ce qui manque aux sections bruitées pour tenir une onde. « Séquence » aux amplitudes est nécessaire ;
 * aux durées, il ne l'est que si une section bruitée a tiré plus d'une durée.
 */
function cause(e: EntreeRapport, bruitees: readonly Section[]): string {
  const { en } = e;
  const manqueAmplitudes = e.principeAmplitudes !== "sequence";
  const manqueDurees = e.principeTemps !== "sequence" && bruitees.some((s) => s.temps.length > 1);
  if (manqueAmplitudes && manqueDurees) {
    return en
      ? "« Amplitude principle » and « Duration principle » on « Sequence »"
      : "« Principe des amplitudes » et « Principe des durées » sur « Séquence »";
  }
  if (manqueAmplitudes) return en ? "« Amplitude principle » on « Sequence »" : "« Principe des amplitudes » sur « Séquence »";
  if (manqueDurees) {
    return en
      ? "« Duration principle » on « Sequence », or a single duration"
      : "« Principe des durées » sur « Séquence », ou une seule durée";
  }
  // Les deux principes sont bons, mais la section est trop brève pour que la suite se répète deux fois.
  return en
    ? "longer sections: the point sequence has to repeat twice to be read"
    : "des sections plus longues : la suite des points doit se répéter deux fois pour être lue";
}

/** La ligne « Onde » : l'état de chaque section posée, compté, et ce qui manque aux bruitées. */
export function ligneOnde(e: EntreeRapport): string {
  const { en, composition: c } = e;
  const rangs = posees(c);
  const sections = rangs.map((i) => c.sections[i]);
  const etats = sections.map(etatDe);
  const bruitees = sections.filter((_, k) => etats[k] === "bruitee");
  const n = sections.length;
  const pour = (texte: string) => `${texte} ${en ? "For a held wave" : "Pour une onde tenue"}, ${cause(e, bruitees)}.`;

  if (n === 1) {
    const s = sections[0];
    if (etats[0] === "tenue") {
      return en
        ? `held at ${s.tenue.hertz!.toFixed(2)} Hz, repeating every ${s.tenue.points} points (${s.tenue.echantillons} samples)`
        : `tenue à ${s.tenue.hertz!.toFixed(2)} Hz, répétée tous les ${s.tenue.points} points (${s.tenue.echantillons} éch.)`;
    }
    if (etats[0] === "constante") {
      return en
        ? `constant at ${s.tenue.constante!.toFixed(2)}: a single distinct amplitude, the signal does not move`
        : `constante à ${s.tenue.constante!.toFixed(2)} : une seule amplitude distincte, le signal ne bouge pas`;
    }
    return pour(en ? "noisy: the point sequence does not repeat." : "bruitée : la suite des points ne se répète pas.");
  }

  const compte = (etat: Etat) => etats.filter((x) => x === etat).length;
  const tenues = compte("tenue"), constantes = compte("constante");
  if (tenues === n) return en ? `held in the ${n} sections placed` : `tenue dans les ${n} sections posées`;
  if (constantes === n) {
    return en
      ? `constant in the ${n} sections placed: a single distinct amplitude, the signal does not move`
      : `constante dans les ${n} sections posées : une seule amplitude distincte, le signal ne bouge pas`;
  }
  if (bruitees.length === n) {
    return pour(en
      ? `noisy in the ${n} sections placed: the point sequence does not repeat in them.`
      : `bruitée dans les ${n} sections posées : la suite des points ne s'y répète pas.`);
  }
  // UN MÉLANGE : la première part porte le total, les suivantes le complètent.
  const parts: string[] = [];
  for (const [etat, fr, enn] of [["tenue", "tenue", "held"], ["constante", "constante", "constant"], ["bruitee", "bruitée", "noisy"]] as const) {
    const k = compte(etat);
    if (k === 0) continue;
    parts.push(parts.length === 0
      ? (en ? `${enn} in ${k} of the ${n} sections placed` : `${fr} dans ${k} des ${n} sections posées`)
      : (en ? `${enn} in ${k}` : `${fr} dans ${k}`));
  }
  const texte = parts.join(", ");
  return bruitees.length > 0
    ? `${texte}. ${en ? "For those" : "Pour celles-là"}, ${cause(e, bruitees)}.`
    : texte;
}

/** Une ligne du bloc « Sections » : la sélection de la section, et ce qu'elle fait entendre. */
function ligneSection(e: EntreeRapport, i: number): string {
  const { en, composition: c } = e;
  const s = c.sections[i];
  const etat = !c.ordre.includes(i)
    ? (en ? "never placed" : "jamais posée")
    : etatDe(s) === "tenue"
      ? `${en ? "held at" : "tenue à"} ${s.tenue.hertz!.toFixed(2)} Hz`
      : etatDe(s) === "constante"
        ? `${en ? "constant at" : "constante à"} ${s.tenue.constante!.toFixed(2)}`
        : (en ? "noisy" : "bruitée");
  // Le point-virgule prend une espace avant lui en français, et non en anglais.
  const pv = en ? ";" : " ;";
  return `    ${String(i + 1).padStart(2)}  amplitudes ${s.amplitudes.join(", ")}${pv} ${en ? "durations" : "durées"} ${s.temps.join(", ")}${pv} ${etat}`;
}

/** Le rapport entier. */
export function rapportSsp(e: EntreeRapport): string {
  const { en, composition: c } = e;
  const colonne = (fr: string, enn: string, valeur: string) => `  ${(en ? enn : fr).padEnd(24)}${valeur}`;
  const lignes: string[] = [];
  lignes.push(en ? "Nonstandard synthesis" : "Synthèse non standard", "");
  lignes.push(colonne("Amplitudes", "Amplitudes", e.amplitudes.join(", ")));
  lignes.push(colonne("Durées", "Durations", `${e.temps.join(", ")} ${en ? "samples" : "échantillons"}`), "");
  lignes.push(colonne("Points posés", "Points placed", String(c.pointsPoses)));
  lignes.push(colonne("Écart moyen", "Mean gap", `${c.dureeMoyenne.toFixed(1)} ${en ? "samples" : "éch."}`));
  lignes.push(colonne("Aigu obtenu", "Treble obtained", `${e.aigu.toFixed(0)} Hz`));
  lignes.push(colonne("Facteur de crête", "Crest factor", `${e.crete.toFixed(2)} dB`));
  lignes.push(colonne("Onde", "Wave", ligneOnde(e)));
  lignes.push(colonne("Calculé en", "Computed in", `${Math.round(e.millisecondes)} ms`), "");
  lignes.push(`  ${en ? "Order of sections" : "Ordre des sections"} (${nomPrincipe(e.principeForme, en)})`);
  lignes.push(`    ${c.ordre.map((r) => r + 1).join(" · ")}`, "");
  lignes.push("  Sections");
  c.sections.forEach((_, i) => lignes.push(ligneSection(e, i)));
  const premiere = c.ordre[0] ?? 0;
  lignes.push("", `  ${en ? `First points (section ${premiere + 1}, the first heard)` : `Premiers points (section ${premiere + 1}, la première entendue)`}`);
  for (const p of c.sections[premiere].points.slice(0, 10)) {
    lignes.push(`    ${p.amplitude.toFixed(2).padStart(6)}  ${en ? "held" : "tenu"} ${String(p.duree).padStart(5)} ${en ? "samples" : "éch."}`);
  }
  lignes.push("", en
    ? "  Pitch is a consequence of the durations, never a setting."
    : "  La hauteur est une conséquence des durées, jamais un réglage.");
  return lignes.join("\n");
}

/** Le dernier mot du message du nœud : l'état des sections posées, en bref. */
export function etatEnBref(c: Composition, en: boolean): string {
  const sections = posees(c).map((i) => c.sections[i]);
  const etats = sections.map(etatDe);
  const n = sections.length;
  const tenues = etats.filter((x) => x === "tenue").length;
  const constantes = etats.filter((x) => x === "constante").length;
  if (n === 1 && tenues === 1) return `${en ? "held" : "tenue"} ${sections[0].tenue.hertz!.toFixed(1)} Hz`;
  if (tenues === n) return en ? `held, ${n} sections` : `tenue, ${n} sections`;
  if (tenues > 0) return en ? `held ${tenues} section${tenues > 1 ? "s" : ""} of ${n}` : `tenue ${tenues} section${tenues > 1 ? "s" : ""} sur ${n}`;
  if (constantes === n) return en ? "constant" : "constante";
  if (constantes > 0) return en ? `noisy, constant ${constantes} of ${n}` : `bruitée, constante ${constantes} sur ${n}`;
  return en ? "noisy" : "bruitée";
}

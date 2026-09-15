// docs/catalogue-markdown.ts — Le catalogue des composants, en Markdown.
//
// Produit COMPONENTS.md à partir du registre vivant, et de lui seul : aucune
// description n'est écrite ici, tout vient des fiches — nom, résumé, notice,
// ports, paramètres et leur documentation, en anglais. Ce qui se trouve dans le
// document est donc exactement ce que l'application affiche en anglais.
//
// La génération est pure et déterministe (ni date ni version, ordre stable) :
// deux générations du même catalogue donnent le même fichier. COMPONENTS.md est
// versionné, et un test vérifie qu'il correspond au registre.
//
// Ce que la version précédente faisait mal, et que celle-ci corrige :
// - des titres en français (« Entrées », « Traitement ») dans un document anglais,
//   et un ordre d'univers qui ignorait Visualisation, Collections et Méta-composants ;
// - la valeur par défaut d'un choix affichée sous sa forme interne française
//   (« Automatique ») à côté d'options listées en anglais ;
// - des types internes bruts (« sf2instrument ») ;
// - les paramètres cachés — chemins de fichier choisis dans l'inspecteur —
//   présentés comme réglables ;
// - aucune vue d'ensemble : ni sommaire, ni comptes, ni légende.

import type { FicheAudio } from "../audio/types-domaine";
import { traduireDans } from "../i18n";

/** Ordre des catégories dans le document ; les inconnues suivent, par ordre alphabétique. */
export const ORDRE_UNIVERS = ["Entrées", "Traitement", "Visualisation", "Sorties", "Collections", "Méta-composants", "Autres"];

const TYPES_PORT: Record<string, string> = {
  audio: "audio", midi: "MIDI", texte: "text", image: "image", controle: "control", fichier: "file", nombre: "number",
};
const TYPES_PARAM: Record<string, string> = {
  nombre: "number", curseur: "slider", choix: "choice", texte: "text", dossier: "folder",
  sf2instrument: "SoundFont preset", couleurs: "colour list",
};

/** Texte sûr dans une cellule de tableau Markdown : barres obliques inverses d'abord, puis barres verticales, chevrons et retours à la ligne. */
export function cellule(texte: string | number | undefined | null): string {
  return String(texte ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/\r?\n+/g, " ")
    .trim();
}

/** Texte sûr hors tableau : seuls les chevrons et les sauts de ligne multiples sont neutralisés. */
const paragraphe = (texte: string | undefined) => String(texte ?? "").replace(/</g, "&lt;").replace(/\r?\n+/g, " ").trim();

/**
 * Ancres de titres telles que GitHub les calcule : minuscules, ponctuation
 * retirée, espaces en tirets, et un suffixe -1, -2… pour les titres répétés
 * (la famille « Audio » existe dans plusieurs catégories).
 */
export function creerSlugger() {
  const vus = new Map<string, number>();
  return (titre: string): string => {
    const base = titre.toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const n = vus.get(base);
    vus.set(base, (n ?? -1) + 1);
    return n === undefined ? base : `${base}-${n + 1}`;
  };
}

type Param = NonNullable<FicheAudio["parametres"]>[number];

/** Libellé anglais de la valeur par défaut d'un choix : elle peut être l'id, le libellé français ou l'anglais. */
export function defautChoix(p: Param): string {
  const def = String(p.defautEn ?? p.defaut ?? "");
  const en = p.optionsEn ?? p.options ?? [];
  for (const liste of [p.optionIds, p.options, p.optionsEn]) {
    const i = (liste ?? []).indexOf(def);
    if (i >= 0 && en[i] !== undefined) return en[i];
  }
  return def;
}

/** Unité telle que l'anglais l'affiche : « temps » y devient « beats ». */
export const uniteEn = (p: Param): string | undefined => p.uniteEn ?? p.unite;

export function defautParam(p: Param): string {
  const type = p.type ?? "nombre";
  if (type === "choix") return defautChoix(p);
  if (type === "sf2instrument") {
    const v = Number(p.defaut);
    if (v < 0) return "follow MIDI";
    const banque = Math.floor(v / 128), programme = v % 128;
    return banque > 0 ? `bank ${banque}, program ${programme}` : `program ${programme}`;
  }
  const brut = p.defautEn ?? p.defaut;
  if (brut === "" || brut === undefined || brut === null) return "—";
  const texte = String(brut);
  const court = texte.length > 60 ? `${texte.slice(0, 57)}…` : texte;
  return type === "texte" || type === "dossier" ? `\`${court.replace(/`/g, "'").replace(/\r?\n+/g, " ")}\`` : `${court}${p.unite ? ` ${uniteEn(p)}` : ""}`;
}

export function valeursParam(p: Param): string {
  const type = p.type ?? "nombre";
  if (type === "choix") return (p.optionsEn ?? p.options ?? []).join(" / ");
  if (p.plage) return `${p.plage[0]} – ${p.plage[1]}${p.unite ? ` ${uniteEn(p)}` : ""}${p.pas !== undefined ? `, step ${p.pas}` : ""}`;
  return "";
}

const nomEn = (f: FicheAudio) => (f.nomEn ?? f.nom).trim();

/**
 * Le document ne porte PAS de numéro de version : il est versionné et un test
 * vérifie qu'il est à jour. Avec la version dedans, chaque montée de version
 * ferait échouer la suite — et la CI d'une PR de release — tant que le catalogue
 * n'aurait pas été régénéré, sans que rien n'y ait changé.
 */
export function genererCatalogueMarkdown(fiches: FicheAudio[]): string {
  const slug = creerSlugger();
  const univers = [...new Set(fiches.map((f) => f.univers))].sort((a, b) => {
    const ia = ORDRE_UNIVERS.indexOf(a), ib = ORDRE_UNIVERS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const lu = (u: string) => traduireDans("en", `univers.${u}`);
  const lf = (f: string) => traduireDans("en", `famille.${f}`);
  const famillesDe = (u: string) => [...new Set(fiches.filter((f) => f.univers === u).map((f) => f.famille))]
    .sort((a, b) => lf(a).localeCompare(lf(b)));
  const fichesDe = (u: string, fam: string) => fiches.filter((f) => f.univers === u && f.famille === fam)
    .sort((a, b) => nomEn(a).localeCompare(nomEn(b)) || a.id.localeCompare(b.id));
  const nbFamilles = univers.reduce((n, u) => n + famillesDe(u).length, 0);

  // Les ancres dépendent de l'ORDRE des titres dans le document : on les calcule
  // en le parcourant exactement comme il sera écrit, avant d'écrire le sommaire.
  const titres = ["Attic Component Catalog", "Contents", "How to read this catalog"];
  titres.forEach(slug);
  const ancres = new Map<string, string>();
  for (const u of univers) {
    ancres.set(`u:${u}`, slug(lu(u)));
    for (const fam of famillesDe(u)) {
      ancres.set(`f:${u}:${fam}`, slug(lf(fam)));
      for (const f of fichesDe(u, fam)) ancres.set(`n:${f.id}`, slug(nomEn(f)));
    }
  }

  const l: string[] = [];
  l.push("# Attic Component Catalog", "");
  l.push("> Generated from the live node registry by `src/docs/catalogue-markdown.ts` — do not edit by hand.  ");
  l.push("> Regenerate with `npm run docs:components`.", "");
  l.push(`Attic ships **${fiches.length} components** in **${univers.length} categories** and **${nbFamilles} families**. `
    + "Every name, summary, description and parameter note below is the English text the application itself displays.", "");

  l.push("## Contents", "");
  l.push("| Category | Components | Families |", "|---|---:|---|");
  for (const u of univers) {
    const fams = famillesDe(u).map((fam) => `[${lf(fam)}](#${ancres.get(`f:${u}:${fam}`)}) (${fichesDe(u, fam).length})`).join(" · ");
    l.push(`| [${lu(u)}](#${ancres.get(`u:${u}`)}) | ${fiches.filter((f) => f.univers === u).length} | ${fams} |`);
  }
  l.push("");

  l.push("## How to read this catalog", "");
  l.push("Components are grouped as in the application's palette: a **category**, then a **family**. Each family opens with a one-line index; each component then gives its summary, its full description, its ports and its parameters.", "");
  l.push("**Port types** — what flows along a connection:", "");
  l.push("| Type | Carries |", "|---|---|");
  l.push("| audio | a decoded audio signal, mono or stereo |");
  l.push("| MIDI | a MIDI file |");
  l.push("| text | plain text: lyrics, prompts, ABC scores, reports, analysis results |");
  l.push("| image | an image |");
  l.push("| control | a numeric control value |");
  l.push("| file | a file of another kind |", "");
  l.push("An input marked **required** must be connected for the component to run. "
    + "**Parameter types**: *number* and *slider* take a value within the given range; *choice* one of the listed options; *text* free text; *folder* a directory path; "
    + "*SoundFont preset* an instrument of the loaded SoundFont, or *follow MIDI* to keep the instruments written in the MIDI file. "
    + "Internal parameters that the application sets by itself — such as the path of a file picked from the inspector — are not listed.", "");

  for (const u of univers) {
    l.push(`## ${lu(u)}`, "");
    for (const fam of famillesDe(u)) {
      const liste = fichesDe(u, fam);
      l.push(`### ${lf(fam)}`, "");
      if (fam === "Test zone") l.push("> Experimental components, still being evaluated.", "");
      l.push("| Component | Summary |", "|---|---|");
      for (const f of liste) l.push(`| [${cellule(nomEn(f))}](#${ancres.get(`n:${f.id}`)}) | ${cellule(f.resumeEn ?? f.resume)} |`);
      l.push("");

      for (const f of liste) {
        l.push(`#### ${nomEn(f)}`, "");
        l.push(`\`${f.id}\` · ${lu(u)} → ${lf(fam)}`, "");
        l.push(`*${paragraphe(f.resumeEn ?? f.resume)}*`, "");
        const notice = paragraphe(f.noticeEn ?? f.notice);
        if (notice && notice !== paragraphe(f.resumeEn ?? f.resume)) l.push(notice, "");

        const ports = [
          ...(f.entrees ?? []).map((p) => ({ sens: "in", p })),
          ...(f.sorties ?? []).map((p) => ({ sens: "out", p })),
        ];
        if (ports.length) {
          l.push("| Port | Name | Type | |", "|---|---|---|---|");
          for (const { sens, p } of ports) {
            const type = `${TYPES_PORT[p.type] ?? p.type}${(p as any).sousType ? ` (${(p as any).sousType})` : ""}`;
            const requis = sens === "in" && p.requis ? "required" : "";
            l.push(`| ${sens === "in" ? "input" : "output"} | ${cellule((p as any).nomEn ?? p.nom)} | ${cellule(type)} | ${requis} |`);
          }
          l.push("");
        } else {
          l.push("*No ports.*", "");
        }

        const params = (f.parametres ?? []).filter((p) => !p.hidden);
        if (params.length) {
          l.push("| Parameter | Type | Default | Values | Description |", "|---|---|---|---|---|");
          for (const p of params) {
            l.push(`| ${cellule(p.nomEn ?? p.nom)} | ${TYPES_PARAM[p.type ?? "nombre"] ?? cellule(p.type)} | ${cellule(defautParam(p))} | ${cellule(valeursParam(p))} | ${cellule(p.docEn ?? p.doc)} |`);
          }
          l.push("");
        } else {
          l.push("*No parameters.*", "");
        }
      }
    }
  }
  return l.join("\n");
}

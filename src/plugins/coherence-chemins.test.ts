// plugins/coherence-chemins.test.ts
// UN CHEMIN NE S'ÉCRIT PAS À LA MAIN. Garde-fou sur les paramètres de TOUS les nœuds qui désignent
// un fichier ou un dossier.
//
// Demandé par Fabien, et à appliquer systématiquement : un paramètre qui désigne un fichier porte le
// type « fichier », un paramètre qui désigne un dossier porte le type « dossier ». L'un et l'autre
// gardent un champ saisissable et reçoivent un bouton qui ouvre le dialogue du système.
//
// POURQUOI C'EST UNE RÈGLE ET NON UNE PRÉFÉRENCE. Un chemin saisi à la main est faux pour une
// majuscule, un accent, un séparateur à l'envers ou un espace de trop, et le composant échoue alors
// sur un fichier qui existe. Le dialogue du système est la seule source d'un chemin exact.
//
// UN PARAMÈTRE CACHÉ EST HORS RÈGLE : il n'est pas saisi, il est écrit par le programme pour se
// souvenir du fichier chargé par la vue du nœud, et rechargé à la reprise de session.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { registre } from "../audio/adaptateur";
import type { ParametreDef } from "../core/types";

interface Cas { fiche: string; param: ParametreDef; ref: string }

const TOUS: Cas[] = [];
for (const f of registre.tousLesPlugins() as any[]) {
  for (const p of (f.parametres ?? []) as ParametreDef[]) {
    TOUS.push({ fiche: f.id, param: p, ref: `${f.id} :: ${p.nom}` });
  }
}

const SELECTEURS = TOUS.filter((c) => c.param.type === "fichier" || c.param.type === "dossier");

/** Le nom dit qu'il s'agit d'un chemin. */
const NOM_DE_CHEMIN = /chemin|fichier|dossier|répertoire|repertoire|\bpath\b|\bfile\b|folder|directory/i;

/** La documentation dit qu'il s'agit d'un chemin, même quand le nom ne le dit pas. */
const DOC_DE_CHEMIN = /chemin (absolu|relatif|du|de la|de l|des|d'|vers)|dossier (où|à)|path (of|to|for)|directory to/i;

/**
 * UN NOM DE FICHIER À CRÉER N'EST PAS UN CHEMIN À CHOISIR, et c'est la seule exception.
 *
 * Un dialogue d'ouverture ne peut pas désigner un fichier qui n'existe pas encore : le nom du
 * fichier qu'un composant va écrire se saisit, et rien d'autre ne peut le fournir.
 */
const ECRITURE = /écrit|écrire|enregistr|written|writes|output|created|saved/i;

const designeUnChemin = (p: ParametreDef) =>
  (NOM_DE_CHEMIN.test(p.nom) || NOM_DE_CHEMIN.test(p.nomEn ?? "")
    || DOC_DE_CHEMIN.test(p.doc ?? "") || DOC_DE_CHEMIN.test(p.docEn ?? ""))
  && !ECRITURE.test(`${p.doc ?? ""} ${p.docEn ?? ""}`);

describe("cohérence des paramètres de chemin", () => {
  it("il y a bien des paramètres à vérifier (garde anti-test-vide)", () => {
    expect(TOUS.length).toBeGreaterThan(500);
    expect(SELECTEURS.length).toBeGreaterThan(5);
  });

  it("aucun paramètre saisissable ne désigne un chemin sans son sélecteur", () => {
    const fautifs = TOUS
      .filter((c) => c.param.type === "texte" && !c.param.hidden && designeUnChemin(c.param))
      .map((c) => `${c.ref} : type « texte » pour un chemin, attendu « fichier » ou « dossier »`);
    expect(fautifs).toEqual([]);
  });

  it("la règle attrape ce qu'elle vise, et laisse ce qu'elle ne vise pas", () => {
    // Le cas d'où vient la règle : le film du montage vidéo, saisi à la main avant cette correction.
    expect(designeUnChemin({ nom: "Chemin", nomEn: "Path", defaut: "",
      doc: "Chemin du film. Conteneurs lus : MP4, MOV." })).toBe(true);
    // Le dossier à parcourir, nommé autrement que « dossier ».
    expect(designeUnChemin({ nom: "Source", nomEn: "Source", defaut: "",
      doc: "Dossier où chercher les pistes.", docEn: "Directory to scan." })).toBe(true);
    // Un nom de fichier à créer : aucun dialogue d'ouverture ne peut le désigner.
    expect(designeUnChemin({ nom: "Nom", nomEn: "Name", defaut: "banque.sfz",
      doc: "Nom du fichier SFZ, écrit dans le répertoire de travail." })).toBe(false);
    // Un réglage ordinaire, que la règle ne doit pas toucher.
    expect(designeUnChemin({ nom: "Gain", nomEn: "Gain", defaut: 0,
      doc: "Niveau du son d'origine." })).toBe(false);
  });

  it("les extensions d'un paramètre « fichier » sont sans point et en minuscules", () => {
    // Le dialogue d'Electron attend « mp4 » et non « .mp4 » : un point rendrait le filtre muet, et
    // le sélecteur n'afficherait aucun fichier là où il y en a.
    const fautifs = SELECTEURS
      .filter((c) => c.param.extensions?.some((e) => e.startsWith(".") || e !== e.toLowerCase() || e.trim() !== e))
      .map((c) => `${c.ref} : extensions=${JSON.stringify(c.param.extensions)}`);
    expect(fautifs).toEqual([]);
  });

  it("un paramètre « dossier » ne déclare pas d'extensions", () => {
    const fautifs = SELECTEURS
      .filter((c) => c.param.type === "dossier" && c.param.extensions?.length)
      .map((c) => `${c.ref} : un dossier n'a pas d'extension`);
    expect(fautifs).toEqual([]);
  });

  // LE LIEN EST MÉCANIQUE, ET NON DE CONFIANCE. Un type de paramètre dont le sélecteur n'existe pas
  // dessine un bouton sans effet. Les deux bouts de la chaîne sont donc vérifiés ici même.
  it("le sélecteur de fichier existe de bout en bout", () => {
    const preload = readFileSync(new URL("../../electron/preload.cjs", import.meta.url), "utf-8");
    const main = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf-8");
    expect(preload).toContain("choisirFichier");
    expect(preload).toContain("choisirDossier");
    expect(main).toContain('ipcMain.handle("fichier:choisir"');
    expect(main).toContain('ipcMain.handle("dossier:choisir"');
  });

  it("l'inspecteur rend les deux types avec un sélecteur", () => {
    const inspecteur = readFileSync(new URL("../ui/Inspector.tsx", import.meta.url), "utf-8");
    expect(inspecteur).toMatch(/p\.type === "fichier" \|\| p\.type === "dossier"/);
    expect(inspecteur).toContain("ChampChemin");
  });
});

// ui/urls-medias-naissances.test.ts — Aucune URL d'objet ne naît dans l'interface hors d'une liste
// tenue, et une URL de média ne naît que par le registre.
//
// POURQUOI CE GARDE, point A6 de la revue d'architecture du 2026-10-31. Le registre de
// `ui/urls-medias.ts` ne révoque que ce qui a été créé par lui : une URL de média créée à côté, par
// `URL.createObjectURL`, retrouve l'ancien sort, la fuite, sans que rien ne le dise. Six naissances
// de média étaient écrites ainsi, dans cinq fichiers ; celle de l'inspecteur est depuis la prise du
// nœud lui-même, et non une seconde écriture.
//
// CE QU'IL CHERCHE : UNE FORME, et le compte de chaque fichier. Tout appel à `URL.createObjectURL`
// dans `src/ui` et `src/vues-domaine` est relevé, commentaires retirés. Chaque fichier qui en porte
// figure ci-dessous avec son compte exact et la raison pour laquelle ce n'est pas une URL de média
// posée sur un nœud. Un appel de plus, ou un fichier de plus, fait tomber le garde : il se classe,
// ou il passe par `creerUrlMedia`. Et un fichier de la liste qui n'en porte plus la rend fausse.
//
// CE QU'IL NE VOIT PAS : `src/plugins` et `src/audio`, où les exécuteurs rendent leurs URL par le
// canal d'affichage et le magasin des résultats, qui les révoque. Le film du « Générateur vidéo »,
// que son exécuteur posait sur le nœud, y passe lui aussi depuis la pièce 4 du point A6, et
// `tests-e2e/films-des-noeuds.spec.ts` le tient dans l'application.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const DOSSIERS = ["ui", "vues-domaine"];

/** Chaque fichier qui crée des URL d'objet sans le registre, son compte, et pourquoi il le peut. */
const CLASSEES: Record<string, { appels: number; raison: string }> = {
  "ui/urls-medias.ts": { appels: 1, raison: "le registre lui-même" },
  "ui/correctif-resultat.ts": { appels: 2, raison: "l'aperçu et l'image d'un résultat, révoqués par le magasin des résultats" },
  "ui/refaire-apercus.ts": { appels: 2, raison: "un aperçu réécrit, qui révoque celui qu'il remplace" },
  "ui/AtelierNode.tsx": { appels: 1, raison: "l'écoute d'un tampon, tenue par la vue et révoquée par elle" },
  "ui/dictee/useDictee.ts": { appels: 1, raison: "le code du module audio de la dictée, et non un média" },
  "ui/ecriture-projet.ts": { appels: 1, raison: "le téléchargement du projet en mode web, révoqué une seconde après le clic" },
  "vues-domaine/PochetteGen.tsx": { appels: 1, raison: "l'aperçu d'une pochette, tenu par la vue et révoqué par elle" },
  "vues-domaine/Songsee.tsx": { appels: 1, raison: "l'image d'un spectre, tenue par la vue et révoquée par elle" },
  "vues-domaine/vues-lecteur.tsx": { appels: 1, raison: "la piste du lecteur de dossier, tenue par la vue et révoquée par elle" },
  "vues-domaine/vues-collections.tsx": { appels: 2, raison: "deux téléchargements, révoqués sur place" },
  "vues-domaine/vues-midi.tsx": { appels: 1, raison: "un téléchargement, révoqué sur place" },
};

function sources(dossier: string): string[] {
  const rendu: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) rendu.push(...sources(chemin));
    else if (/\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom)) rendu.push(chemin);
  }
  return rendu;
}

/** Les commentaires retirés : un commentaire qui CITE l'appel ne le porte pas. */
const sansCommentaires = (texte: string) =>
  texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const APPEL = /URL\.createObjectURL\s*\(/g;

/** Le nombre d'appels dans un texte source. */
export const appels = (texte: string) => (sansCommentaires(texte).match(APPEL) ?? []).length;

/** Les fichiers de l'interface qui créent des URL d'objet, et combien chacun. */
function releve(): Record<string, number> {
  const comptes: Record<string, number> = {};
  for (const d of DOSSIERS) {
    for (const f of sources(join(SRC, d))) {
      const n = appels(readFileSync(f, "utf8"));
      if (n > 0) comptes[relative(SRC, f).replace(/\\/g, "/")] = n;
    }
  }
  return comptes;
}

describe("les naissances d'URL d'objet dans l'interface", () => {
  it("LE MOTIF COMPTE LES APPELS, et pas ceux qu'un commentaire cite", () => {
    expect(appels("const u = URL.createObjectURL(b);\nx = URL.createObjectURL ( c );")).toBe(2);
    expect(appels("// URL.createObjectURL(b)\n/* URL.createObjectURL(c) */\nconst d = creerUrlMedia(b);")).toBe(0);
  });

  it("CHAQUE FICHIER QUI EN CRÉE EST CLASSÉ, AVEC SON COMPTE EXACT : une URL de média passe par le registre", () => {
    const comptes = releve();
    // LE DÉNOMINATEUR : onze fichiers et quatorze appels le 2026-11-10, depuis que le film de la
    // démonstration naît par le registre. Si le relevé tombe sous la moitié, il ne regarde plus le
    // bon endroit.
    expect(Object.keys(comptes).length, "le relevé ne voit presque plus de fichiers : il regarde ailleurs").toBeGreaterThanOrEqual(6);
    const attendus = Object.fromEntries(Object.entries(CLASSEES).map(([f, c]) => [f, c.appels]));
    expect(comptes, [
      "Un fichier crée des URL d'objet hors de la liste, ou un autre nombre qu'elle ne dit.",
      "Une URL de média posée sur un nœud se crée par `creerUrlMedia` de `ui/urls-medias.ts` ;",
      "une autre se classe ici, avec sa raison.",
    ].join("\n")).toEqual(attendus);
  });

  it("LES NAISSANCES DE MÉDIA PASSENT PAR LE REGISTRE, dans chacun des cinq fichiers qui en portent", () => {
    const portes: Record<string, number> = {
      "ui/hooks/useChargementMedias.ts": 2, "ui/hooks/useDepot.ts": 1,
      "ui/rechargerFichiers.ts": 2, "vues-domaine/vues-explorateur.tsx": 1,
      "ui/demo/useRealisateurDemo.tsx": 1,
    };
    const vus: Record<string, number> = {};
    for (const f of Object.keys(portes)) {
      vus[f] = (sansCommentaires(readFileSync(join(SRC, f), "utf8")).match(/creerUrlMedia\s*\(/g) ?? []).length;
    }
    expect(vus).toEqual(portes);
  });
});

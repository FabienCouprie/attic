// docs/contrat-ecritures-refusees.test.ts — Une écriture refusée se dit.
//
// ═══ POURQUOI CE FICHIER EXISTE ═══
//
// RELEVÉ PAR UNE REVUE CRITIQUE DU DÉPÔT, le 2026-10-27 : dix appels à `ecrireFichier` jetaient
// leur résultat, dont les DEUX sauvegardes de projet. Le pont rend `null` quand le processus
// principal refuse d'écrire — disque plein, fichier verrouillé, extension exécutable, dossier hors
// des racines —, et personne ne le lisait. Une sauvegarde refusée laissait croire le projet
// enregistré ; la sauvegarde automatique, voyant le contenu marqué comme écrit, ne réessayait
// jamais ; un lot de conversions comptait ses fichiers comme écrits. C'était aussi ce qui
// interdisait d'armer la sanction par racines : elle aurait refusé des écritures que rien ne disait.
//
// ═══ CE QUE CE GARDE CHERCHE : UNE FORME, ET NON UN NOM ═══
//
// Un appel dont le résultat est jeté a une forme : une INSTRUCTION qui commence par `await` et
// dont l'expression est l'appel lui-même, ou un appel sans `await` ni affectation. Un appel dont on
// lit le résultat — affecté, testé, rendu, passé à une aide — n'a pas cette forme. La voie
// recommandée est `ecrireOuLever` de `plugins/pont-electron.ts`, qui lève sur un refus.
//
// ET IL COMPTE CE QU'IL A VU, pour ne pas passer au vert en n'examinant plus rien : un garde qui
// cherche dans un dossier vide, ou dont le motif ne rencontre plus aucun appel, ne garde rien.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function sources(dossier: string): string[] {
  const rendu: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) rendu.push(...sources(chemin));
    else if (/\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom)) rendu.push(chemin);
  }
  return rendu;
}

/** Les commentaires retirés : un commentaire qui CITE la forme fautive ne doit pas la porter. */
function sansCommentaires(texte: string): string {
  return texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Une instruction qui appelle `ecrireFichier` et jette son résultat. */
const JETE = /^\s*(?:await\s+)?(?:\(?\s*window\s+as\s+any\s*\)?\.|[\w$.]+\.)?api\??\.ecrireFichier\??\s*\(/;
/** Tout appel à `ecrireFichier`, quelle que soit sa forme : c'est le dénominateur. */
const APPEL = /\.ecrireFichier\??\s*\(/g;

export function ecrituresJetees(texte: string): number[] {
  const lignes = sansCommentaires(texte).split(/\r?\n/);
  const fautives: number[] = [];
  lignes.forEach((l, i) => { if (JETE.test(l)) fautives.push(i + 1); });
  return fautives;
}

describe("les écritures refusées", () => {
  it("LE MOTIF RECONNAÎT LA FORME FAUTIVE, et pas les formes qui lisent le résultat", () => {
    expect(ecrituresJetees("        await api.ecrireFichier(chemin, donnees);")).toEqual([1]);
    expect(ecrituresJetees("  await (window as any).api.ecrireFichier(x, y);")).toEqual([1]);
    expect(ecrituresJetees("  api.ecrireFichier(x, y);")).toEqual([1]);
    expect(ecrituresJetees("  const ok = await api.ecrireFichier(x, y);")).toEqual([]);
    expect(ecrituresJetees("  if (!(await api.ecrireFichier(x, y))) throw e;")).toEqual([]);
    expect(ecrituresJetees("  return api.ecrireFichier(x, y);")).toEqual([]);
    expect(ecrituresJetees("  await ecrireOuLever(api, x, y);")).toEqual([]);
    expect(ecrituresJetees("  // await api.ecrireFichier(x, y);")).toEqual([]);
  });

  it("AUCUNE ÉCRITURE PAR LE PONT NE JETTE SON RÉSULTAT", () => {
    let appels = 0;
    const fautes: string[] = [];
    for (const f of sources(SRC)) {
      const texte = readFileSync(f, "utf8");
      appels += (sansCommentaires(texte).match(APPEL) ?? []).length;
      for (const ligne of ecrituresJetees(texte)) fautes.push(`${relative(SRC, f)}:${ligne}`);
    }
    // LE DÉNOMINATEUR : relevé le 2026-10-27, une vingtaine d'appels. Sous dix, le garde ne
    // regarde plus le bon endroit.
    expect(appels, "le garde ne voit presque plus d'appels : il regarde ailleurs").toBeGreaterThanOrEqual(10);
    expect(fautes, "ces écritures jettent leur résultat ; employer `ecrireOuLever` ou lire le retour").toEqual([]);
  });
});

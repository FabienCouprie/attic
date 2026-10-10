// plugins/niveau-des-synthes.test.ts — Un synthé sort au niveau que son « Volume » demande.
//
// POURQUOI CE FICHIER EXISTE. `instruments-communs.ts` porte `versBuffer`, qui normalise un signal
// mono à une crête de 0,9 puis lui applique le volume. Il attend ce volume EN POUR CENT et le
// divise lui-même ; trois appelants le divisaient d'avance, de sorte que l'Oscillateur à table
// d'onde, l'Oscillateur analogique et la FM à six opérateurs sortaient à **0,0072 au lieu de
// 0,72**, soit quarante décibels trop bas. Rien ne le signalait : le son était juste, seulement
// cent fois trop faible, et il fallait le mesurer pour le voir.
//
// LA FORME CHERCHÉE EST « LE NIVEAU DE SORTIE SUIT LE RÉGLAGE », et non les trois appels fautifs.
// Un garde qui chercherait `/ 100` dans la source ne verrait que cette faute-ci ; celui-ci voit
// toute erreur d'unité, de facteur ou de normalisation, quelle qu'en soit l'écriture. Il se
// découvre tout seul les fiches concernées, par la mention de `versBuffer` dans leur exécuteur :
// un synthé neuf bâti sur ce socle entre sous ce contrôle sans que personne ait à l'inscrire.
//
// CE QUI EST ÉCARTÉ, ET POURQUOI. Deux fiches ne rendent rien sans entrée — le Séparateur IA
// attend de l'audio, le Mosaïquage un corpus —, et on ne peut rien mesurer sur un silence. Elles
// sont reconnues à leur sortie vide, non à leur nom, et le PLANCHER ci-dessous interdit que ce
// contrôle passe au vert en n'éprouvant plus personne.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from ".";
import type { FicheAudio } from "../audio/types-domaine";

/** La crête à laquelle `versBuffer` normalise avant d'appliquer le volume. */
const CRETE_NORMALISEE = 0.9;

/**
 * Le nombre de fiches que ce contrôle doit réellement exercer.
 *
 * Sans lui, un contrôle qui ne trouve plus personne passe au vert sans rien tenir. Neuf au
 * moment où il est écrit ; le baisser est un acte délibéré qui se voit à la relecture.
 */
const PLANCHER_EPROUVES = 9;

/**
 * Les fiches dont le niveau ne suit PAS cette règle, avec leur raison.
 *
 * Une fiche qui retouche le son APRÈS `versBuffer` est légitime ; elle se déclare ici avec ce
 * qu'elle fait, et sans raison écrite il n'y a pas d'exemption. La liste est vide, et c'est
 * l'état que l'on souhaite garder.
 */
const EXEMPTEES: Record<string, string> = {};

function contexte() {
  return {
    entree: () => undefined,
    sortieBranchee: () => false,
    paramNombre: (_nom: string, defaut: number) => defaut,
    paramTexte: (_nom: string, defaut: string) => defaut,
    onProgress: () => {},
  } as never;
}

const cretheDe = (v: unknown): number => {
  if (!(v instanceof AudioBuffer)) return 0;
  let c = 0;
  for (let ch = 0; ch < v.numberOfChannels; ch++) {
    const x = v.getChannelData(ch);
    for (let i = 0; i < x.length; i++) c = Math.max(c, Math.abs(x[i]));
  }
  return c;
};

/** Les fiches bâties sur `versBuffer`, reconnues à l'emploi qu'en fait leur exécuteur. */
const batiesSurVersBuffer = (): FicheAudio[] => (toutesLesFiches as unknown as FicheAudio[])
  .filter((f) => typeof f.executer === "function" && f.executer.toString().includes("versBuffer"));

describe("le niveau de sortie des synthés", () => {
  it("relève bien les fiches bâties sur ce socle", () => {
    expect(batiesSurVersBuffer().length).toBeGreaterThanOrEqual(PLANCHER_EPROUVES);
  });

  it("CHAQUE SYNTHÉ SORT À LA CRÊTE QUE SON « VOLUME » DEMANDE", async () => {
    const fautifs: string[] = [];
    let eprouves = 0;

    for (const f of batiesSurVersBuffer()) {
      if (EXEMPTEES[f.id]) continue;
      const volume = (f.parametres ?? []).find((p) => p.nom === "Volume");
      if (typeof volume?.defaut !== "number") continue;

      let sortie: unknown;
      try {
        const res = await f.executer(contexte() as never) as { valeurs?: unknown[] };
        sortie = (res?.valeurs ?? []).find((v) => v instanceof AudioBuffer);
      } catch {
        // Une fiche qui refuse de tourner sans entrée ne dit rien du niveau : elle n'est pas
        // fautive, elle n'est simplement pas mesurable ici.
        continue;
      }
      const crete = cretheDe(sortie);
      // Un silence n'est pas une crête : la fiche attendait une entrée qu'on ne lui donne pas.
      if (crete <= 0.001) continue;

      eprouves++;
      const attendu = (CRETE_NORMALISEE * (volume.defaut as number)) / 100;
      if (Math.abs(crete - attendu) > 1e-3) {
        const dB = (20 * Math.log10(crete / attendu)).toFixed(1);
        fautifs.push(`${f.id} : crête ${crete.toFixed(4)} pour ${attendu.toFixed(4)} attendu (${dB} dB)`);
      }
    }

    expect(fautifs, "le niveau de sortie ne suit pas le réglage").toEqual([]);
    expect(eprouves, "ce contrôle n'éprouve plus assez de fiches").toBeGreaterThanOrEqual(PLANCHER_EPROUVES);
  }, 120000);

  it("chaque exemption nomme une fiche qui existe, sinon la liste vieillit en silence", () => {
    const ids = new Set((toutesLesFiches as unknown as FicheAudio[]).map((f) => f.id));
    expect(Object.keys(EXEMPTEES).filter((id) => !ids.has(id))).toEqual([]);
  });
});

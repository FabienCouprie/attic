// @vitest-environment jsdom
// plugins/vexflow.test.ts — Vérification des nœuds de notation VexFlow.
import { describe, it, expect, beforeAll } from "vitest";
import { fiches } from "./vexflow";
import { jetonsSansCordeFret, jetonsSansDuree } from "./vexflow-notation";
import { accordsInconnus } from "../audio/theorie-romains";
import { ctxDEssai } from "../core/contexte-essai";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

function ctxSimple(valeur: any) {
  return ctxDEssai([valeur]);
}

beforeAll(() => {
  // jsdom n'implémente pas getBBox, requis par VexFlow pour mesurer le texte.
  (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
});

describe("nœuds VexFlow", () => {
  it("les 3 fiches sont enregistrées", () => {
    expect(fiches.map((f) => f.id)).toEqual(["vexflow-portee", "vexflow-tab", "vexflow-grille"]);
  });

  it("vexflow-portee génère un SVG", async () => {
    const f = trouver("vexflow-portee")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
    // Le SVG part sur la sortie déclarée ET dans le message. Cette assertion
    // exigeait `null` : elle décrivait le code, pas une exigence. Un port « SVG »
    // déclaré qui n'émet jamais rien n'est pas un choix — il rend la sortie
    // inexploitable en aval, et le moteur marquait le nœud « Erreur » alors que
    // la portée s'affichait. Vérifié dans l'app avant de changer la règle : le
    // défaut se produisait aussi sur une entrée sans chiffres romains, donc
    // indépendamment de la correction d'harmonie faite en même temps.
    expect(res.valeurs[0]).toContain("<svg");
    expect(res.valeurs[0]).toBe(res.message);
  });

  it("vexflow-portee utilise l'entrée connectée", async () => {
    const f = trouver("vexflow-portee")!;
    const ctx = ctxDEssai(["A4/q B4/q"]);
    const res = await f.executer(ctx as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-tab génère un SVG", async () => {
    const f = trouver("vexflow-tab")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-grille génère un SVG", async () => {
    const f = trouver("vexflow-grille")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-grille accepte une progression en chiffres romains", async () => {
    const f = trouver("vexflow-grille")!;
    const ctx = ctxDEssai(["I V vi IV"]);
    const res = await f.executer(ctx as any);
    expect(res.message).toContain("<svg");
  });

  // ── Ce que la bibliothèque ne doit plus dire à l'utilisateur ──
  //
  // LE DÉFAUT, MESURÉ DANS L'APPLICATION AVANT D'ÊTRE ÉCRIT ICI. Les quatre sorties nommées
  // « Notation » du catalogue — accords joués, gamme jouée, accords vers notation et grille
  // d'accords — écrivent toutes le format de « Texte → MIDI », où la durée est un jeton à part.
  // Branchées sur la portée, elles donnaient « [RuntimeError] IncompleteVoice: Voice does not
  // have enough notes. », huit fois sur huit, au lieu d'un refus. Un jeton sans barre de fraction
  // recevait une noire par défaut : le texte étranger traversait l'analyse en se changeant en notes
  // plausibles, et c'est VexFlow qui s'arrêtait ensuite.

  it("REFUSE la notation de « Texte → MIDI » en nommant le jeton fautif", async () => {
    const f = trouver("vexflow-portee")!;
    const res = await f.executer(ctxSimple("Tempo 90\nC4+E4+G4 2.000") as any);
    expect(res.erreur).toBe(true);
    expect(res.message, "le jeton fautif doit être nommé").toContain("Tempo");
    expect(res.message, "et la forme attendue aussi").toContain("C4/q");
    expect(res.message).not.toContain("IncompleteVoice");
  });

  it("LA TABLATURE REFUSE AU LIEU DE GRAVER « NaN »", async () => {
    // LE DÉFAUT, MESURÉ DANS L'APPLICATION. Nourri du même texte étranger, ce nœud annonçait
    // « Terminé » et gravait QUATRE « NaN » sur la portée : `parseInt` d'un mot rend NaN, et
    // personne ne regardait le résultat. Le garde qui comptait les notes ne pouvait rien voir, un
    // jeton produisant toujours une note.
    const f = trouver("vexflow-tab")!;
    const res = await f.executer(ctxSimple("Tempo 90\nC4+E4+G4 2.000") as any);
    expect(res.erreur).toBe(true);
    expect(res.message, "le jeton fautif doit être nommé").toContain("Tempo");
    expect(res.message, "et la forme attendue aussi").toContain("6-3/q");
    expect(res.message).not.toContain("NaN");
  });

  it("ET LA GRILLE REFUSE AU LIEU DE DESSINER DES MESURES VIDES", async () => {
    // MÊME MESURE : quatre-vingts éléments dessinés, pas un seul texte, et « Terminé ». Tonal rend
    // la CHAÎNE VIDE pour un symbole inconnu, et `?? ` ne se déclenche pas dessus ; les portées
    // suffisaient à rendre le SVG non vide, donc le garde « aucun accord valide » ne voyait rien.
    const f = trouver("vexflow-grille")!;
    const res = await f.executer(ctxSimple("Tempo 90\nC4+E4+G4 2.000") as any);
    expect(res.erreur).toBe(true);
    expect(res.message).toContain("Tempo");
    expect(res.message).toContain("C Am F G");
  });

  it("LES TROIS GRAVEURS RENDENT AUSSI LEUR SVG EN FICHIER, et l'export peut donc les lire", async () => {
    // LE TROU QUE CE CAS FERME, MESURÉ DANS L'APPLICATION. « Export SVG » écrit un fichier et son
    // entrée est de type image ; ces nœuds ne rendaient qu'une chaîne. Graver une partition et en
    // sauvegarder le SVG était impossible dans un seul graphe : « connexion illégale : texte →
    // image ». DÉFAUT REPLANTÉ en retirant la seconde sortie d'un des graveurs : ce cas le nomme.
    for (const id of ["vexflow-portee", "vexflow-tab", "vexflow-grille"]) {
      const f = trouver(id)!;
      expect(f.sorties.map((s: any) => s.type), id).toEqual(["texte", "image"]);
      const res = await f.executer(ctxSimple(null) as any);
      expect(typeof res.valeurs[0], id).toBe("string");
      const fichier = res.valeurs[1] as File;
      expect(fichier, id).toBeInstanceOf(File);
      expect(fichier.type, id).toBe("image/svg+xml");
      expect(fichier.name.endsWith(".svg"), id).toBe(true);
      // LE FICHIER PORTE LE MÊME SVG QUE LA CHAÎNE, et non une seconde gravure : c'est la même
      // image dans deux porteurs, ce que les deux ports disent en portant le même nom.
      expect(await fichier.text(), id).toBe(res.valeurs[0]);
    }
  });

  it("et un refus rend DEUX valeurs nulles, une par sortie déclarée", async () => {
    // SANS CE CAS, UN REFUS LAISSERAIT LA SECONDE SORTIE INDÉFINIE plutôt que nulle, et un nœud en
    // aval recevrait `undefined` au lieu de rien.
    const f = trouver("vexflow-portee")!;
    const res = await f.executer(ctxSimple("Tempo 90\nC4+E4+G4 2.000") as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs).toEqual([null, null]);
  });

  it("les deux reconnaisseurs laissent passer ce qui est valide", () => {
    // SANS CES DEUX-CI, UN REFUS QUI REFUSE TOUT PASSERAIT : les cas de succès ci-dessus tournent
    // sur les valeurs par défaut, et c'est l'entrée BRANCHÉE que ces refus interceptent.
    expect(jetonsSansCordeFret("6-3/q 5-0/q 5-2/q 4-0/q 5-3/q")).toEqual([]);
    expect(jetonsSansCordeFret("Tempo 90 2.000")).toEqual(["Tempo", "90", "2.000"]);
    expect(accordsInconnus(["C", "Am", "F", "G"])).toEqual([]);
    expect(accordsInconnus(["Tempo", "90", "C4+E4+G4"])).toEqual(["Tempo", "90", "C4+E4+G4"]);
  });

  it("jetonsSansDuree ne se trompe pas sur un accord entre parenthèses", () => {
    // LA BARRE SE CHERCHE HORS DES PARENTHÈSES, et c'est pourquoi la recherche est partagée avec
    // l'analyseur : deux lecteurs du même jeton ne doivent pas se répondre différemment.
    expect(jetonsSansDuree("C4/q (C4 E4 G4)/h B4/q/r")).toEqual([]);
    expect(jetonsSansDuree("Tempo 90 C4+E4+G4 2.000")).toEqual(["Tempo", "90", "C4+E4+G4", "2.000"]);
  });

  it("vexflow-portee affiche les accords et la syntaxe plus", async () => {
    const f = trouver("vexflow-portee")!;
    const ctx = ctxDEssai(["C4+E4+G4/q (C4 E4 G4)/h B4/q/r"]);
    const res = await f.executer(ctx as any);
    expect(res.message).toContain("<svg");
  });
});

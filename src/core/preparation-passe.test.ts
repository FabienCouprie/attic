// core/preparation-passe.test.ts — La préparation d'une passe, pure, décide ce que décidait le bloc du
// moteur qu'elle remplace : même ordre, même périmètre, mêmes statuts, mêmes avertissements.
//
// LE TÉMOIN EST L'ANCIEN BLOC, recopié tel quel depuis `useExecutionGraphe.ts`, ses effets de bord
// captés dans des listes : `definirStatut` et `console.warn` y écrivaient, `console.log` y traçait
// l'ordre. Trois graphes, ceux que la préparation sait déplier : une chaîne avec un décoratif, un
// orphelin et un dernier ; une boucle de graphe à deux tours ; un instrument. Et trois demandes :
// le run global, le run ciblé qui n'embrasse que l'amont, la relance qui embrasse l'aval.
import { describe, expect, it } from "vitest";

import { deplierBoucles, FICHE_DEBUT, FICHE_FIN } from "./boucle-graphe";
import { estBulle, estSubstitution } from "./bulles";
import { conteneurs } from "./conteneurs";
import { grapheSansConteneurs } from "./formes-graphe";
import { noeudsEnCycle, ordreTopologique, perimetreCible, placerEnDernier } from "./graphe";
import { deplierInstruments, FICHE_FIN as FICHE_INSTRUMENT_FIN, FICHE_NOTE } from "./instrument-graphe";
import { aplatirGraphe, type AreteG, type NoeudG } from "./meta";
import { preparerLaPasse, type EntreesDePreparation, type FicheDePreparation } from "./preparation-passe";
import { validerGraphe } from "./validation";

const audio = (nom: string) => ({ nom, type: "audio" });
const FICHES: Record<string, FicheDePreparation> = {
  src: { entrees: [], sorties: [audio("Audio")] },
  fx: { entrees: [audio("Audio")], sorties: [audio("Audio")] },
  out: { entrees: [audio("Audio")], sorties: [], executerEnDernier: true },
  comment: { entrees: [], sorties: [] },
  [FICHE_DEBUT]: { entrees: [audio("Audio")], sorties: [audio("Audio")] },
  [FICHE_FIN]: { entrees: [audio("Audio")], sorties: [audio("Audio")] },
  [FICHE_NOTE]: { entrees: [], sorties: [audio("Audio")] },
  [FICHE_INSTRUMENT_FIN]: { entrees: [audio("Audio")], sorties: [audio("Audio")] },
} as Record<string, FicheDePreparation>;
const trouverDef = (id: string) => FICHES[id];
const trouverMeta = () => undefined;
const fluxCompatibles = (s: string, c: string) => s === c;
const t = (cle: string) => `<${cle}>`;

const n = (id: string, ficheId: string, parametres: Record<string, number | string> = {}): NoeudG =>
  ({ id, data: { ficheId, parametres } } as unknown as NoeudG);
const a = (source: string, target: string): AreteG =>
  ({ id: `${source}-${target}`, source, target, sourceHandle: "out:0", targetHandle: "in:0" } as AreteG);

const CHAINE = {
  noeuds: [n("src", "src"), n("fx", "fx"), n("out", "out"), n("note", "comment"), n("seul", "fx")],
  aretes: [a("src", "fx"), a("fx", "out")],
};
const BOUCLE = {
  noeuds: [n("src", "src"), n("debut", FICHE_DEBUT, { Tours: 2 }), n("fx", "fx"), n("fin", FICHE_FIN), n("out", "out")],
  aretes: [a("src", "debut"), a("debut", "fx"), a("fx", "fin"), a("fin", "out")],
};
const INSTRUMENT = {
  noeuds: [n("note", FICHE_NOTE), n("fx", "fx"), n("ifin", FICHE_INSTRUMENT_FIN), n("out", "out")],
  aretes: [a("note", "fx"), a("fx", "ifin"), a("ifin", "out")],
};

/** L'ancien bloc du moteur, à l'identique, ses effets de bord captés. */
function ancienPlan({ noeuds, aretes, prioriteDemandee, versLAval }: Pick<EntreesDePreparation, "noeuds" | "aretes" | "prioriteDemandee" | "versLAval">) {
  const statuts: { id: string; statut: string; progression?: string }[] = [];
  const avertissements: string[] = [];
  const definirStatut = (id: string, statut: string, progression?: string) => { statuts.push({ id, statut, progression }); };
  const aretesReelles = aretes.filter((x) => !estSubstitution(x));
  const plat = aplatirGraphe(noeuds, aretesReelles, trouverMeta);
  const aDocumenter = grapheSansConteneurs(noeuds, aretesReelles, trouverMeta, estBulle);
  for (const id of aDocumenter.conteneursRetires) avertissements.push(`[attic] Documentation : conteneur non dépliable retiré (${id})`);
  const instruments = deplierInstruments(plat.noeuds, plat.aretes);
  for (const [copie, origine] of instruments.origines) plat.expansions.set(copie, plat.expansions.get(origine) ?? origine);
  for (const p of instruments.problemes) avertissements.push(`[attic] Instrument de graphe : ${p.code} sur ${p.noeudId}`);
  plat.noeuds = instruments.noeuds;
  plat.aretes = instruments.aretes;
  const deplie = deplierBoucles(plat.noeuds, plat.aretes);
  for (const [copie, origine] of deplie.origines) plat.expansions.set(copie, plat.expansions.get(origine) ?? origine);
  for (const p of deplie.problemes) avertissements.push(`[attic] Boucle de graphe : ${p.code} sur ${p.noeudId}`);
  for (const d of deplie.depliees) {
    const dits = [t("boucle.depliee").replace("{n}", String(d.tours))];
    if (d.entreesDuDehors > 0) dits.push(t("boucle.entrees").replace("{n}", String(d.entreesDuDehors)));
    if (d.sortiesVersDehors > 0) dits.push(t("boucle.sorties").replace("{n}", String(d.sortiesVersDehors)));
    definirStatut(d.debutId, "attente", dits.join(" · "));
  }
  const nds = deplie.noeuds;
  const boites = conteneurs(noeuds, (id) => plat.expansions.get(id) ?? id, () => !!trouverMeta());
  const estDernier = (id: string) => trouverDef((deplie.noeuds.find((x) => x.id === id)?.data as { ficheId?: string } | undefined)?.ficheId as string)?.executerEnDernier === true;
  const priorite = prioriteDemandee && estDernier(prioriteDemandee) ? undefined : prioriteDemandee;
  const aretesG = deplie.aretes;
  const ordonnees = placerEnDernier(ordreTopologique(nds.map((x) => x.id), aretesG), estDernier, aretesG);
  let ordreFiltre = ordonnees;
  let ancPriorite: Set<string> | null = null;
  if (priorite) {
    const contenu = boites.contenu(priorite, ordonnees);
    const cibles = contenu.length > 0 ? contenu : [priorite];
    const anc = perimetreCible(cibles, aretesG, versLAval);
    ancPriorite = anc;
    ordreFiltre = ordonnees.filter((id) => anc.has(id));
  }
  const traceOrdre = "[ordre] priorite=" + priorite + " ordreFiltre=" + ordreFiltre.map((id) => id + "(" + (nds.find((x) => x.id === id)?.data?.ficheId ?? "?") + ")").join(", ");
  const validation = validerGraphe(nds, aretesG, (ficheId) => trouverDef(ficheId), fluxCompatibles);
  const noeudsEnErreur = new Set<string>();
  for (const [nodeId, msgs] of validation.noeudsAffectes) {
    if (ancPriorite && !ancPriorite.has(nodeId)) continue;
    noeudsEnErreur.add(nodeId);
    definirStatut(nodeId, "erreur", msgs[0]);
  }
  for (const id of noeudsEnCycle(nds.map((x) => x.id), aretesG)) {
    if (ancPriorite && !ancPriorite.has(id)) continue;
    if (noeudsEnErreur.has(id)) continue;
    noeudsEnErreur.add(id);
    definirStatut(id, "erreur", t("erreur.cycle"));
  }
  const idsDecoratifs = new Set(nds.filter((x) => x.data?.ficheId === "comment" || x.data?.ficheId === "frame" || estBulle(x.data?.ficheId)).map((x) => x.id));
  ordreFiltre = ordreFiltre.filter((id) => !idsDecoratifs.has(id));
  for (const id of ordreFiltre) if (!noeudsEnErreur.has(id)) definirStatut(id, "attente");
  for (const c of boites.ids) if (!noeudsEnErreur.has(c) && boites.contenu(c, ordreFiltre).length > 0) definirStatut(c, "en_cours");
  return { ordonnees, ordreFiltre, ancPriorite, noeudsEnErreur, idsDecoratifs, statuts, avertissements, traceOrdre,
    nds: nds.map((x) => x.id), aretesG: aretesG.map((x) => x.id), expansions: [...plat.expansions], origines: [...deplie.origines],
    aDocumenter: aDocumenter.noeuds.map((x) => x.id), boites: boites.ids };
}

const DEMANDES: { prioriteDemandee: string | null; versLAval: boolean }[] = [
  { prioriteDemandee: null, versLAval: false },
  { prioriteDemandee: "fx", versLAval: false },
  { prioriteDemandee: "fx", versLAval: true },
  { prioriteDemandee: "out", versLAval: false },
];

const comparable = (p: ReturnType<typeof preparerLaPasse>) => ({
  ordonnees: p.ordonnees, ordreFiltre: p.ordreFiltre, ancPriorite: p.ancPriorite, noeudsEnErreur: p.noeudsEnErreur,
  idsDecoratifs: p.idsDecoratifs, statuts: p.statuts, avertissements: p.avertissements, traceOrdre: p.traceOrdre,
  nds: p.nds.map((x) => x.id), aretesG: p.aretesG.map((x) => x.id), expansions: [...p.plat.expansions], origines: [...p.deplie.origines],
  aDocumenter: p.aDocumenter.noeuds.map((x) => x.id), boites: p.boites.ids,
});

describe("la préparation d'une passe, pure, contre l'ancien bloc du moteur", () => {
  for (const [nom, graphe] of Object.entries({ CHAINE, BOUCLE, INSTRUMENT })) {
    for (const demande of DEMANDES) {
      it(`${nom.toLowerCase()} · priorité ${demande.prioriteDemandee ?? "aucune"}${demande.versLAval ? " vers l'aval" : ""}`, () => {
        const entrees = { ...graphe, ...demande, trouverMeta, trouverDef, fluxCompatibles, t };
        expect(comparable(preparerLaPasse(entrees))).toEqual(ancienPlan(entrees));
      });
    }
  }

  it("dit ce qu'elle décide : l'orphelin en erreur, le décoratif écarté, le dernier en dernier", () => {
    const p = preparerLaPasse({ ...CHAINE, prioriteDemandee: null, versLAval: false, trouverMeta, trouverDef, fluxCompatibles, t });
    expect(p.noeudsEnErreur.has("seul")).toBe(true);
    expect(p.idsDecoratifs.has("note")).toBe(true);
    expect(p.ordreFiltre.at(-1)).toBe("out");
    expect(p.statuts.some((s) => s.id === "seul" && s.statut === "erreur")).toBe(true);
    expect(p.statuts.filter((s) => s.statut === "attente").map((s) => s.id)).toEqual(["src", "fx", "out"]);
  });

  it("un run ciblé sur le dernier devient un run global, et vers l'aval embrasse l'aval", () => {
    const base = { ...CHAINE, trouverMeta, trouverDef, fluxCompatibles, t };
    expect(preparerLaPasse({ ...base, prioriteDemandee: "out", versLAval: false }).ancPriorite).toBeNull();
    expect([...preparerLaPasse({ ...base, prioriteDemandee: "fx", versLAval: false }).ancPriorite!]).toEqual(["fx", "src"]);
    expect([...preparerLaPasse({ ...base, prioriteDemandee: "fx", versLAval: true }).ancPriorite!].sort()).toEqual(["fx", "out", "src"]);
  });

  it("une boucle à deux tours est dépliée, et son début le dit", () => {
    const p = preparerLaPasse({ ...BOUCLE, prioriteDemandee: null, versLAval: false, trouverMeta, trouverDef, fluxCompatibles, t });
    expect(p.deplie.depliees.map((d) => d.tours)).toEqual([2]);
    expect(p.statuts[0]).toEqual({ id: "debut", statut: "attente", progression: "<boucle.depliee>" });
    expect(p.nds.filter((x) => p.deplie.origines.get(x.id) === "fx")).toHaveLength(2);
  });
});

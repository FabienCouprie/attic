// refus-du-registre.ts — Ce que la personne lit quand le registre refuse une fiche qu'on lui apporte.
//
// POURQUOI CE MODULE. Le registre dit ses refus à la console, en français, et rend leur forme à
// l'appelant (`Inscription`, `FauteDeFiche`). Deux chemins apportent des fiches reçues d'ailleurs :
// l'import d'un nœud en `.zip` (`plugins/gestion-nodes.ts`) et l'ouverture d'un projet qui porte ses
// méta-composants (`ui/hooks/useImportProjet.ts`). Les deux doivent dire le refus dans la langue de
// la personne, et le dire de la même façon.
//
// IL EST À CÔTÉ D'`i18n.tsx`, ET NON DANS `ui/`. Le premier est un exécuteur, et
// `docs/frontiere-domaine.test.ts` refuse qu'un exécuteur prenne une valeur à l'interface : son
// résultat dépendrait de l'écran. Traduire un texte n'en dépend pas, et c'est le métier d'`i18n.tsx`,
// que tous les exécuteurs lisent déjà.
import type { FauteDeFiche, InscriptionInjectee } from "./core";
import { traduire } from "./i18n";

/** Un refus du registre, rendu à qui lui apportait une fiche. */
export type RefusDuRegistre = Exclude<InscriptionInjectee, { inscrite: true }>;

/** Une faute d'une fiche invalide, dans la langue de la personne. */
export function decrireFaute(f: FauteDeFiche): string {
  switch (f.code) {
    case "id-manquant": return traduire("msg.faute_fiche.id_manquant");
    case "nom-manquant": return traduire("msg.faute_fiche.nom_manquant");
    case "resume-manquant": return traduire("msg.faute_fiche.resume_manquant");
    case "executer-manquant": return traduire("msg.faute_fiche.executer_manquant");
    case "port-sans-type": return traduire("msg.faute_fiche.port_sans_type", f.port);
    case "type-inconnu": return traduire("msg.faute_fiche.type_inconnu", f.port, f.type);
    case "parametre-hors-empreinte": return traduire("msg.faute_fiche.parametre_hors_empreinte", f.parametre);
  }
}

/** Les éléments d'une énumération, séparés comme la langue de la personne les sépare. */
const enumerer = (elements: string[]): string => elements.join(traduire("liste.separateur"));

/** Toutes les fautes d'une fiche invalide, en une phrase. */
export const decrireFautes = (fautes: FauteDeFiche[]): string => enumerer(fautes.map(decrireFaute));

/** Un méta-composant refusé, et pourquoi, en quelques mots. */
function raisonDuMetaRefuse(id: string, refus: RefusDuRegistre): string {
  switch (refus.raison) {
    case "natif": return traduire("persistance.metaRefuse.natif", id);
    case "alias": return traduire("persistance.metaRefuse.alias", id, refus.cible);
    case "invalide": return traduire("persistance.metaRefuse.invalide", id, decrireFautes(refus.fautes));
    case "sans-registre": return traduire("persistance.metaRefuse.sansRegistre", id);
  }
}

/**
 * Le message qui dit les méta-composants que le registre a refusés, ou `null`.
 *
 * UN MÉTA REFUSÉ N'EST PAS CHARGÉ, et la personne doit savoir pourquoi le catalogue ne le montre
 * pas : sous l'identifiant d'un natif ou d'un alias, les nœuds du graphe qui le portent ouvrent la
 * fiche existante et non ce méta.
 *
 * DEUX PROVENANCES : un projet qu'on ouvre (`fichier`), ou les métas gardés par l'application, au
 * démarrage (`stockage`). Le second dit aussi ce que devient leur clé : voir `ui/metasLocaux.ts`.
 */
export function messageMetasRefuses(refuses: { id: string; refus: RefusDuRegistre }[],
  provenance: "fichier" | "stockage" = "fichier"): string | null {
  if (refuses.length === 0) return null;
  return traduire(provenance === "fichier" ? "persistance.metasRefuses" : "persistance.metasGardesRefuses",
    refuses.length, enumerer(refuses.map((r) => raisonDuMetaRefuse(r.id, r.refus))));
}

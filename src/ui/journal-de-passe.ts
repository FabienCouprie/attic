// ui/journal-de-passe.ts — Le journal des écritures d'une passe dans les trois magasins, armé par une spec.
//
// POURQUOI CE MODULE. Le chantier de l'architecture par messages déplace qui écrit dans les magasins
// des statuts, des résultats et de la priorité : la boucle, le ménage d'après passe et le correctif
// passeront derrière une frontière, et chacune de ses pièces se dit sans changement de comportement.
// Ce que l'interface montre d'une passe, c'est la suite de ces écritures : quel nœud, quels champs,
// dans quel ordre. Ce module la relève, et `tests-e2e/journal-de-passe.spec.ts` la compare à une
// référence enregistrée. Les empreintes d'exemples surveillent le son ; elles ne voient pas un
// résultat posé avant son temps ni un statut dans le mauvais ordre.
//
// IL EST ARMÉ PAR L'APPLICATION, ET NON PAR LA SPEC. Un `import()` lancé depuis la page rend le
// module que la page a DÉJÀ chargé, pas celui du disque, et une sonde ainsi importée relèverait ce
// qu'une version d'avant écrivait. La spec pose donc une globale avant le chargement, et ce module,
// importé par `main.tsx` avant l'application, la lit au moment d'être évalué. Sans elle il ne
// s'abonne à rien, et les trois magasins ne paient que la lecture d'une taille par écriture.
//
// CE QU'IL RELÈVE : chaque écriture qui change quelque chose, au moment où elle a lieu. Les états de
// statut tels quels, et pour un résultat les champs posés et retirés, chaque valeur DÉCRITE en
// texte : un `AudioBuffer` ne traverse pas `page.evaluate`, sa forme si. Ce qu'il ne fait pas :
// trier ce qui varie d'une passe à l'autre. Les adresses `blob:`, les durées et l'avancement des
// lecteurs se retirent dans la spec, où se voit ce qu'on choisit de ne pas surveiller.
import { surEcriture as surEcriturePriorite } from "./priorite";
import { surEcriture as surEcritureResultat, type ResultatNoeud } from "./resultats";
import { surEcriture as surEcritureStatut, type EtatNoeud } from "./statuts";

/** Une écriture relevée, en données que `page.evaluate` peut rendre. */
export type EntreeDuJournal =
  | { magasin: "statuts"; id: string; avant: EtatNoeud; apres: EtatNoeud }
  | { magasin: "resultats"; id: string; poses: Record<string, string>; ajoutes: string[]; retires: string[] }
  | { magasin: "priorite"; avant: string | null; apres: string | null };

/** La globale que la spec pose avant le chargement de la page : un tableau vide. */
const PORTEE = globalThis as unknown as { __attic_journal_de_passe__?: unknown };

/** Au-delà, une chaîne est coupée : un message se lit à son début, une adresse `data:` aussi. */
const LONGUEUR_MAX = 200;

/**
 * Une valeur rendue en texte, assez pour dire qu'elle a changé de forme et pas davantage.
 *
 * UN TAMPON SE DIT PAR SES CANAUX, SA LONGUEUR ET SON TAUX : deux tampons de même forme sont le même
 * résultat pour ce journal, et c'est aux empreintes de dire s'ils sonnent pareil.
 */
export function decrire(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") {
    return JSON.stringify(v.length > LONGUEUR_MAX ? `${v.slice(0, LONGUEUR_MAX)}…` : v);
  }
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (typeof v === "function") return "fonction";
  if (typeof v !== "object") return typeof v;
  if (typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer) {
    return `AudioBuffer(${v.numberOfChannels}×${v.length}@${v.sampleRate})`;
  }
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (ArrayBuffer.isView(v)) return `${v.constructor.name}(${v.byteLength} o)`;
  if (typeof Blob !== "undefined" && v instanceof Blob) return `${v.constructor.name}(${v.type || "?"})`;
  const nom = (Object.getPrototypeOf(v) as { constructor?: { name?: string } } | null)?.constructor?.name;
  if (nom && nom !== "Object") return nom;
  return `{${Object.keys(v).sort().join(",")}}`;
}

/**
 * Les champs qu'une écriture a posés ou changés, décrits ; parmi eux, ceux qui n'étaient pas là ; et
 * ceux qu'elle a retirés.
 *
 * `ajoutes` DISTINGUE LA PREMIÈRE POSE D'UN CHAMP DE SA RÉÉCRITURE. Une durée réécrite à l'identique
 * n'est pas une écriture, et cela dépend de l'horloge ; sa première pose, elle, a toujours lieu.
 */
function difference(avant: ResultatNoeud, apres: ResultatNoeud) {
  const poses: Record<string, string> = {};
  const ajoutes: string[] = [];
  for (const [cle, val] of Object.entries(apres)) {
    if (!(cle in avant)) ajoutes.push(cle);
    if (!(cle in avant) || avant[cle] !== val) poses[cle] = decrire(val);
  }
  const retires = Object.keys(avant).filter((cle) => !(cle in apres));
  return { poses, ajoutes, retires };
}

/**
 * Abonne le journal aux trois magasins quand on lui donne un tableau, et rend de quoi le désarmer.
 *
 * SANS ARGUMENT, IL LIT LA GLOBALE DE LA SPEC, et c'est ainsi qu'il est appelé au chargement de ce
 * module. Ne rend rien quand il n'y a rien à armer.
 */
export function armerLeJournalDePasse(journal: unknown = PORTEE.__attic_journal_de_passe__): (() => void) | null {
  if (!Array.isArray(journal)) return null;
  const noter = (e: EntreeDuJournal) => { journal.push(e); };
  const retirer = [
    surEcritureStatut((id, avant, apres) => noter({ magasin: "statuts", id, avant: { ...avant }, apres: { ...apres } })),
    surEcritureResultat((id, avant, apres) => noter({ magasin: "resultats", id, ...difference(avant, apres) })),
    surEcriturePriorite((avant, apres) => noter({ magasin: "priorite", avant, apres })),
  ];
  return () => { for (const r of retirer) r(); };
}

armerLeJournalDePasse();

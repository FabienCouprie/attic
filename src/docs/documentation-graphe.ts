// docs/documentation-graphe.ts — La documentation d'UN graphe, pour un agent et pour un humain.
//
// Le catalogue voisin (`catalogue-markdown.ts`) documente tous les composants d'Attic, en
// général. Ce module-ci documente un graphe PARTICULIER : celui qui est sur la table. La
// différence est tout le sujet. Un agent à qui l'on confie « le synthétiseur soustractif »
// n'a pas besoin des deux cent quatre-vingt-dix-huit nœuds de l'application ; il a besoin
// des huit qui composent ce synthétiseur, de leurs VALEURS RÉGLÉES — et non de leurs valeurs
// par défaut —, de la façon dont ils sont câblés, de l'ordre dans lequel ils s'exécutent, et
// de la notice de chacun. Le reste est du bruit qui lui coûte sa fenêtre de contexte.
//
// Trois sorties depuis un seul modèle, parce que deux publics ne lisent pas la même chose :
//
//  - `documentationVersMarkdown` pour un agent : du texte, dense, sans mise en forme à
//    interpréter, et l'ordre d'exécution avant les notices ;
//  - `documentationVersHtml` pour un humain : un site d'une seule page, sommaire à gauche,
//    schéma du graphe dessiné aux POSITIONS RÉELLES des nœuds — celui qui lit la page
//    reconnaît ainsi ce qu'il a sous les yeux dans l'application ;
//  - le JSON du graphe, tel qu'Attic l'enregistre, pour qu'il soit rejouable.
//
// La génération est PURE : ni date, ni version, ni hasard. Deux documentations du même graphe
// donnent le même texte, ce qui permet de la mettre sous contrôle de version à côté du
// graphe et de voir ce qui change quand on touche à un réglage.
//
// Ce que ce module ne fait PAS, et qu'il vaut mieux dire : il ne documente pas le code source
// des nœuds. La documentation d'un nœud est sa notice, ses ports et ses paramètres, c'est-à-dire
// ce que le registre porte — l'application livrée ne contient pas ses sources TypeScript, et
// une documentation qui promettrait le code ne pourrait pas la tenir.

import type { AreteG, NoeudG } from "../core/meta";
import type { FicheAudio } from "../audio/types-domaine";
import { ordreTopologique } from "../core/graphe";

export type Langue = "fr" | "en";

type Param = FicheAudio["parametres"][number];
type Port = FicheAudio["entrees"][number];

/** Un paramètre tel qu'il est RÉGLÉ dans le graphe, avec ce qu'il aurait valu sans réglage. */
export interface ParametreDoc {
  nom: string;
  type: string;
  /** La valeur en vigueur, mise en forme pour être lue. */
  valeur: string;
  /** La valeur par défaut de la fiche, pour situer celle-ci. */
  defaut: string;
  /** Vrai si le graphe laisse le défaut : un agent lit d'abord ce qui a été choisi. */
  parDefaut: boolean;
  /** Vrai si la valeur est trop longue ou trop multiligne pour une cellule de tableau. */
  bloc: boolean;
  unite?: string;
  valeurs?: string;
  doc?: string;
}

/** Un bout de câble, vu d'un port. */
export interface LienDoc {
  noeud: string;
  nomNoeud: string;
  port: string;
}

export interface PortDoc {
  nom: string;
  type: string;
  requis: boolean;
  liens: LienDoc[];
}

/** Un nœud du graphe, avec ce qui le distingue de sa fiche : son id, ses valeurs, ses câbles. */
export interface NoeudDoc {
  id: string;
  ficheId: string;
  nom: string;
  univers: string;
  famille: string;
  resume: string;
  parametres: ParametreDoc[];
  entrees: PortDoc[];
  sorties: PortDoc[];
  /** Le registre ne connaît pas cette fiche : graphe d'une autre version, ou greffon absent. */
  inconnu: boolean;
}

/** Une fiche employée par le graphe, documentée une fois pour toutes ses instances. */
export interface ComposantDoc {
  ficheId: string;
  nom: string;
  univers: string;
  famille: string;
  resume: string;
  notice?: string;
  entrees: { nom: string; type: string; requis: boolean }[];
  sorties: { nom: string; type: string }[];
  parametres: { nom: string; type: string; defaut: string; valeurs?: string; doc?: string }[];
  /** Combien de fois ce composant est posé dans le graphe. */
  compte: number;
}

/** Une boîte du schéma, aux coordonnées du graphe. */
export interface BoiteDoc {
  id: string;
  nom: string;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export interface DocumentationGraphe {
  titre: string;
  langue: Langue;
  compte: { noeuds: number; aretes: number; composants: number };
  /** Ordre topologique : une source avant ses cibles. C'est l'ordre d'exécution du moteur. */
  ordre: string[];
  noeuds: NoeudDoc[];
  composants: ComposantDoc[];
  /** Les nœuds sans entrée connectée — par où le graphe commence. */
  sources: string[];
  /** Les nœuds dont aucune sortie n'est branchée — où il aboutit. */
  terminaux: string[];
  typesFlux: { type: string; libelle: string; compte: number }[];
  /** Ce qui empêcherait le graphe de tourner, ou qui mérite un œil. */
  avertissements: string[];
  /** Le graphe tel qu'Attic l'enregistre, pour qu'il soit rejouable. */
  json: string;
  schema: BoiteDoc[];
}

export interface OptionsDocumentation {
  noeuds: NoeudG[];
  aretes: AreteG[];
  fiches: FicheAudio[];
  langue?: Langue;
  titre?: string;
  /** Les notices entières, ou les seuls résumés. Entières pour un agent. */
  notices?: boolean;
  /** Libellé lisible d'un type de flux ; le registre le connaît, ce module non. */
  libelleFlux?: (type: string) => string;
}

// ── Ce qui dépend de la langue ───────────────────────────────────────────────────

const choisir = (langue: Langue, fr: string | undefined, en: string | undefined): string =>
  ((langue === "en" ? en ?? fr : fr ?? en) ?? "").trim();

const MOTS = {
  fr: {
    titre: "Documentation du graphe", noeuds: "nœuds", aretes: "connexions", composants: "composants",
    ordre: "Ordre d'exécution", schema: "Schéma", graphe: "Le graphe", reference: "Les composants",
    parametres: "Paramètres", entrees: "Entrées", sorties: "Sorties", valeur: "Valeur",
    defaut: "Défaut", plage: "Valeurs", role: "Rôle", type: "Type", port: "Port", de: "vient de",
    vers: "va vers", libre: "libre", requis: "requis", facultatif: "facultatif",
    avertissements: "Avertissements", json: "Le graphe en JSON", sources: "Points de départ",
    terminaux: "Aboutissements", flux: "Types de flux employés", resume: "Résumé",
    notice: "Notice", pose: "posé", fois: "fois", reglages: "Réglages non standard",
    inconnu: "composant inconnu du registre", cycle: "Le graphe contient un cycle : une boucle de graphe, ou un câblage circulaire.",
    portVide: "entrée obligatoire non connectée", aucunNoeud: "Le graphe est vide.",
    sommaire: "Sommaire", presentation: "Présentation", parDefaut: "par défaut",
    exemplaires: "exemplaires", commentLire: "Comment lire ce document",
  },
  en: {
    titre: "Graph documentation", noeuds: "nodes", aretes: "connections", composants: "components",
    ordre: "Execution order", schema: "Diagram", graphe: "The graph", reference: "The components",
    parametres: "Parameters", entrees: "Inputs", sorties: "Outputs", valeur: "Value",
    defaut: "Default", plage: "Values", role: "Role", type: "Type", port: "Port", de: "comes from",
    vers: "goes to", libre: "free", requis: "required", facultatif: "optional",
    avertissements: "Warnings", json: "The graph as JSON", sources: "Starting points",
    terminaux: "End points", flux: "Flow types used", resume: "Summary",
    notice: "Notice", pose: "placed", fois: "times", reglages: "Non-default settings",
    inconnu: "component unknown to the registry", cycle: "The graph holds a cycle: a graph loop, or circular wiring.",
    portVide: "required input not connected", aucunNoeud: "The graph is empty.",
    sommaire: "Contents", presentation: "Overview", parDefaut: "default",
    exemplaires: "instances", commentLire: "How to read this document",
  },
} as const;

// ── Mise en forme des valeurs ────────────────────────────────────────────────────

/**
 * La valeur d'un choix, dans la langue du document.
 *
 * Un « choix » se stocke tantôt par son identifiant interne, tantôt par son libellé français,
 * tantôt par l'anglais — les trois formes existent dans les graphes enregistrés, et c'est
 * `valeurCanoniqueChoix` qui les réconcilie côté moteur. Ici on cherche le rang de la valeur
 * dans l'une des trois listes, et l'on rend le libellé de la langue demandée.
 */
function libelleChoix(p: Param, brut: unknown, langue: Langue): string {
  const cible = String(brut ?? "");
  const affichees = (langue === "en" ? p.optionsEn ?? p.options : p.options) ?? [];
  for (const liste of [p.optionIds, p.options, p.optionsEn]) {
    const i = (liste ?? []).indexOf(cible);
    if (i >= 0 && affichees[i] !== undefined) return affichees[i];
  }
  return cible;
}

function valeurLisible(p: Param, brut: unknown, langue: Langue): string {
  const type = p.type ?? "nombre";
  if (type === "choix") return libelleChoix(p, brut, langue);
  if (brut === "" || brut === undefined || brut === null) return "—";
  const unite = langue === "en" ? p.uniteEn ?? p.unite : p.unite;
  if (typeof brut === "number") return `${brut}${unite ? ` ${unite}` : ""}`;
  return String(brut);
}

/** Les valeurs admises, pour qu'un agent sache ce qu'il peut écrire. */
function plageLisible(p: Param, langue: Langue): string | undefined {
  const type = p.type ?? "nombre";
  if (type === "choix") return ((langue === "en" ? p.optionsEn ?? p.options : p.options) ?? []).join(" / ");
  if (p.plage) {
    const unite = langue === "en" ? p.uniteEn ?? p.unite : p.unite;
    return `${p.plage[0]} – ${p.plage[1]}${unite ? ` ${unite}` : ""}${p.pas !== undefined ? `, pas ${p.pas}` : ""}`;
  }
  return undefined;
}

/**
 * Une valeur mérite-t-elle son propre bloc plutôt qu'une cellule de tableau ?
 *
 * Un orchestre Csound, un programme, une liste de notes : ce sont des valeurs de plusieurs
 * lignes, et les aplatir dans une cellule les rend illisibles — or c'est justement ce qu'un
 * agent doit recevoir intact pour comprendre le graphe.
 */
const estBloc = (valeur: string): boolean => valeur.includes("\n") || valeur.length > 80;

// ── Le modèle ────────────────────────────────────────────────────────────────────

const rang = (poignee: string | null | undefined, defaut: number): number => {
  const n = parseInt(String(poignee ?? "").split(":")[1] ?? "", 10);
  return Number.isFinite(n) ? n : defaut;
};

export function documenterGraphe(o: OptionsDocumentation): DocumentationGraphe {
  const langue: Langue = o.langue ?? "fr";
  const m = MOTS[langue];
  const notices = o.notices !== false;
  const libelleFlux = o.libelleFlux ?? ((t: string) => t);
  const parId = new Map(o.fiches.map((f) => [f.id, f]));
  const nomDe = (n: NoeudG): string => {
    const f = parId.get(n.data.ficheId);
    // Un nœud renommé à la main garde son nom : c'est celui que l'utilisateur lit.
    const propre = typeof n.data.nom === "string" && n.data.nom.trim() ? n.data.nom.trim() : "";
    return propre || (f ? choisir(langue, f.nom, f.nomEn) : n.data.ficheId);
  };

  const ids = o.noeuds.map((n) => n.id);
  const ordre = ordreTopologique(ids, o.aretes);
  // Kahn n'émet jamais un nœud pris dans un cycle : ce qui manque à l'ordre est le cycle.
  const horsOrdre = ids.filter((id) => !ordre.includes(id));
  const rangDe = new Map(ordre.map((id, i) => [id, i]));

  const avertissements: string[] = [];
  if (horsOrdre.length > 0) avertissements.push(`${m.cycle} (${horsOrdre.join(", ")})`);
  if (o.noeuds.length === 0) avertissements.push(m.aucunNoeud);

  const noeuds: NoeudDoc[] = [...o.noeuds]
    // L'ordre d'exécution d'abord : c'est la lecture utile. Les nœuds d'un cycle ferment la
    // marche, à leur place dans le graphe plutôt que nulle part.
    .sort((a, b) => (rangDe.get(a.id) ?? ids.length) - (rangDe.get(b.id) ?? ids.length))
    .map((n) => {
      const f = parId.get(n.data.ficheId);
      const regles = (n.data.parametres ?? {}) as Record<string, unknown>;
      if (!f) avertissements.push(`${n.id} : ${m.inconnu} (${n.data.ficheId})`);

      const parametres: ParametreDoc[] = (f?.parametres ?? [])
        .filter((p) => !p.hidden)
        .map((p) => {
          const posee = regles[p.nom];
          const brut = posee !== undefined ? posee : p.defaut;
          const valeur = valeurLisible(p, brut, langue);
          return {
            nom: choisir(langue, p.nom, p.nomEn),
            type: p.type ?? "nombre",
            valeur,
            defaut: valeurLisible(p, p.defaut, langue),
            parDefaut: posee === undefined || String(posee) === String(p.defaut),
            bloc: estBloc(valeur),
            unite: langue === "en" ? p.uniteEn ?? p.unite : p.unite,
            valeurs: plageLisible(p, langue),
            doc: choisir(langue, p.doc, p.docEn) || undefined,
          };
        });

      const port = (p: Port, i: number, sens: "entree" | "sortie"): PortDoc => {
        const liens = o.aretes
          .filter((a) => (sens === "entree"
            ? a.target === n.id && rang(a.targetHandle, -1) === i
            : a.source === n.id && rang(a.sourceHandle, 0) === i))
          .map((a) => {
            const autreId = sens === "entree" ? a.source : a.target;
            const autre = o.noeuds.find((x) => x.id === autreId);
            const autreFiche = autre ? parId.get(autre.data.ficheId) : undefined;
            const j = sens === "entree" ? rang(a.sourceHandle, 0) : rang(a.targetHandle, -1);
            const liste = sens === "entree" ? autreFiche?.sorties : autreFiche?.entrees;
            const pp = liste?.[j];
            return {
              noeud: autreId,
              nomNoeud: autre ? nomDe(autre) : autreId,
              port: pp ? choisir(langue, pp.nom, pp.nomEn) : `#${j}`,
            };
          });
        if (sens === "entree" && p.requis !== false && liens.length === 0) {
          avertissements.push(`${nomDe(n)} (${n.id}) : ${m.portVide} — ${choisir(langue, p.nom, p.nomEn)}`);
        }
        return {
          nom: choisir(langue, p.nom, p.nomEn),
          type: libelleFlux(p.type),
          requis: p.requis !== false,
          liens,
        };
      };

      return {
        id: n.id,
        ficheId: n.data.ficheId,
        nom: nomDe(n),
        univers: f?.univers ?? "?",
        famille: f?.famille ?? "?",
        resume: f ? choisir(langue, f.resume, f.resumeEn) : "",
        parametres,
        entrees: (f?.entrees ?? []).map((p, i) => port(p, i, "entree")),
        sorties: (f?.sorties ?? []).map((p, i) => port(p, i, "sortie")),
        inconnu: !f,
      };
    });

  // Les composants employés, chacun une fois, dans l'ordre de leur première apparition :
  // la référence se lit alors dans le même ordre que le graphe.
  const composants: ComposantDoc[] = [];
  for (const n of noeuds) {
    const deja = composants.find((c) => c.ficheId === n.ficheId);
    if (deja) { deja.compte++; continue; }
    const f = parId.get(n.ficheId);
    if (!f) continue;
    composants.push({
      ficheId: f.id,
      nom: choisir(langue, f.nom, f.nomEn),
      univers: f.univers,
      famille: f.famille,
      resume: choisir(langue, f.resume, f.resumeEn),
      notice: notices ? choisir(langue, f.notice, f.noticeEn) || undefined : undefined,
      entrees: f.entrees.map((p) => ({ nom: choisir(langue, p.nom, p.nomEn), type: libelleFlux(p.type), requis: p.requis !== false })),
      sorties: f.sorties.map((p) => ({ nom: choisir(langue, p.nom, p.nomEn), type: libelleFlux(p.type) })),
      parametres: f.parametres.filter((p) => !p.hidden).map((p) => ({
        nom: choisir(langue, p.nom, p.nomEn),
        type: p.type ?? "nombre",
        defaut: valeurLisible(p, p.defaut, langue),
        valeurs: plageLisible(p, langue),
        doc: choisir(langue, p.doc, p.docEn) || undefined,
      })),
      compte: 1,
    });
  }

  const comptesFlux = new Map<string, number>();
  for (const a of o.aretes) {
    const src = o.noeuds.find((x) => x.id === a.source);
    const f = src ? parId.get(src.data.ficheId) : undefined;
    const p = f?.sorties[rang(a.sourceHandle, 0)];
    if (p) comptesFlux.set(p.type, (comptesFlux.get(p.type) ?? 0) + 1);
  }

  return {
    titre: (o.titre ?? "").trim() || m.titre,
    langue,
    compte: { noeuds: o.noeuds.length, aretes: o.aretes.length, composants: composants.length },
    ordre,
    noeuds,
    composants,
    sources: noeuds.filter((n) => n.entrees.every((p) => p.liens.length === 0)).map((n) => n.id),
    terminaux: noeuds.filter((n) => n.sorties.every((p) => p.liens.length === 0)).map((n) => n.id),
    typesFlux: [...comptesFlux.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([type, compte]) => ({ type, libelle: libelleFlux(type), compte })),
    avertissements,
    // Le même contenu que l'export d'Attic, réduit à ce qui rejoue le graphe.
    json: JSON.stringify({
      nodes: o.noeuds.map((n) => ({
        id: n.id, type: n.type, position: n.position,
        data: { ficheId: n.data.ficheId, parametres: n.data.parametres ?? {} },
      })),
      edges: o.aretes.map((a) => ({
        id: a.id, source: a.source, target: a.target,
        sourceHandle: a.sourceHandle ?? "out:0", targetHandle: a.targetHandle ?? "in:0",
      })),
    }, null, 2),
    schema: o.noeuds.map((n) => ({
      id: n.id,
      nom: nomDe(n),
      x: n.position?.x ?? 0,
      y: n.position?.y ?? 0,
      largeur: n.width ?? 280,
      hauteur: n.height ?? 160,
    })),
  };
}

// ── Markdown, pour un agent ──────────────────────────────────────────────────────

/** Texte sûr dans une cellule : les barres verticales couperaient le tableau. */
const cel = (t: string | undefined): string => String(t ?? "").replace(/\|/g, "\\|").replace(/\r?\n+/g, " ").trim();

export function documentationVersMarkdown(d: DocumentationGraphe): string {
  const m = MOTS[d.langue];
  const l: string[] = [];
  l.push(`# ${d.titre}`, "");
  l.push(`${d.compte.noeuds} ${m.noeuds} · ${d.compte.aretes} ${m.aretes} · ${d.compte.composants} ${m.composants}`, "");
  l.push(`> ${m.commentLire} : ${d.langue === "en"
    ? "the graph is described first, node by node, in execution order and with the values actually set; the components' notices follow, one per distinct component; the graph's JSON closes the document and is enough to rebuild it."
    : "le graphe est décrit d'abord, nœud par nœud, dans l'ordre d'exécution et avec les valeurs réellement réglées ; les notices des composants suivent, une par composant distinct ; le JSON du graphe ferme le document et suffit à le reconstruire."}`, "");

  if (d.avertissements.length > 0) {
    l.push(`## ${m.avertissements}`, "");
    for (const a of d.avertissements) l.push(`- ${a}`);
    l.push("");
  }

  l.push(`## ${m.presentation}`, "");
  if (d.sources.length > 0) l.push(`- **${m.sources}** : ${d.sources.join(", ")}`);
  if (d.terminaux.length > 0) l.push(`- **${m.terminaux}** : ${d.terminaux.join(", ")}`);
  if (d.typesFlux.length > 0) {
    l.push(`- **${m.flux}** : ${d.typesFlux.map((f) => `${f.libelle} (${f.compte})`).join(" · ")}`);
  }
  l.push("");
  l.push(`### ${m.ordre}`, "");
  l.push(d.ordre.map((id, i) => {
    const n = d.noeuds.find((x) => x.id === id);
    return `${i + 1}. ${n ? `${n.nom} (\`${id}\`)` : `\`${id}\``}`;
  }).join("\n"), "");

  l.push(`## ${m.graphe}`, "");
  for (const n of d.noeuds) {
    l.push(`### ${n.nom} — \`${n.id}\``, "");
    l.push(`\`${n.ficheId}\` · ${n.univers} → ${n.famille}${n.inconnu ? ` · **${m.inconnu}**` : ""}`, "");
    if (n.resume) l.push(`*${n.resume}*`, "");

    const cables = [
      ...n.entrees.map((p) => ({ p, sens: m.de })),
      ...n.sorties.map((p) => ({ p, sens: m.vers })),
    ].filter(({ p }) => p.liens.length > 0);
    if (cables.length > 0) {
      for (const { p, sens } of cables) {
        l.push(`- **${p.nom}** (${p.type}) ${sens} ${p.liens.map((x) => `${x.nomNoeud} → ${x.port} (\`${x.noeud}\`)`).join(", ")}`);
      }
      l.push("");
    }

    const tableau = n.parametres.filter((p) => !p.bloc);
    if (tableau.length > 0) {
      l.push(`| ${m.parametres} | ${m.valeur} | ${m.defaut} | ${m.plage} |`, "|---|---|---|---|");
      for (const p of tableau) {
        // La valeur réglée est en gras : c'est la seule chose que le graphe ajoute à la fiche.
        const v = p.parDefaut ? cel(p.valeur) : `**${cel(p.valeur)}**`;
        l.push(`| ${cel(p.nom)} | ${v} | ${cel(p.defaut)} | ${cel(p.valeurs)} |`);
      }
      l.push("");
    }
    for (const p of n.parametres.filter((x) => x.bloc)) {
      l.push(`**${p.nom}**${p.parDefaut ? ` (${m.parDefaut})` : ""} :`, "", "```", p.valeur, "```", "");
    }
  }

  l.push(`## ${m.reference}`, "");
  for (const c of d.composants) {
    l.push(`### ${c.nom} — \`${c.ficheId}\``, "");
    l.push(`${c.univers} → ${c.famille} · ${m.pose} ${c.compte} ${c.compte > 1 ? m.fois : m.fois}`, "");
    if (c.resume) l.push(`*${c.resume}*`, "");
    if (c.notice) l.push(c.notice, "");
    if (c.entrees.length > 0 || c.sorties.length > 0) {
      l.push(`| ${m.port} | ${m.type} | |`, "|---|---|---|");
      for (const p of c.entrees) l.push(`| ${m.entrees} | ${cel(p.nom)} | ${p.type}${p.requis ? "" : ` (${m.facultatif})`} |`);
      for (const p of c.sorties) l.push(`| ${m.sorties} | ${cel(p.nom)} | ${p.type} |`);
      l.push("");
    }
    if (c.parametres.length > 0) {
      l.push(`| ${m.parametres} | ${m.type} | ${m.defaut} | ${m.plage} | ${m.role} |`, "|---|---|---|---|---|");
      for (const p of c.parametres) {
        l.push(`| ${cel(p.nom)} | ${p.type} | ${cel(p.defaut)} | ${cel(p.valeurs)} | ${cel(p.doc)} |`);
      }
      l.push("");
    }
  }

  l.push(`## ${m.json}`, "", "```json", d.json, "```", "");
  return l.join("\n");
}

// ── Site d'une page, pour un humain ──────────────────────────────────────────────

const ech = (t: string | undefined): string => String(t ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Ancre stable et unique pour les liens du sommaire. */
function ancre(prefixe: string, id: string): string {
  return `${prefixe}-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/**
 * Le schéma du graphe, aux POSITIONS RÉELLES des nœuds.
 *
 * Dessiner le graphe à plat, en colonnes, donnerait une image juste et méconnaissable. Aux
 * coordonnées du graphe, celui qui lit la page retrouve la disposition qu'il a sous les yeux
 * dans l'application — c'est ce qui fait qu'un schéma sert à quelque chose.
 */
function schemaSvg(d: DocumentationGraphe): string {
  if (d.schema.length === 0) return "";
  const marge = 40;
  const minX = Math.min(...d.schema.map((b) => b.x)) - marge;
  const minY = Math.min(...d.schema.map((b) => b.y)) - marge;
  const maxX = Math.max(...d.schema.map((b) => b.x + b.largeur)) + marge;
  const maxY = Math.max(...d.schema.map((b) => b.y + b.hauteur)) + marge;
  const parId = new Map(d.schema.map((b) => [b.id, b]));

  const cables: string[] = [];
  for (const n of d.noeuds) {
    for (const p of n.sorties) {
      const de = parId.get(n.id);
      for (const lien of p.liens) {
        const vers = parId.get(lien.noeud);
        if (!de || !vers) continue;
        const x1 = de.x + de.largeur, y1 = de.y + de.hauteur / 2;
        const x2 = vers.x, y2 = vers.y + vers.hauteur / 2;
        const dx = Math.max(40, Math.abs(x2 - x1) / 2);
        cables.push(`<path d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}" class="cable" />`);
      }
    }
  }
  const boites = d.schema.map((b) => {
    const n = d.noeuds.find((x) => x.id === b.id);
    const i = d.ordre.indexOf(b.id);
    return `<g><a href="#${ancre("noeud", b.id)}">`
      + `<rect x="${b.x}" y="${b.y}" width="${b.largeur}" height="${b.hauteur}" rx="10" class="boite" />`
      + `<text x="${b.x + 14}" y="${b.y + 30}" class="titre-boite">${ech(b.nom)}</text>`
      + `<text x="${b.x + 14}" y="${b.y + 54}" class="sous-boite">${i >= 0 ? `${i + 1}. ` : ""}${ech(n?.famille ?? "")}</text>`
      + `</a></g>`;
  });
  return `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" class="schema" role="img">`
    + `${cables.join("")}${boites.join("")}</svg>`;
}

export function documentationVersHtml(d: DocumentationGraphe): string {
  const m = MOTS[d.langue];
  const t: string[] = [];

  const sommaire = [
    `<a href="#presentation">${m.presentation}</a>`,
    d.avertissements.length > 0 ? `<a href="#avertissements">${m.avertissements}</a>` : "",
    `<a href="#graphe">${m.graphe}</a>`,
    ...d.noeuds.map((n) => `<a class="creux" href="#${ancre("noeud", n.id)}">${ech(n.nom)}</a>`),
    `<a href="#reference">${m.reference}</a>`,
    ...d.composants.map((c) => `<a class="creux" href="#${ancre("composant", c.ficheId)}">${ech(c.nom)}</a>`),
    `<a href="#json">${m.json}</a>`,
  ].filter(Boolean).join("\n");

  t.push(`<!doctype html>
<html lang="${d.langue}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ech(d.titre)}</title>
<style>
:root {
  --fond: #faf9f7; --fond-carte: #fff; --texte: #1b1b1c; --doux: #62636a; --trait: #e2e0dc;
  --accent: #7a5cff; --alerte: #b4510a; --code: #f3f1ed;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --fond: #16161a; --fond-carte: #1e1e24; --texte: #ecebe8; --doux: #a0a0aa; --trait: #32323c;
    --accent: #a892ff; --alerte: #ffab6b; --code: #23232b;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--fond); color: var(--texte);
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.page { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 40px; max-width: 1400px; margin: 0 auto; padding: 0 16px; }
nav { position: sticky; top: 0; align-self: start; max-height: 100vh; overflow-y: auto; padding: 32px 0; font-size: 14px; }
nav h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--doux); margin: 0 0 12px; }
nav a { display: block; padding: 3px 0; color: var(--texte); text-decoration: none; }
nav a:hover { color: var(--accent); }
nav a.creux { padding-left: 14px; color: var(--doux); font-size: 13px; }
main { padding: 32px 0 96px; min-width: 0; }
h1 { font-size: 30px; line-height: 1.2; margin: 0 0 8px; }
h2 { font-size: 22px; margin: 48px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--trait); }
h3 { font-size: 18px; margin: 32px 0 6px; }
.compte { color: var(--doux); margin: 0 0 24px; }
.carte { background: var(--fond-carte); border: 1px solid var(--trait); border-radius: 12px; padding: 20px 24px; margin: 16px 0; }
.etiquette { display: inline-block; font-size: 12px; color: var(--doux); border: 1px solid var(--trait);
  border-radius: 999px; padding: 1px 10px; margin-right: 6px; }
.resume { color: var(--doux); font-style: italic; margin: 4px 0 16px; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--trait); vertical-align: top; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--doux); font-weight: 600; }
td.regle { font-weight: 600; color: var(--accent); }
ul.cables { list-style: none; padding: 0; margin: 12px 0; font-size: 14px; }
ul.cables li { padding: 3px 0; }
ul.cables .type { color: var(--doux); }
pre { background: var(--code); border: 1px solid var(--trait); border-radius: 8px; padding: 14px 16px;
  overflow-x: auto; font-size: 13px; line-height: 1.5; }
code { background: var(--code); border-radius: 4px; padding: 1px 5px; font-size: 13px; }
pre code { background: none; padding: 0; }
.alerte { border-left: 3px solid var(--alerte); padding-left: 14px; color: var(--alerte); }
.notice { margin: 12px 0; }
.schema { width: 100%; height: auto; background: var(--fond-carte); border: 1px solid var(--trait); border-radius: 12px; }
.schema .cable { fill: none; stroke: var(--accent); stroke-width: 2.5; opacity: .5; }
.schema .boite { fill: var(--fond); stroke: var(--trait); stroke-width: 2; }
.schema .titre-boite { font: 600 17px sans-serif; fill: var(--texte); }
.schema .sous-boite { font: 14px sans-serif; fill: var(--doux); }
ol.ordre { margin: 12px 0; padding-left: 24px; }
ol.ordre code { color: var(--doux); }
@media (max-width: 880px) {
  .page { grid-template-columns: 1fr; gap: 0; }
  nav { position: static; max-height: none; border-bottom: 1px solid var(--trait); }
}
</style>
</head>
<body>
<div class="page">
<nav><h2>${m.sommaire}</h2>${sommaire}</nav>
<main>
<h1>${ech(d.titre)}</h1>
<p class="compte">${d.compte.noeuds} ${m.noeuds} · ${d.compte.aretes} ${m.aretes} · ${d.compte.composants} ${m.composants}</p>`);

  if (d.avertissements.length > 0) {
    t.push(`<h2 id="avertissements">${m.avertissements}</h2><ul class="alerte">`);
    for (const a of d.avertissements) t.push(`<li>${ech(a)}</li>`);
    t.push(`</ul>`);
  }

  t.push(`<h2 id="presentation">${m.presentation}</h2>`);
  t.push(schemaSvg(d));
  t.push(`<div class="carte"><table>`);
  if (d.sources.length > 0) t.push(`<tr><th>${m.sources}</th><td>${d.sources.map((s) => `<code>${ech(s)}</code>`).join(" ")}</td></tr>`);
  if (d.terminaux.length > 0) t.push(`<tr><th>${m.terminaux}</th><td>${d.terminaux.map((s) => `<code>${ech(s)}</code>`).join(" ")}</td></tr>`);
  if (d.typesFlux.length > 0) {
    t.push(`<tr><th>${m.flux}</th><td>${d.typesFlux.map((f) => `${ech(f.libelle)} (${f.compte})`).join(" · ")}</td></tr>`);
  }
  t.push(`</table></div>`);
  t.push(`<h3>${m.ordre}</h3><ol class="ordre">`);
  for (const id of d.ordre) {
    const n = d.noeuds.find((x) => x.id === id);
    t.push(`<li><a href="#${ancre("noeud", id)}">${ech(n?.nom ?? id)}</a> <code>${ech(id)}</code></li>`);
  }
  t.push(`</ol>`);

  t.push(`<h2 id="graphe">${m.graphe}</h2>`);
  for (const n of d.noeuds) {
    t.push(`<section class="carte" id="${ancre("noeud", n.id)}">`);
    t.push(`<h3>${ech(n.nom)} <code>${ech(n.id)}</code></h3>`);
    t.push(`<p><span class="etiquette">${ech(n.univers)} → ${ech(n.famille)}</span><span class="etiquette">${ech(n.ficheId)}</span>`
      + `${n.inconnu ? `<span class="etiquette alerte">${m.inconnu}</span>` : ""}</p>`);
    if (n.resume) t.push(`<p class="resume">${ech(n.resume)}</p>`);

    const cables = [
      ...n.entrees.map((p) => ({ p, sens: m.de })),
      ...n.sorties.map((p) => ({ p, sens: m.vers })),
    ].filter(({ p }) => p.liens.length > 0);
    if (cables.length > 0) {
      t.push(`<ul class="cables">`);
      for (const { p, sens } of cables) {
        const cibles = p.liens.map((x) => `<a href="#${ancre("noeud", x.noeud)}">${ech(x.nomNoeud)}</a> → ${ech(x.port)}`).join(", ");
        t.push(`<li><strong>${ech(p.nom)}</strong> <span class="type">(${ech(p.type)})</span> ${sens} ${cibles}</li>`);
      }
      t.push(`</ul>`);
    }

    const tableau = n.parametres.filter((p) => !p.bloc);
    if (tableau.length > 0) {
      t.push(`<table><tr><th>${m.parametres}</th><th>${m.valeur}</th><th>${m.defaut}</th><th>${m.plage}</th></tr>`);
      for (const p of tableau) {
        t.push(`<tr><td>${ech(p.nom)}</td><td${p.parDefaut ? "" : ' class="regle"'}>${ech(p.valeur)}</td>`
          + `<td>${ech(p.defaut)}</td><td>${ech(p.valeurs)}</td></tr>`);
      }
      t.push(`</table>`);
    }
    for (const p of n.parametres.filter((x) => x.bloc)) {
      t.push(`<h4>${ech(p.nom)}${p.parDefaut ? ` <span class="etiquette">${m.parDefaut}</span>` : ""}</h4>`);
      t.push(`<pre><code>${ech(p.valeur)}</code></pre>`);
    }
    t.push(`</section>`);
  }

  t.push(`<h2 id="reference">${m.reference}</h2>`);
  for (const c of d.composants) {
    t.push(`<section class="carte" id="${ancre("composant", c.ficheId)}">`);
    t.push(`<h3>${ech(c.nom)} <code>${ech(c.ficheId)}</code></h3>`);
    t.push(`<p><span class="etiquette">${ech(c.univers)} → ${ech(c.famille)}</span>`
      + `<span class="etiquette">${c.compte} ${c.compte > 1 ? m.exemplaires : m.exemplaires}</span></p>`);
    if (c.resume) t.push(`<p class="resume">${ech(c.resume)}</p>`);
    if (c.notice) t.push(`<p class="notice">${ech(c.notice)}</p>`);
    if (c.entrees.length > 0 || c.sorties.length > 0) {
      t.push(`<table><tr><th>${m.port}</th><th></th><th>${m.type}</th></tr>`);
      for (const p of c.entrees) {
        t.push(`<tr><td>${m.entrees}</td><td>${ech(p.nom)}</td><td>${ech(p.type)}${p.requis ? "" : ` (${m.facultatif})`}</td></tr>`);
      }
      for (const p of c.sorties) t.push(`<tr><td>${m.sorties}</td><td>${ech(p.nom)}</td><td>${ech(p.type)}</td></tr>`);
      t.push(`</table>`);
    }
    if (c.parametres.length > 0) {
      t.push(`<table><tr><th>${m.parametres}</th><th>${m.type}</th><th>${m.defaut}</th><th>${m.plage}</th><th>${m.role}</th></tr>`);
      for (const p of c.parametres) {
        t.push(`<tr><td>${ech(p.nom)}</td><td>${ech(p.type)}</td><td>${ech(p.defaut)}</td>`
          + `<td>${ech(p.valeurs)}</td><td>${ech(p.doc)}</td></tr>`);
      }
      t.push(`</table>`);
    }
    t.push(`</section>`);
  }

  t.push(`<h2 id="json">${m.json}</h2><pre><code>${ech(d.json)}</code></pre>`);
  t.push(`</main></div></body></html>`);
  return t.join("\n");
}

// src/docs/description.ts — DÉCRIRE : le catalogue projeté en données, pour qui n'a pas d'yeux.
//
// POURQUOI CE MODULE, ET IL NE DOIT RIEN INVENTER. `COMPONENTS.md` dit déjà tout, en 1,3 Mo de
// prose bilingue : c'est fait pour être LU. Qui veut assembler un graphe sans le lire — un agent,
// un serveur de pilotage, un script — n'a pas besoin des notices, il a besoin de savoir ce qui se
// branche sur quoi et ce qui se règle.
//
// CE MODULE PROJETTE, IL NE DUPLIQUE PAS. C'est la leçon des cinq tables du dépôt et de la base
// d'empreintes, qui a dérivé trois semaines sans que rien ne le dise : une description de cinq cents
// composants écrite à la main vieillirait. Celle-ci se lit sur le REGISTRE VIVANT, à chaque appel.
//
// LES NOTICES EN SONT ABSENTES, ET C'EST UN CHOIX MESURÉ : elles pèsent l'essentiel des 1,3 Mo, et
// elles ne disent pas ce qui se branche. Le résumé d'un composant, lui, est court et il y est. Qui
// veut la notice la lit dans `COMPONENTS.md`, qui est engendré du même registre.
import { registre } from "../audio/adaptateur";
import { toutesLesFiches } from "./index";
import { CONTENUS_TEXTE } from "../audio/sous-types-texte";

/** Un port, tel qu'un assembleur a besoin de le connaître. */
export interface PortDecrit {
  nom: string;
  nomEn?: string;
  type: string;
  /** Le contenu que ce port transporte, quand le flux en distingue. */
  contenu?: string;
  /** Faux seulement quand la fiche le déclare : le défaut est « obligatoire ». */
  requis?: false;
}

/** Un réglage, avec ce qui borne ses valeurs. */
export interface ReglageDecrit {
  nom: string;
  nomEn?: string;
  type: string;
  defaut?: unknown;
  min?: number;
  max?: number;
  pas?: number;
  unite?: string;
  /** Les valeurs canoniques d'un choix. C'est par elles qu'un graphe écrit à la main doit parler. */
  options?: string[];
}

export interface ComposantDecrit {
  id: string;
  nom: string;
  nomEn?: string;
  univers?: string;
  famille?: string;
  resume?: string;
  resumeEn?: string;
  entrees: PortDecrit[];
  sorties: PortDecrit[];
  reglages: ReglageDecrit[];
}

export interface FluxDecrit {
  id: string;
  libelle?: string;
  /** Les contenus que ce flux distingue, quand il en distingue. Deux contenus différents ne vont pas ensemble. */
  contenus?: string[];
}

export interface Description {
  /** La forme de ce document. Un lecteur qui ne la reconnaît pas doit s'arrêter plutôt que deviner. */
  forme: 1;
  composants: ComposantDecrit[];
  flux: FluxDecrit[];
}

/** Les bornes d'un réglage, qu'une fiche écrit en `plage: [min, max]`. */
function bornes(p: any): { min?: number; max?: number } {
  return Array.isArray(p.plage) && p.plage.length === 2
    ? { min: Number(p.plage[0]), max: Number(p.plage[1]) }
    : {};
}

/**
 * LES OPTIONS SONT LES IDENTIFIANTS, JAMAIS LES LIBELLÉS, et c'est la leçon la plus chère du mois :
 * le chantier des nomenclatures a passé une semaine à réparer des exécuteurs qui comparaient un
 * libellé traduit. Une fiche sans `optionIds` n'en a pas d'autre que ses libellés français, et c'est
 * alors eux que l'exécuteur compare : on les rend tels quels.
 */
function options(p: any): string[] | undefined {
  if (p.type !== "choix") return undefined;
  const ids = p.optionIds ?? p.options;
  return Array.isArray(ids) ? ids.map(String) : undefined;
}

const decrirePort = (p: any): PortDecrit => ({
  nom: p.nom, ...(p.nomEn && p.nomEn !== p.nom ? { nomEn: p.nomEn } : {}),
  type: p.type, ...(p.sousType ? { contenu: p.sousType } : {}),
  ...(p.requis === false ? { requis: false as const } : {}),
});

const decrireReglage = (p: any): ReglageDecrit => ({
  nom: p.nom, ...(p.nomEn && p.nomEn !== p.nom ? { nomEn: p.nomEn } : {}),
  type: p.type ?? "curseur",
  ...(p.defaut !== undefined ? { defaut: p.defaut } : {}),
  ...bornes(p),
  ...(p.pas !== undefined ? { pas: p.pas } : {}),
  ...(p.unite ? { unite: p.unite } : {}),
  ...(options(p) ? { options: options(p) } : {}),
});

/** Le catalogue entier, lu sur le registre vivant. */
export function decrireCatalogue(): Description {
  const composants = (toutesLesFiches as any[])
    .map((f): ComposantDecrit => ({
      id: f.id, nom: f.nom,
      ...(f.nomEn && f.nomEn !== f.nom ? { nomEn: f.nomEn } : {}),
      ...(f.univers ? { univers: f.univers } : {}),
      ...(f.famille ? { famille: f.famille } : {}),
      ...(f.resume ? { resume: f.resume } : {}),
      ...(f.resumeEn ? { resumeEn: f.resumeEn } : {}),
      entrees: (f.entrees ?? []).map(decrirePort),
      sorties: (f.sorties ?? []).map(decrirePort),
      reglages: (f.parametres ?? []).map(decrireReglage),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const flux = registre.tousTypesFlux()
    .map((t): FluxDecrit => ({
      id: t.id, ...(t.libelle ? { libelle: t.libelle } : {}),
      // LES CONTENUS NE SE DEVINENT PAS DEPUIS LA RÈGLE, qui est une fermeture : c'est la table du
      // domaine qui les nomme, et elle est la même que celle dont les ports tirent leur sous-type.
      ...(t.sousTypesCompatibles && t.id === "texte" ? { contenus: Object.keys(CONTENUS_TEXTE) } : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { forme: 1, composants, flux };
}

/** Un seul composant, pour qui sait déjà lequel il cherche. */
export function decrireComposant(id: string): ComposantDecrit | undefined {
  return decrireCatalogue().composants.find((c) => c.id === id);
}

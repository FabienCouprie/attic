// core/registre.ts — Registre de plugins ET de types de flux, instancié et typé par domaine.
//
// `creerRegistre<TV, TR>()` retourne un registre cloisonné contenant :
//  - les fiches de plugins (Map par id)
//  - les types de flux (Map par id)
//
// Deux registres sont étanches : un type de flux "nombre" dans le domaine
// nombre n'écrase pas un type "nombre" dans un autre domaine.
import type { PluginDef, FonctionPlugin } from "./types";
import type { FormePort, TypeFlux } from "./typesFlux";
import { valider } from "./validation";

export interface Registre<TV, TR> {
  enregistrer(def: PluginDef<TV, TR>): void;
  /**
   * Fige ce qui est inscrit à cet instant : plus rien ne pourra en remplacer un identifiant.
   *
   * POURQUOI, ET LE TROU ÉTAIT RÉEL. `enregistrer` remplaçait en silence un plugin de même
   * identifiant. Un nœud installé depuis un `.zip` partagé, ou un méta-composant porté par un
   * projet reçu, pouvait donc prendre la place d'un composant NATIF — garder son nom, son icône et
   * sa place dans la palette, et faire autre chose. Relevé le 2026-10-25 par une revue critique.
   *
   * LE REMPLACEMENT RESTE PERMIS POUR CE QUI N'EST PAS FIGÉ, et il le faut : c'est ainsi qu'un
   * méta-composant se réenregistre quand on le modifie, et qu'un nœud installé se recharge à chaud.
   * Seul le socle du domaine est protégé, et il l'est à l'instant où il a fini de s'inscrire.
   */
  figerLesNatifs(): void;
  trouverDef(id: string): PluginDef<TV, TR> | undefined;
  trouverPlugin(id: string): FonctionPlugin<TV, TR> | undefined;
  /** Le CATALOGUE : ce qui peut être choisi. Une fiche `horsCatalogue` n'y figure pas. */
  tousLesPlugins(): PluginDef<TV, TR>[];
  /**
   * TOUT CE QUI EST INSCRIT, catalogué ou non.
   *
   * Un seul besoin le justifie : ce qui pose des fiches dérivées doit pouvoir retirer les siennes
   * quand ce dont elles dérivent a disparu. Sans cette lecture, `tousLesPlugins` les cachant, elles
   * s'accumuleraient sans que rien ne puisse les nommer.
   */
  tousLesInscrits(): PluginDef<TV, TR>[];
  desenregistrer(id: string): void;
  enregistrerTypeFlux(t: TypeFlux): void;
  typeFlux(id: string): TypeFlux | undefined;
  tousTypesFlux(): TypeFlux[];
  couleurFlux(id: string): string;
  /** La forme du point d'un port, qui distingue deux types là où la couleur ne suffit plus. */
  formeFlux(id: string): FormePort;
  /**
   * Deux ports vont-ils ensemble ? Les sous-types sont facultatifs : sans eux, c'est la règle de
   * transport seule, celle qu'un graphe déjà enregistré a connue en naissant.
   */
  fluxCompatibles(
    sourceId: string, cibleId: string,
    sousTypeSource?: string, sousTypeCible?: string,
  ): boolean;
}

const ALIAS: Record<string, string> = {
  "placer-son-zones": "placer-sons-zones",
  "dererverb": "dereverberation",
  "reverbe-progressive": "reverb-progressive",
  "melangeur-audio": "melangeur",
  "boite-a-rythmes": "boite-rythmes",
  "variateur-vitesse": "changement-tempo",
  "filtre": "reponse-filtre",
  "boucle": "simple-boucle",
  "fusionneur": "melangeur",
  "entree-micro": "enregistreur-audio",
  "reservoir-midi": "reservoir-musical",
  // « Fin de boucle » est devenue « Fin de boucle A » quand B et C sont arrivées. Son
  // identifiant n'a pas bougé — les graphes enregistrés le portent —, mais qui écrit un
  // graphe à la main attend le suffixe du nom.
  "boucle-graphe-fin-a": "boucle-graphe-fin",
  // « Séquenceur de batterie » était un sous-ensemble strict de « Séquenceur de batterie avancé » :
  // mêmes cinq pistes, dans le même ordre, sans la vélocité ni les trois pistes supplémentaires. Il
  // a été supprimé ; les graphes enregistrés qui le portent ouvrent donc le second, qui sait relire
  // leurs motifs binaires (voir `audio/batterie.ts`, `estMotifBinaire`).
  "sequenceur-batterie": "sequenceur-batterie-avance",
};

function resoudre(id: string): string {
  return ALIAS[id] ?? id;
}

export function creerRegistre<TV, TR>(): Registre<TV, TR> {
  const plugins: PluginDef<TV, TR>[] = [];
  const parId = new Map<string, PluginDef<TV, TR>>();
  /** Les identifiants du socle, figés une fois le domaine inscrit. Voir `figerLesNatifs`. */
  const natifs = new Set<string>();
  const typesFlux = new Map<string, TypeFlux>();

  function enregistrer(def: PluginDef<TV, TR>): void {
    const { erreurs, avertissements } = valider(def, { typeFlux: (id: string) => typesFlux.get(id), fluxCompatibles });
    if (erreurs.length) {
      console.error(`[attic] Plugin « ${def.id || "?"} » invalide : ${erreurs.join(" ; ")} — non enregistré.`);
      return;
    }
    const existant = parId.get(def.id);
    if (existant) {
      // UN IDENTIFIANT NATIF NE SE REMPLACE PAS. Sans ce refus, un nœud installé depuis un `.zip`
      // partagé — ou un méta-composant porté par un projet reçu — prenait la place d'un composant
      // du socle : son nom, son icône, sa place dans la palette, et un autre code derrière.
      if (natifs.has(def.id)) {
        console.error(`[attic] Plugin « ${def.id} » : un composant natif ne se remplace pas — non enregistré.`);
        return;
      }
      const idx = plugins.indexOf(existant);
      if (idx >= 0) plugins[idx] = def;
      parId.set(def.id, def);
      return;
    }
    if ((import.meta as any).env?.DEV && avertissements.length) {
      console.warn(`[attic] Plugin « ${def.id} » — documentation incomplète : ${avertissements.join(" ; ")}`);
    }
    plugins.push(def);
    parId.set(def.id, def);
  }

  function trouverPlugin(id: string): FonctionPlugin<TV, TR> | undefined {
    return parId.get(resoudre(id))?.executer;
  }

  function trouverDef(id: string): PluginDef<TV, TR> | undefined {
    return parId.get(resoudre(id));
  }

  /**
   * LE CATALOGUE, ET NON TOUT CE QUI EST INSCRIT. Une fiche marquée `horsCatalogue` est inscrite pour
   * qu'un nœud se dessine et se câble, jamais pour être choisie : `trouverDef` la rend, celle-ci non.
   * Tout ce qui énumère le registre — palette, quiz, vocabulaire de génération, documentation,
   * gestionnaire de nodes — en est protégé du même coup, sans avoir à y penser.
   */
  function tousLesPlugins(): PluginDef<TV, TR>[] {
    return plugins.filter((p) => p.horsCatalogue !== true);
  }

  function tousLesInscrits(): PluginDef<TV, TR>[] {
    return plugins;
  }

  function desenregistrer(id: string): void {
    const def = parId.get(id);
    if (!def) return;
    parId.delete(id);
    const idx = plugins.indexOf(def);
    if (idx >= 0) plugins.splice(idx, 1);
  }

  function enregistrerTypeFlux(t: TypeFlux): void {
    typesFlux.set(t.id, t);
  }

  function typeFlux(id: string): TypeFlux | undefined {
    return typesFlux.get(id);
  }

  function tousTypesFlux(): TypeFlux[] {
    return [...typesFlux.values()];
  }

  function couleurFlux(id: string): string {
    return typesFlux.get(id)?.couleur ?? "#999";
  }

  /** La forme du point d'un port. Ronde par défaut, comme tous les ports l'étaient. */
  function formeFlux(id: string): FormePort {
    return typesFlux.get(id)?.forme ?? "rond";
  }

  /**
   * Deux ports vont-ils ensemble ?
   *
   * LES SOUS-TYPES SONT FACULTATIFS, ET C'EST LA MOITIÉ DE LA DÉCISION. Un appelant qui ne les
   * passe pas obtient exactement la règle d'avant : c'est ainsi que la validation d'un graphe
   * DÉJÀ ENREGISTRÉ continue d'accepter ce qu'elle acceptait, pendant que la pose d'une arête
   * NEUVE, elle, les passe et se fait refuser. Un contenu mal branché se refuse au geste ; il ne
   * s'efface pas sous les doigts de qui rouvre son graphe.
   */
  function fluxCompatibles(
    sourceId: string, cibleId: string,
    sousTypeSource?: string, sousTypeCible?: string,
  ): boolean {
    const t = typesFlux.get(sourceId);
    const transport = t?.compatible ? t.compatible(cibleId) : sourceId === cibleId;
    if (!transport) return false;
    // La règle est celle du type SOURCE, comme `compatible` : c'est lui qui sait ce qu'il émet.
    return t?.sousTypesCompatibles ? t.sousTypesCompatibles(sousTypeSource, sousTypeCible) : true;
  }

  /**
   * Fige les identifiants inscrits à cet instant.
   *
   * IDEMPOTENTE, et appelable plusieurs fois : le domaine peut s'inscrire en plusieurs morceaux, et
   * un second appel n'élargit l'ensemble qu'à ce qui est arrivé entre les deux.
   */
  function figerLesNatifs(): void {
    for (const id of parId.keys()) natifs.add(id);
  }

  return { enregistrer, figerLesNatifs, trouverDef, trouverPlugin, tousLesPlugins, tousLesInscrits, desenregistrer,
    enregistrerTypeFlux, typeFlux, tousTypesFlux, couleurFlux, formeFlux, fluxCompatibles };
}

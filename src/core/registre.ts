// core/registre.ts — Registre de plugins ET de types de flux, instancié et typé par domaine.
//
// `creerRegistre<TV, TR>({ alias })` retourne un registre cloisonné contenant :
//  - les fiches de plugins (Map par id)
//  - les types de flux (Map par id)
//  - les anciens identifiants de fiche de son domaine, reçus à sa création
//
// Deux registres sont étanches : un type de flux "nombre" dans le domaine
// nombre n'écrase pas un type "nombre" dans un autre domaine, et un alias de
// l'un ne détourne pas une fiche de l'autre.
import type { PluginDef, FonctionPlugin } from "./types";
import type { FormePort, TypeFlux } from "./typesFlux";
import { valider } from "./validation";

/**
 * Ce que `enregistrer` rend : la fiche est inscrite, ou la raison pour laquelle elle ne l'est pas.
 *
 * POURQUOI UN RÉSULTAT, ET NON PLUS `void`. Le refus n'était dit qu'à la console, que personne ne lit
 * dans l'application construite, et l'appelant n'en savait rien : `installerNode` écrivait « ✓ »,
 * gardait le nœud en stockage, et le Gestionnaire de nodes annonçait « installé » d'un nœud que le
 * registre venait de refuser. Observé dans l'application le 2026-11-20 sous l'identifiant `filtre`.
 *
 * LA RAISON VOYAGE AVEC LE REFUS, ET NON UN BOOLÉEN. L'appelant doit pouvoir dire à la personne quoi
 * changer, et seul le registre sait si l'identifiant est un natif figé ou un alias, la table des
 * alias et l'ensemble des natifs lui étant propres. Relire `tousLesInscrits` après coup aurait dit
 * qu'il y a eu refus, jamais pourquoi, et aurait tenu la règle en deux endroits qui peuvent diverger.
 */
export type Inscription =
  | { inscrite: true }
  | { inscrite: false; raison: "invalide"; erreurs: string[] }
  | { inscrite: false; raison: "alias"; cible: string }
  | { inscrite: false; raison: "natif" };

export interface Registre<TV, TR> {
  /** Inscrit la fiche, ou la refuse et le dit à la console. Le refus se lit dans ce qui est rendu. */
  enregistrer(def: PluginDef<TV, TR>): Inscription;
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

/** Ce qu'un domaine remet à son registre en le créant. */
export interface OptionsDuRegistre {
  /**
   * Les anciens identifiants de fiche du domaine, et celle que chacun ouvre. Pour l'audio,
   * `audio/alias.ts`.
   *
   * PROPRES AU REGISTRE, ET NON AU MODULE, et c'est le contrat de départ : le cœur ne nomme aucun
   * composant d'un domaine. La table vivait ici, en constante du module, si bien que le cœur portait
   * quatorze identifiants audio et que TOUT registre les résolvait : une fiche d'un autre domaine
   * nommée `filtre` y était introuvable, `trouverDef` cherchant `reponse-filtre`. Relevé par la
   * relecture de `PORTING-A-DOMAIN.md` (PR 403), passé au registre sur décision de Fabien le
   * 2026-11-20.
   */
  alias?: Readonly<Record<string, string>>;
}

export function creerRegistre<TV, TR>(options: OptionsDuRegistre = {}): Registre<TV, TR> {
  const alias = options.alias ?? {};
  const plugins: PluginDef<TV, TR>[] = [];
  const parId = new Map<string, PluginDef<TV, TR>>();
  /** Les identifiants du socle, figés une fois le domaine inscrit. Voir `figerLesNatifs`. */
  const natifs = new Set<string>();
  const typesFlux = new Map<string, TypeFlux>();

  /**
   * Ce que cet identifiant ouvre : la fiche que l'alias désigne, ou lui-même.
   *
   * UNE CLÉ PROPRE À LA TABLE, ET NON UNE CLÉ HÉRITÉE. `alias[id]` lu tel quel rendait, pour
   * `constructor` ou `toString`, une fonction d'`Object.prototype` : la recherche manquait alors une
   * fiche de ce nom, et le refus de `enregistrer` l'aurait refusée.
   */
  function aliasDe(id: string): string | undefined {
    return Object.prototype.hasOwnProperty.call(alias, id) ? alias[id] : undefined;
  }

  function resoudre(id: string): string {
    return aliasDe(id) ?? id;
  }

  function enregistrer(def: PluginDef<TV, TR>): Inscription {
    const { erreurs, avertissements } = valider(def, { typeFlux: (id: string) => typesFlux.get(id), fluxCompatibles });
    if (erreurs.length) {
      console.error(`[attic] Plugin « ${def.id || "?"} » invalide : ${erreurs.join(" ; ")} — non enregistré.`);
      return { inscrite: false, raison: "invalide", erreurs };
    }
    // UN IDENTIFIANT QUI EST UN ALIAS NE S'INSCRIT PAS. `trouverDef` résout l'alias avant de chercher,
    // si bien qu'une fiche de ce nom serait inscrite et jamais trouvée : un nœud installé nommé
    // `filtre` paraissait dans la palette sous son nom, puis, posé, s'affichait et s'exécutait en
    // « Réponse de filtre », sans que rien le dise. Le refus le dit, et nomme la fiche qui l'ouvre.
    const cible = aliasDe(def.id);
    if (cible !== undefined) {
      console.error(`[attic] Plugin « ${def.id} » : cet identifiant est un ancien identifiant de « ${cible} », `
        + `et les graphes qui le portent ouvrent « ${cible} ». Une fiche de ce nom ne serait jamais trouvée : `
        + "choisissez-en un autre — non enregistré.");
      return { inscrite: false, raison: "alias", cible };
    }
    const existant = parId.get(def.id);
    if (existant) {
      // UN IDENTIFIANT NATIF NE SE REMPLACE PAS. Sans ce refus, un nœud installé depuis un `.zip`
      // partagé — ou un méta-composant porté par un projet reçu — prenait la place d'un composant
      // du socle : son nom, son icône, sa place dans la palette, et un autre code derrière.
      if (natifs.has(def.id)) {
        console.error(`[attic] Plugin « ${def.id} » : un composant natif ne se remplace pas — non enregistré.`);
        return { inscrite: false, raison: "natif" };
      }
      const idx = plugins.indexOf(existant);
      if (idx >= 0) plugins[idx] = def;
      parId.set(def.id, def);
      return { inscrite: true };
    }
    if ((import.meta as any).env?.DEV && avertissements.length) {
      console.warn(`[attic] Plugin « ${def.id} » — documentation incomplète : ${avertissements.join(" ; ")}`);
    }
    plugins.push(def);
    parId.set(def.id, def);
    return { inscrite: true };
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

// plugins/effets-aides.ts — Les fabriques dont toutes les fiches d'effets se servent.
//
// POURQUOI CE MODULE. `effet`, `param` et `simple` construisent une fiche a partir de quelques
// arguments, et les soixante-quinze effets passent par elles. Les garder dans l'un des fichiers de
// fiches aurait fait de ce fichier-la le maitre des quatre autres, sans raison : une fabrique
// partagee est un sujet a elle seule.


import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { estCourbe, valeursParametre } from "../audio/courbe";
import { parseMidi } from "midi-file";
import { appliquerInstrumentMidi, analyserMidi, notesVersFichierMidi, rendreSequence } from "../audio";
import { rendreBatterieMidi } from "../audio/tone-synths";
import { type NoteMotif } from "../audio/motifs-midi";
import { PARAMETRE_INSTRUMENT_SF2, PARAMETRE_SYNTHESE, decoderInstrumentSF2, normaliserModeSynthèse, sf2Chargee } from "./soundfontGlobal";
import { parCanal } from "./hors-fil";


// `graine` PORTE LE MÊME RÔLE QU'AILLEURS : ces réglages-ci se fabriquent par `param()`, et sans
// ce champ ils n'auraient pas pu le déclarer. Voir `core/types.ts` pour ce que le moteur en fait.
export type ParamEffet = { nom: string; nomEn?: string; defaut: number; unite?: string; doc?: string; docEn?: string; plage?: [number, number]; pas?: number; graine?: true };
/**
 * Le calcul d'un effet, ses réglages passés dans l'ordre où la fiche les déclare.
 *
 * LES ARGUMENTS NE SONT PAS TYPÉS `number`, ET C'EST DÉLIBÉRÉ. Un effet qui accepte une modulation
 * reçoit un `Float32Array` à la place du nombre, une valeur par échantillon. Typer la liste en
 * `number | Float32Array` obligerait une trentaine d'effets non modulés à convertir leurs arguments
 * un par un, pour un gain nul : la fabrique distribue déjà ses arguments par position, sans que le
 * type les relie aux paramètres déclarés.
 */
export type FnEffet = (audio: AudioBuffer, ...args: any[]) => Promise<AudioBuffer> | AudioBuffer;

/**
 * Le réglage qu'une courbe branchée vient piloter.
 *
 * L'ENTRÉE RESTE FACULTATIVE, ET C'EST LA CONDITION. Sans courbe, `valeursParametre` rend une
 * constante à la valeur du réglage : le cœur de l'effet reçoit exactement ce qu'il recevait, et sa
 * sortie ne bouge pas d'un chiffre. Les empreintes enregistrées avant l'ajout le vérifient.
 *
 * `echelle` suit la nature de la grandeur : une fréquence se parcourt en multipliant, un mélange en
 * ajoutant.
 */
/**
 * Les noms des deux bornes du PREMIER réglage modulé d'une fiche.
 *
 * Ils sont la convention du catalogue depuis l'origine, et les graphes enregistrés rangent leurs
 * valeurs sous ces noms-là : les changer relirait des graphes aux bornes revenues au défaut.
 */
export const BORNES_PAR_DEFAUT: readonly [string, string] = ["Modulation min", "Modulation max"];

type ModulationEffet = {
  /** Le nom du réglage piloté, tel qu'il apparaît à l'écran. */
  parametre: string;
  /**
   * Le même nom dans l'interface anglaise. Par défaut le nom français, ce qui est juste pour
   * « Mix » ou « Gain » et faux pour « Mélange ».
   *
   * LE GARDE D'ANGLAIS A ATTRAPÉ L'OUBLI, et c'est pour cela que le champ existe : la
   * documentation des deux bornes se fabrique par interpolation, de sorte qu'un nom français
   * glissé dans `docEn` ressort tel quel à l'écran anglais. `effet()` le remplit tout seul depuis
   * le `nomEn` du réglage visé, les fiches écrites à la main le portent sur leur constante.
   */
  parametreEn?: string;
  /**
   * Les noms sous lesquels les deux bornes sont RANGÉES, et non ce qu'elles valent.
   *
   * À QUOI CELA SERT, ET C'EST MESURÉ. Une fiche range ses valeurs par NOM : `paramNombre` lit
   * `noeud.data.parametres[nom]`, et la définition retenue est la PREMIÈRE qui porte ce nom.
   * `bornesModulation` rendant toujours « Modulation min » et « Modulation max », deux réglages
   * modulés sur une même fiche recevraient deux paires HOMONYMES : relevé sur un banc, les bornes
   * du premier posées à 0 → 40 se lisaient aussi pour le second, et une courbe tenue à un y donnait
   * 40 sur une plage déclarée de 0 à 10 secondes. Rien ne levait d'erreur.
   *
   * LA CONVENTION DU CATALOGUE EST DÉJÀ CELLE-CI : le premier réglage modulé d'une fiche garde
   * « Modulation min / max », les suivants prennent le nom de leur réglage — « Temps min » et
   * « Feedback min » sur l'écho, « Azimut min » et « Distance min » sur le spatialiseur. Le défaut
   * reproduit donc l'existant, et les graphes enregistrés se relisent sans rien changer.
   */
  noms?: [string, string];
  /** Les mêmes dans l'interface anglaise. Par défaut, les noms français. */
  nomsEn?: [string, string];
  /** Bornes des deux réglages, dans l'unité de l'écran. */
  bornes: [number, number];
  /** Ce que valent le zéro et le un de la courbe. Par défaut, les bornes elles-mêmes. */
  defauts?: [number, number];
  echelle?: "lineaire" | "logarithmique";
  unite?: string;
  uniteEn?: string;
};

/**
 * De quoi faire calculer un effet hors du fil de l'interface, quand son calcul le permet.
 *
 * SEULS LES EFFETS DONT LE CALCUL EST PUR PEUVENT L'EMPLOYER, c'est-à-dire ceux qui ne touchent pas
 * au Web Audio : `AudioBuffer` n'existe pas dans un worker. `voix` reçoit un canal et les réglages
 * dans l'ordre où la fiche les déclare, et c'est cette même fonction que le worker exécute.
 */
type HorsFilEffet = {
  creerWorker: () => Worker;
  voix: (x: Float32Array, o: Record<string, number>) => Float32Array;
  /** Les noms sous lesquels les réglages voyagent, dans l'ordre des paramètres de la fiche. */
  cles: string[];
};

/**
 * Le port d'entrée d'une modulation, tel que toute fiche doit le déclarer.
 *
 * EXPORTÉ POUR LES FICHES ÉCRITES À LA MAIN. `effet()` le fabrique pour les effets qu'il bâtit,
 * mais la moitié du catalogue est écrite fiche par fiche, et chacune le recopierait autrement.
 * Deux recopies divergent toujours : ici c'est le champ `module` qui relie le port au réglage,
 * et l'oublier donnerait un port que l'inspecteur ne saurait rattacher à rien.
 *
 * LE PORT SE POSE EN DERNIER, toujours. Les ports sont désignés par leur rang, et les graphes déjà
 * enregistrés pointent dessus : l'insérer ailleurs qu'à la fin rebrancherait chaque arête d'un cran.
 */
export const portModulation = (
  parametre: string,
  parametreEn = parametre,
  opts: { court?: boolean } = {},
) => {
  // « MODULATION » TOUT COURT N'EST PAS UN NOM LIBRE. C'est celui du port principal d'un
  // composant, celui qui remplace l'oscillateur ou promène la grandeur même de l'effet, et
  // plusieurs fiches le portent déjà. Il ne convient au mélange que si la fiche n'a pas d'autre
  // port de courbe ; dès qu'elle en a un, le port prend le nom de son réglage, comme le vibrato
  // le fait pour « Modulation profondeur ».
  //
  // LE DÉFAUT CI-DESSOUS EST UNE SUPPOSITION, et elle s'est trompée. Déduite du NOM du réglage,
  // elle ne peut pas voir combien de ports la fiche compte : cinq fiches ont reçu un port
  // « Modulation » pour leur mélange alors qu'elles en avaient déjà un, dont deux où les deux
  // ports sortaient homonymes. Une fiche qui a déjà un port de courbe le dit donc par
  // `court: false`, et le cas d'homonymie de `docs/contrat-reglages.test.ts` arrête l'oubli.
  const court = opts.court ?? (parametre === "Mélange" || parametre === "Mix");
  return {
    nom: court ? "Modulation" : `Modulation ${parametre.toLowerCase()}`,
    nomEn: court ? "Modulation" : `Modulation ${parametreEn.toLowerCase()}`,
    type: "courbe" as const, requis: false, module: parametre,
  };
};

/**
 * Les deux réglages qui disent ce que zéro et un de la courbe valent chez le consommateur.
 *
 * UNE COURBE PORTE TOUJOURS DES VALEURS ENTRE ZÉRO ET UN : c'est l'étage de mise en correspondance
 * de l'article de Verfaille, Zölzer et Arfib, placé du côté qui connaît ses propres unités. Les
 * deux bornes sont donc chez l'effet, jamais chez la source, et leur documentation se fabrique
 * d'un seul endroit pour que cent effets ne la racontent pas de cent façons.
 */
export const bornesModulation = (m: ModulationEffet) => {
  const en = m.parametreEn ?? m.parametre;
  const [nomMin, nomMax] = m.noms ?? BORNES_PAR_DEFAUT;
  const [nomMinEn, nomMaxEn] = m.nomsEn ?? m.noms ?? BORNES_PAR_DEFAUT;
  return [
    { nom: nomMin, nomEn: nomMinEn, modulationDe: m.parametre,
      type: "curseur" as const, plage: m.bornes, pas: 1,
      defaut: m.defauts?.[0] ?? m.bornes[0], unite: m.unite, uniteEn: m.uniteEn,
      doc: `Valeur de « ${m.parametre} » que vaut le zéro d'une courbe branchée. Sans courbe, ce réglage ne sert pas.`,
      docEn: `Value of « ${en} » that a connected curve's zero means. With no curve, this setting does nothing.` },
    { nom: nomMax, nomEn: nomMaxEn, modulationDe: m.parametre,
      type: "curseur" as const, plage: m.bornes, pas: 1,
      defaut: m.defauts?.[1] ?? m.bornes[1], unite: m.unite, uniteEn: m.uniteEn,
      doc: `Valeur de « ${m.parametre} » que vaut le un de la courbe.`,
      docEn: `Value of « ${en} » that the curve's one means.` },
  ];
};

/**
 * La modulation d'un mélange sec/mouillé, en pour cent : la même chez tous ceux qui en ont un.
 *
 * DEUX CONSTANTES PARCE QUE LE CATALOGUE EMPLOIE DEUX NOMS pour un seul geste, « Mélange » et
 * « Mix ». Les renommer d'un bloc casserait les graphes enregistrés, qui désignent un réglage par
 * son nom ; les deux constantes disent donc la même chose sous les deux noms, et c'est la seule
 * place du dépôt où cette divergence coûte quelque chose.
 */
export const MODULATION_MELANGE: ModulationEffet =
  { parametre: "Mélange", parametreEn: "Mix", bornes: [0, 100], unite: "%" };
export const MODULATION_MIX: ModulationEffet =
  { parametre: "Mix", parametreEn: "Mix", bornes: [0, 100], unite: "%" };

/**
 * Le même mélange, mais sur une fiche qui module déjà autre chose : ses bornes se nomment.
 *
 * POURQUOI UNE TROISIÈME CONSTANTE. « Modulation min / max » ne se comprend que s'il n'y a qu'une
 * modulation. Dès qu'une fiche en a deux, chaque paire de bornes doit dire quel réglage elle
 * borne, sans quoi l'écran montre « Fréquence min » à côté de « Modulation min » et rien ne dit
 * que la seconde est celle du mélange. C'est la règle que le catalogue suit déjà partout :
 * « Fréquence min » sur le phaser, « Fondamentale min » sur les résonateurs, « Temps min » sur
 * l'écho. Les cinq fiches de cette famille emploient donc celle-ci.
 */
export const modulationNommee = (
  parametre: string, parametreEn: string, bornes: [number, number], unite?: string,
): ModulationEffet => ({
  parametre, parametreEn, bornes, unite,
  noms: [`${parametre} min`, `${parametre} max`],
  nomsEn: [`${parametreEn} min`, `${parametreEn} max`],
});

export const MODULATION_MIX_NOMMEE = modulationNommee("Mix", "Mix", [0, 100], "%");

/**
 * Ce qu'il y a à dire du réglage qu'une courbe vient piloter, dans les deux langues.
 *
 * Exportée pour que les fiches écrites à la main l'ajoutent au même endroit de leur phrase, plutôt
 * que de la reformuler chacune autrement.
 */
/**
 * Les réglages que `reglageModule` lit LUI-MÊME, et que la source de l'exécuteur ne montre donc pas.
 *
 * LES GARDES DE PARAMÈTRE MORT S'APPUIENT DESSUS. Ils cherchent le nom de chaque réglage déclaré
 * dans le texte de l'exécuteur ; ces deux-là sont lus un étage plus bas. Les énumérer ici plutôt
 * que dans chaque garde fait qu'un réglage ajouté à l'aide se déclare d'un seul endroit.
 */
export const REGLAGES_LUS_PAR_L_AIDE = BORNES_PAR_DEFAUT;

/**
 * Vrai si l'exécuteur dont voici la source lit ce réglage, directement ou par une aide partagée.
 *
 * LA FORME CHERCHÉE EST « CE RÉGLAGE EST LU », non « ce nom apparaît ici ». C'est la différence qui
 * compte : un garde qui ne connaît que la seconde oblige chaque fiche à relire ses réglages elle-même
 * pour le satisfaire, c'est-à-dire à défaire la mise en commun qu'il prétend surveiller.
 */
export const luParLExecuteur = (source: string, nom: string): boolean =>
  source.includes(`"${nom}"`)
  || (source.includes("reglageModule") && (REGLAGES_LUS_PAR_L_AIDE as readonly string[]).includes(nom));

/**
 * UN RÉGLAGE EN POUR CENT, modulé ou non.
 *
 * ELLE S'EST APPELÉE `melangeModule` TANT QU'ELLE NE SERVAIT QU'À DES MÉLANGES. La famille
 * « niveau » lui donne un niveau à lire, et le nom aurait menti au premier lecteur venu : rien
 * dans son calcul ne tient au mélange, elle lit un réglage en pour cent et rend soit une
 * proportion, soit ce même pour cent.
 *
 * SANS COURBE, UN NOMBRE — ET C'EST CE QUI REND L'INVARIANT VRAI SANS EFFORT. Un tableau constant
 * donnerait le même son, l'arithmétique étant la même ; mais il coûterait une allocation de la
 * longueur du morceau à chaque effet qui n'est pas modulé, c'est-à-dire presque tous. Le scalaire
 * est donc rendu tel quel, et `valeurA` le lit sans distinguer les deux cas chez le consommateur.
 *
 * LE NOM DU RÉGLAGE EST OBLIGATOIRE, SANS VALEUR PAR DÉFAUT, et ce n'est pas une coquetterie. Les
 * gardes du dépôt vérifient qu'aucun réglage déclaré n'est mort en cherchant son nom dans la source
 * de l'exécuteur : un nom caché dans le défaut de cette aide rendrait le garde aveugle sans que
 * rien ne le signale. Le nommer à l'appel le laisse visible là où le garde regarde.
 *
 * L'UNITÉ RENDUE EST DITE, JAMAIS DEVINÉE. Le réglage est en pour cent à l'écran, partout ; mais
 * les cœurs de calcul du dépôt sont partagés entre ceux qui attendent une proportion de zéro à un
 * et ceux qui divisent eux-mêmes. Un facteur cent tombé du mauvais côté donne un mélange bloqué à
 * son maximum, ou un son quarante décibels trop bas — c'est arrivé à trois synthés du catalogue,
 * et `plugins/niveau-des-synthes.test.ts` en garde la trace. L'appelant déclare donc ce qu'il veut.
 */
export function reglageModule(
  ctx: any, n: number, rangPort: number,
  o: {
    reglage: string; defaut?: number; rendu?: "proportion" | "pourCent";
    /**
     * Les noms des deux bornes à lire, quand ce n'est pas le premier réglage modulé de la fiche.
     *
     * LES NOMMER À L'APPEL LES REND VISIBLES AU GARDE DE RÉGLAGE MORT, qui cherche le nom de chaque
     * réglage déclaré dans le texte de l'exécuteur : les deux noms par défaut lui sont connus par
     * `REGLAGES_LUS_PAR_L_AIDE`, et des noms donnés ici apparaissent dans la source.
     */
    noms?: readonly [string, string];
  },
): number | Float32Array {
  const { reglage, defaut = 100, rendu = "proportion", noms = BORNES_PAR_DEFAUT } = o;
  const facteur = rendu === "pourCent" ? 1 : 100;
  const fixe = ctx.paramNombre(reglage, defaut);
  const courbe = ctx.entree(rangPort);
  if (!estCourbe(courbe)) return fixe / facteur;
  const valeurs = valeursParametre(courbe, n, fixe, {
    min: ctx.paramNombre(noms[0], 0),
    max: ctx.paramNombre(noms[1], 100),
  });
  if (facteur !== 1) for (let i = 0; i < valeurs.length; i++) valeurs[i] /= facteur;
  return valeurs;
}

export function effet(
  slug: string, nom: string, nomEn: string, resume: string, resumeEn: string,
  parametres: ParamEffet[], fn: FnEffet, hors?: HorsFilEffet,
  modulation?: ModulationEffet | readonly ModulationEffet[],
): FicheAudio {
  // PLUSIEURS MODULATIONS SUR UNE MÊME FICHE, et c'est ce qui a changé. Ce socle n'en portait
  // qu'une : douze fiches qu'il bâtit avaient donc épuisé leur unique place, et trente-sept
  // réglages du catalogue restaient fermés pour cette seule raison. L'appelant passe désormais un
  // tableau, et un objet seul continue de signifier exactement ce qu'il signifiait.
  const mods: readonly ModulationEffet[] = modulation
    ? (Array.isArray(modulation) ? modulation : [modulation as ModulationEffet])
    : [];
  const rangs = mods.map((m) => {
    const r = parametres.findIndex((p) => p.nom === m.parametre);
    if (r < 0) throw new Error(`${slug} : « ${m.parametre} » n'est pas un de ses réglages.`);
    return r;
  });
  // LE NOM ANGLAIS DU RÉGLAGE EST PRIS À LA FICHE, non redonné par l'appelant : la fiche le
  // déclare déjà sur son paramètre, et le redemander ouvrirait la porte à deux noms différents
  // pour un seul réglage. Un effet dont le réglage n'a pas de `nomEn` montre son nom français
  // dans les deux langues, ce qui est l'état qu'il avait déjà.
  //
  // LA PREMIÈRE GARDE SON PORT ET SES BORNES COURTS, les suivantes nomment leur réglage. Ce n'est
  // pas une inconséquence : les fiches à une seule modulation sont en production, et un graphe
  // enregistré désigne un réglage par son NOM. Renommer « Modulation min » en « Seuil min »
  // orphelinerait les valeurs déjà sauvegardées. Un port, lui, se renomme sans risque, puisqu'un
  // câble le désigne par son rang ; il reste court par symétrie avec ses deux bornes.
  const modules = mods.map((m, i) => {
    const en = m.parametreEn ?? parametres[rangs[i]].nomEn ?? m.parametre;
    if (i === 0) return { ...m, parametreEn: en };
    return {
      ...m, parametreEn: en,
      noms: m.noms ?? ([`${m.parametre} min`, `${m.parametre} max`] as [string, string]),
      nomsEn: m.nomsEn ?? ([`${en} min`, `${en} max`] as [string, string]),
    };
  });

  return {
    id: slug, nom, nomEn, univers: "Traitement", famille: "Effets", resume, resumeEn,
    // LES PORTS VIENNENT DANS L'ORDRE DES MODULATIONS, et cet ordre ne se réarrange pas : un câble
    // enregistré désigne sa borne par son RANG, et intercaler une modulation rebrancherait chaque
    // arête d'un cran. Une modulation neuve se met donc EN DERNIER dans le tableau de l'appel.
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      ...modules.map((m, i) => (i === 0
        ? { nom: "Modulation", nomEn: "Modulation", type: "courbe" as const, requis: false, module: m.parametre }
        : portModulation(m.parametre, m.parametreEn, { court: false }))),
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      ...parametres.map((p) => ({
        nom: p.nom, nomEn: p.nomEn, defaut: p.defaut,
        // CE QU'UNE MODULATION FAIT À CE RÉGLAGE N'EST PAS ÉCRIT ICI. Une première version
        // l'ajoutait à la documentation du réglage piloté ; l'inspecteur REMPLACE ce réglage par
        // ses deux bornes dès qu'une courbe arrive, de sorte que la phrase s'affichait à côté des
        // deux seuls curseurs réglables pour dire que le réglage ne servait à rien. Les deux
        // phrases, celle de l'annonce et celle de la course, sont dans `i18n` sous
        // `inspecteur.modulation.*`, et c'est l'inspecteur qui choisit.
        doc: p.doc,
        docEn: p.docEn,
        unite: p.unite ?? (p.nom.includes("Mix") || p.nom === "Gain" || p.nom === "Réduction" ? "%" : undefined),
        ...(p.plage ? { plage: p.plage } : {}),
        ...(p.pas ? { pas: p.pas } : {}),
        // CETTE LIGNE RECOPIE UN RÔLE, ET SON ABSENCE NE SE VOYAIT PAS : la fiche se reconstruit
        // champ par champ, donc un champ oublié ici disparaît sans erreur. Le contrat des graines
        // a rattrapé le cas ; tout champ ajouté à `ParamEffet` est à recopier ici.
        ...(p.graine ? { graine: p.graine } : {}),
      })),
      ...modules.flatMap((m) => bornesModulation(m)),
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const args: any[] = parametres.map(p => ctx.paramNombre(p.nom, p.defaut));
      // UN SEUL CHEMIN, modulé ou non : sans courbe, une constante à la valeur du réglage. Le port
      // de la modulation `i` est à l'entrée `1 + i`, dans l'ordre où les entrées sont déclarées.
      modules.forEach((m, i) => {
        const [nomMin, nomMax] = m.noms ?? BORNES_PAR_DEFAUT;
        args[rangs[i]] = valeursParametre(
          ctx.entree(1 + i), audio.length, args[rangs[i]] as number,
          {
            min: ctx.paramNombre(nomMin, m.defauts?.[0] ?? m.bornes[0]),
            max: ctx.paramNombre(nomMax, m.defauts?.[1] ?? m.bornes[1]),
            echelle: m.echelle,
          },
        );
      });
      if (hors) {
        const reglages: Record<string, number> = {};
        hors.cles.forEach((cle, i) => { reglages[cle] = args[i]; });
        // LA FRÉQUENCE D'ÉCHANTILLONNAGE VOYAGE TOUJOURS, sous `sr`. Un tableau de nombres ne la
        // porte pas, et un calcul qui en a besoin — tout ce qui compte en secondes plutôt qu'en
        // échantillons — ne pouvait donc pas employer ce socle du tout. Un calcul qui n'en a pas
        // besoin reçoit une clé de plus et l'ignore.
        reglages.sr = audio.sampleRate;
        const voies = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
        const parVoie = await parCanal<Record<string, number>, Float32Array>(voies, reglages, {
          creerWorker: hors.creerWorker, calcul: hors.voix,
        });
        const out = new AudioBuffer({
          numberOfChannels: audio.numberOfChannels, length: audio.length, sampleRate: audio.sampleRate,
        });
        // LA VOIE RENDUE PEUT ÊTRE PLUS LONGUE QUE LE TAMPON : le glissando recolle ses segments et
        // dépasse d'un reste de recouvrement, qu'il rogne. `set` refuserait tout net.
        for (let c = 0; c < audio.numberOfChannels; c++) {
          out.getChannelData(c).set(parVoie[c].subarray(0, audio.length));
        }
        return { valeurs: [out] };
      }
      return { valeurs: [await fn(audio, ...args)] };
   },
  };
}

export function param(nom: string, defaut: number, nomEn?: string, unite?: string, doc?: string, docEn?: string, plage?: [number, number], pas?: number): ParamEffet {
  return { nom, defaut, nomEn, unite, doc, docEn, plage, pas };
}

export function simple(slug: string, nom: string, nomEn: string, resume: string, resumeEn: string, fn: (a: AudioBuffer) => AudioBuffer | Promise<AudioBuffer>): FicheAudio {
  return {
    id: slug, nom, nomEn, univers: "Traitement", famille: "Effets", resume, resumeEn,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      return { valeurs: [await fn(audio)] };
   },
  };
}

/**
 * Lit un MIDI d'entrée en notes de motif.
 *
 * Les quatre nœuds de motifs partagent cette lecture, donc la même tolérance et le même
 * message quand il n'y a rien à lire. Le champ de vélocité s'appelle `velocite` dans le
 * domaine — une coquille ancienne, gardée pour ne pas casser les graphes enregistrés.
 */
export async function notesDuMidi(fichier: unknown): Promise<NoteMotif[] | null> {
  if (!(fichier instanceof File)) return null;
  const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
  return notes.map((n) => ({
    note: n.note, velocite: n.velocite ?? 90, debut: n.debut, fin: n.fin, canal: n.canal,
  }));
}

/** Le canal le plus représenté : une percussion doit ressortir en percussion. */
export function canalDominant(notes: NoteMotif[]): number {
  const compte = new Map<number, number>();
  for (const n of notes) {
    const c = n.canal ?? 0;
    compte.set(c, (compte.get(c) ?? 0) + 1);
  }
  let meilleur = 0, max = -1;
  for (const [canal, n] of compte) if (n > max) { max = n; meilleur = canal; }
  return meilleur;
}

/**
 * Rend le motif transformé en AUDIO et en MIDI.
 *
 * L'audio n'est pas un supplément : sans lui, le nœud n'a pas de lecteur et l'on ne peut
 * pas entendre ce qu'on vient de régler sans lui brancher un point d'écoute. Le canal 9
 * passe par la synthèse de batterie — un MIDI de percussion joué en FM donnerait des sons
 * de flûte sur les notes de grosse caisse —, et l'instrument mélodique n'est alors pas
 * imposé au fichier, ce qui ferait taire la batterie chez les autres lecteurs.
 */
export async function rendreMotif(
  ctx: any, notes: NoteMotif[], canal: number,
): Promise<[AudioBuffer, File]> {
  const tempo = ctx.paramNombre("Tempo", 120);
  const volume = ctx.paramNombre("Volume", 80);
  const brut = notesVersFichierMidi(notes, tempo, canal);
  if (canal === 9) {
    return [await rendreBatterieMidi({ notes, volume }), brut];
  }
  const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
  const modeRendu: "FM/Oscillateurs" | "SoundFont" =
    mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
  const { programme, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
  return [
    await rendreSequence(notes, modeRendu, volume, programme, banque),
    await appliquerInstrumentMidi(brut, ctx.paramNombre("Instrument", 0)),
  ];
}

/** Les réglages de rendu communs aux nœuds de motifs : écouter d'abord, exporter ensuite. */
export const PARAMETRES_RENDU_MOTIF = [
  { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 300] as [number, number], pas: 1, defaut: 120, unite: "BPM",
    doc: "Tempo inscrit dans le fichier MIDI produit. Les durées, elles, sont en secondes et ne changent pas.",
    docEn: "Tempo written into the produced MIDI file. The durations themselves are in seconds and do not change." },
  { ...PARAMETRE_SYNTHESE,
    doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. Sans effet sur une piste de percussion, qui passe toujours par la synthèse de batterie.",
    docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. No effect on a percussion track, which always goes through the drum synthesis." },
  PARAMETRE_INSTRUMENT_SF2,
  { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100] as [number, number], pas: 1, defaut: 80, unite: "%",
    doc: "Volume du rendu audio.", docEn: "Output volume." },
];

export const SORTIES_MOTIF = [
  { nom: "Audio", type: "audio" as const },
  { nom: "MIDI", nomEn: "MIDI", type: "midi" as const },
];


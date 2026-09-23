// plugins/multicanal.ts — La famille « Multicanal » : composer l'espace, et l'entendre.
//
// SIX NŒUDS, QUATRE FAMILLES DE DIFFUSION. Les anneaux de concert, l'ambisonie, les formats à canaux
// (5.1 jusqu'au 7.1.4) et les objets sonores partagent le même calcul — `audio/multicanal.ts` — et la
// même convention d'angles. Ce qui les distingue est seulement la disposition choisie au rendu, et
// c'est voulu : une trajectoire écrite une fois doit pouvoir se jouer dans n'importe quelle salle.
//
// POURQUOI LES TRAJECTOIRES SONT DES PORTS DE MODULATION. Spatialiser, dans le sens où l'on compose,
// c'est écrire des mouvements : un azimut, une élévation, une distance qui varient dans le temps. Les
// courbes et les ports de modulation multiples savent déjà porter exactement cela ; un spatialiseur
// à trois entrées de modulation nommées est donc un outil d'écriture de l'espace, et l'inspecteur y
// montre chaque trajectoire comme sa plage, dans ses degrés.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { estCourbe, valeursParametre } from "../audio/courbe";
import {
  DISPOSITIONS, decoder, dispositionDe, dispositionParId, estObjet, etiqueter, nombreDeCanaux,
  rendreObjets, spatialiser, versMono, type Disposition, type ObjetSonore, type Trajectoire,
} from "../audio/multicanal";
import { rendreBinaural } from "../audio/multicanal-ecoute";

const UNIVERS = "Autres";
const FAMILLE = "Multicanal";

const choixDisposition = (filtre: (d: Disposition) => boolean, defaut: string) => {
  const liste = DISPOSITIONS.filter(filtre);
  const d = liste.find((x) => x.id === defaut) ?? liste[0];
  return {
    type: "choix" as const,
    options: liste.map((x) => x.fr), optionsEn: liste.map((x) => x.en), optionIds: liste.map((x) => x.id),
    defaut: d.fr, defautEn: d.en,
  };
};

/** Un tampon multicanal neuf, étiqueté de sa disposition. */
function tamponEtiquete(canaux: Float32Array[], frequence: number, d: Disposition): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux.length, length: Math.max(1, canaux[0]?.length ?? 1), sampleRate: frequence });
  canaux.forEach((c, i) => b.copyToChannel(new Float32Array(c), i));
  return etiqueter(b, d.id);
}

const canauxDe = (b: AudioBuffer): Float32Array[] =>
  Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));

// Les trois trajectoires, leurs ports et leurs bornes, communs au spatialiseur et à l'objet sonore.
const PORTS_TRAJECTOIRE = [
  { nom: "Modulation azimut", nomEn: "Azimuth modulation", type: "courbe", requis: false, module: "Azimut" },
  { nom: "Modulation élévation", nomEn: "Elevation modulation", type: "courbe", requis: false, module: "Élévation" },
  { nom: "Modulation distance", nomEn: "Distance modulation", type: "courbe", requis: false, module: "Distance" },
];

const PARAMETRES_TRAJECTOIRE = [
  { nom: "Azimut", nomEn: "Azimuth", type: "curseur" as const, plage: [-180, 180] as [number, number], pas: 1, defaut: 0, unite: "°",
    doc: "La direction dans le plan horizontal, en degrés : zéro devant, positif vers la gauche, cent quatre-vingts derrière. C'est la convention de l'ambisonie et de l'UIT, tenue partout dans cette famille pour qu'un panoramique ne tourne jamais à l'envers d'un décodeur.",
    docEn: "The direction in the horizontal plane, in degrees: zero in front, positive to the left, one hundred and eighty behind. It is the convention of ambisonics and of the ITU, held throughout this family so that a panner never turns the opposite way from a decoder." },
  { nom: "Élévation", nomEn: "Elevation", type: "curseur" as const, plage: [-90, 90] as [number, number], pas: 1, defaut: 0, unite: "°",
    doc: "La hauteur, en degrés : zéro à l'horizon, quatre-vingt-dix au zénith. Une disposition sans haut-parleurs en hauteur la ramène à l'horizon ; le 7.1.4 et l'ambisonie la rendent.",
    docEn: "The height, in degrees: zero at the horizon, ninety at the zenith. A layout without height speakers brings it back to the horizon; 7.1.4 and ambisonics render it." },
  { nom: "Distance", nomEn: "Distance", type: "curseur" as const, plage: [1, 10] as [number, number], pas: 0.1, defaut: 1,
    doc: "La distance relative : un pour la référence, deux pour deux fois plus loin, ce qui divise l'amplitude par deux. En deçà de la référence le son ne se renforce plus, une source infiniment proche ne doit pas devenir infiniment forte.",
    docEn: "The relative distance: one for the reference, two for twice as far, which halves the amplitude. Closer than the reference the sound stops growing, an infinitely near source must not become infinitely loud." },
  { nom: "Azimut min", nomEn: "Azimuth min", modulationDe: "Azimut", type: "curseur" as const, plage: [-180, 180] as [number, number], pas: 1, defaut: -180, unite: "°",
    doc: "L'azimut que vaut le zéro d'une courbe branchée. De −180 à 180, une rampe fait faire un tour complet à la source.",
    docEn: "The azimuth a connected curve's zero means. From -180 to 180, a ramp takes the source through one full turn." },
  { nom: "Azimut max", nomEn: "Azimuth max", modulationDe: "Azimut", type: "curseur" as const, plage: [-180, 180] as [number, number], pas: 1, defaut: 180, unite: "°",
    doc: "L'azimut que vaut le un de la courbe.", docEn: "The azimuth the curve's one means." },
  { nom: "Élévation min", nomEn: "Elevation min", modulationDe: "Élévation", type: "curseur" as const, plage: [-90, 90] as [number, number], pas: 1, defaut: 0, unite: "°",
    doc: "L'élévation que vaut le zéro d'une courbe branchée.", docEn: "The elevation a connected curve's zero means." },
  { nom: "Élévation max", nomEn: "Elevation max", modulationDe: "Élévation", type: "curseur" as const, plage: [-90, 90] as [number, number], pas: 1, defaut: 60, unite: "°",
    doc: "L'élévation que vaut le un de la courbe.", docEn: "The elevation the curve's one means." },
  { nom: "Distance min", nomEn: "Distance min", modulationDe: "Distance", type: "curseur" as const, plage: [1, 10] as [number, number], pas: 0.1, defaut: 1,
    doc: "La distance que vaut le zéro d'une courbe branchée.", docEn: "The distance a connected curve's zero means." },
  { nom: "Distance max", nomEn: "Distance max", modulationDe: "Distance", type: "curseur" as const, plage: [1, 10] as [number, number], pas: 0.1, defaut: 4,
    doc: "La distance que vaut le un de la courbe. Une courbe qui monte éloigne la source, et l'amplitude suit en 1/r.",
    docEn: "The distance the curve's one means. A rising curve moves the source away, and the amplitude follows 1/r." },
];

/** La trajectoire d'un nœud : chaque composante est une courbe branchée, ou le réglage constant. */
function trajectoireDe(ctx: any, n: number, premierPort: number): Trajectoire {
  const piste = (port: number, nom: string, defaut: number, min: number, max: number): Float32Array | number => {
    const c = ctx.entree(port);
    if (!estCourbe(c)) return ctx.paramNombre(nom, defaut);
    return valeursParametre(c, n, 0, { min: ctx.paramNombre(`${nom} min`, min), max: ctx.paramNombre(`${nom} max`, max) });
  };
  return {
    azimut: piste(premierPort, "Azimut", 0, -180, 180),
    elevation: piste(premierPort + 1, "Élévation", 0, 0, 60),
    distance: piste(premierPort + 2, "Distance", 1, 1, 4),
  };
}

const resumeTrajectoire = (t: Trajectoire): string => {
  const d = (v: Float32Array | number | undefined) =>
    v === undefined ? "—" : typeof v === "number" ? `${Math.round(v)}` : `${Math.round(v[0])}→${Math.round(v[v.length - 1])}`;
  return `${d(t.azimut)}° / ${d(t.elevation)}°`;
};

export const fiches: FicheAudio[] = ([
  {
    id: "spatialiseur", nom: "Spatialiseur", nomEn: "Spatialiser", univers: UNIVERS, famille: FAMILLE,
    resume: "Place un son sur une trajectoire (azimut, élévation, distance) dans une disposition au choix : anneau de concert, 5.1 à 7.1.4, ou champ ambisonique.",
    resumeEn: "Places a sound on a trajectory (azimuth, elevation, distance) in a layout of your choice: concert ring, 5.1 to 7.1.4, or ambisonic field.",
    notice: "Place une source sonore dans l'espace, et la rend dans la disposition choisie. Un son entre, mono ou non : il est d'abord ramené au mono, car c'est une source qu'on place et non un champ, et il ressort dans la disposition choisie, étiqueté comme tel : la disposition voyage ensuite avec lui jusqu'à l'export, à travers n'importe quel effet ordinaire.\n\nLes trois trajectoires sont des entrées de modulation. Une courbe sur l'azimut fait tourner la source ; sur l'élévation, elle la fait monter ; sur la distance, elle l'éloigne. Sans courbe, chaque réglage tient sa valeur. Dans l'inspecteur, une trajectoire branchée s'affiche comme sa plage, dans ses degrés.\n\nPour un anneau ou une disposition à canaux, le placement suit le panoramique par vecteurs de Ville Pulkki : une source n'excite que les haut-parleurs qui l'encadrent, et la puissance reste constante où qu'elle se trouve, une source qui passe entre deux enceintes ne se creuse ni ne gonfle. Les hauteurs du 7.1.4 se traitent par couches, l'oreille et le plafond. Le caisson de graves ne reçoit jamais de panoramique : il n'a pas de direction.\n\nPour l'ambisonie, la source est encodée dans le champ selon la convention AmbiX, ordre des canaux ACN, normalisation SN3D, celle que les décodeurs et les outils de production attendent. Le champ ne choisit aucune salle : un décodeur ou l'écoute binaurale le feront ensuite.\n\nLe lecteur sous ce composant joue un repliement stéréo calculé par le composant, qui sait décoder l'ambisonie : il ressemble à la pièce au sixième de son poids, mais l'avant et l'arrière s'y confondent, comme dans toute stéréo. L'espace composé s'écoute au casque par un rendu binaural. Le fichier enregistré, lui, reste multicanal ; il est refait depuis le tampon complet, et non depuis l'aperçu.",
    noticeEn: "Places a sound source in space, and returns it in the chosen layout. A sound comes in, mono or not; it is first brought down to mono, since it is a source being placed and not a field, and it comes out in the chosen layout, labelled as such: the layout then travels with it to the export, through any ordinary effect.\n\nThe three trajectories are modulation inputs. A curve on the azimuth turns the source; on the elevation, it raises it; on the distance, it moves it away. Without a curve each setting holds its value. In the inspector, a connected trajectory shows as its range, in its degrees.\n\nFor a ring or a channel layout, placement follows Ville Pulkki's vector base amplitude panning: a source only excites the speakers framing it, and power stays constant wherever it is, a source passing between two speakers neither dips nor swells. The heights of 7.1.4 are handled by layers, ear level and ceiling. The subwoofer never receives panning: it has no direction.\n\nFor ambisonics, the source is encoded into the field following the AmbiX convention, ACN channel order, SN3D normalisation, the one decoders and production tools expect. The field chooses no room: a decoder or the binaural monitor will do so afterwards.\n\nThe player under this node plays a stereo fold-down computed by the node, which knows how to decode ambisonics: it resembles the piece at a sixth of its weight, but front and back merge in it, as in any stereo. The composed space is heard on headphones through a binaural render. The saved file stays multichannel; it is rebuilt from the full buffer, not from the preview.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }, ...PORTS_TRAJECTOIRE],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Disposition", nomEn: "Layout", ...choixDisposition(() => true, "7.1.4"),
        doc: "La salle pour laquelle on écrit. Les anneaux et les formats à canaux sont des haut-parleurs réels ; l'ambisonie est un champ, décodé plus tard vers n'importe quelle salle. L'octophonie numérote ses canaux dans le sens des aiguilles d'une montre à partir de la gauche de l'axe : c'est la convention la plus répandue des anneaux de concert, pas la seule.",
        docEn: "The room being written for. Rings and channel formats are real speakers; ambisonics is a field, decoded later to any room. The octophony numbers its channels clockwise starting left of the axis: it is the most widespread convention for concert rings, not the only one." },
      ...PARAMETRES_TRAJECTOIRE,
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en ? "No input." : "Aucune entrée." };
      const d = dispositionParId(ctx.paramTexte("Disposition", "7.1.4")) ?? dispositionParId("7.1.4")!;
      const mono = versMono(canauxDe(a));
      const t = trajectoireDe(ctx, mono.length, 1);
      const sortie = tamponEtiquete(spatialiser(mono, d, t), a.sampleRate, d);
      return {
        valeurs: [sortie],
        message: `${en ? d.en : d.fr} · ${nombreDeCanaux(d)} ${en ? "channels" : "canaux"}\n${resumeTrajectoire(t)}`,
      };
    },
  },
  {
    id: "declarer-disposition", nom: "Déclarer la disposition", nomEn: "Declare Layout", univers: UNIVERS, famille: FAMILLE,
    resume: "Dit ce que sont les canaux d'un fichier multicanal (un 5.1, un anneau, un champ AmbiX) pour que la suite de la chaîne le sache.",
    resumeEn: "States what a multichannel file's channels are (a 5.1, a ring, an AmbiX field) so that the rest of the chain knows.",
    notice: "Un fichier chargé depuis le disque arrive avec un nombre de canaux, et rien d'autre. Or quatre canaux, c'est une quadriphonie ou une ambisonie d'ordre un : même nombre, deux mondes, et les traiter l'un comme l'autre rend du bruit. \n\nLe nombre de canaux de l'entrée doit correspondre à la disposition déclarée ; sinon le composant refuse, plutôt que de laisser un 7.1 passer pour un anneau de huit. Le son n'est pas modifié : seule l'étiquette change, et elle suit ensuite le son jusqu'à l'export.",
    noticeEn: "A file loaded from disk arrives with a number of channels, and nothing else. Yet four channels is a quad or a first-order ambisonic field: the same number, two worlds, and treating one as the other gives noise. \n\nThe input's channel count must match the declared layout; otherwise the node refuses, rather than letting a 7.1 pass for a ring of eight. The sound is not changed: only the label is, and it then follows the sound to the export.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Disposition", nomEn: "Layout", ...choixDisposition(() => true, "5.1"),
        doc: "Ce que sont les canaux de l'entrée. Un fichier AmbiX se déclare en ambisonie de l'ordre correspondant : quatre canaux pour l'ordre un, neuf pour le deux, seize pour le trois.",
        docEn: "What the input's channels are. An AmbiX file is declared as ambisonics of the matching order: four channels for order one, nine for two, sixteen for three." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en ? "No input." : "Aucune entrée." };
      const d = dispositionParId(ctx.paramTexte("Disposition", "5.1")) ?? dispositionParId("5.1")!;
      const attendu = nombreDeCanaux(d);
      if (a.numberOfChannels !== attendu) {
        return {
          valeurs: [null], erreur: true,
          message: en
            ? `${d.en} has ${attendu} channels, the input has ${a.numberOfChannels}.`
            : `${d.fr} compte ${attendu} canaux, l'entrée en a ${a.numberOfChannels}.`,
        };
      }
      // Une copie et non l'entrée étiquetée sur place : le même tampon peut alimenter une autre
      // branche du graphe, qui n'a rien déclaré et ne doit pas hériter d'une étiquette par surprise.
      return { valeurs: [tamponEtiquete(canauxDe(a), a.sampleRate, d)], message: en ? d.en : d.fr };
    },
  },
  {
    id: "decodeur-ambisonique", nom: "Décodeur ambisonique", nomEn: "Ambisonic Decoder", univers: UNIVERS, famille: FAMILLE,
    resume: "Décode un champ ambisonique vers une salle réelle : anneau de concert ou format à canaux.",
    resumeEn: "Decodes an ambisonic field to a real room: concert ring or channel format.",
    notice: "Un champ ambisonique ne choisit aucune salle, et c'est sa force : écrit une fois, il se décode vers un anneau de huit, de seize, un 5.1 ou un 7.1.4. Ce composant fait ce décodage.\n\nLe décodeur est échantillonnant : chaque haut-parleur reçoit le champ lu dans sa propre direction. Deux précautions le rendent juste. La normalisation SN3D de l'entrée est défaite au décodage, l'oublier donne un champ dominé par sa composante omnidirectionnelle, où tout paraît venir de partout. Et les poids « max-rE » de Zotter et Frank concentrent l'énergie vers la bonne direction en réduisant les lobes arrière : c'est le réglage à préférer pour l'écoute, et le défaut.\n\nL'ordre du champ se lit sur son étiquette. Un fichier AmbiX chargé depuis le disque se déclare d'abord avec « Déclarer la disposition ». Un ordre plus élevé localise mieux, à condition d'avoir assez de haut-parleurs pour le porter : un ordre trois sur quatre enceintes n'apporte rien.",
    noticeEn: "An ambisonic field chooses no room, and that is its strength: written once, it decodes to a ring of eight, of sixteen, a 5.1 or a 7.1.4. This node does that decoding.\n\nThe decoder is a sampling one: each speaker receives the field read in its own direction. Two precautions make it right. The input's SN3D normalisation is undone at decoding, forgetting it gives a field dominated by its omnidirectional component, where everything seems to come from everywhere. And Zotter and Frank's « max-rE » weights concentrate energy towards the right direction by reducing rear lobes: it is the setting to prefer for listening, and the default.\n\nThe field's order is read from its label. An AmbiX file loaded from disk is first declared with « Declare Layout ». A higher order localises better, provided there are enough speakers to carry it: an order three on four speakers brings nothing.",
    entrees: [{ nom: "Champ", nomEn: "Field", type: "audio" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Salle", nomEn: "Room", ...choixDisposition((d) => d.famille !== "ambisonie", "octo"),
        doc: "La disposition de haut-parleurs vers laquelle décoder. Le caisson de graves d'un 5.1 ou d'un 7.1 ne reçoit rien du champ, qui n'a pas de canal de graves.",
        docEn: "The speaker layout to decode to. The subwoofer of a 5.1 or 7.1 receives nothing from the field, which has no bass channel." },
      { nom: "Poids", nomEn: "Weights", type: "choix", options: ["max-rE", "Basiques"], optionsEn: ["max-rE", "Basic"], optionIds: ["maxre", "basiques"],
        defaut: "max-rE", defautEn: "max-rE",
        doc: "Les poids max-rE concentrent l'énergie vers la direction de la source et réduisent les lobes arrière ; les poids basiques gardent la réponse la plus fidèle au champ mais localisent moins bien. Pour l'écoute, max-rE.",
        docEn: "Max-rE weights concentrate energy towards the source direction and reduce rear lobes; basic weights keep the response most faithful to the field but localise less well. For listening, max-rE." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en ? "No input." : "Aucune entrée." };
      const source = dispositionDe(a);
      if (!source || source.famille !== "ambisonie") {
        return {
          valeurs: [null], erreur: true,
          message: en
            ? "The input is not labelled as an ambisonic field. Declare it first with « Declare Layout »."
            : "L'entrée n'est pas étiquetée comme un champ ambisonique. Déclarez-la d'abord avec « Déclarer la disposition ».",
        };
      }
      const cible = dispositionParId(ctx.paramTexte("Salle", "octo")) ?? dispositionParId("octo")!;
      const maxRE = ctx.paramTexte("Poids", "maxre") !== "basiques";
      const sortie = tamponEtiquete(decoder(canauxDe(a), source.ordre ?? 1, cible.hautParleurs, maxRE), a.sampleRate, cible);
      return { valeurs: [sortie], message: `${en ? source.en : source.fr} → ${en ? cible.en : cible.fr}` };
    },
  },
  {
    id: "ecoute-binaurale", nom: "Écoute binaurale", nomEn: "Binaural Monitor", univers: UNIVERS, famille: FAMILLE,
    resume: "Fait entendre au casque n'importe quelle disposition (anneau, 7.1.4, champ ambisonique) par des haut-parleurs virtuels filtrés par la tête.",
    resumeEn: "Makes any layout audible on headphones (ring, 7.1.4, ambisonic field) through virtual speakers filtered by the head.",
    notice: "On n'écoute pas un 7.1.4 au casque, et c'est pourtant au casque qu'on compose. Sans ce composant, un espace écrit pour douze haut-parleurs reste inaudible sur le poste de travail : le lecteur du navigateur replie tout en stéréo par ses propres règles, qui ne savent rien de l'ambisonie.\n\nChaque canal devient un haut-parleur virtuel placé à sa direction, filtré par les fonctions de transfert de la tête du moteur audio. Un champ ambisonique est d'abord décodé vers vingt-six directions réparties sur la sphère. Le procédé est le même pour les quatre familles, de sorte qu'on compare au casque des choses comparables.\n\nC'est une écoute de travail, pas un export : le caisson de graves est ajouté aux deux oreilles six décibels plus bas, et si la somme dépasse le plein calibre tout le rendu est ramené juste en dessous, un écrêtage masquerait précisément ce qu'on vient écouter. Les fonctions de transfert sont celles du moteur, génériques : elles ne sont pas mesurées sur l'auditeur, et l'impression d'avant et d'arrière en souffre toujours un peu.",
    noticeEn: "You do not listen to a 7.1.4 on headphones, and yet headphones are where you compose. Without this node, a space written for twelve speakers stays inaudible at the workstation: the browser's player folds everything to stereo by its own rules, which know nothing of ambisonics.\n\nEach channel becomes a virtual speaker placed at its direction, filtered by the audio engine's head-related transfer functions. An ambisonic field is first decoded to twenty-six directions spread over the sphere. The process is the same for all four families, so that on headphones you compare comparable things.\n\nIt is a working monitor, not an export: the subwoofer is added to both ears six decibels lower, and if the sum exceeds full scale the whole render is brought just below it, clipping would mask precisely what you came to hear. The transfer functions are the engine's generic ones: they are not those of your head, and the sense of front and back always suffers a little.",
    // Ses sorties audio sont des pairs : aucune ne represente le noeud a elle seule, et un
    // lecteur generique en designerait une au hasard.
    sansApercuAudio: true,
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [{ nom: "Casque", nomEn: "Headphones", type: "audio", sousType: "stereo" }],
    parametres: [],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en ? "No input." : "Aucune entrée." };
      const d = dispositionDe(a);
      if (!d) {
        if (a.numberOfChannels <= 2) return { valeurs: [a], message: en ? "Already stereo." : "Déjà en stéréo." };
        return {
          valeurs: [null], erreur: true,
          message: en
            ? `${a.numberOfChannels} channels without a declared layout. Declare it first with « Declare Layout ».`
            : `${a.numberOfChannels} canaux sans disposition déclarée. Déclarez-la d'abord avec « Déclarer la disposition ».`,
        };
      }
      const rendu = await rendreBinaural(a, d);
      return { valeurs: [rendu], message: `${en ? d.en : d.fr} → ${en ? "binaural" : "binaural"}` };
    },
  },
  {
    id: "objet-sonore", nom: "Objet sonore", nomEn: "Sound Object", univers: UNIVERS, famille: FAMILLE,
    resume: "Attache à un son sa trajectoire, sans choisir de salle : la disposition ne sera décidée qu'au rendu, pour tous les objets à la fois.",
    resumeEn: "Attaches its trajectory to a sound without choosing a room: the layout will only be decided at render time, for all objects at once.",
    notice: "La famille la plus compositionnelle, parce qu'elle sépare ce qu'on écrit de l'endroit où on le joue. Un objet ne sait pas s'il finira en 5.1, en anneau de seize ou au casque : il ne porte que son son et son mouvement. Plusieurs objets partagent un même rendu, et la salle s'y choisit une seule fois, pour tous ; la changer rejoue la même pièce dans une autre salle sans rien réécrire. C'est le principe des formats à objets du cinéma, porté dans le graphe.\n\nLes trajectoires se règlent comme celles du spatialiseur : trois entrées de modulation, azimut, élévation, distance, affichées dans l'inspecteur comme leurs plages.\n\nLa sortie n'est pas de l'audio : c'est un objet, qui ne s'écoute pas seul et ne se branche que sur un rendu d'objets.",
    noticeEn: "The most compositional family, because it separates what is written from where it is played. An object does not know whether it will end in 5.1, a ring of sixteen or on headphones: it only carries its sound and its movement. Connect several objects to one « Object Renderer », and the room is chosen once, for all of them; changing it replays the same piece in another room without rewriting anything. It is the principle of cinema's object formats, brought into the graph.\n\nTrajectories are set like the spatialiser's: three modulation inputs, azimuth, elevation, distance, shown in the inspector as their ranges.\n\nThe output is not audio: it is an object, which cannot be listened to alone and only connects to an object renderer.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }, ...PORTS_TRAJECTOIRE],
    sorties: [{ nom: "Objet", nomEn: "Object", type: "objet" }],
    parametres: [
      { nom: "Nom", nomEn: "Name", type: "texte", defaut: "", defautEn: "", placeholder: "voix", placeholderEn: "voice",
        doc: "Un nom pour s'y retrouver dans le rendu, qui liste ses objets.", docEn: "A name to find your way in the renderer, which lists its objects." },
      ...PARAMETRES_TRAJECTOIRE,
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en ? "No input." : "Aucune entrée." };
      const son = versMono(canauxDe(a));
      const trajectoire = trajectoireDe(ctx, son.length, 1);
      const nom = ctx.paramTexte("Nom", "").trim() || undefined;
      const objet: ObjetSonore = { genre: "objet-sonore", son, frequence: a.sampleRate, trajectoire, nom };
      return {
        valeurs: [objet as unknown as AudioBuffer],
        message: `${nom ?? (en ? "Object" : "Objet")} · ${a.duration.toFixed(1)} s\n${resumeTrajectoire(trajectoire)}`,
      };
    },
  },
  {
    id: "rendu-objets", nom: "Rendu d'objets", nomEn: "Object Renderer", univers: UNIVERS, famille: FAMILLE,
    resume: "Rend tous les objets sonores branchés dans une seule salle, choisie ici et changeable à tout moment.",
    resumeEn: "Renders every connected sound object into a single room, chosen here and changeable at any time.",
    notice: "Le point où la salle se décide. Tous les objets branchés (autant qu'on veut, sur la même entrée) sont placés chacun sur sa trajectoire dans la disposition choisie, puis additionnés. Changer la disposition rejoue toute la pièce dans une autre salle : un anneau de seize pour le concert, un 7.1.4 pour la diffusion, l'ambisonie pour un décodage ultérieur, sans toucher à un seul objet.\n\nLes objets sont rendus à la fréquence du premier d'entre eux ; des objets de fréquences différentes devraient être rééchantillonnés avant, et le composant le signale plutôt que de mélanger des secondes qui n'ont pas la même longueur.",
    noticeEn: "The point where the room is decided. Every connected object (as many as you like, on the same input) is placed on its own trajectory in the chosen layout, then summed. Changing the layout replays the whole piece in another room: a ring of sixteen for concert, a 7.1.4 for broadcast, ambisonics for later decoding, without touching a single object.\n\nObjects are rendered at the sample rate of the first of them; objects at different rates should be resampled beforehand, and the node says so rather than mixing seconds that are not the same length.",
    entrees: [{ nom: "Objets", nomEn: "Objects", type: "objet", dynamique: true }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Disposition", nomEn: "Layout", ...choixDisposition(() => true, "7.1.4"),
        doc: "La salle de rendu, pour tous les objets à la fois. La changer ne réécrit rien : les trajectoires restent celles des objets.",
        docEn: "The render room, for all objects at once. Changing it rewrites nothing: the trajectories stay the objects' own." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const objets = (ctx.entrees() as unknown[]).filter(estObjet);
      if (objets.length === 0) return { valeurs: [null], message: en ? "No object connected." : "Aucun objet branché." };
      const frequence = objets[0].frequence;
      if (objets.some((o) => o.frequence !== frequence)) {
        return {
          valeurs: [null], erreur: true,
          message: en ? "Objects at different sample rates: resample them first." : "Objets à des fréquences différentes : rééchantillonnez-les d'abord.",
        };
      }
      const d = dispositionParId(ctx.paramTexte("Disposition", "7.1.4")) ?? dispositionParId("7.1.4")!;
      const sortie = tamponEtiquete(rendreObjets(objets, d), frequence, d);
      const noms = objets.map((o, i) => o.nom ?? `${i + 1}`).join(", ");
      return {
        valeurs: [sortie],
        message: `${objets.length} ${en ? "objects" : "objets"} → ${en ? d.en : d.fr}\n${noms}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);

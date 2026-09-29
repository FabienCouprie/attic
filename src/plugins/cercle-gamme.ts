// plugins/cercle-gamme.ts — Le cercle d'une gamme nommée, tempérée ou mesurée en cents.
//
// LE CALCUL EST DANS `audio/cercle-gamme.ts`, ÉPROUVÉ, et l'en-tête de ce fichier-là dit pourquoi
// les deux tables de gammes s'y rejoignent. Ce fichier n'est que la prise.
//
// IL N'A PAS DE DESSIN À LUI. Ce qu'il rend est un cercle comme un autre, et c'est le composant qui
// affiche un cercle reçu qui le montre : un dessin de plus ici redirait le sien.

import type { FicheAudio } from "../audio/types-domaine";
import { FONDAMENTALES } from "../audio/cercle";
import { cercleDeGamme, type PlacesDeGamme } from "../audio/cercle-gamme";
import { GAMMES_REUNIES, degresDUneOctave, estTemperee } from "../audio/gammes-reunies";
import { langueCourante } from "../i18n";
import { libelleFondamentale } from "./cercle";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

/** Combien de degrés tombent à plus d'un vingtième de demi-ton d'une touche. */
function horsDuClavier(degres: readonly number[]): number {
  return degres.filter((d) => Math.abs(d - Math.round(d)) > 0.05).length;
}

export const fiches: FicheAudio[] = ([
  {
    id: "cercle-gamme", nom: "Cercle de gamme", nomEn: "Scale Circle",
    univers: "Autres", famille: "Circle",
    resume: "Pose les degrés d'une gamme nommée sur un cercle, maqamat et gamelan compris.",
    resumeEn: "Places the degrees of a named scale on a circle, maqamat and gamelan included.",
    notice: `Pose les degrés d'une gamme sur un cercle, un sommet par degré sonnant. La gamme se choisit par son nom, et non en dessinant ses places une à une.

« Gamme » offre deux ensembles à la suite. Les premières sont comptées en demi-tons et tombent donc sur les touches d'un clavier : les modes, les mineures, les pentatoniques, le vocabulaire du jazz, les symétriques et les gammes à seconde augmentée. Les suivantes sont comptées en cents : maqamat, ragas et gammes de gamelan. La valeur d'un sommet étant à virgule, ces dernières arrivent entières sur le cercle, avec leurs quarts de ton et leurs tierces pures.

« Fondamentale » est la note de la place zéro, donnée avec sa fréquence. Elle déplace tout le cercle et ne change rien aux écarts entre degrés.

« Places » décide de ce que vaut un tour.
• « Un degré par place » donne une place à chaque degré : le tour se fait en autant de pas que la gamme en compte, chacun dure autant, et c'est la seule façon qui convienne à une gamme mesurée en cents.
• « Les douze demi-tons » pose douze places et n'allume que les degrés : l'angle est alors la hauteur, et le polygone dessine la forme de la gamme. Une gamme mesurée en cents ne tombe pas sur ces douze places, et deux de ses degrés voisins s'y rejoindraient : elle revient donc à la première façon, et le message le dit.

« Octave de fermeture » garde le degré qui atteint l'octave. Un cercle y revient déjà tout seul, et ce degré se jette donc par défaut. Il se garde pour les gammes dont l'octave n'est pas juste : celle du slendro vaut 1208 cents et celle du pelog 1206, et c'est ce que ces gammes ont de plus notable. Aucune gamme comptée en demi-tons n'atteint l'octave, ce réglage ne leur fait donc rien.

Le message dit le nom de la gamme, le nombre de places, et combien de degrés tombent entre deux touches.

La sortie « Cercle » porte les places et leurs hauteurs, sans aucune durée : le temps est fourni par le composant qui le rend.`,
    noticeEn: `Places the degrees of a scale on a circle, one vertex per sounding degree. The scale is chosen by name, rather than by drawing its positions one by one.

« Scale » offers two sets in succession. The first are counted in semitones and therefore fall on a keyboard's keys: the modes, the minors, the pentatonics, the jazz vocabulary, the symmetrical scales and the scales with an augmented second. The rest are counted in cents: maqamat, ragas and gamelan scales. A vertex's value having a decimal part, the latter arrive whole on the circle, with their quarter tones and their pure thirds.

« Fundamental » is the note of position zero, given with its frequency. It moves the whole circle and changes nothing about the gaps between degrees.

« Positions » decides what a turn is worth.
• « One position per degree » gives each degree a position: the turn takes as many steps as the scale has degrees, each lasting the same, and it is the only way that suits a scale measured in cents.
• « Twelve semitones » lays out twelve positions and lights only the degrees: the angle is then the pitch, and the polygon draws the shape of the scale. A scale measured in cents does not fall on those twelve positions, and two of its neighbouring degrees would meet there: it therefore reverts to the first way, and the message says so.

« Closing octave » keeps the degree that reaches the octave. A circle already comes back there on its own, so that degree is dropped by default. It is kept for scales whose octave is not just: slendro's is worth 1208 cents and pelog's 1206, and that is what these scales have that is most notable. No scale counted in semitones reaches the octave, so this setting does nothing to them.

The message states the scale's name, the number of positions, and how many degrees fall between two keys.

The « Circle » output carries the positions and their pitches, with no duration at all: time is supplied by the node that renders it.`,
    entrees: [],
    sorties: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    parametres: [
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_REUNIES.map((g) => g.fr), optionsEn: GAMMES_REUNIES.map((g) => g.en),
        optionIds: GAMMES_REUNIES.map((g) => g.id),
        defaut: GAMMES_REUNIES[0].fr, defautEn: GAMMES_REUNIES[0].en,
        doc: "La gamme à poser. Les premières sont comptées en demi-tons, les suivantes en cents.",
        docEn: "The scale to lay out. The first are counted in semitones, the rest in cents." },
      { nom: "Fondamentale", nomEn: "Fundamental", type: "choix",
        options: FONDAMENTALES.map((f) => libelleFondamentale(f, true)),
        optionsEn: FONDAMENTALES.map((f) => libelleFondamentale(f, false)),
        optionIds: FONDAMENTALES.map((f) => String(f.note)),
        defaut: libelleFondamentale(FONDAMENTALES[36], true),
        defautEn: libelleFondamentale(FONDAMENTALES[36], false),
        doc: "La note de la place zéro, donnée avec sa fréquence. Tous les degrés s'en déduisent.",
        docEn: "The note of position zero, given with its frequency. Every degree follows from it." },
      { nom: "Places", nomEn: "Positions", type: "choix",
        options: ["Un degré par place", "Les douze demi-tons"],
        optionsEn: ["One position per degree", "Twelve semitones"],
        optionIds: ["degre", "chromatique"],
        defaut: "Un degré par place", defautEn: "One position per degree",
        doc: "Ce que vaut un tour. Les douze demi-tons dessinent la forme de la gamme, et ne valent que pour une gamme comptée en demi-tons.",
        docEn: "What a turn is worth. Twelve semitones draws the shape of the scale, and only holds for a scale counted in semitones." },
      { nom: "Octave de fermeture", nomEn: "Closing octave", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["non", "oui"],
        defaut: "Non", defautEn: "No",
        doc: "Garder le degré qui atteint l'octave. À garder pour le gamelan, dont l'octave est étirée.",
        docEn: "Keep the degree that reaches the octave. Keep it for the gamelan, whose octave is stretched." },
    ],
    async executer(ctx: any) {
      const id = ctx.paramTexte("Gamme", GAMMES_REUNIES[0].id);
      const fondamentale = parseInt(ctx.paramTexte("Fondamentale", "60"), 10) || 60;
      const places = ctx.paramTexte("Places", "degre") as PlacesDeGamme;
      const fermeture = ctx.paramTexte("Octave de fermeture", "non") === "oui";

      const cercle = cercleDeGamme(id, fondamentale, places, fermeture);
      if (!cercle) {
        return { valeurs: [null], erreur: true,
          message: en() ? `Unknown scale: ${id}` : `Gamme inconnue : ${id}` };
      }
      const nom = GAMMES_REUNIES.find((g) => g.id === id);
      const degres = degresDUneOctave(id, fermeture) ?? [];
      const entreDeuxTouches = horsDuClavier(degres);
      // LA SECONDE FAÇON DE PLACER NE VAUT QUE POUR UNE GAMME TEMPÉRÉE, et le message doit dire
      // qu'elle n'a pas été suivie plutôt que de laisser croire au réglage affiché.
      const repli = places === "chromatique" && !estTemperee(id)
        ? ` · ${en() ? "measured in cents, one position per degree" : "mesurée en cents, une place par degré"}`
        : "";
      const hors = entreDeuxTouches > 0
        ? ` · ${entreDeuxTouches} ${en() ? "between two keys" : "entre deux touches"}`
        : "";
      return {
        valeurs: [cercle],
        // LE CERCLE SE VOIT SUR LE NŒUD, par le canal de ce qu'un run a PRODUIT : il est fabriqué
        // des réglages, donc un réglage changé le périme, ce qu'`affichage` fait exactement.
        affichage: { cercle },
        message: `${nom ? (en() ? nom.en : nom.fr) : id} · ${cercle.positions} `
          + `${en() ? "positions" : "places"} · ${cercle.sommets.length} ${en() ? "degrees" : "degrés"}${repli}${hors}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);

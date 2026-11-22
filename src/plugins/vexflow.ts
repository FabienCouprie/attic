// plugins/vexflow.ts — Les cinq nœuds de gravure.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { fiche, reglagePartage } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { analyserMidi, midiDuFichier } from "../audio/midi";
import {
  GRILLES_NOTATION, accordsDeProgression, genererGrille, genererPartition, genererPortee, genererTab, graverNotation, romainsIllisibles,
  jetonsSansCordeFret, jetonsSansDuree, longueurDeMesure, type Signature,
} from "./vexflow-notation";
import { lireTablature, mettreEnMesures, midiVersEvenements, type FauteGravure } from "../audio/notation-vexflow";

/** La première métrique d'un fichier MIDI, 4/4 s'il n'en déclare pas. */
function signatureDuMidi(pistes: readonly (readonly { type: string; numerator?: number; denominator?: number }[])[]): Signature {
  for (const piste of pistes) {
    const s = piste.find((e) => e.type === "timeSignature" && e.numerator && e.denominator);
    if (s) return { numerateur: s.numerator!, denominateur: s.denominator! };
  }
  return { numerateur: 4, denominateur: 4 };
}

/** Les cordes de chaque accordage de la tablature. */
const CORDES: Record<string, number> = { "Guitare standard": 6, "Ukulélé": 4, Basse: 4 };
import { choixValeurs } from "../audio/valeurs-note";
import { accordsInconnus } from "../audio/theorie-romains";
import { choixClefPortee } from "../audio/clefs-portee";

/** Le refus d'une notation fautive : chaque jeton nommé avec sa raison, les huit premiers. */
function direFautesGravure(fautes: readonly FauteGravure[]): string {
  const liste = fautes.slice(0, 8).map((f) => traduire(`msg.vexflow.faute.${f.raison}`, f.jeton));
  return traduire("msg.vexflow.notation_refusee_var_0", liste.join(" · ") + (fautes.length > 8 ? " · …" : ""));
}

/** La clé des trois portées. Ses identifiants sont les noms de VexFlow, ses libellés sont traduits. */
const CLE_PORTEE = reglagePartage({
  nom: "Clé", nomEn: "Clef", type: "choix", ...choixClefPortee(), defaut: "Sol", defautEn: "Treble",
  doc: "Clé de la portée : de sol pour les voix et les instruments aigus, de fa pour les graves, d'ut 3e ligne pour l'alto, d'ut 4e ligne pour le ténor.",
  docEn: "Staff clef: treble for high voices and instruments, bass for low ones, alto for the viola, tenor for the tenor range.",
});

export const fiches: FicheAudio[] = ([
  fiche({
    id: "vexflow-portee", nomDicte: "portée gravée", nom: "Portée VexFlow", nomEn: "VexFlow Staff",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une portée de notation musicale à partir d'une notation texte.",
    resumeEn: "Displays a musical staff from a text notation.",
    entrees: [{ nom: "Notation", type: "texte", sousType: "notation", requis: false }],
    // DEUX SORTIES POUR UN MÊME SVG, ET LE MÊME NOM POUR LES DEUX. Les quatre graveurs de ce
    // fichier portent la même paire, et la raison vaut pour les quatre.
    //
    // POURQUOI LA SECONDE. « Export SVG » écrit un FICHIER, et son entrée est donc de type image ;
    // ces nœuds ne rendaient qu'une chaîne. Graver une partition et en sauvegarder le SVG était
    // impossible dans un seul graphe : l'application refusait le câble, « connexion illégale :
    // texte → image ». Seule « Partition MIDI », plus bas, savait alimenter l'export — son SVG
    // était déjà un fichier, et c'est son précédent que l'on suit.
    //
    // ET DEUX NOMS, PARCE QUE LE DÉPÔT L'EXIGE — ce que j'ai appris en le cassant. J'avais nommé
    // les deux « SVG », au motif que c'est le même contenu dans deux porteurs, comme « Mélodie »
    // est MIDI ou séquence. Le contrat de réglages refuse l'homonymie de ports sur une même fiche,
    // et sa raison est écrite : l'inspecteur annonce un réglage modulable en NOMMANT le port où la
    // courbe doit aller, et la notice répète ce nom ; avec deux ports homonymes, la phrase ne
    // désigne plus rien. J'avais mesuré qu'aucune fiche ne le faisait, sans chercher si quelque
    // chose l'interdisait.
    //
    // L'AJOUT EST EN FIN DE LISTE, et il le faut : un graphe enregistré désigne un port par son
    // INDICE, et insérer avant aurait décalé la sortie texte de tous les projets existants.
    sorties: [{ nom: "SVG", type: "texte" }, { nom: "Fichier SVG", nomEn: "SVG file", type: "image" }],
    parametres: [
      { nom: "Notation", nomEn: "Notation", type: "texte", defaut: "C4/q D4/8 E4/8 F4/q G4/q",
        doc: "Notes à afficher. Format : note/octave/durée (ex : C4/q, D4/8, F#4/q, C4+E4+G4/q).",
        docEn: "Notes to display. Format: note/octave/duration (e.g. C4/q, D4/8, F#4/q, C4+E4+G4/q).", defautEn: "C4/q D4/8 E4/8 F4/q G4/q" },
      CLE_PORTEE,
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 400], pas: 10, defaut: 160, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const notation = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Notation", "C4/q D4/8 E4/8 F4/q G4/q");
      // CE QUI N'EST PAS CETTE NOTATION EST REFUSE EN LE NOMMANT, et non rendu a la bibliotheque.
      // Mesure : les quatre sorties nommees « Notation » du catalogue ecrivent le format de
      // « Texte -> MIDI », ou la duree est un jeton a part ; branchees ici, elles ne donnaient pas
      // un refus mais l'erreur brute de VexFlow, qui ne dit ni ce qui etait attendu ni quoi
      // brancher. Le message, lui, nomme les jetons fautifs ET la forme attendue.
      const sansDuree = jetonsSansDuree(notation);
      if (sansDuree.length > 0) {
        return { valeurs: [null, null], erreur: true,
          message: traduire("msg.vexflow.notation_sans_duree_var_0", sansDuree.slice(0, 3).join(" ")) };
      }
      const clef = ctx.paramTexte("Clé", "treble");
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 160);
      // UNE DURÉE OU UNE NOTE QUE LA NOTATION NE CONNAÎT PAS EST REFUSÉE EN LA NOMMANT, décision de
      // Fabien du 2026-11-22. Mesuré avant : « C4/q. » perdait son point, « C4/8t » devenait une noire,
      // et « H4/q » finissait en « Aucune note valide », sans dire laquelle.
      const { svg, fautes } = graverNotation(notation, clef, w, h);
      if (fautes.length > 0) return { valeurs: [null, null], erreur: true, message: direFautesGravure(fautes) };
      if (!svg) return { valeurs: [null, null], erreur: true, message: traduire("msg.aucune_note_valide") };
      // Le SVG part AUSSI sur la sortie declaree, pas seulement dans le message.
      // La vue lit le message (VueVexFlow) ; le port, lui, n'emettait rien : la
      // sortie SVG etait donc inexploitable en aval, et le moteur marquait le
      // noeud « Erreur » alors que la portee s'affichait correctement.
      return { valeurs: [svg, new File([svg], "portee.svg", { type: "image/svg+xml" })], message: svg };
   },
 }),
  fiche({
    id: "vexflow-tab", nomDicte: "tablature gravée", nom: "Tablature VexFlow", nomEn: "VexFlow Tab",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une tablature à partir d'une notation texte.",
    resumeEn: "Displays a tablature from a text notation.",
    entrees: [{ nom: "Tablature", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }, { nom: "Fichier SVG", nomEn: "SVG file", type: "image" }],
    parametres: [
      { nom: "Tablature", nomEn: "Tablature", type: "texte", defaut: "6-3/q 5-0/q 5-2/q 4-0/q 5-3/q",
        doc: "Tablature à afficher. Format : corde-fret/durée (ex : 6-3/q = corde 6, fret 3, noire).",
        docEn: "Tablature to display. Format: string-fret/duration (e.g. 6-3/q = 6th string, 3rd fret, quarter note).", defautEn: "6-3/q 5-0/q 5-2/q 4-0/q 5-3/q" },
      { nom: "Accordage", nomEn: "Tuning", type: "choix", options: ["Guitare standard", "Ukulélé", "Basse"], optionIds: ["Guitare standard","Ukulélé","Basse"], optionsEn: ["Standard guitar", "Ukulele", "Bass"], defaut: "Guitare standard",
        doc: "Accordage affiché en titre (la notation reste en corde-fret).", docEn: "Tuning displayed in title (notation remains string-fret).", defautEn: "Standard guitar" },
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 400], pas: 10, defaut: 160, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const tabText = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Tablature", "6-3/q 5-0/q 5-2/q 4-0/q 5-3/q");
      // CE QUI N'EST PAS UNE CORDE ET UNE FRETTE EST REFUSE EN LE NOMMANT. Mesure : nourri du format
      // de « Texte -> MIDI », ce noeud annoncait « Termine » et gravait quatre « NaN » sur la portee,
      // parce que `parseInt` d'un mot rend NaN et que personne ne regardait le resultat.
      const sansCordeFret = jetonsSansCordeFret(tabText);
      if (sansCordeFret.length > 0) {
        return { valeurs: [null, null], erreur: true,
          message: traduire("msg.vexflow.tablature_sans_corde_fret_var_0", sansCordeFret.slice(0, 3).join(" ")) };
      }
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 160);
      // UNE CORDE QUE L'INSTRUMENT N'A PAS, UN ACCORD OU UNE DURÉE INCONNUE SONT REFUSÉS EN LES
      // NOMMANT, revue des notations en texte du 2026-11-22 : ils se dessinaient faux, sans un mot.
      const accordage = ctx.paramTexte("Accordage", "Guitare standard");
      const cordes = CORDES[accordage] ?? 6;
      const { notes, fautes } = lireTablature(tabText, cordes);
      if (fautes.length > 0) {
        const liste = fautes.slice(0, 8).map((f) => traduire(`msg.vexflow.tab.${f.raison}_var_0_var_1`, f.jeton, cordes));
        return { valeurs: [null, null], erreur: true, message: traduire("msg.vexflow.tablature_refusee_var_0", liste.join(" · ")) };
      }
      const svg = genererTab(notes, accordage, cordes, w, h);
      if (!svg) return { valeurs: [null, null], erreur: true, message: traduire("msg.aucune_note_valide") };
      // Le SVG part AUSSI sur la sortie declaree, pas seulement dans le message.
      // La vue lit le message (VueVexFlow) ; le port, lui, n'emettait rien : la
      // sortie SVG etait donc inexploitable en aval, et le moteur marquait le
      // noeud « Erreur » alors que la portee s'affichait correctement.
      return { valeurs: [svg, new File([svg], "tablature.svg", { type: "image/svg+xml" })], message: svg };
   },
 }),
  fiche({
    id: "vexflow-grille", nomDicte: "grille d'accords gravée", nom: "Grille d'accords VexFlow", nomEn: "VexFlow Chord Chart",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une grille d'accords à partir d'une liste de symboles.",
    resumeEn: "Displays a chord chart from a list of symbols.",
    entrees: [{ nom: "Accords", nomEn: "Chords", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }, { nom: "Fichier SVG", nomEn: "SVG file", type: "image" }],
    parametres: [
      { nom: "Accords", nomEn: "Chords", type: "texte", defaut: "C Am F G",
        doc: "Accords à afficher, séparés par des espaces. Accepte aussi une progression en chiffres romains si une tonalité est renseignée.",
        docEn: "Chords to display, separated by spaces. Also accepts a roman numeral progression if a key is set.", defautEn: "C Am F G" },
      { nom: "Tonalité", nomEn: "Key", type: "texte", defaut: "C",
        doc: "Tonalité pour interpréter une progression en chiffres romains. Accepte une tonique seule (« A ») ou un libellé complet (« A minor »), tel que l'émet « Analyse harmonique », dans ce cas le mode nommé l'emporte sur « Gamme ».",
        docEn: "Key used to interpret a roman numeral progression. Accepts a bare tonic (« A ») or a full label (« A minor »), as emitted by « Harmonic Analysis », the named mode then wins over « Scale ».", defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["majeur", "mineur"], optionsEn: ["major", "minor"],
        optionIds: ["majeur", "mineur"], defaut: "majeur", defautEn: "major",
        doc: "Gamme dans laquelle lire les degrés, quand la tonalité ne nomme pas de mode. En mineur, III, VI et VII descendent d'un demi-ton : « i VI III VII » donne Am F C G en la.",
        docEn: "Scale the degrees are read in, when the key names no mode. In minor, III, VI and VII drop a semitone: « i VI III VII » gives Am F C G in A." },
      { nom: "Mesures par ligne", nomEn: "Measures per line", plage: [1, 8], pas: 1, defaut: 4,
        doc: "Nombre de mesures par ligne.", docEn: "Number of measures per line." },
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 600], pas: 10, defaut: 200, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const texte = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Accords", "C Am F G");
      // Même lecture que la partition : chaque jeton, par `estProgressionRomaine`, et les degrés par
      // `accordsPourPartition`. Voir les commentaires là-bas.
      const illisibles = romainsIllisibles(texte);
      if (illisibles.length > 0) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.tonal.romains_inconnus_var_0", illisibles.slice(0, 4).join(" » « ")) };
      }
      const accords = accordsDeProgression(texte, ctx.paramTexte("Tonalité", "C"), ctx.paramTexte("Gamme", "majeur"));
      // UN SYMBOLE QU'AUCUN ACCORD NE RECONNAIT EST REFUSE EN LE NOMMANT. Mesure : nourri du format
      // de « Texte -> MIDI », ce noeud annoncait « Termine » et dessinait quatre-vingts elements sans
      // un seul texte — des mesures vides. Tonal le disait deja par `empty`, que personne ne lisait.
      // LE CONTROLE EST APRES LA LECTURE DES CHIFFRES ROMAINS, et il le faut : ce sont les symboles
      // FINALEMENT graves qu'il s'agit de reconnaitre, pas les degres ecrits.
      const inconnus = accordsInconnus(accords);
      if (inconnus.length > 0) {
        return { valeurs: [null, null], erreur: true,
          message: traduire("msg.accords_inconnus_var_0", inconnus.slice(0, 3).join(" ")) };
      }
      const mpl = Math.round(ctx.paramNombre("Mesures par ligne", 4));
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 200);
      const svg = genererGrille(accords, mpl, w, h);
      if (!svg) return { valeurs: [null, null], erreur: true, message: traduire("msg.aucun_accord_valide") };
      // Le SVG part AUSSI sur la sortie declaree, pas seulement dans le message.
      // La vue lit le message (VueVexFlow) ; le port, lui, n'emettait rien : la
      // sortie SVG etait donc inexploitable en aval, et le moteur marquait le
      // noeud « Erreur » alors que la portee s'affichait correctement.
      return { valeurs: [svg, new File([svg], "grille.svg", { type: "image/svg+xml" })], message: svg };
   },
 }),
  fiche({
    id: "vexflow-partition", nomDicte: "partition dessinée", nom: "Partition VexFlow", nomEn: "VexFlow Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une partition simple à partir d'une progression d'accords.",
    resumeEn: "Displays a simple score from a chord progression.",
    entrees: [{ nom: "Progression", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }, { nom: "Fichier SVG", nomEn: "SVG file", type: "image" }],
    parametres: [
      { nom: "Progression", nomEn: "Progression", type: "texte", defaut: "I V vi IV",
        doc: "Progression en chiffres romains ou en symboles d'accords (ex : C Am F G).",
        docEn: "Roman numeral progression or chord symbols (e.g. C Am F G).", defautEn: "I V vi IV" },
      { nom: "Tonalité", nomEn: "Key", type: "texte", defaut: "C",
        doc: "Tonalité de la progression. Accepte une tonique seule (« A ») ou un libellé complet (« A minor »), tel que l'émet « Analyse harmonique », dans ce cas le mode nommé l'emporte sur « Gamme ».",
        docEn: "Progression key. Accepts a bare tonic (« A ») or a full label (« A minor »), as emitted by « Harmonic Analysis », the named mode then wins over « Scale ».", defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["majeur", "mineur"], optionsEn: ["major", "minor"],
        optionIds: ["majeur", "mineur"], defaut: "majeur", defautEn: "major",
        doc: "Gamme dans laquelle lire les degrés, quand la tonalité ne nomme pas de mode. En mineur, III, VI et VII descendent d'un demi-ton.",
        docEn: "Scale the degrees are read in, when the key names no mode. In minor, III, VI and VII drop a semitone." },
      CLE_PORTEE,
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 400], pas: 10, defaut: 160, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const progression = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Progression", "I V vi IV");
      const tonic = ctx.paramTexte("Tonalité", "C");
      const clef = ctx.paramTexte("Clé", "treble");
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 160);
      // UN SYMBOLE QU'AUCUN ACCORD NE RECONNAÎT EST REFUSÉ EN LE NOMMANT, comme sur la grille. Mesuré
      // avant : « C Zorglub G C » finissait en « Aucune progression valide », sans dire lequel.
      const illisibles = romainsIllisibles(progression);
      if (illisibles.length > 0) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.tonal.romains_inconnus_var_0", illisibles.slice(0, 4).join(" » « ")) };
      }
      const accords = accordsDeProgression(progression, tonic, ctx.paramTexte("Gamme", "majeur"));
      const inconnus = accordsInconnus(accords);
      if (inconnus.length > 0) {
        return { valeurs: [null, null], erreur: true,
          message: traduire("msg.accords_inconnus_var_0", inconnus.slice(0, 3).join(" ")) };
      }
      const svg = genererPartition(accords, clef, w, h);
      if (!svg) return { valeurs: [null, null], erreur: true, message: traduire("msg.aucune_progression_valide") };
      // Le SVG part AUSSI sur la sortie declaree, pas seulement dans le message.
      // La vue lit le message (VueVexFlow) ; le port, lui, n'emettait rien : la
      // sortie SVG etait donc inexploitable en aval, et le moteur marquait le
      // noeud « Erreur » alors que la portee s'affichait correctement.
      return { valeurs: [svg, new File([svg], "partition.svg", { type: "image/svg+xml" })], message: svg };
    },
  }),
  fiche({
    id: "vexflow-midi", nom: "Partition MIDI", nomEn: "MIDI Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une portée de notation musicale à partir d'un fichier MIDI.",
    resumeEn: "Displays a musical staff from a MIDI file.",
    entrees: [{ nom: "MIDI", type: "midi", requis: true }],
    sorties: [{ nom: "SVG", type: "image" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [0, 300], pas: 1, defaut: 0, unite: "BPM",
        doc: "À 0, les durées se lisent en temps du fichier, changements de tempo compris : une noire reste une noire quand le tempo ralentit. Une autre valeur convertit les secondes jouées à ce tempo, pour un fichier joué sans métrique.", docEn: "At 0, durations are read in the file's beats, tempo changes included: a quarter note stays a quarter note when the tempo slows down. Another value converts the played seconds at that tempo, for a file played without a meter." },
      { nom: "Canal", nomEn: "Channel", type: "nombre", plage: [-1, 15], pas: 1, defaut: -1, unite: "-1 = tous", uniteEn: "-1 = all",
        doc: "Canal MIDI à afficher : -1 pour tous les canaux, sauf le 9, celui de la batterie, que le message dit omis. Le 9 choisi par son numéro est gravé.",
        docEn: "MIDI channel to display: -1 for all channels except 9, the drums, which the message says were left out. Channel 9 chosen by its number is engraved." },
      { nom: "Quantification", nomEn: "Quantization", type: "choix", ...choixValeurs(Object.keys(GRILLES_NOTATION)), defaut: "1/16",
        doc: "Résolution de la grille de quantification. Chaque note garde sa longueur, écrite en valeurs pointées et liées, de la ronde à la triple croche ; une grille de triolet n'y est pas, faute de valeur pour l'écrire.",
        docEn: "Quantization grid resolution. Each note keeps its length, written in dotted and tied values, from the whole note to the thirty-second; there is no triplet grid, for want of a value to write it.", defautEn: "1/16" },
      CLE_PORTEE,
      { nom: "Largeur", nomEn: "Width", plage: [200, 2000], pas: 10, defaut: 800, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 800], pas: 10, defaut: 200, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const brut = await midiDuFichier(fichier);
      // À 0, LES DURÉES SE LISENT EN TEMPS DU FICHIER, changements de tempo compris : le fichier est
      // relu à un seul tempo de 120, ce qui rend chaque temps égal à une demi-seconde. Le nœud prenait
      // le premier tempo et convertissait les secondes : après un passage de 120 à 60, une noire se
      // gravait en blanche. Revue des notations en texte, 2026-11-22.
      let bpm = ctx.paramNombre("Tempo", 0);
      const midi = bpm > 0 ? brut : {
        ...brut,
        tracks: brut.tracks.map((piste) => piste.map((e) => (e.type === "setTempo" ? { ...e, microsecondsPerBeat: 500_000 } : e))),
      };
      if (bpm <= 0) bpm = 120;
      const canal = ctx.paramNombre("Canal", -1);
      const grilleNom = ctx.paramTexte("Quantification", "1/16");
      const grille = GRILLES_NOTATION[grilleNom] ?? 0.25;
      const { notes } = analyserMidi(midi);
      // LA BATTERIE N'EST PAS GRAVÉE SOUS « TOUS », décision de Fabien du 2026-11-22 : mesuré avant,
      // la grosse caisse devenait un do 2 et la charleston un fa dièse 2, en clé de sol. Le canal 9
      // choisi par son numéro reste gravé : c'est alors une demande.
      const batterie = canal < 0 ? notes.filter((n) => n.canal === 9).length : 0;
      const notesFiltrees = canal >= 0 ? notes.filter((n) => n.canal === canal) : notes.filter((n) => n.canal !== 9);
      const ditBatterie = batterie > 0 ? `\n${traduire("msg.vexflow.batterie_omise_var_0", batterie)}` : "";
      const evenements = midiVersEvenements(notesFiltrees, bpm, grille);
      if (evenements.length === 0) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_valide") + ditBatterie };
      const signature = signatureDuMidi(midi.tracks);
      const clef = ctx.paramTexte("Clé", "treble");
      const w = ctx.paramNombre("Largeur", 800);
      const h = ctx.paramNombre("Hauteur", 200);
      const svg = genererPortee(mettreEnMesures(evenements, longueurDeMesure(signature)), clef, w, h, signature);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_valide") };
      const svgFile = new File([svg], "partition.svg", { type: "image/svg+xml" });
      // Le message est le SVG, que la vue dessine ; la ligne sur la batterie le suit, comme celle
      // qu'ajoute le moteur pour une valeur de réglage inconnue.
      return { valeurs: [svgFile], message: svg + ditBatterie };
    },
  }),
] as FicheAudio[]).map(avecDoc);


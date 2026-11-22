// plugins/lire-partition.ts — Une partition écrite rendue en séquence, une voix par couche de portée.
//
// CE QUI MANQUAIT : Attic écrivait le MusicXML (`audio/musicxml.ts`) et le gravait par Verovio, mais
// n'en lisait aucun. Une partition éditée dans MuseScore, un choral d'un corpus d'analyse, une pièce
// en MEI n'entraient dans aucune chaîne.
//
// LE CALCUL EST DANS `audio/partition-lecture.ts` POUR LES PARTITIONS, ET DANS `audio/dcml-tsv.ts`
// POUR LES TABLES DU DCML ; ce fichier choisit la source, charge le moteur et compose le rapport.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { detecterFormat, entreeVerovio, type FormatNotation } from "../audio/verovio";
import { hauteursHumdrum, lireDepuisVerovio } from "../audio/partition-lecture";
import { lireTableDcml } from "../audio/dcml-tsv";
import { nomNote } from "../audio/nom-note";
import type { Sequence } from "../audio/sequence";
import { outilVerovio } from "./verovio-outil";

const en = () => langueCourante() === "en";

const EXTRAIT = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Voix</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
<note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>2</voice><type>half</type><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
<note><pitch><step>B</step><octave>3</octave></pitch><duration>1</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration><voice>5</voice><type>half</type><staff>2</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>6</voice><type>quarter</type><staff>2</staff></note>
<note><pitch><step>G</step><octave>2</octave></pitch><duration>1</duration><voice>6</voice><type>quarter</type><staff>2</staff></note>
<note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration><voice>6</voice><type>half</type><staff>2</staff></note>
</measure></part></score-partwise>`;

/** Une table de notes du DCML : un en-tête tabulé qui nomme l'attaque, la portée et la hauteur. */
const estTableDcml = (t: string) => {
  const entete = t.split("\n", 1)[0].split("\t");
  return entete.includes("midi") && entete.includes("staff") && entete.some((c) => c.startsWith("quarterbeats"));
};

type Source = { texte: string; zip?: undefined; nom: string } | { texte?: undefined; zip: ArrayBuffer; nom: string };

const NOMS_FORMAT: Record<FormatNotation | "dcml", string> = { abc: "ABC", musicxml: "MusicXML", mei: "MEI", humdrum: "Humdrum", dcml: "DCML" };

export const fiches: FicheAudio[] = ([
  fiche({
    id: "lire-partition",
    nom: "Lire une partition", nomEn: "Read a Score",
    univers: "Autres", famille: "Harmonisation",
    resume: "Lit une partition MusicXML, MEI, Humdrum ou ABC, ou une table de notes du DCML, et rend une séquence à une voix par couche de portée.",
    resumeEn: "Reads a MusicXML, MEI, Humdrum or ABC score, or a DCML notes table, and returns a sequence with one voice per staff layer.",
    notice: "Ce composant lit une partition écrite et la rend en séquence de notes, avec une voix par couche de chaque portée.\n\nQuatre notations sont lues par le moteur de gravure Verovio : MusicXML, le format d'échange des éditeurs de partition, sous forme de texte ou compressé en .mxl ; MEI ; Humdrum, celui des corpus d'analyse, dont les chorals de Bach encodés par Craig Sapp ; et ABC. S'y ajoutent les tables de notes du Digital and Cognitive Musicology Lab, une ligne par note, que la bibliothèque ms3 extrait de leurs partitions. Le format est reconnu à la forme du texte.\n\nUne voix est une couche d'une portée, telle que la partition l'écrit : sur un choral à deux portées de deux voix, la première voix est le soprano, la deuxième l'alto, la troisième le ténor et la quatrième la basse. Deux voix qui se croisent restent chacune la sienne. Les notes liées forment une seule note. Les reprises ne sont pas dépliées : chaque mesure est lue une fois, telle qu'elle est écrite.\n\nLa partition vient de l'entrée « Notation » quand elle est branchée, sinon du fichier désigné par « Chemin », sinon du texte du réglage « Notation ».\n\n« Chemin » désigne un fichier .musicxml, .xml, .mxl, .mei, .krn, .abc ou .tsv. Le bouton « … » ouvre le sélecteur du système.\n\n« Tempo » règle la durée d'une noire en secondes. À zéro, c'est le tempo écrit dans la partition, et 120 quand elle n'en écrit aucun ; une table du DCML, qui n'en porte pas, est lue à 100.\n\nLa sortie « Séquence » rend les notes, chacune sur sa voix, les voix nommées d'après leur portée quand la partition les nomme. La sortie « Rapport » donne le format reconnu, le tempo employé, et pour chaque voix son nombre de notes et son étendue, puis le nombre de notes liées et les lignes refusées.",
    noticeEn: "This component reads a written score and returns it as a note sequence, with one voice per layer of each staff.\n\nFour notations are read by the Verovio engraving engine: MusicXML, the exchange format of score editors, as text or compressed as .mxl; MEI; Humdrum, the format of analysis corpora, including Bach's chorales encoded by Craig Sapp; and ABC. Added to them are the notes tables of the Digital and Cognitive Musicology Lab, one row per note, which the ms3 library extracts from their scores. The format is recognised from the shape of the text.\n\nA voice is a layer of a staff, as the score writes it: on a chorale of two staves with two voices each, the first voice is the soprano, the second the alto, the third the tenor and the fourth the bass. Two voices that cross each keep their own. Tied notes form a single note. Repeats are not unfolded: every bar is read once, as written.\n\nThe score comes from the « Notation » input when connected, otherwise from the file named by « Path », otherwise from the text of the « Notation » setting.\n\n« Path » names a .musicxml, .xml, .mxl, .mei, .krn, .abc or .tsv file. The « … » button opens the system picker.\n\n« Tempo » sets the length of a quarter note in seconds. At zero, it is the tempo written in the score, and 120 when it writes none; a DCML table, which carries none, is read at 100.\n\nThe « Sequence » output returns the notes, each on its voice, the voices named after their staff when the score names it. The « Report » output gives the recognised format, the tempo used, and for each voice its number of notes and its range, then the number of tied notes and the refused rows.",
    entrees: [{ nom: "Notation", nomEn: "Notation", type: "texte", sousType: "notation", requis: false }],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Chemin", nomEn: "Path", type: "fichier", extensions: ["musicxml", "xml", "mxl", "mei", "krn", "abc", "tsv"], defaut: "", defautEn: "",
        doc: "Le fichier de la partition. Vide, la partition vient du réglage « Notation ».",
        docEn: "The score file. Empty, the score comes from the « Notation » setting." },
      { nom: "Notation", nomEn: "Notation", type: "texte", defaut: EXTRAIT, defautEn: EXTRAIT,
        doc: "Le texte de la partition, quand ni l'entrée « Notation » ni « Chemin » ne la donnent.",
        docEn: "The text of the score, when neither the « Notation » input nor « Path » gives it." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [0, 300], pas: 1, defaut: 0, unite: "BPM",
        doc: "La noire par minute. À zéro, le tempo écrit dans la partition, 120 à défaut, et 100 pour une table du DCML.",
        docEn: "Quarter notes per minute. At zero, the tempo written in the score, 120 failing that, and 100 for a DCML table." },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const chemin = ctx.paramTexte("Chemin", "").trim();
      let source: Source;
      if (typeof entree === "string" && entree.trim()) {
        source = { texte: entree, nom: en() ? "Notation input" : "entrée Notation" };
      } else if (chemin) {
        const api = (window as any).api;
        if (!api?.lireTexte || !api?.lireBinaire) {
          return { valeurs: [null, null], erreur: true, message: en() ? "Reading a file requires the desktop application." : "Lire un fichier demande l'application de bureau." };
        }
        if (/\.mxl$/i.test(chemin)) {
          const octets = await api.lireBinaire(chemin);
          if (!octets) return { valeurs: [null, null], erreur: true, message: `${en() ? "Unreadable file" : "Fichier illisible"} : ${chemin}` };
          const vue = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
          source = { zip: vue.buffer.slice(vue.byteOffset, vue.byteOffset + vue.byteLength) as ArrayBuffer, nom: chemin };
        } else {
          const texte = await api.lireTexte(chemin);
          if (typeof texte !== "string" || !texte.trim()) return { valeurs: [null, null], erreur: true, message: `${en() ? "Unreadable file" : "Fichier illisible"} : ${chemin}` };
          source = { texte, nom: chemin };
        }
      } else {
        source = { texte: ctx.paramTexte("Notation", EXTRAIT), nom: en() ? "Notation setting" : "réglage Notation" };
      }
      const tempoImpose = ctx.paramNombre("Tempo", 0);

      let sequence: Sequence;
      let format: FormatNotation | "dcml";
      const lignes: string[] = [];
      if (source.texte !== undefined && estTableDcml(source.texte)) {
        format = "dcml";
        const lue = lireTableDcml(source.texte, tempoImpose > 0 ? tempoImpose : 100);
        sequence = lue.sequence;
        lignes.push(`${en() ? "tied notes joined" : "notes liées jointes"} : ${lue.liees}`);
        for (const r of lue.refusees.slice(0, 20)) lignes.push(`${en() ? "row" : "ligne"} ${r.ligne} ${en() ? "refused" : "refusée"} : ${r.raison}`);
        if (lue.refusees.length > 0 && sequence.notes.length === 0) {
          return { valeurs: [null, lignes.join("\n")], erreur: true, message: lue.refusees[0].raison };
        }
      } else {
        format = source.zip ? "musicxml" : (detecterFormat(source.texte ?? "") as FormatNotation);
        if (!format) {
          return { valeurs: [null, null], erreur: true, message: en()
            ? "Notation not recognised: expected MusicXML, MEI, Humdrum, ABC or a DCML table."
            : "Notation non reconnue : attendu MusicXML, MEI, Humdrum, ABC ou une table du DCML." };
        }
        let tk: any = null;
        try {
          tk = await outilVerovio(format === "humdrum");
          tk.setOptions({ inputFrom: entreeVerovio(format), expandNever: true });
          const charge = source.zip ? tk.loadZipDataBuffer(source.zip) : tk.loadData(source.texte);
          if (!charge) {
            return { valeurs: [null, null], erreur: true, message: en()
              ? `${NOMS_FORMAT[format]} refused by Verovio: check the notation.`
              : `${NOMS_FORMAT[format]} refusé par Verovio : vérifiez la notation.` };
          }
          // Le Humdrum reprend ses hauteurs dans son texte : l'import de Verovio perd les altérations
          // que l'armure porte (`hauteursHumdrum`).
          const ecrites = format === "humdrum" && source.texte ? hauteursHumdrum(source.texte) : undefined;
          const lue = lireDepuisVerovio(tk, tempoImpose, ecrites);
          sequence = lue.sequence;
          lignes.push(`${en() ? "tied notes joined" : "notes liées jointes"} : ${lue.liees}`);
          if (lue.sansVoix > 0) lignes.push(`${en() ? "notes without staff or layer, left out" : "notes sans portée ni couche, écartées"} : ${lue.sansVoix}`);
        } catch (e: any) {
          return { valeurs: [null, null], erreur: true, message: e?.message ?? String(e) };
        } finally {
          tk?.destroy?.();
        }
      }
      if (sequence.notes.length === 0) {
        return { valeurs: [null, lignes.join("\n")], erreur: true, message: en() ? "No note in the score." : "Aucune note dans la partition." };
      }
      const nbVoix = (sequence.voix ?? []).length || 1;
      const parVoix = Array.from({ length: nbVoix }, (_, v) => {
        const siennes = sequence.notes.filter((n) => (n.voix ?? 0) === v);
        const nom = sequence.voix?.[v]?.nom ?? `${en() ? "voice" : "voix"} ${v + 1}`;
        const etendue = siennes.length
          ? `${nomNote(Math.min(...siennes.map((n) => n.note)))} ${en() ? "to" : "à"} ${nomNote(Math.max(...siennes.map((n) => n.note)))}`
          : (en() ? "no note" : "aucune note");
        return `${v + 1}. ${nom} · ${siennes.length} notes · ${etendue}`;
      });
      const rapport = [
        `${NOMS_FORMAT[format]} · ${source.nom} · ${sequence.tempo} ${en() ? "BPM" : "à la noire"}`,
        "", ...parVoix, "", ...lignes,
      ].join("\n");
      return {
        valeurs: [sequence, rapport],
        message: `${NOMS_FORMAT[format]} · ${nbVoix} ${en() ? "voices" : "voix"} · ${sequence.notes.length} notes`,
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);

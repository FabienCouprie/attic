// plugins/lire-corpus.ts — Un dossier de pièces, ou les chorals de Bach livrés, rendus en corpus.
//
// CHAQUE PIÈCE PASSE PAR LE LECTEUR DE SON FORMAT : MIDI une voix par piste (`audio/corpus-midi.ts`),
// partitions et tables du DCML par la lecture de « Lire une partition » (`plugins/partition-source.ts`).
// Une pièce refusée est nommée avec sa raison ; elle ne fait jamais tomber les autres.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { Respiration } from "../core/respirer";
import type { Corpus, PieceDuCorpus } from "../audio/corpus";
import { corpusDepuisJson, type EnteteCorpus } from "../audio/corpus-fichier";
import { sequenceDepuisMidiParPiste } from "../audio/corpus-midi";
import { tonaliteDesNotes } from "../audio/corpus-tonalite";
import { lirePartitionSource, octetsLus } from "./partition-source";
import { baseModeleLivre } from "./base-modeles";
import { annoncerModele } from "./message-modele";

const en = () => langueCourante() === "en";

/** Le corpus livré, au manifeste des modèles (`scripts/modeles.cjs`). */
export const FICHIER_CHORALS = "oonx/corpus-chorals-bach-dcml-2.json";

const EXTENSIONS = ["mid", "midi", "musicxml", "xml", "mxl", "mei", "krn", "abc", "tsv"];
const extension = (nom: string) => /\.([^.\\/]+)$/.exec(nom)?.[1]?.toLowerCase() ?? "";

/** Le pont de l'application de bureau, absent dans un navigateur et sous un banc de node. */
const apiDeBureau = (): any => (typeof window !== "undefined" ? (window as any).api : undefined);

/** Le corpus livré : par l'application de bureau, sinon par le serveur qui sert `public/`. */
async function lireCorpusLivre(): Promise<{ texte: string } | { absent: string }> {
  const api = apiDeBureau();
  if (api?.lireBinaire) {
    const octets = octetsLus(await api.lireBinaire(FICHIER_CHORALS));
    return octets ? { texte: new TextDecoder().decode(octets) } : { absent: FICHIER_CHORALS };
  }
  const reponse = await fetch(baseModeleLivre(FICHIER_CHORALS)).catch(() => null);
  return reponse?.ok ? { texte: await reponse.text() } : { absent: FICHIER_CHORALS };
}

/** Une pièce d'un dossier, ou la raison de son refus. */
async function lirePiece(api: any, chemin: string, nom: string): Promise<PieceDuCorpus | { refus: string }> {
  const ext = extension(nom);
  if (ext === "mid" || ext === "midi" || ext === "mxl") {
    const octets = octetsLus(await api.lireBinaire(chemin));
    if (!octets) return { refus: en() ? "unreadable" : "illisible" };
    if (ext !== "mxl") {
      const lue = sequenceDepuisMidiParPiste(octets);
      return { sequence: { ...lue.sequence, titre: nom }, source: nom, tonalite: tonaliteDesNotes(lue.sequence) };
    }
    const lue = await lirePartitionSource({ zip: octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer, nom }, 0);
    return lue.ok ? { sequence: { ...lue.sequence, titre: nom }, source: nom, tonalite: tonaliteDesNotes(lue.sequence) } : { refus: lue.message };
  }
  const texte = await api.lireTexte(chemin);
  if (typeof texte !== "string" || !texte.trim()) return { refus: en() ? "unreadable" : "illisible" };
  const lue = await lirePartitionSource({ texte, nom }, 0);
  return lue.ok ? { sequence: { ...lue.sequence, titre: nom }, source: nom, tonalite: tonaliteDesNotes(lue.sequence) } : { refus: lue.message };
}

export const fiches: FicheAudio[] = ([
  fiche({
    id: "lire-corpus",
    nom: "Lire un corpus", nomEn: "Read a Corpus",
    univers: "Autres", famille: "Harmonisation",
    resume: "Lit un dossier de pièces à voix, ou les chorals de Bach livrés, et les rend en corpus.",
    resumeEn: "Reads a folder of pieces in parts, or the bundled Bach chorales, and returns them as a corpus.",
    notice: "Ce composant lit des pièces à plusieurs voix et les rend ensemble, chacune séparée des autres, avec ses voix, le nom de son fichier et sa tonalité.\n\n« Source » choisit d'où elles viennent. « Chorals de Bach (DCML corrigé) » prend les 361 chorals du Digital and Cognitive Musicology Lab, à quatre voix sauf un à cinq (DCMLab/bach_chorales, version 2.0, domaine public), livrés avec l'application et récupérés au premier emploi. 489 de leurs hauteurs ont été corrigées d'après l'encodage de Craig Sapp ; six chorals que cet encodage n'apparie pas sûrement sont livrés sans vérification, et le rapport les nomme. « Dossier » lit les fichiers du dossier désigné par le réglage du même nom.\n\nDans un dossier, chaque fichier est lu selon son extension : un fichier MIDI, .mid ou .midi, donne une voix par piste qui porte des notes ; MusicXML, .musicxml, .xml ou .mxl, MEI, Humdrum, .krn, et ABC donnent une voix par couche de chaque portée ; une table de notes du DCML, .tsv, une voix par couche de chaque portée. Les fichiers sont lus dans l'ordre alphabétique de leur nom.\n\n« Voix » est le nombre de voix qu'une pièce doit avoir : une pièce qui en a un autre nombre est écartée, et le rapport la nomme avec ce nombre.\n\n« Limite » arrête la lecture après ce nombre de pièces gardées ; à zéro, toutes sont lues.\n\nLa tonalité de chaque pièce est estimée sur ses notes, par la méthode de Carol Krumhansl et Mark Schmuckler : la durée de chaque classe de hauteur est comparée aux profils des vingt-quatre tonalités, et la plus proche est retenue, sauf quand la tonalité dont la tonique est la note la plus grave du dernier accord en reste proche : c'est alors elle qui est retenue.\n\nLa sortie « Corpus » rend les pièces gardées. La sortie « Rapport » donne le nombre de pièces lues et écartées, chaque pièce écartée avec sa raison, et pour les chorals de Bach le nombre de hauteurs corrigées et les chorals livrés sans vérification.",
    noticeEn: "This component reads pieces in several parts and returns them together, each kept apart from the others, with its voices, the name of its file and its key.\n\n« Source » chooses where they come from. « Bach chorales (corrected DCML) » takes the 361 chorales of the Digital and Cognitive Musicology Lab, in four parts but one in five (DCMLab/bach_chorales, version 2.0, public domain), bundled with the application and fetched on first use. 489 of their pitches were corrected after Craig Sapp's encoding; six chorales that this encoding does not surely match are delivered unchecked, and the report names them. « Folder » reads the files of the folder named by the setting of the same name.\n\nIn a folder, every file is read according to its extension: a MIDI file, .mid or .midi, gives one voice per track that carries notes; MusicXML, .musicxml, .xml or .mxl, MEI, Humdrum, .krn, and ABC give one voice per layer of each staff; a DCML notes table, .tsv, one voice per layer of each staff. Files are read in the alphabetical order of their names.\n\n« Voices » is the number of voices a piece must have: a piece with another number is left out, and the report names it with that number.\n\n« Limit » stops reading after that many kept pieces; at zero, all are read.\n\nThe key of every piece is estimated on its notes, by the method of Carol Krumhansl and Mark Schmuckler: the duration of every pitch class is compared with the profiles of the twenty-four keys, and the closest is kept, except when the key whose tonic is the lowest note of the last chord stays close to it: that key is then kept.\n\nThe « Corpus » output returns the kept pieces. The « Report » output gives the number of pieces read and left out, every piece left out with its reason, and for the Bach chorales the number of corrected pitches and the chorales delivered unchecked.",
    entrees: [],
    sorties: [
      { nom: "Corpus", nomEn: "Corpus", type: "corpus" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Source", nomEn: "Source", type: "choix",
        options: ["Chorals de Bach (DCML corrigé)", "Dossier"], optionsEn: ["Bach chorales (corrected DCML)", "Folder"],
        optionIds: ["chorals-bach", "dossier"], defaut: "Chorals de Bach (DCML corrigé)", defautEn: "Bach chorales (corrected DCML)",
        doc: "Les chorals de Bach livrés avec l'application, ou les fichiers du dossier désigné par « Dossier ».",
        docEn: "The Bach chorales bundled with the application, or the files of the folder named by « Folder »." },
      { nom: "Dossier", nomEn: "Folder", type: "dossier", defaut: "", defautEn: "",
        doc: "Le dossier lu quand « Source » vaut « Dossier ». Le bouton « … » ouvre le sélecteur du système.",
        docEn: "The folder read when « Source » is « Folder ». The « … » button opens the system picker." },
      { nom: "Voix", nomEn: "Voices", type: "nombre", plage: [2, 4], pas: 1, defaut: 4,
        doc: "Le nombre de voix qu'une pièce doit avoir pour être gardée.",
        docEn: "The number of voices a piece must have to be kept." },
      { nom: "Limite", nomEn: "Limit", type: "nombre", plage: [0, 10000], pas: 1, defaut: 0,
        doc: "Le nombre de pièces gardées après lequel la lecture s'arrête. À zéro, toutes sont lues.",
        docEn: "The number of kept pieces after which reading stops. At zero, all are read." },
    ],
    async executer(ctx) {
      const voixAttendues = Math.round(ctx.paramNombre("Voix", 4));
      const limite = Math.max(0, Math.round(ctx.paramNombre("Limite", 0)));
      const pieces: PieceDuCorpus[] = [];
      const refus: string[] = [];
      let entete: EnteteCorpus | null = null;
      let lues = 0;
      const garder = (p: PieceDuCorpus) => {
        lues++;
        const n = new Set(p.sequence.notes.map((x) => x.voix ?? 0)).size;
        if (n !== voixAttendues) refus.push(`${p.source} · ${n} ${en() ? "voices" : "voix"}`);
        else pieces.push(p);
      };
      const souffle = new Respiration();

      if (ctx.paramTexte("Source", "chorals-bach") === "dossier") {
        const dossier = ctx.paramTexte("Dossier", "").trim();
        if (!dossier) return { valeurs: [null, null], erreur: true, message: en() ? "No folder chosen." : "Aucun dossier choisi." };
        const api = apiDeBureau();
        if (!api?.lireDossier || !api?.lireTexte || !api?.lireBinaire) {
          return { valeurs: [null, null], erreur: true, message: en() ? "Reading a folder requires the desktop application." : "Lire un dossier demande l'application de bureau." };
        }
        const fichiers: { nom: string; chemin: string }[] = ((await api.lireDossier(dossier)) ?? [])
          .filter((f: { nom: string }) => EXTENSIONS.includes(extension(f.nom)))
          .sort((a: { nom: string }, b: { nom: string }) => a.nom.localeCompare(b.nom));
        for (const f of fichiers) {
          if (limite > 0 && pieces.length >= limite) break;
          ctx.onProgress?.(`${f.nom}`);
          const lue = await lirePiece(api, f.chemin, f.nom);
          if ("refus" in lue) { lues++; refus.push(`${f.nom} · ${lue.refus}`); } else garder(lue);
          await souffle.tour();
        }
      } else {
        await annoncerModele(ctx, "lire-corpus", en() ? "Reading the Bach chorales…" : "Lecture des chorals de Bach…");
        const livre = await lireCorpusLivre();
        if ("absent" in livre) {
          return { valeurs: [null, null], erreur: true, message: `${en() ? "bundled corpus missing" : "corpus livré absent"} : ${livre.absent}` };
        }
        const relu = corpusDepuisJson(livre.texte);
        entete = relu.entete;
        for (const p of relu.corpus.pieces) {
          if (limite > 0 && pieces.length >= limite) break;
          garder(p);
        }
      }

      const corpus: Corpus = { pieces };
      const rapport = [
        `${pieces.length} ${en() ? "pieces kept" : "pièces gardées"} · ${lues - pieces.length} ${en() ? "left out" : "écartées"} · ${voixAttendues} ${en() ? "voices" : "voix"}`,
        ...(entete ? ["", `${entete.nom} · ${entete.source} · ${entete.licence}`,
          `${en() ? "corrected pitches" : "hauteurs corrigées"} : ${entete.corrections?.length ?? 0}`,
          ...(entete.nonVerifiees ?? []).map((x) => `${en() ? "unchecked" : "non vérifié"} : ${x.source} · ${x.raison}`)] : []),
        ...(refus.length ? ["", ...refus.map((r) => `${en() ? "left out" : "écartée"} : ${r}`)] : []),
      ].join("\n");
      if (pieces.length === 0) return { valeurs: [null, rapport], erreur: true, message: en() ? "No piece kept." : "Aucune pièce gardée." };
      return { valeurs: [corpus, rapport], message: `${pieces.length} ${en() ? "pieces" : "pièces"} · ${lues - pieces.length} ${en() ? "left out" : "écartées"}` };
    },
  }),
] as FicheAudio[]).map(avecDoc);

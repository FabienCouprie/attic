// plugins/instruments.ts — Nœud « Noms d'instruments » : émet sur sa sortie texte
// une longue liste de noms d'instruments de musique, filtrable par famille.
// Bilingue : les noms suivent la langue de l'app (FR/EN). Rangé dans « Autres ».

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante, type Langue, traduire } from "../i18n";

type Instr = { fr: string; en: string };

// ~130 instruments regroupés par famille (sans doublon entre familles).
export const INSTRUMENTS: Record<string, Instr[]> = {
  Cordes: [
    { fr: "Violon", en: "Violin" }, { fr: "Alto", en: "Viola" }, { fr: "Violoncelle", en: "Cello" },
    { fr: "Contrebasse", en: "Double bass" }, { fr: "Harpe", en: "Harp" },
    { fr: "Guitare classique", en: "Classical guitar" }, { fr: "Guitare folk", en: "Acoustic guitar" },
    { fr: "Guitare électrique", en: "Electric guitar" }, { fr: "Guitare basse", en: "Bass guitar" },
    { fr: "Mandoline", en: "Mandolin" }, { fr: "Banjo", en: "Banjo" }, { fr: "Ukulélé", en: "Ukulele" },
    { fr: "Luth", en: "Lute" }, { fr: "Théorbe", en: "Theorbo" }, { fr: "Sitar", en: "Sitar" },
    { fr: "Koto", en: "Koto" }, { fr: "Guzheng", en: "Guzheng" }, { fr: "Erhu", en: "Erhu" },
    { fr: "Shamisen", en: "Shamisen" }, { fr: "Balalaïka", en: "Balalaika" }, { fr: "Bouzouki", en: "Bouzouki" },
    { fr: "Oud", en: "Oud" }, { fr: "Kora", en: "Kora" }, { fr: "Charango", en: "Charango" },
    { fr: "Vielle à roue", en: "Hurdy-gurdy" }, { fr: "Lyre", en: "Lyre" }, { fr: "Cithare", en: "Zither" },
  ],
  Bois: [
    { fr: "Flûte traversière", en: "Flute" }, { fr: "Piccolo", en: "Piccolo" }, { fr: "Flûte à bec", en: "Recorder" },
    { fr: "Hautbois", en: "Oboe" }, { fr: "Cor anglais", en: "English horn" }, { fr: "Clarinette", en: "Clarinet" },
    { fr: "Clarinette basse", en: "Bass clarinet" }, { fr: "Basson", en: "Bassoon" },
    { fr: "Contrebasson", en: "Contrabassoon" }, { fr: "Saxophone soprano", en: "Soprano saxophone" },
    { fr: "Saxophone alto", en: "Alto saxophone" }, { fr: "Saxophone ténor", en: "Tenor saxophone" },
    { fr: "Saxophone baryton", en: "Baritone saxophone" }, { fr: "Cornemuse", en: "Bagpipes" },
    { fr: "Harmonica", en: "Harmonica" }, { fr: "Flûte de pan", en: "Pan flute" }, { fr: "Ocarina", en: "Ocarina" },
    { fr: "Bombarde", en: "Bombard" }, { fr: "Duduk", en: "Duduk" }, { fr: "Shakuhachi", en: "Shakuhachi" },
    { fr: "Ney", en: "Ney" }, { fr: "Fifre", en: "Fife" }, { fr: "Tin whistle", en: "Tin whistle" },
    { fr: "Kaval", en: "Kaval" },
  ],
  Cuivres: [
    { fr: "Trompette", en: "Trumpet" }, { fr: "Cornet", en: "Cornet" }, { fr: "Bugle", en: "Flugelhorn" },
    { fr: "Trombone", en: "Trombone" }, { fr: "Trombone basse", en: "Bass trombone" },
    { fr: "Cor d'harmonie", en: "French horn" }, { fr: "Tuba", en: "Tuba" }, { fr: "Euphonium", en: "Euphonium" },
    { fr: "Saxhorn", en: "Saxhorn" }, { fr: "Sousaphone", en: "Sousaphone" }, { fr: "Clairon", en: "Bugle" },
    { fr: "Cor des Alpes", en: "Alphorn" }, { fr: "Serpent", en: "Serpent" }, { fr: "Conque", en: "Conch" },
  ],
  Percussions: [
    { fr: "Batterie", en: "Drum kit" }, { fr: "Timbales", en: "Timpani" }, { fr: "Caisse claire", en: "Snare drum" },
    { fr: "Grosse caisse", en: "Bass drum" }, { fr: "Cymbales", en: "Cymbals" }, { fr: "Charleston", en: "Hi-hat" },
    { fr: "Tom", en: "Tom-tom" }, { fr: "Xylophone", en: "Xylophone" }, { fr: "Marimba", en: "Marimba" },
    { fr: "Vibraphone", en: "Vibraphone" }, { fr: "Glockenspiel", en: "Glockenspiel" }, { fr: "Triangle", en: "Triangle" },
    { fr: "Tambourin", en: "Tambourine" }, { fr: "Castagnettes", en: "Castanets" }, { fr: "Wood block", en: "Wood block" },
    { fr: "Cloches tubulaires", en: "Tubular bells" }, { fr: "Gong", en: "Gong" }, { fr: "Tam-tam", en: "Tam-tam" },
    { fr: "Djembé", en: "Djembe" }, { fr: "Congas", en: "Congas" }, { fr: "Bongos", en: "Bongos" },
    { fr: "Tabla", en: "Tabla" }, { fr: "Cajón", en: "Cajón" }, { fr: "Darbouka", en: "Darbuka" },
    { fr: "Steel drum", en: "Steel drum" }, { fr: "Balafon", en: "Balafon" }, { fr: "Cabasa", en: "Cabasa" },
    { fr: "Maracas", en: "Maracas" }, { fr: "Güiro", en: "Güiro" }, { fr: "Cowbell", en: "Cowbell" },
    { fr: "Vibraslap", en: "Vibraslap" }, { fr: "Bâton de pluie", en: "Rain stick" },
  ],
  Claviers: [
    { fr: "Piano", en: "Piano" }, { fr: "Piano à queue", en: "Grand piano" }, { fr: "Piano droit", en: "Upright piano" },
    { fr: "Piano électrique", en: "Electric piano" }, { fr: "Rhodes", en: "Rhodes" }, { fr: "Clavecin", en: "Harpsichord" },
    { fr: "Clavicorde", en: "Clavichord" }, { fr: "Orgue", en: "Organ" }, { fr: "Orgue Hammond", en: "Hammond organ" },
    { fr: "Célesta", en: "Celesta" }, { fr: "Accordéon", en: "Accordion" }, { fr: "Bandonéon", en: "Bandoneon" },
    { fr: "Mélodica", en: "Melodica" }, { fr: "Harmonium", en: "Harmonium" }, { fr: "Clavinet", en: "Clavinet" },
    { fr: "Mellotron", en: "Mellotron" },
  ],
  Électronique: [
    { fr: "Synthétiseur", en: "Synthesizer" }, { fr: "Boîte à rythmes", en: "Drum machine" }, { fr: "Sampler", en: "Sampler" },
    { fr: "Séquenceur", en: "Sequencer" }, { fr: "Theremin", en: "Theremin" }, { fr: "Ondes Martenot", en: "Ondes Martenot" },
    { fr: "Vocodeur", en: "Vocoder" }, { fr: "Groovebox", en: "Groovebox" }, { fr: "Orgue électronique", en: "Electronic organ" },
    { fr: "Piano numérique", en: "Digital piano" },
  ],
  "Voix & Monde": [
    { fr: "Voix", en: "Voice" }, { fr: "Chœur", en: "Choir" }, { fr: "Sifflet", en: "Whistle" },
    { fr: "Guimbarde", en: "Jew's harp" }, { fr: "Kalimba", en: "Kalimba" }, { fr: "Mbira", en: "Mbira" },
    { fr: "Handpan", en: "Handpan" }, { fr: "Hang", en: "Hang" }, { fr: "Didgeridoo", en: "Didgeridoo" },
    { fr: "Carillon", en: "Carillon" }, { fr: "Bol tibétain", en: "Singing bowl" }, { fr: "Appeau", en: "Bird call" },
    { fr: "Scie musicale", en: "Musical saw" }, { fr: "Sanza", en: "Thumb piano" },
  ],
};

export const FAMILLES_INSTRUMENTS = Object.keys(INSTRUMENTS);

// Noms de familles traduits (pour le message / la vue).
export const FAMILLES_LABEL: Record<string, Record<Langue, string>> = {
  Cordes: { fr: "Cordes", en: "Strings" },
  Bois: { fr: "Bois", en: "Woodwinds" },
  Cuivres: { fr: "Cuivres", en: "Brass" },
  Percussions: { fr: "Percussions", en: "Percussion" },
  Claviers: { fr: "Claviers", en: "Keyboards" },
  Électronique: { fr: "Électronique", en: "Electronic" },
  "Voix & Monde": { fr: "Voix & Monde", en: "Voice & World" },
};

// Construit le texte de sortie selon la famille, le format et la langue.
export function construireListeInstruments(
  famille: string, format: string, langue: Langue,
): { texte: string; total: number } {
  const fam = famille === "All" ? "Toutes" : famille;
  const liste = fam && fam !== "Toutes" ? (INSTRUMENTS[fam] ?? []) : Object.values(INSTRUMENTS).flat();
  const noms = liste.map((i) => (langue === "en" ? i.en : i.fr));
  let texte: string;
  // Compare la forme canonique : accepte l'id ("retour-ligne"/"puces") comme
  // les anciens libellés FR/EN encore présents dans les projets enregistrés.
  const fmt = format.trim().toLowerCase();
  if (fmt === "retour-ligne" || fmt === "retour ligne" || fmt === "newline") texte = noms.join("\n");
  else if (fmt === "puces" || fmt === "bullets") texte = noms.map((n) => `• ${n}`).join("\n");
  else texte = noms.join(", ");
  return { texte, total: noms.length };
}

export const fiches: FicheAudio[] = ([
  {
    id: "noms-instruments", nom: "Noms d'instruments", nomEn: "Instrument Names",
    univers: "Autres", famille: "Texte",
    resume: "Émet en texte une longue liste de noms d'instruments de musique.",
    resumeEn: "Outputs a long list of musical instrument names as text.",
    entrees: [],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      {
        nom: "Famille", nomEn: "Family", type: "choix",
        options: ["Toutes", ...FAMILLES_INSTRUMENTS],
        optionsEn: ["All", ...FAMILLES_INSTRUMENTS.map((f) => FAMILLES_LABEL[f]?.en ?? f)],
        optionIds: ["Toutes", ...FAMILLES_INSTRUMENTS],
        defaut: "Toutes",
        doc: "Filtre la liste par famille d'instruments.", docEn: "Filters the list by instrument family.", defautEn: "All",
     },
      {
        nom: "Format", nomEn: "Format", type: "choix",
        options: ["Virgule", "Retour ligne", "Puces"], optionIds: ["virgule","retour-ligne","puces"],
        optionsEn: ["Comma", "Newline", "Bullets"],
        defaut: "Virgule",
        doc: "Séparateur du texte produit.", docEn: "Separator of the produced text.", defautEn: "Comma",
     },
    ],
    async executer(ctx: any) {
      const langue = langueCourante();
      const fam = ctx.paramTexte("Famille", "Toutes");
      const { texte, total } = construireListeInstruments(fam, ctx.paramTexte("Format", "Virgule"), langue);
      const famAff = fam === "Toutes" ? "" : (FAMILLES_LABEL[fam]?.[langue] ?? fam);
      return { valeurs: [texte], message: traduire("msg.var_0_instruments_var_1", total, famAff ? ` — ${famAff}` : "") };
   },
 },
] as FicheAudio[]).map(avecDoc);

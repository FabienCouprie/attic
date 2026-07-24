// plugins/styles-musicaux.ts — Nœud « Styles musicaux » : émet sur sa sortie
// texte une large collection de styles musicaux, filtrable par catégorie.
// Bilingue : les noms suivent la langue de l'app (FR/EN). Rangé dans « Autres ».

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante, type Langue, traduire } from "../i18n";

type Style = { fr: string; en: string };

export const STYLES: Record<string, Style[]> = {
  Rock: [
    { fr: "Rock classique", en: "Classic rock" }, { fr: "Rock alternatif", en: "Alternative rock" },
    { fr: "Rock indé", en: "Indie rock" }, { fr: "Punk rock", en: "Punk rock" }, { fr: "Hard rock", en: "Hard rock" },
    { fr: "Rock progressif", en: "Progressive rock" }, { fr: "Rock psychédélique", en: "Psychedelic rock" },
    { fr: "Garage rock", en: "Garage rock" }, { fr: "Surf rock", en: "Surf rock" }, { fr: "Post-rock", en: "Post-rock" },
    { fr: "Math rock", en: "Math rock" }, { fr: "Krautrock", en: "Krautrock" }, { fr: "Shoegaze", en: "Shoegaze" },
    { fr: "Grunge", en: "Grunge" }, { fr: "Rock sudiste", en: "Southern rock" }, { fr: "Rock college", en: "College rock" },
    { fr: "Rock instrumental", en: "Instrumental rock" }, { fr: "Rockabilly", en: "Rockabilly" },
    { fr: "No wave", en: "No wave" }, { fr: "Space rock", en: "Space rock" },
  ],
  Métal: [
    { fr: "Heavy métal", en: "Heavy metal" }, { fr: "Thrash métal", en: "Thrash metal" },
    { fr: "Death métal", en: "Death metal" }, { fr: "Black métal", en: "Black metal" },
    { fr: "Power métal", en: "Power metal" }, { fr: "Métal symphonique", en: "Symphonic metal" },
    { fr: "Doom métal", en: "Doom metal" }, { fr: "Métalcore", en: "Metalcore" },
    { fr: "Post-métal", en: "Post-metal" }, { fr: "Nu métal", en: "Nu metal" },
    { fr: "Folk métal", en: "Folk metal" }, { fr: "Métal gothique", en: "Gothic metal" },
    { fr: "Métal progressif", en: "Progressive metal" }, { fr: "Sludge métal", en: "Sludge metal" },
    { fr: "Grindcore", en: "Grindcore" }, { fr: "Métal industriel", en: "Industrial metal" },
  ],
  Pop: [
    { fr: "Pop", en: "Pop" }, { fr: "Synth pop", en: "Synth pop" }, { fr: "Pop indé", en: "Indie pop" },
    { fr: "Dream pop", en: "Dream pop" }, { fr: "Chamber pop", en: "Chamber pop" }, { fr: "Power pop", en: "Power pop" },
    { fr: "K-pop", en: "K-pop" }, { fr: "J-pop", en: "J-pop" }, { fr: "Bubblegum pop", en: "Bubblegum pop" },
    { fr: "Electropop", en: "Electropop" }, { fr: "Art pop", en: "Art pop" }, { fr: "Hyperpop", en: "Hyperpop" },
    { fr: "Pop baroque", en: "Baroque pop" }, { fr: "Pop expérimentale", en: "Experimental pop" },
    { fr: "Sophisti-pop", en: "Sophisti-pop" }, { fr: "Sunshine pop", en: "Sunshine pop" },
    { fr: "Teen pop", en: "Teen pop" }, { fr: "Pop latino", en: "Latin pop" },
  ],
  Électronique: [
    { fr: "House", en: "House" }, { fr: "Deep house", en: "Deep house" }, { fr: "Tech house", en: "Tech house" },
    { fr: "Progressive house", en: "Progressive house" }, { fr: "Techno", en: "Techno" }, { fr: "Techno minimale", en: "Minimal techno" },
    { fr: "Trance", en: "Trance" }, { fr: "Drum and bass", en: "Drum and bass" }, { fr: "Dubstep", en: "Dubstep" },
    { fr: "Ambient", en: "Ambient" }, { fr: "Breakbeat", en: "Breakbeat" }, { fr: "Garage", en: "Garage" },
    { fr: "Jungle", en: "Jungle" }, { fr: "IDM", en: "IDM" }, { fr: "Glitch", en: "Glitch" },
    { fr: "Footwork", en: "Footwork" }, { fr: "UK bass", en: "UK bass" }, { fr: "Vaporwave", en: "Vaporwave" },
    { fr: "Synthwave", en: "Synthwave" }, { fr: "Chillwave", en: "Chillwave" }, { fr: "Electro", en: "Electro" },
    { fr: "Industriel", en: "Industrial" }, { fr: "EBM", en: "EBM" }, { fr: "Witch house", en: "Witch house" },
    { fr: "Hardcore", en: "Hardcore" }, { fr: "Gabber", en: "Gabber" }, { fr: "Speedcore", en: "Speedcore" },
    { fr: "Future garage", en: "Future garage" }, { fr: "Braindance", en: "Braindance" },
    { fr: "Donk", en: "Donk" }, { fr: "Hardstyle", en: "Hardstyle" },
  ],
  "Hip-Hop/Rap": [
    { fr: "Hip-hop", en: "Hip-hop" }, { fr: "Boom bap", en: "Boom bap" }, { fr: "Trap", en: "Trap" },
    { fr: "Drill", en: "Drill" }, { fr: "UK drill", en: "UK drill" }, { fr: "Mumble rap", en: "Mumble rap" },
    { fr: "Rap old school", en: "Old school rap" }, { fr: "Gangsta rap", en: "Gangsta rap" },
    { fr: "Rap conscient", en: "Conscious rap" }, { fr: "Hip-hop alternatif", en: "Alternative hip-hop" },
    { fr: "Lo-fi hip-hop", en: "Lo-fi hip-hop" }, { fr: "Grime", en: "Grime" }, { fr: "Afrobeat", en: "Afrobeat" },
    { fr: "Afrobeats", en: "Afrobeats" }, { fr: "Drill UK", en: "UK drill" }, { fr: "Phonk", en: "Phonk" },
    { fr: "Cloud rap", en: "Cloud rap" }, { fr: "Snap rap", en: "Snap rap" },
  ],
  Jazz: [
    { fr: "Bebop", en: "Bebop" }, { fr: "Swing", en: "Swing" }, { fr: "Free jazz", en: "Free jazz" },
    { fr: "Cool jazz", en: "Cool jazz" }, { fr: "Hard bop", en: "Hard bop" }, { fr: "Jazz modal", en: "Modal jazz" },
    { fr: "Jazz fusion", en: "Jazz fusion" }, { fr: "Smooth jazz", en: "Smooth jazz" },
    { fr: "Jazz manouche", en: "Gypsy jazz" }, { fr: "Jazz d'avant-garde", en: "Avant-garde jazz" },
    { fr: "Jazz latin", en: "Latin jazz" }, { fr: "Soul jazz", en: "Soul jazz" }, { fr: "Big band", en: "Big band" },
    { fr: "Jazz vocal", en: "Vocal jazz" }, { fr: "Jazz contemporain", en: "Contemporary jazz" },
    { fr: "Jazz électrique", en: "Electric jazz" }, { fr: "Nu jazz", en: "Nu jazz" },
  ],
  "Blues/Soul/Funk": [
    { fr: "Blues", en: "Blues" }, { fr: "Delta blues", en: "Delta blues" }, { fr: "Chicago blues", en: "Chicago blues" },
    { fr: "Blues électrique", en: "Electric blues" }, { fr: "Rhythm and blues", en: "Rhythm and blues" },
    { fr: "Soul", en: "Soul" }, { fr: "Neo-soul", en: "Neo-soul" }, { fr: "Funk", en: "Funk" },
    { fr: "P-funk", en: "P-funk" }, { fr: "Motown", en: "Motown" }, { fr: "Gospel", en: "Gospel" },
    { fr: "Boogaloo", en: "Boogaloo" }, { fr: "Funk rock", en: "Funk rock" }, { fr: "Funk metal", en: "Funk metal" },
    { fr: "Disco", en: "Disco" }, { fr: "Boogie", en: "Boogie" }, { fr: "Minneapolis sound", en: "Minneapolis sound" },
  ],
  "Country/Folk": [
    { fr: "Country", en: "Country" }, { fr: "Bluegrass", en: "Bluegrass" }, { fr: "Folk", en: "Folk" },
    { fr: "Americana", en: "Americana" }, { fr: "Alt-country", en: "Alt-country" },
    { fr: "Auteur-compositeur", en: "Singer-songwriter" }, { fr: "Celtique", en: "Celtic" },
    { fr: "Western", en: "Western" }, { fr: "Honky tonk", en: "Honky tonk" }, { fr: "Outlaw country", en: "Outlaw country" },
    { fr: "Nashville sound", en: "Nashville sound" }, { fr: "Folk psychédélique", en: "Psychedelic folk" },
    { fr: "Anti-folk", en: "Anti-folk" }, { fr: "Folk rock", en: "Folk rock" }, { fr: "Freak folk", en: "Freak folk" },
  ],
  "Reggae/Latin": [
    { fr: "Reggae", en: "Reggae" }, { fr: "Dub", en: "Dub" }, { fr: "Ska", en: "Ska" },
    { fr: "Rocksteady", en: "Rocksteady" }, { fr: "Dancehall", en: "Dancehall" }, { fr: "Ragga", en: "Ragga" },
    { fr: "Salsa", en: "Salsa" }, { fr: "Bachata", en: "Bachata" }, { fr: "Merengue", en: "Merengue" },
    { fr: "Reggaeton", en: "Reggaeton" }, { fr: "Bossa nova", en: "Bossa nova" }, { fr: "Samba", en: "Samba" },
    { fr: "Tango", en: "Tango" }, { fr: "Cumbia", en: "Cumbia" }, { fr: "Boléro", en: "Bolero" },
    { fr: "Son cubain", en: "Son cubano" }, { fr: "Forró", en: "Forró" }, { fr: "Mariachi", en: "Mariachi" },
    { fr: "Mambo", en: "Mambo" }, { fr: "Rumba", en: "Rumba" }, { fr: "Calypso", en: "Calypso" },
    { fr: "Kompa", en: "Kompa" }, { fr: "Zouk", en: "Zouk" },
  ],
  "Classique/Contemporain": [
    { fr: "Baroque", en: "Baroque" }, { fr: "Classique", en: "Classical" }, { fr: "Romantique", en: "Romantic" },
    { fr: "Moderne", en: "Modern" }, { fr: "Contemporain", en: "Contemporary" }, { fr: "Minimalisme", en: "Minimalism" },
    { fr: "Impressionnisme", en: "Impressionism" }, { fr: "Sérialisme", en: "Serialism" },
    { fr: "Spectral", en: "Spectral" }, { fr: "Néo-classique", en: "Neoclassical" }, { fr: "Opéra", en: "Opera" },
    { fr: "Musique de chambre", en: "Chamber music" }, { fr: "Symphonique", en: "Symphonic" },
    { fr: "Musique concrète", en: "Musique concrète" }, { fr: "Électroacoustique", en: "Electroacoustic" },
    { fr: "Polyphonie", en: "Polyphony" }, { fr: "Choral", en: "Choral" }, { fr: "Lied", en: "Lied" },
    { fr: "Ballet", en: "Ballet" }, { fr: "Post-minimalisme", en: "Post-minimalism" },
  ],
  "World/Traditionnel": [
    { fr: "Musique africaine", en: "African music" }, { fr: "Afro-pop", en: "Afro-pop" },
    { fr: "Highlife", en: "Highlife" }, { fr: "Mbalax", en: "Mbalax" }, { fr: "Soukous", en: "Soukous" },
    { fr: "Musique indienne", en: "Indian music" }, { fr: "Bollywood", en: "Bollywood" },
    { fr: "Raga", en: "Raga" }, { fr: "Bhangra", en: "Bhangra" }, { fr: "Musique japonaise", en: "Japanese music" },
    { fr: "Enka", en: "Enka" }, { fr: "Musique arabe", en: "Arabic music" }, { fr: "Raï", en: "Raï" },
    { fr: "Maqam", en: "Maqam" }, { fr: "Musique klezmer", en: "Klezmer" }, { fr: "Musique tzigane", en: "Gypsy music" },
    { fr: "Flamenco", en: "Flamenco" }, { fr: "Fado", en: "Fado" }, { fr: "Musique bretonne", en: "Breton music" },
    { fr: "Musique irlandaise", en: "Irish music" }, { fr: "Musique balkanique", en: "Balkan music" },
    { fr: "Chanson française", en: "French chanson" }, { fr: "Nouvelle scène française", en: "French new scene" },
    { fr: "Tropicália", en: "Tropicália" }, { fr: "Musique andine", en: "Andean music" },
    { fr: "Musique aborigène", en: "Aboriginal music" }, { fr: "Musique amérindienne", en: "Native American music" },
  ],
};

export const CATEGORIES_STYLES = Object.keys(STYLES);

export const CATEGORIES_LABEL: Record<string, Record<Langue, string>> = {
  Rock: { fr: "Rock", en: "Rock" },
  Métal: { fr: "Métal", en: "Metal" },
  Pop: { fr: "Pop", en: "Pop" },
  Électronique: { fr: "Électronique", en: "Electronic" },
  "Hip-Hop/Rap": { fr: "Hip-Hop/Rap", en: "Hip-Hop/Rap" },
  Jazz: { fr: "Jazz", en: "Jazz" },
  "Blues/Soul/Funk": { fr: "Blues/Soul/Funk", en: "Blues/Soul/Funk" },
  "Country/Folk": { fr: "Country/Folk", en: "Country/Folk" },
  "Reggae/Latin": { fr: "Reggae/Latin", en: "Reggae/Latin" },
  "Classique/Contemporain": { fr: "Classique/Contemporain", en: "Classical/Contemporary" },
  "World/Traditionnel": { fr: "World/Traditionnel", en: "World/Traditional" },
};

export function construireListeStyles(
  categorie: string, format: string, langue: Langue,
): { texte: string; total: number } {
  const cat = categorie === "All" ? "Toutes" : categorie;
  const liste = cat && cat !== "Toutes" ? (STYLES[cat] ?? []) : Object.values(STYLES).flat();
  const noms = liste.map((s) => (langue === "en" ? s.en : s.fr));
  let texte: string;
  if (format === "Retour ligne") texte = noms.join("\n");
  else if (format === "Puces") texte = noms.map((n) => `• ${n}`).join("\n");
  else texte = noms.join(", ");
  return { texte, total: noms.length };
}

export const fiches: FicheAudio[] = ([
  {
    id: "styles-musicaux", nom: "Styles musicaux", nomEn: "Musical Styles",
    univers: "Autres", famille: "Texte",
    resume: "Émet en texte une large collection de styles musicaux par catégorie.",
    resumeEn: "Outputs a large collection of musical styles by category as text.",
    entrees: [],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      {
        nom: "Catégorie", nomEn: "Category", type: "choix",
        options: ["Toutes", ...CATEGORIES_STYLES],
        optionsEn: ["All", ...CATEGORIES_STYLES.map((c) => CATEGORIES_LABEL[c]?.en ?? c)],
        defaut: "Toutes",
        doc: "Filtre la liste par catégorie de styles musicaux.", docEn: "Filters the list by musical style category.", defautEn: "All",
     },
      {
        nom: "Format", nomEn: "Format", type: "choix",
        options: ["Virgule", "Retour ligne", "Puces"],
        optionsEn: ["Comma", "Newline", "Bullets"],
        defaut: "Virgule",
        doc: "Séparateur du texte produit.", docEn: "Separator of the produced text.", defautEn: "Comma",
     },
    ],
    async executer(ctx: any) {
      const langue = langueCourante();
      const cat = ctx.paramTexte("Catégorie", "Toutes");
      const { texte, total } = construireListeStyles(cat, ctx.paramTexte("Format", "Virgule"), langue);
      const catAff = cat === "Toutes" ? "" : (CATEGORIES_LABEL[cat]?.[langue] ?? cat);
      return { valeurs: [texte], message: traduire("msg.var_0_styles_var_1", total, catAff ? ` — ${catAff}` : "") };
   },
 },
] as FicheAudio[]).map(avecDoc);

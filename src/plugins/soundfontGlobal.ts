import { analyserSF2, type StructureSF2 } from "../audio/soundfont";
import { reglagePartage } from "./fiche";

type GlobalAttic = typeof globalThis & {
  __attic_sf2__?: StructureSF2 | null;
  __attic_sf2_nom__?: string;
};

const g = globalThis as GlobalAttic;

export function sf2Chargee(): StructureSF2 | null {
  return g.__attic_sf2__ ?? null;
}

export function sf2Nom(): string {
  return g.__attic_sf2_nom__ ?? "";
}

/** Liste les presets du SoundFont global (toutes banques). La valeur encodée est
 * `banque * 128 + programme`, ce qui permet de stocker banque + programme dans
 * un seul nombre pour le paramètre `sf2instrument`. */
export function listerPresetsSF2(): { valeur: number; banque: number; programme: number; nom: string }[] {
  const sf2 = sf2Chargee();
  if (!sf2) return [];
  const vus = new Set<string>();
  const liste: { valeur: number; banque: number; programme: number; nom: string }[] = [];
  for (const p of sf2.presets) {
    const cle = `${p.banque}:${p.programme}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const valeur = p.banque * 128 + p.programme;
    liste.push({ valeur, banque: p.banque, programme: p.programme, nom: p.nom });
  }
  return liste.sort((a, b) => a.banque - b.banque || a.programme - b.programme);
}

/** Décode une valeur `sf2instrument` en programme (0-127) et banque.
 *  Une valeur négative signifie « Suivre le MIDI » : ne pas écraser les
 *  changements de programme/banque présents dans le fichier. */
export function decoderInstrumentSF2(valeur: number): { programme: number; banque: number } {
  if (valeur < 0) return { programme: -1, banque: -1 };
  const programme = Math.max(0, Math.min(127, Math.round(valeur % 128)));
  const banque = Math.max(0, Math.floor(valeur / 128));
  return { programme, banque };
}

/**
 * Paramètre réutilisable : sélecteur d'instrument SoundFont.
 *
 * LES QUATRE RÉGLAGES DE CE FICHIER PASSENT PAR `reglagePartage` (`plugins/fiche.ts`), et c'est ce
 * qui garde leur nom littéral. Annotés `ParametreDef`, ils l'élargissaient à `string`, et les
 * quarante-six fiches qui les reprennent perdaient la vérification de tous leurs noms.
 */
export const PARAMETRE_INSTRUMENT_SF2 = reglagePartage({
  nom: "Instrument",
  nomEn: "Instrument",
  type: "sf2instrument",
  defaut: 0,
  doc: "Preset du SoundFont global à utiliser pour le rendu (ignoré en mode FM). Chargez d'abord un fichier SF2 dans la barre d'outils. Les kits de percussion (banque 128) sont inclus s'ils sont présents.",
  docEn: "Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present.",
});

export const PARAMETRE_INSTRUMENT_SF2_SUIVI = reglagePartage({
  ...PARAMETRE_INSTRUMENT_SF2,
  defaut: -1,
  doc: "Preset du SoundFont à utiliser, ou Suivre le MIDI pour respecter les changements de programme/banque présents dans le fichier MIDI.",
  docEn: "SoundFont preset to use, or Follow MIDI to use the program/bank changes already in the MIDI file.",
});

/**
 * Paramètre réutilisable : moteur de synthèse. Déclaré une seule fois plutôt
 * que recopié dans chaque nœud — c'est aussi ce qui permet de lui donner des
 * `optionIds` (identité stable, indépendante de la langue) en un seul endroit.
 * Les nœuds qui ont besoin d'une variante font `{ ...PARAMETRE_SYNTHESE, doc: … }`.
 */
export const PARAMETRE_SYNTHESE = reglagePartage({
  nom: "Synthèse",
  nomEn: "Synthesis",
  type: "choix",
  options: ["Automatique", "FM/Oscillateurs", "SoundFont"],
  optionsEn: ["Auto", "FM/Oscillators", "SoundFont"],
  optionIds: ["auto", "fm", "soundfont"],
  defaut: "Automatique",
  doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
  docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples.",
});

// IL N'Y A PLUS DE VARIANTE SANS « AUTOMATIQUE ». L'automate cellulaire, son seul emprunteur, offre
// le moteur entier depuis le 2026-11-14 : un nœud dont le rendu FM est le défaut pose
// `defaut: "FM/Oscillateurs"` sur ce réglage, sans retirer un choix.

// Accepte indifféremment l'id canonique ("auto"/"fm"/"soundfont"), l'ancienne
// valeur française ou l'anglaise : les projets enregistrés avant l'ajout des
// optionIds stockent encore les libellés, et doivent continuer à être relus.
export function normaliserModeSynthèse(valeur: string): "Automatique" | "FM/Oscillateurs" | "SoundFont" {
  const v = valeur.trim().toLowerCase();
  if (v === "soundfont" || v === "sound font") return "SoundFont";
  if (v === "fm" || v === "fm/oscillators" || v === "fm/oscillateurs") return "FM/Oscillateurs";
  if (v === "auto" || v === "automatique") return "Automatique";
  return "Automatique";
}

export async function chargerSF2Globale(
  source: ArrayBuffer | Uint8Array,
  nom: string
): Promise<StructureSF2> {
  const buf = (source instanceof ArrayBuffer ? source : source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)) as ArrayBuffer;
  const sf2 = analyserSF2(buf);
  g.__attic_sf2__ = sf2;
  g.__attic_sf2_nom__ = nom;
  console.log(`[attic] SF2 global chargé : ${nom} (${sf2.presets.length} presets, ${sf2.instruments.length} instruments, ${sf2.echantillons.length} échantillons)`);
  for (const p of sf2.presets.slice(0, 3)) {
    const insts = [...new Set(p.zones.map(z => z.instrumentIdx))].join(",");
    console.log(`[attic]   preset "${p.nom}" prog=${p.programme} banque=${p.banque} zones=${p.zones.length} -> insts=[${insts}]`);
  }
  return sf2;
}

async function chargerSF2DepuisChemin(
  chemin: string,
  lireFichier: (p: string) => Promise<{ donnees: Uint8Array; nom: string } | null>
): Promise<StructureSF2 | null> {
  try {
    const resultat = await lireFichier(chemin);
    if (!resultat) return null;
    const donnees = resultat.donnees;
    if (donnees.length < 1024) return null;
    const riff = String.fromCharCode(donnees[0], donnees[1], donnees[2], donnees[3]);
    const sfbk = String.fromCharCode(donnees[8], donnees[9], donnees[10], donnees[11]);
    if (riff !== "RIFF" || sfbk !== "sfbk") {
      console.warn(`[attic] ${chemin} n'est pas un fichier SF2 valide (RIFF/sfbk manquant)`);
      return null;
    }
    return await chargerSF2Globale(donnees, resultat.nom);
  } catch {
    return null;
  }
}

async function chargerSF2DepuisUrl(url: string): Promise<StructureSF2 | null> {
  try {
    const rep = await fetch(url);
    if (!rep.ok) return null;
    const buf = await rep.arrayBuffer();
    if (buf.byteLength < 1024) return null;
    const v = new DataView(buf);
    const riff = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
    const sfbk = String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11));
    if (riff !== "RIFF" || sfbk !== "sfbk") {
      console.warn(`[attic] ${url} n'est pas un fichier SF2 valide (RIFF/sfbk manquant)`);
      return null;
    }
    const nom = url.split("/").pop() || "soundfont.sf2";
    return await chargerSF2Globale(buf, nom);
  } catch {
    return null;
  }
}

/** Charge le SoundFont embarqué (FluidR3) via le binaire embarqué si l'application
 *  tourne sous Electron, ou via fetch en mode dev Vite. */
const NOMS_SF2_DEFAUT = ["FluidR3_GM.sf2", "FluidR3_GM_GS.sf2"];

async function chargerSF2ParNom(nom: string): Promise<StructureSF2 | null> {
  const api = (window as any).api;
  if (api?.lireBinaire) {
    // En production, le fichier est dans resources/sf2/ ; en dev, le main
    // résout aussi public/sf2/ grâce au fallback public/.
    try {
      const res = await api.lireBinaire(`./sf2/${nom}`);
      if (res?.donnees) {
        const donnees = res.donnees;
        if (donnees.length >= 1024) {
          const riff = String.fromCharCode(donnees[0], donnees[1], donnees[2], donnees[3]);
          const sfbk = String.fromCharCode(donnees[8], donnees[9], donnees[10], donnees[11]);
          if (riff === "RIFF" && sfbk === "sfbk") {
            return await chargerSF2Globale(donnees, res.nom || nom);
          }
        }
      }
    } catch {}
  }
  // Fallback Vite / serveur web (public/sf2/).
  try {
    return await chargerSF2DepuisUrl(`./sf2/${nom}`);
  } catch {}
  return null;
}

/** Le SoundFont retenu par son seul nom, cherché dans `public/sf2/` (dev) ou `resources/sf2/` (Electron). */
async function chargerSF2ParNomRetenu(dernierNom: string): Promise<StructureSF2 | null> {
  const api = (window as any).api;
  if (api?.lireBinaire) {
    try {
      const res = await api.lireBinaire(`./sf2/${encodeURIComponent(dernierNom)}`);
      if (res?.donnees) {
        const donnees = res.donnees;
        if (donnees.length >= 1024) {
          const riff = String.fromCharCode(donnees[0], donnees[1], donnees[2], donnees[3]);
          const sfbk = String.fromCharCode(donnees[8], donnees[9], donnees[10], donnees[11]);
          if (riff === "RIFF" && sfbk === "sfbk") {
            return await chargerSF2Globale(donnees, res.nom || dernierNom);
          }
        }
      }
    } catch {}
  }
  try {
    const charge = await chargerSF2DepuisUrl(`./sf2/${encodeURIComponent(dernierNom)}`);
    if (charge) return charge;
  } catch {}
  return null;
}

/** Les deux clés sous lesquelles le choix de l'utilisateur survit au redémarrage. */
const CLE_NOM_CHOISI = "attic-sf2-nom";
const CLE_CHEMIN_CHOISI = "attic-sf2-chemin";

/**
 * Retient le SoundFont que l'utilisateur vient de charger par la barre d'outils.
 *
 * Le chemin n'existe que sous Electron. SANS LUI, L'ANCIEN CHEMIN EST EFFACÉ : il passerait sinon
 * devant le fichier qu'on vient de choisir, au démarrage suivant.
 */
export function retenirChoixSF2(nom: string, chemin: string): void {
  localStorage.setItem(CLE_NOM_CHOISI, nom);
  if (chemin) localStorage.setItem(CLE_CHEMIN_CHOISI, chemin);
  else localStorage.removeItem(CLE_CHEMIN_CHOISI);
}

/** Un endroit où chercher un SoundFont au démarrage. */
export type SourceSF2 =
  | { genre: "chemin"; chemin: string }
  | { genre: "nom"; nom: string }
  | { genre: "livre"; nom: string };

/**
 * L'ordre du démarrage : le fichier choisi, par son chemin puis par son nom, et la banque livrée
 * ensuite. Le répertoire de travail vient en dernier, à part, parce qu'il faut d'abord le lister.
 *
 * LE CHOIX DE L'UTILISATEUR PASSE AVANT LA BANQUE LIVRÉE depuis le 2026-11-19, à la demande de
 * Fabien : « l'utilisateur doit pouvoir utiliser un autre soundfont s'il le souhaite ». Avant, FluidR3
 * était cherché en premier, et l'installeur le porte toujours (`resources/sf2/`) : un utilisateur
 * qui avait chargé un autre SoundFont retrouvait FluidR3 à chaque démarrage. Et seul le nom du
 * fichier était retenu, si bien qu'un fichier pris hors du dossier `sf2/` n'était jamais retrouvé,
 * même sans FluidR3.
 */
export function sourcesDuDemarrage(choix: { nom: string | null; chemin: string | null }): SourceSF2[] {
  const sources: SourceSF2[] = [];
  if (choix.chemin) sources.push({ genre: "chemin", chemin: choix.chemin });
  if (choix.nom) sources.push({ genre: "nom", nom: choix.nom });
  for (const nom of NOMS_SF2_DEFAUT) sources.push({ genre: "livre", nom });
  return sources;
}

async function chargerSource(source: SourceSF2): Promise<StructureSF2 | null> {
  if (source.genre === "livre") return chargerSF2ParNom(source.nom);
  if (source.genre === "nom") return chargerSF2ParNomRetenu(source.nom);
  // Un chemin absolu, que `fichier:lire-binaire` rend tel quel : le fichier là où l'utilisateur l'a pris.
  const api = (window as any).api;
  if (!api?.lireBinaire) return null;
  return chargerSF2DepuisChemin(source.chemin, api.lireBinaire.bind(api));
}

export async function autoChargerSF2(repertoireTravail?: string): Promise<StructureSF2 | null> {
  const existant = sf2Chargee();
  if (existant) return existant;

  // 1. Le choix de l'utilisateur, puis la banque livrée (FluidR3).
  const choix = { nom: localStorage.getItem(CLE_NOM_CHOISI), chemin: localStorage.getItem(CLE_CHEMIN_CHOISI) };
  for (const source of sourcesDuDemarrage(choix)) {
    const charge = await chargerSource(source);
    if (charge) return charge;
  }

  // 2. Scanner le répertoire de travail (Electron)
  if (repertoireTravail && (window as any).api) {
    try {
      const fichiers = await (window as any).api.lireDossier(repertoireTravail);
      const sf2Trouves = (fichiers as any[])?.filter((f: any) => f.nom.toLowerCase().endsWith(".sf2")) ?? [];
      for (const f of sf2Trouves) {
        const chargeF = await chargerSF2DepuisChemin(f.chemin, (window as any).api.lireFichierAudio.bind((window as any).api));
        if (chargeF) return chargeF;
      }
    } catch {}
  }

  return null;
}

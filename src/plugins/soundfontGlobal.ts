import { analyserSF2, type StructureSF2 } from "../audio/soundfont";
import type { ParametreDef } from "../core/types";

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

/** Paramètre réutilisable : sélecteur d'instrument SoundFont. */
export const PARAMETRE_INSTRUMENT_SF2: ParametreDef = {
  nom: "Instrument",
  nomEn: "Instrument",
  type: "sf2instrument",
  defaut: 0,
  doc: "Preset du SoundFont global à utiliser pour le rendu (ignoré en mode FM). Chargez d'abord un fichier SF2 dans la barre d'outils. Les kits de percussion (banque 128) sont inclus s'ils sont présents.",
  docEn: "Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present.",
};

export const PARAMETRE_INSTRUMENT_SF2_SUIVI: ParametreDef = {
  ...PARAMETRE_INSTRUMENT_SF2,
  defaut: -1,
  doc: "Preset du SoundFont à utiliser, ou Suivre le MIDI pour respecter les changements de programme/banque présents dans le fichier MIDI.",
  docEn: "SoundFont preset to use, or Follow MIDI to use the program/bank changes already in the MIDI file.",
};

export function normaliserModeSynthèse(valeur: string): "Automatique" | "FM/Oscillateurs" | "SoundFont" {
  const v = valeur.trim().toLowerCase();
  if (v === "soundfont" || v === "sound font") return "SoundFont";
  if (v === "fm/oscillators" || v === "fm/oscillateurs") return "FM/Oscillateurs";
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

export async function chargerSF2DepuisChemin(
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

export async function chargerSF2DepuisUrl(url: string): Promise<StructureSF2 | null> {
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

async function chargerSF2Defaut(): Promise<StructureSF2 | null> {
  for (const nom of NOMS_SF2_DEFAUT) {
    const charge = await chargerSF2ParNom(nom);
    if (charge) return charge;
  }
  return null;
}

export async function autoChargerSF2(repertoireTravail?: string): Promise<StructureSF2 | null> {
  const existant = sf2Chargee();
  if (existant) return existant;

  // 1. SoundFont embarqué par défaut (FluidR3) — prioritaire.
  const chargeDefaut = await chargerSF2Defaut();
  if (chargeDefaut) return chargeDefaut;

  const dernierNom = localStorage.getItem("attic-sf2-nom");

  // 2. Dossier public/sf2/ (dev) ou resources/sf2/ (Electron) — autre fichier.
  if (dernierNom) {
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
  }

  // 3. Scanner le répertoire de travail (Electron)
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

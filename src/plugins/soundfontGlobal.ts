import { analyserSF2, type StructureSF2 } from "../audio/soundfont";

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

export async function autoChargerSF2(repertoireTravail?: string): Promise<StructureSF2 | null> {
  const existant = sf2Chargee();
  if (existant) return existant;

  const dernierNom = localStorage.getItem("attic-sf2-nom");

  // 1. Dossier public/sf2/ — prioritaire
  try {
    const liste = await fetch("./sf2/");
    if (liste.ok) {
      // Essayer le dernier utilisé d'abord
      if (dernierNom) {
        const charge = await chargerSF2DepuisUrl(`./sf2/${encodeURIComponent(dernierNom)}`);
        if (charge) return charge;
      }
      // Sinon charger le premier .sf2 trouvé
      const charge = await chargerSF2DepuisUrl("./sf2/The Fixed JummBox SoundFont11.sf2");
      if (charge) return charge;
    }
  } catch { /* pas de dossier sf2/ */ }

  // 2. Racine public/
  const chargePub = await chargerSF2DepuisUrl("./The Fixed JummBox SoundFont11.sf2");
  if (chargePub) return chargePub;

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

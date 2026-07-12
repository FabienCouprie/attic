import { analyserSF2, type StructureSF2 } from "../audio/soundfont";

let sf2DataCache: StructureSF2 | null = null;
let sf2NomCache: string = "";

export function sf2Chargee(): StructureSF2 | null {
  return sf2DataCache;
}

export function sf2Nom(): string {
  return sf2NomCache;
}

export async function chargerSF2Globale(
  source: ArrayBuffer | Uint8Array,
  nom: string
): Promise<StructureSF2> {
  const buf = (source instanceof ArrayBuffer ? source : source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)) as ArrayBuffer;
  sf2DataCache = analyserSF2(buf);
  sf2NomCache = nom;
  return sf2DataCache;
}

export async function chargerSF2DepuisChemin(
  chemin: string,
  lireFichier: (p: string) => Promise<{ donnees: Uint8Array; nom: string } | null>
): Promise<StructureSF2 | null> {
  try {
    const resultat = await lireFichier(chemin);
    if (!resultat) return null;
    return chargerSF2Globale(resultat.donnees, resultat.nom);
  } catch {
    return null;
  }
}

export async function chargerSF2DepuisUrl(url: string): Promise<StructureSF2 | null> {
  try {
    const rep = await fetch(url);
    if (!rep.ok) return null;
    const buf = await rep.arrayBuffer();
    const nom = url.split("/").pop() || "soundfont.sf2";
    return chargerSF2Globale(buf, nom);
  } catch {
    return null;
  }
}

export async function autoChargerSF2(repertoireTravail?: string): Promise<StructureSF2 | null> {
  if (sf2DataCache) return sf2DataCache;

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

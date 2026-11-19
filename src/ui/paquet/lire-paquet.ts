// ui/paquet/lire-paquet.ts — Un paquet `.attic` validé ENTIER avant que l'atelier n'en voie rien.
//
// UN PAQUET ABÎMÉ NE DOIT JAMAIS ÉCRASER LE PROJET OUVERT, demandé le 2026-11-16. Ce module est donc
// tout ou rien : il rend le projet, le cache et les médias, ou il lève `RefusPaquet` — et l'import ne
// touche à l'atelier qu'après lui. Dans cet ordre, sans rien décompresser avant d'avoir tout vu :
//
//   1. le répertoire central, et chaque nom d'entrée, celles qu'on ne lira pas comprises
//      (`ui/paquet/zip.ts` : chemins qui sortent de l'archive, doublons, chiffrement, zip64) ;
//   2. le manifeste, borné à 16 Mio : son format, sa version, la forme de chaque entrée, et la
//      version d'Attic qui l'a écrit, qui ne doit pas être plus récente que celle qui lit ;
//   3. la taille de chaque entrée nommée, comparée à celle du répertoire, et leur SOMME au plafond
//      du paquet — une bombe zip se refuse là, sur ce qu'elle déclare ;
//   4. chaque entrée nommée, décompressée dans la limite de sa taille déclarée, puis son CRC et son
//      empreinte SHA-256 ;
//   5. le projet, qui doit être un objet JSON, et les données, qui doivent avoir leur forme.
//
// CE QUI EST REFUSÉ SANS REFUSER LE PAQUET : une entrée de cache ou un média dont la forme ne se relit
// pas. Le nœud se recalculera, et le reste du paquet s'ouvre.
//
// LE CACHE D'UNE VERSION ANTÉRIEURE SE REPREND, décidé par Fabien le 2026-11-16, et un paquet d'une
// version plus récente est refusé entier (`format-paquet.ts`). Ce que cela engage : un résultat
// calculé par une version du code est resservi par la suivante, même si elle a corrigé le composant,
// tant que ses réglages et ses entrées n'ont pas changé. Les empreintes du moteur ne portent pas de
// version de fiche (`core/cache-execution.ts`).
import type { EntreeDeCache } from "../../core/cache-execution";
import { extraire, lireRepertoire, RefusPaquet, type EntreeLue } from "./zip";
import { DecodeurDePaquet, type OptionsDecodeur } from "./valeurs-paquet";
import {
  EMPREINTES_DU_CACHE, FORMAT_PAQUET, NOM_DONNEES, NOM_MANIFESTE, NOM_PROJET, PLAFOND_MANIFESTE, PLAFOND_PAQUET,
  VERSION_PAQUET, comparerVersions, nomDesOctets, sha256, type EntreeDuManifeste,
} from "./format-paquet";

export interface PaquetLu {
  /** Le texte de `projet.json`, à lire comme un fichier de projet. */
  projet: string;
  /** Le cache à rendre au moteur. */
  cache: Map<string, EntreeDeCache>;
  /** Les médias de chaque nœud, par champ. */
  medias: Map<string, Record<string, Blob>>;
  /** La version d'Attic qui a écrit le paquet : celle qui lit, ou une plus ancienne. */
  application: string;
  /** Ce qui ne s'est pas relu : des entrées de cache et des médias. */
  illisibles: { cache: number; medias: number };
  /** Les entrées de l'archive que le manifeste ne nomme pas, ignorées sans être lues. */
  ignorees: string[];
}

export interface OptionsLecture {
  /** La version d'Attic qui lit. */
  application: string;
  plafond?: number;
  creerUrl?: OptionsDecodeur["creerUrl"];
}

const estObjet = (j: unknown): j is Record<string, unknown> => !!j && typeof j === "object" && !Array.isArray(j);

function lireJson(octets: Uint8Array, code: "manifeste" | "projet" | "donnees"): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(octets));
  } catch {
    throw new RefusPaquet(code, "JSON illisible");
  }
}

function manifesteValide(j: unknown): { application: string; entrees: EntreeDuManifeste[] } {
  if (!estObjet(j) || j.format !== FORMAT_PAQUET) throw new RefusPaquet("manifeste", "ce n'est pas un paquet Attic");
  if (typeof j.version !== "number" || !Number.isInteger(j.version) || j.version < 1) throw new RefusPaquet("manifeste", "version absente");
  if (j.version > VERSION_PAQUET) throw new RefusPaquet("version", `format ${j.version}, cette version lit le format ${VERSION_PAQUET}`);
  if (typeof j.application !== "string" || !Array.isArray(j.entrees)) throw new RefusPaquet("manifeste", "application ou entrées absentes");
  const vus = new Set<string>();
  for (const e of j.entrees as unknown[]) {
    if (!estObjet(e) || typeof e.nom !== "string" || typeof e.sha256 !== "string"
      || typeof e.octets !== "number" || !Number.isInteger(e.octets) || e.octets < 0) throw new RefusPaquet("manifeste", "entrée mal formée");
    if (vus.has(e.nom) || e.nom === NOM_MANIFESTE) throw new RefusPaquet("manifeste", `entrée ${e.nom} nommée deux fois`);
    vus.add(e.nom);
  }
  if (!vus.has(NOM_PROJET) || !vus.has(NOM_DONNEES)) throw new RefusPaquet("manifeste", "projet ou données non nommés");
  return { application: j.application, entrees: j.entrees as EntreeDuManifeste[] };
}

export async function lirePaquet(octets: Uint8Array, o: OptionsLecture): Promise<PaquetLu> {
  const plafond = o.plafond ?? PLAFOND_PAQUET;
  const repertoire = lireRepertoire(octets);
  const m = repertoire.get(NOM_MANIFESTE);
  if (!m) throw new RefusPaquet("manifeste", "paquet.json absent");
  // UN MANIFESTE AU-DELÀ DE SES 16 MIO EST UN MANIFESTE ILLISIBLE, et non un paquet trop gros : le
  // refus `plafond` dit le plafond du paquet, que la configuration règle, et ce n'est pas lui qui joue.
  const brut = await extraire(octets, m, PLAFOND_MANIFESTE).catch((e: unknown) => {
    throw e instanceof RefusPaquet && e.code === "plafond" ? new RefusPaquet("manifeste", e.detail) : e;
  });
  const { application, entrees } = manifesteValide(lireJson(brut, "manifeste"));
  // UN PAQUET D'UN ATTIC PLUS RÉCENT EST REFUSÉ AVANT D'ÊTRE LU : il peut porter des fiches, des
  // réglages ou des valeurs que celui-ci ne connaît pas. Le détail est sa version, que le message dit.
  const ordre = application === o.application ? 0 : comparerVersions(application, o.application);
  if (ordre === null) throw new RefusPaquet("manifeste", `version d'Attic illisible : ${application}, lue par ${o.application}`);
  if (ordre > 0) throw new RefusPaquet("application", application);

  // LA BOMBE SE REFUSE SUR CE QU'ELLE DÉCLARE, avant qu'un octet ne soit décompressé ; `extraire`
  // coupe ensuite tout flux qui rendrait plus que sa déclaration.
  const lues = new Map<string, EntreeLue>();
  let total = 0;
  for (const e of entrees) {
    const r = repertoire.get(e.nom);
    if (!r) throw new RefusPaquet("absente", e.nom);
    if (r.taille !== e.octets) throw new RefusPaquet("taille", `${e.nom} : ${r.taille} octets au répertoire, ${e.octets} au manifeste`);
    total += e.octets;
    lues.set(e.nom, r);
  }
  if (total > plafond) throw new RefusPaquet("plafond", `${total} octets déclarés, pour un plafond de ${plafond}`, { declare: total, plafond });
  const contenus = new Map<string, Uint8Array>();
  for (const e of entrees) {
    const c = await extraire(octets, lues.get(e.nom)!, e.octets);
    if (await sha256(c) !== e.sha256.toLowerCase()) throw new RefusPaquet("empreinte", e.nom);
    contenus.set(e.nom, c);
  }
  const ignorees = [...repertoire.keys()].filter((n) => n !== NOM_MANIFESTE && !lues.has(n) && !n.endsWith("/"));

  const projetOctets = contenus.get(NOM_PROJET)!;
  if (!estObjet(lireJson(projetOctets, "projet"))) throw new RefusPaquet("projet", "ce n'est pas un objet");
  const projet = new TextDecoder("utf-8").decode(projetOctets);
  const donnees = lireJson(contenus.get(NOM_DONNEES)!, "donnees");
  if (!estObjet(donnees) || !Array.isArray(donnees.cache) || !Array.isArray(donnees.medias) || !Array.isArray(donnees.partages)) {
    throw new RefusPaquet("donnees", "forme inattendue");
  }

  const dec = new DecodeurDePaquet(donnees.partages, {
    lireOctets: (k) => (Number.isInteger(k) && k >= 0 ? contenus.get(nomDesOctets(k)) : undefined),
    creerUrl: o.creerUrl,
  });
  const illisibles = { cache: 0, medias: 0 };
  const cache = new Map<string, EntreeDeCache>();
  for (const paire of donnees.cache as unknown[]) {
    const entree = entreeDeCache(paire, dec);
    if (entree) cache.set(entree[0], entree[1]); else illisibles.cache++;
  }
  const medias = new Map<string, Record<string, Blob>>();
  for (const paire of donnees.medias as unknown[]) {
    if (!Array.isArray(paire) || typeof paire[0] !== "string" || !estObjet(paire[1])) { illisibles.medias++; continue; }
    const champs: Record<string, Blob> = {};
    for (const [champ, j] of Object.entries(paire[1])) {
      let v: unknown;
      try { v = dec.decoder(j); } catch { v = null; }
      if (v instanceof Blob) champs[champ] = v; else illisibles.medias++;
    }
    if (Object.keys(champs).length) medias.set(paire[0], champs);
  }
  return { projet, cache, medias, application, illisibles, ignorees };
}

/** Une entrée de cache relue, ou `null` si sa forme n'est pas celle qu'on a écrite. */
function entreeDeCache(paire: unknown, dec: DecodeurDePaquet): [string, EntreeDeCache] | null {
  if (!Array.isArray(paire) || typeof paire[0] !== "string" || !estObjet(paire[1])) return null;
  const { empreintes, reste } = paire[1];
  if (!estObjet(empreintes)) return null;
  for (const cle of EMPREINTES_DU_CACHE) {
    if (empreintes[cle] !== undefined && typeof empreintes[cle] !== "string") return null;
  }
  if (["hashParams", "hashEntree", "hashSorties", "hashValeursEntree"].some((c) => typeof empreintes[c] !== "string")) return null;
  // UNE VALEUR QUI NE SE REFAIT PAS N'EMPORTE QUE SON ENTRÉE : une forme inattendue, ou un tampon que
  // le navigateur refuse de construire. Le nœud se recalculera ; le reste du paquet s'ouvre.
  let corps: unknown;
  try { corps = dec.decoder(reste); } catch { return null; }
  if (!estObjet(corps) || !Array.isArray(corps.valeurs)) return null;
  return [paire[0], { ...corps, ...empreintes } as unknown as EntreeDeCache];
}

// ui/paquet/ecrire-paquet.ts — Le projet, son cache et ses médias, écrits en un paquet `.attic`.
//
// LE PROJET EST LE TEXTE MÊME D'UN EXPORT `.json`, et ce module ne le recalcule pas : il le reçoit de
// `ui/projet-a-ecrire.ts`, que les trois sauvegardes appellent déjà. Un `projet.json` extrait d'un
// paquet est donc le fichier qu'« Exporter » aurait écrit à cet instant.
//
// LE CACHE EST CELUI DU MOTEUR, entrée par entrée, sous l'identifiant qu'il porte — aplati pour un
// membre de méta, recopié pour un tour de boucle. Une entrée est emportée entière ou pas du tout, et
// elle ne l'est pas quand :
//   — sa fiche refuse le cache (`jamaisCache`) : le moteur la recalculerait de toute façon ;
//   — une de ses valeurs ne s'écrit pas, ou nomme un chemin absolu (voir `valeurs-paquet.ts`) ;
//   — elle ferait dépasser le plafond du paquet, ou le nombre d'entrées qu'un zip sait porter.
// Chaque écart est rendu avec sa raison : l'appelant le dit, et le nœud se recalculera.
//
// LES MÉDIAS sont les fichiers qu'on a chargés sur un nœud et que l'ouverture sait refaire : les
// champs `rechargeable` de `core/saisies.ts`. Sans eux, un projet rouvert sur une autre machine ne
// retrouverait pas son son d'entrée, son nœud source se recalculerait sur rien, et tout l'aval
// après lui. Le modèle chargé sur un nœud n'en est pas, et ne part donc jamais.
import { CHAMPS_RECHARGEABLES } from "../../core/saisies";
import { ecrireZip, type EntreeAEcrire } from "./zip";
import { EncodeurDePaquet, NonSerialisable, contientUnCheminAbsolu, type OptionsEncodeur } from "./valeurs-paquet";
import {
  EMPREINTES_DU_CACHE, EMPREINTES_DU_PROJET, FORMAT_PAQUET, NOM_DONNEES, NOM_MANIFESTE, NOM_PROJET,
  PLAFOND_PAQUET, VERSION_PAQUET, nomDesOctets, sha256, type Ecarte, type Manifeste,
} from "./format-paquet";

/** Ce que le paquet reçoit de l'atelier. */
export interface PaquetAEcrire {
  /** Le texte du fichier de projet, tel que `projetAEcrire` le rend. */
  projet: string;
  /** Le cache du moteur, `cacheExec`. */
  cache: ReadonlyMap<string, unknown>;
  /** Les nœuds du graphe racine, avec leurs médias. */
  noeuds: readonly { id: string; data?: Record<string, unknown> }[];
  /** Vrai pour un nœud dont la fiche refuse le cache. */
  jamaisCache?: (id: string) => boolean;
  /** La version d'Attic qui écrit. */
  application: string;
  plafond?: number;
  lireUrl?: OptionsEncodeur["lireUrl"];
}

export interface PaquetEcrit {
  octets: Uint8Array;
  /** Les identifiants des entrées de cache emportées, dans l'ordre du cache. */
  cache: string[];
  medias: number;
  ecartes: Ecarte[];
}

/** La marge que le JSON du cache peut prendre sous le plafond, au-delà des octets des atomes. */
const MARGE_JSON = 32 * 1024 ** 2;
/** Le zip sans zip64 porte 65 534 entrées ; trois sont au manifeste, au projet et aux données. */
const ATOMES_MAX = 65_534 - 3;

const ecartDe = (id: string, champ: string | undefined, e: unknown): Ecarte => (e instanceof NonSerialisable
  ? { id, champ, code: e.code, detail: e.detail || undefined }
  : { id, champ, code: "echec", detail: String((e as Error)?.message ?? e) });

export async function ecrirePaquet(p: PaquetAEcrire): Promise<PaquetEcrit> {
  const texte = new TextEncoder();
  const projet = texte.encode(p.projet);
  const plafond = p.plafond ?? PLAFOND_PAQUET;
  const budget = plafond - projet.length - MARGE_JSON;
  const enc = new EncodeurDePaquet({ lireUrl: p.lireUrl });
  const ecartes: Ecarte[] = [];

  /** Encode une entrée, tout ou rien, et l'écarte si elle fait déborder le paquet. */
  const tenter = async (id: string, champ: string | undefined, f: () => Promise<unknown>) => {
    const avant = enc.marque();
    try {
      const encode = await enc.transaction(f);
      if (enc.poids > budget || enc.octets.length > ATOMES_MAX) {
        enc.annulerJusqua(avant);
        ecartes.push({ id, champ, code: "plafond" });
        return undefined;
      }
      return encode;
    } catch (e) {
      ecartes.push(ecartDe(id, champ, e));
      return undefined;
    }
  };

  const medias: [string, Record<string, unknown>][] = [];
  let nbMedias = 0;
  for (const n of p.noeuds) {
    const champs: Record<string, unknown> = {};
    for (const champ of CHAMPS_RECHARGEABLES) {
      const v = n.data?.[champ];
      if (!(typeof Blob !== "undefined" && v instanceof Blob)) continue;
      const encode = await tenter(n.id, champ, () => enc.encoder(v));
      if (encode !== undefined) { champs[champ] = encode; nbMedias++; }
    }
    if (Object.keys(champs).length) medias.push([n.id, champs]);
  }

  const cache: [string, { empreintes: Record<string, string>; reste: unknown }][] = [];
  for (const [id, brute] of p.cache) {
    if (p.jamaisCache?.(id)) continue;
    const entree = brute as Record<string, unknown>;
    const encode = await tenter(id, undefined, async () => {
      const empreintes: Record<string, string> = {};
      const reste: Record<string, unknown> = { ...entree };
      for (const cle of EMPREINTES_DU_CACHE) {
        const v = entree[cle];
        delete reste[cle];
        if (v === undefined) continue;
        if (typeof v !== "string") throw new NonSerialisable("type", `${cle} : ${typeof v}`);
        if (!EMPREINTES_DU_PROJET.has(cle) && contientUnCheminAbsolu(v)) throw new NonSerialisable("chemin");
        empreintes[cle] = v;
      }
      return { empreintes, reste: await enc.encoder(reste) };
    });
    if (encode !== undefined) cache.push([id, encode as { empreintes: Record<string, string>; reste: unknown }]);
  }

  const donnees = texte.encode(JSON.stringify({ cache, medias, partages: enc.partages }));
  const entrees: EntreeAEcrire[] = [
    { nom: NOM_PROJET, octets: projet, compresser: true },
    { nom: NOM_DONNEES, octets: donnees, compresser: true },
    ...enc.octets.map((o, k) => ({ nom: nomDesOctets(k), octets: o })),
  ];
  const total = entrees.reduce((s, e) => s + e.octets.length, 0);
  if (total > plafond) throw new RangeError(`le paquet ferait ${total} octets, au-delà du plafond de ${plafond}`);
  const manifeste: Manifeste = {
    format: FORMAT_PAQUET, version: VERSION_PAQUET, application: p.application,
    entrees: await Promise.all(entrees.map(async (e) => ({ nom: e.nom, octets: e.octets.length, sha256: await sha256(e.octets) }))),
  };
  const octets = await ecrireZip([
    { nom: NOM_MANIFESTE, octets: texte.encode(JSON.stringify(manifeste, null, 2)), compresser: true },
    ...entrees,
  ]);
  return { octets, cache: cache.map(([id]) => id), medias: nbMedias, ecartes };
}

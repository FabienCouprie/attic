// audio/sfz.ts — LIRE du SFZ, l'inverse de `versSfz`.
//
// Attic sait écrire une banque de clavier en SFZ depuis « Export SFZ ». Il ne savait pas la RELIRE :
// le seul clavier jouable de l'application lit du SF2, et au niveau général — un fichier chargé une
// fois pour toute la session. Ce module permet l'autre sens, et au niveau du nœud : un `.sfz` posé
// sur un nœud devient un instrument jouable à la souris.
//
// POURQUOI C'EST FAISABLE EN UNE FONCTION PURE. SFZ est un format TEXTE, et c'est tout son intérêt
// face au SF2 : pas de tables, pas de générateurs, pas de morceaux binaires à parcourir. Un fichier
// est une suite d'en-têtes entre chevrons et d'opcodes `clé=valeur`. Le format se lit donc sans
// AudioContext, sans disque et sans Electron, ce qui rend la lecture VÉRIFIABLE — et le test qui
// compte relit ce que notre propre exportateur écrit : un aller-retour complet.
//
// LES TROIS PIÈGES DU FORMAT, qui font qu'un analyseur naïf se trompe :
//
//  1. UNE VALEUR PEUT CONTENIR DES ESPACES. `sample=Grand Piano C4.wav lokey=58` n'est pas
//     ambigu pour un échantillonneur : la valeur court jusqu'au PROCHAIN `clé=`. Découper sur les
//     espaces, comme on le fait d'instinct, tronque le nom du fichier au premier blanc — et la
//     moitié des bibliothèques réelles ont des espaces dans leurs noms.
//  2. L'HÉRITAGE. Un opcode posé dans `<global>`, `<master>` ou `<group>` vaut pour toutes les
//     régions qui suivent, jusqu'au prochain en-tête de même niveau. Une bibliothèque écrit
//     rarement `loop_mode` quatre-vingt-dix fois : elle le pose une fois dans le groupe.
//  3. LES NOMS DE NOTES. `lokey=c4` est aussi légal que `lokey=60`, et les deux se croisent dans un
//     même fichier. Do4 vaut 60 dans la convention SFZ.
//
// CE QUI N'EST PAS GÉRÉ EST DIT, et non deviné : chaque opcode rencontré que nous ne savons pas
// traduire est collecté dans `ignores`, que le nœud affiche. Mieux vaut annoncer « douze opcodes
// ignorés : pan, fil_cutoff… » que faire sonner un instrument à moitié et laisser croire qu'il est
// complet.
import type { Banque, Zone } from "./clavier-banque";

/** Une région : une zone de clavier et son échantillon, opcodes hérités déjà résolus. */
export interface RegionSfz {
  /** Chemin de l'échantillon, tel qu'écrit dans le fichier — non résolu. */
  sample: string;
  lokey: number;
  hikey: number;
  /** Note à laquelle l'échantillon est juste (`pitch_keycenter`). */
  racine: number;
  loVel: number;
  hiVel: number;
  modeBoucle: string | null;
  boucleDebut: number | null;
  boucleFin: number | null;
  /** Gain de la région, en décibels (`volume`). */
  volume: number;
  /** Désaccord, en cents (`tune`), transposition entière déjà pliée dans `racine`. */
  accord: number;
  /** `amp_veltrack` : de combien la vélocité fait encore varier le niveau, de 0 à 100. */
  suiviVelocite: number;
  /**
   * La région suit-elle la touche jouée ? `pitch_keytrack=0` dit que non.
   *
   * C'est ainsi qu'un kit de percussion se déclare : son échantillon sort tel qu'il est enregistré,
   * quelle que soit la touche. La valeur normale est 100 — cent cents par demi-ton.
   */
  suitLaTouche: boolean;
}

export interface Probleme {
  code: string;
  detail: string;
}

export interface Sfz {
  regions: RegionSfz[];
  /** `ampeg_release` global, en secondes, ou null s'il n'est pas déclaré. */
  relachement: number | null;
  /** `default_path` de `<control>`, préfixe des chemins d'échantillons. */
  cheminParDefaut: string;
  /** Opcodes rencontrés que nous ne traduisons pas, dans l'ordre de première apparition. */
  ignores: string[];
  problemes: Probleme[];
}

const DEMI_TONS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * Une valeur de note SFZ : un nombre MIDI, ou un nom de note.
 *
 * La convention SFZ met le do central — note 60 — à `c4`, ce qui n'est pas la seule convention en
 * usage (certains logiciels écrivent `c3`). Nous suivons celle du format, et l'octave peut être
 * négative : `c-1` est la note 0.
 */
export function noteSfz(valeur: string): number | null {
  const v = valeur.trim();
  if (v === "") return null;
  if (/^-?\d+$/.test(v)) {
    const n = Number(v);
    return n >= 0 && n <= 127 ? n : null;
  }
  const m = /^([a-gA-G])([#b]?)(-?\d+)$/.exec(v);
  if (!m) return null;
  const base = DEMI_TONS[m[1].toLowerCase()];
  const alteration = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const note = (Number(m[3]) + 1) * 12 + base + alteration;
  return note >= 0 && note <= 127 ? note : null;
}

/** Les opcodes que nous savons traduire. Tout le reste part dans `ignores`. */
const CONNUS = new Set([
  "sample", "lokey", "hikey", "key", "pitch_keycenter", "lovel", "hivel",
  "loop_mode", "loop_start", "loop_end", "loopmode", "loopstart", "loopend",
  "ampeg_release", "volume", "tune", "pitch", "transpose", "default_path", "pitch_keytrack",
  "amp_veltrack",
]);

/**
 * Les opcodes d'un bloc, `clé` en minuscules.
 *
 * LA RÈGLE QUI COMPTE : la valeur d'un opcode court jusqu'au début du suivant, et non jusqu'au
 * prochain espace. C'est ce qui permet à `sample=Grand Piano C4.wav` de survivre.
 */
export function analyserOpcodes(corps: string): Map<string, string> {
  const res = new Map<string, string>();
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*=/g;
  const trouves: { cle: string; debutCle: number; debutValeur: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(corps)) !== null) {
    trouves.push({ cle: m[1].toLowerCase(), debutCle: m.index, debutValeur: re.lastIndex });
  }
  for (let i = 0; i < trouves.length; i++) {
    const fin = i + 1 < trouves.length ? trouves[i + 1].debutCle : corps.length;
    res.set(trouves[i].cle, corps.slice(trouves[i].debutValeur, fin).trim());
  }
  return res;
}

const nombre = (v: string | undefined, defaut: number): number => {
  if (v === undefined) return defaut;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : defaut;
};

/** Le bloc `<en-tête>` et ce qui le suit, jusqu'au prochain en-tête. */
interface Bloc { entete: string; corps: string }

function decouper(texte: string): Bloc[] {
  const blocs: Bloc[] = [];
  const re = /<\s*([A-Za-z_]+)\s*>/g;
  let m: RegExpExecArray | null;
  let courant: Bloc | null = null;
  let position = 0;
  while ((m = re.exec(texte)) !== null) {
    if (courant) { courant.corps = texte.slice(position, m.index); blocs.push(courant); }
    courant = { entete: m[1].toLowerCase(), corps: "" };
    position = re.lastIndex;
  }
  if (courant) { courant.corps = texte.slice(position); blocs.push(courant); }
  return blocs;
}

/**
 * Le texte d'un fichier SFZ, en régions.
 *
 * Les `#define` sont substitués — les bibliothèques s'en servent beaucoup —, les `#include` sont
 * SIGNALÉS et non suivis : ils demanderaient de lire d'autres fichiers, ce que cette fonction, pure,
 * ne fait pas. Le nœud le dira plutôt que de jouer un instrument amputé sans prévenir.
 */
export function analyserSfz(texte: string): Sfz {
  const problemes: Probleme[] = [];
  // Les commentaires d'abord : `//` jusqu'à la fin de la ligne, ce qui vaut aussi pour notre propre
  // en-tête. Conséquence assumée du format : un chemin d'échantillon ne peut pas contenir `//`.
  const lignes = texte.split(/\r?\n/).map((l) => {
    const i = l.indexOf("//");
    return i >= 0 ? l.slice(0, i) : l;
  });

  const defines = new Map<string, string>();
  const gardees: string[] = [];
  for (const ligne of lignes) {
    const def = /^\s*#define\s+(\$[A-Za-z0-9_]+)\s+(.+?)\s*$/.exec(ligne);
    if (def) { defines.set(def[1], def[2]); continue; }
    const inc = /^\s*#include\s+"?([^"]+)"?\s*$/.exec(ligne);
    if (inc) { problemes.push({ code: "include", detail: inc[1].trim() }); continue; }
    gardees.push(ligne);
  }
  let corpsEntier = gardees.join("\n");
  // Les plus longs d'abord : sans quoi `$KEY` mangerait le début de `$KEYRANGE`.
  for (const [nom, valeur] of [...defines].sort((a, b) => b[0].length - a[0].length)) {
    corpsEntier = corpsEntier.split(nom).join(valeur);
  }

  const regions: RegionSfz[] = [];
  const ignores: string[] = [];
  const vusIgnores = new Set<string>();
  let global = new Map<string, string>();
  let master = new Map<string, string>();
  let groupe = new Map<string, string>();
  let cheminParDefaut = "";
  let relachement: number | null = null;

  const noter = (opcodes: Map<string, string>) => {
    for (const cle of opcodes.keys()) {
      if (CONNUS.has(cle) || vusIgnores.has(cle)) continue;
      vusIgnores.add(cle);
      ignores.push(cle);
    }
  };

  for (const bloc of decouper(corpsEntier)) {
    const opcodes = analyserOpcodes(bloc.corps);
    noter(opcodes);
    if (bloc.entete === "control") {
      const dp = opcodes.get("default_path");
      if (dp) cheminParDefaut = dp;
      continue;
    }
    if (bloc.entete === "global") { global = opcodes; master = new Map(); groupe = new Map(); }
    else if (bloc.entete === "master") { master = opcodes; groupe = new Map(); }
    else if (bloc.entete === "group") { groupe = opcodes; }
    else if (bloc.entete === "region") {
      const h = new Map([...global, ...master, ...groupe, ...opcodes]);
      const sample = h.get("sample");
      if (!sample) { problemes.push({ code: "sansEchantillon", detail: `région ${regions.length + 1}` }); continue; }
      const cle = h.get("key") !== undefined ? noteSfz(h.get("key")!) : null;
      const lo = h.get("lokey") !== undefined ? noteSfz(h.get("lokey")!) : null;
      const hi = h.get("hikey") !== undefined ? noteSfz(h.get("hikey")!) : null;
      // `pitch_keycenter` vaut 60 par défaut dans le format ; `key` le fixe en même temps que les
      // bornes, ce qui est la façon courte d'écrire une région d'une seule touche.
      const centre = h.get("pitch_keycenter") !== undefined ? noteSfz(h.get("pitch_keycenter")!) : null;
      // `transpose` décale la hauteur jouée : jouer la touche n sur une région transposée de t
      // revient à jouer n+t, donc à prendre pour racine `centre - t`. C'est la même chose vue de
      // l'autre bout, et cela évite un champ de plus dans la banque.
      const transpose = Math.round(nombre(h.get("transpose"), 0));
      regions.push({
        sample,
        lokey: lo ?? cle ?? 0,
        hikey: hi ?? cle ?? 127,
        racine: (centre ?? cle ?? 60) - transpose,
        loVel: Math.round(nombre(h.get("lovel"), 0)),
        hiVel: Math.round(nombre(h.get("hivel"), 127)),
        modeBoucle: h.get("loop_mode") ?? h.get("loopmode") ?? null,
        boucleDebut: h.has("loop_start") || h.has("loopstart")
          ? Math.round(nombre(h.get("loop_start") ?? h.get("loopstart"), 0)) : null,
        boucleFin: h.has("loop_end") || h.has("loopend")
          ? Math.round(nombre(h.get("loop_end") ?? h.get("loopend"), 0)) : null,
        volume: nombre(h.get("volume"), 0),
        accord: nombre(h.get("tune") ?? h.get("pitch"), 0),
        suitLaTouche: nombre(h.get("pitch_keytrack"), 100) !== 0,
        suiviVelocite: Math.max(0, Math.min(100, nombre(h.get("amp_veltrack"), 100))),
      });
      const rel = h.get("ampeg_release");
      if (rel !== undefined) relachement = Math.max(relachement ?? 0, nombre(rel, 0));
    }
  }
  if (regions.length === 0) problemes.push({ code: "aucuneRegion", detail: "" });
  return { regions, relachement, cheminParDefaut, ignores, problemes };
}

/**
 * Ce fichier décrit-il un KIT — une touche, un son — plutôt qu'un instrument de hauteurs ?
 *
 * DEUX SIGNATURES, et il suffit de l'une. La première est explicite : toutes les régions déclarent
 * `pitch_keytrack=0`, c'est-à-dire « ne transpose pas avec la touche », ce qu'écrivent les kits
 * sérieux. La seconde est de forme : chaque région ne couvre qu'UNE touche. Un kit de percussion est
 * fait comme cela — 36 grosse caisse, 38 caisse claire, 42 charley —, et un instrument échantillonné
 * touche par touche l'est aussi ; les traiter pareil ne coûte rien, puisque la touche y tombe de
 * toute façon sur sa propre racine et que rien ne s'y transpose.
 *
 * UNE SEULE RÉGION NE FAIT PAS UN KIT : c'est le cas courant d'un son étalé, où le repli sur la zone
 * la plus proche est exactement ce qu'on veut.
 */
export function estKitSfz(regions: readonly RegionSfz[]): boolean {
  if (regions.length < 2) return false;
  if (regions.every((r) => !r.suitLaTouche)) return true;
  // Les couches de vélocité ne changent rien ici : un kit dont chaque son a trois nuances a toujours
  // une touche par région.
  return regions.every((r) => r.lokey === r.hikey);
}

/**
 * Le chemin d'un échantillon, résolu.
 *
 * Trois choses à faire, et chacune vient d'un fichier réel : les antislashs de Windows deviennent
 * des barres, `default_path` se préfixe au chemin de la région, et un chemin ABSOLU — lettre de
 * lecteur ou barre initiale — ignore les deux, comme le veut le format.
 */
export function resoudreChemin(dossierSfz: string, cheminParDefaut: string, sample: string): string {
  const barres = (s: string) => s.replace(/\\/g, "/");
  const ech = barres(sample).replace(/^\.\//, "");
  if (/^([A-Za-z]:\/|\/)/.test(ech)) return ech;
  const prefixe = barres(cheminParDefaut).replace(/^\.\//, "").replace(/\/?$/, cheminParDefaut ? "/" : "");
  const base = barres(dossierSfz).replace(/\/$/, "");
  return [base, prefixe + ech].filter((x) => x !== "").join("/");
}

/** Le dossier qui contient un fichier, barres normalisées. */
export function dossierDe(chemin: string): string {
  const s = chemin.replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i > 0 ? s.slice(0, i) : "";
}

export interface Chargement {
  banque: Banque;
  /** Chemins résolus qu'on n'a pas pu décoder ou trouver. */
  manquants: string[];
  /**
   * Régions écartées parce qu'une autre couvre EXACTEMENT les mêmes touches et la même vélocité.
   *
   * Ce sont de vrais doublons — ou des variantes tirées au sort, `seq_position`, que nous ne savons
   * pas jouer. Les couches de vélocité, elles, ne sont plus écartées : elles sont gardées.
   */
  couchesEcartees: number;
  /** Combien de couches de vélocité distinctes la banque contient. */
  couches: number;
}

/**
 * Une banque jouable à partir de régions analysées et d'échantillons décodés.
 *
 * LES COUCHES DE VÉLOCITÉ SONT GARDÉES. Elles ne l'étaient pas : la plus forte de chaque plage de
 * touches était retenue et les autres comptées, si bien qu'un piano joué doucement sonnait dur — un
 * échantillon forte baissé de vingt décibels reste un échantillon forte. Une zone porte donc
 * maintenant sa plage de vélocité, et `choisirZone` la lit. Ne sont plus écartés que les VRAIS
 * doublons : deux régions couvrant exactement les mêmes touches ET la même vélocité, ce qui, dans une
 * bibliothèque, désigne des variantes tirées au sort (`seq_position`) que nous ne savons pas jouer.
 *
 * UN RENONCEMENT RESTE, dit ici plutôt que caché : `one_shot` et `loop_continuous` sont joués comme
 * `loop_sustain` — notre lecteur éteint la note au relâchement de la touche dans tous les cas. La
 * différence s'entend sur une percussion tenue très court, pas sur un instrument tenu.
 */
export function banqueDepuisSfz(
  sfz: Sfz, audios: Map<string, AudioBuffer>,
  o: { dossierSfz?: string; mode?: "auto" | "hauteurs" | "kit" } = {},
): Chargement {
  // Le mode décide de deux choses : le repli sur la zone la plus proche, et la transposition. En
  // automatique, le fichier tranche lui-même — voir `estKitSfz`.
  const mode = o.mode ?? "auto";
  const kit = mode === "kit" || (mode === "auto" && estKitSfz(sfz.regions));
  // « Hauteurs » imposé l'emporte AUSSI sur un `pitch_keytrack=0` écrit dans le fichier : le mode
  // décide de la sémantique, le fichier ne fait qu'informer le choix automatique. Sans cela, forcer
  // « Hauteurs » sur un kit rendait la moitié du geste — le repli sur la zone la plus proche revenait,
  // mais rien ne transposait —, ce qui n'est ni l'une ni l'autre des deux lectures.
  const hauteursImposees = mode === "hauteurs";
  const manquants: string[] = [];
  const dejaManquant = new Set<string>();
  // Une région par plage de touches ET par plage de vélocité : c'est la clé qui distingue une COUCHE
  // d'un doublon. Seul un doublon exact est écarté, et compté.
  const parPlage = new Map<string, RegionSfz>();
  let couchesEcartees = 0;
  for (const r of sfz.regions) {
    const cle = `${r.lokey}:${r.hikey}:${r.racine}:${r.loVel}:${r.hiVel}`;
    if (parPlage.has(cle)) { couchesEcartees++; continue; }
    parPlage.set(cle, r);
  }

  // Trié par racine, puis par vélocité CROISSANTE : les couches d'une même touche se suivent de la
  // plus douce à la plus forte, ce qui rend la banque lisible et l'export prévisible.
  const ordonnees = [...parPlage.values()].sort((a, b) => a.racine - b.racine || a.hiVel - b.hiVel);
  const zones: Zone[] = [];
  for (const r of ordonnees) {
    const chemin = resoudreChemin(o.dossierSfz ?? "", sfz.cheminParDefaut, r.sample);
    const audio = audios.get(chemin) ?? audios.get(r.sample);
    if (!audio) {
      if (!dejaManquant.has(chemin)) { dejaManquant.add(chemin); manquants.push(chemin); }
      continue;
    }
    const zone: Zone = {
      racine: r.racine,
      basse: Math.min(r.lokey, r.hikey),
      haute: Math.max(r.lokey, r.hikey),
      audio,
    };
    if (r.accord !== 0) zone.accord = r.accord;
    if (r.volume !== 0) zone.gain = Math.pow(10, r.volume / 20);
    // Les bornes de vélocité ne sont posées que si elles disent quelque chose : une région pleine
    // plage reste une zone sans couche, et se comporte exactement comme avant.
    if (r.loVel > 0 || r.hiVel < 127) { zone.velBasse = r.loVel; zone.velHaute = r.hiVel; }
    if (r.suiviVelocite !== 100) zone.suiviVelocite = r.suiviVelocite;
    // Dans un kit, aucune zone ne suit la touche : même quand le fichier ne déclare pas
    // `pitch_keytrack=0`, une région d'une seule touche jouée à sa propre racine ne transpose pas —
    // et si le mode est imposé à la main, c'est cette intention qui doit gagner.
    if (!hauteursImposees && (kit || !r.suitLaTouche)) zone.suitLaTouche = false;
    // La boucle : déclarée par le mode, ou par la seule présence des bornes — beaucoup de fichiers
    // posent `loop_start`/`loop_end` et laissent le mode au drapeau du WAV, que nous ne lisons pas.
    const mode = (r.modeBoucle ?? "").toLowerCase();
    const boucleVoulue = mode === "loop_sustain" || mode === "loop_continuous"
      || (mode === "" && r.boucleDebut !== null && r.boucleFin !== null);
    if (boucleVoulue) {
      const debut = Math.max(0, Math.min(audio.length - 2, r.boucleDebut ?? 0));
      const fin = Math.max(debut + 32, Math.min(audio.length - 1, r.boucleFin ?? audio.length - 1));
      if (fin > debut && fin < audio.length) zone.boucle = { debut, fin };
    }
    zones.push(zone);
  }

  const noteBasse = zones.length ? Math.min(...zones.map((z) => z.basse)) : 21;
  const noteHaute = zones.length ? Math.max(...zones.map((z) => z.haute)) : 108;
  // La largeur n'est pas un réglage ici, c'est une MESURE : de combien de demi-tons la touche la
  // plus éloignée de sa racine devra être rééchantillonnée. Elle dit la qualité du fichier lu.
  let largeur = 0;
  for (const z of zones) {
    largeur = Math.max(largeur, z.racine - z.basse, z.haute - z.racine);
  }
  const racines = zones.map((z) => z.racine).sort((a, b) => a - b);
  // Le nombre de couches : la plus fournie des touches décide. Une banque où une seule note a trois
  // enregistrements est bien une banque à trois couches, même si les autres n'en ont qu'un.
  const parTouche = new Map<string, number>();
  for (const z of zones) {
    const cle = `${z.basse}:${z.haute}:${z.racine}`;
    parTouche.set(cle, (parTouche.get(cle) ?? 0) + 1);
  }
  const couches = parTouche.size ? Math.max(...parTouche.values()) : 0;
  return {
    banque: {
      zones,
      racineSource: racines[Math.floor(racines.length / 2)] ?? 60,
      largeur,
      noteBasse,
      noteHaute,
      ...(couches > 1 ? { couches } : {}),
      ...(kit ? { kit: true } : {}),
    },
    manquants,
    couchesEcartees,
    couches,
  };
}

/**
 * Les chemins distincts à décoder, dans l'ordre.
 *
 * Une bibliothèque réutilise souvent le même fichier dans plusieurs régions — une région par couche
 * de vélocité pointant vers un même WAV, ou une région par touche d'un même échantillon. Décoder
 * deux fois le même mégaoctet est du temps perdu et, sur un piano complet, cela se compte en
 * secondes.
 */
export function cheminsAChargerSfz(sfz: Sfz, dossierSfz: string): string[] {
  const vus = new Set<string>();
  const liste: string[] = [];
  for (const r of sfz.regions) {
    const chemin = resoudreChemin(dossierSfz, sfz.cheminParDefaut, r.sample);
    if (vus.has(chemin)) continue;
    vus.add(chemin);
    liste.push(chemin);
  }
  return liste;
}

/**
 * Lit un SFZ de bout en bout : texte → régions → échantillons décodés → banque.
 *
 * Le DÉCODEUR est injecté, ce qui n'est pas un détail : il tient tout ce qui dépend de l'extérieur —
 * Electron pour lire le disque, un AudioContext pour décoder un WAV —, si bien que tout le reste de
 * ce module se teste sans l'un ni l'autre. Le nœud et la vue du clavier passent le même décodeur.
 */
export async function chargerSfz(
  texte: string, dossierSfz: string,
  decoder: (chemin: string) => Promise<AudioBuffer | null>,
  o: {
    surProgres?: (faits: number, total: number) => void;
    mode?: "auto" | "hauteurs" | "kit";
  } = {},
): Promise<Chargement & { sfz: Sfz }> {
  const sfz = analyserSfz(texte);
  const chemins = cheminsAChargerSfz(sfz, dossierSfz);
  const audios = new Map<string, AudioBuffer>();
  for (let i = 0; i < chemins.length; i++) {
    const audio = await decoder(chemins[i]);
    if (audio) audios.set(chemins[i], audio);
    o.surProgres?.(i + 1, chemins.length);
  }
  return { ...banqueDepuisSfz(sfz, audios, { dossierSfz, mode: o.mode }), sfz };
}

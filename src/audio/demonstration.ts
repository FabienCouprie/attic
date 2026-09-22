// audio/demonstration.ts — Ce que montre une démonstration, et ce qu'elle fait entendre.
//
// Une démonstration parcourt les nœuds d'un graphe dans l'ordre où ils ont été calculés, et
// consacre à chacun un segment de durée fixe : son nom, son résumé, ses réglages, et son résultat
// — un son qu'on entend pendant que sa forme d'onde défile, une courbe, une image, un texte.
//
// Ce fichier est la partie PURE : choisir l'aperçu d'un nœud, planifier les segments, fabriquer
// la bande-son. Le dessin des images et l'encodage vidéo, qui demandent un navigateur, sont dans
// `demonstration-video.ts`.

import { estCourbe } from "./courbe";
import type { ExecutionCourante } from "../plugins/grapheGlobal";

export type Apercu =
  | { genre: "audio"; son: AudioBuffer }
  | { genre: "image"; fichier: Blob }
  | { genre: "courbe"; valeurs: Float32Array }
  | { genre: "texte"; texte: string };

/**
 * Ce qu'on montre d'un nœud, parmi ses sorties. Un son d'abord — c'est ce qu'une démonstration
 * d'Attic fait entendre —, puis une image, une courbe, un texte. Rien de montrable : `null`, et le
 * nœud n'a pas de segment.
 */
export function choisirApercu(valeurs: unknown[] | undefined): Apercu | null {
  if (!valeurs) return null;
  const son = valeurs.find((v): v is AudioBuffer => typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer && v.length > 0);
  if (son) return { genre: "audio", son };
  const image = valeurs.find((v): v is Blob => typeof Blob !== "undefined" && v instanceof Blob && v.type.startsWith("image/"));
  if (image) return { genre: "image", fichier: image };
  const courbe = valeurs.find((v) => estCourbe(v));
  if (courbe) return { genre: "courbe", valeurs: (courbe as { valeurs: Float32Array }).valeurs };
  const texte = valeurs.find((v): v is string => typeof v === "string" && v.trim() !== "");
  if (texte) return { genre: "texte", texte };
  return null;
}

export interface DescriptionFiche {
  nom: string;
  resume: string;
  /** `nom` s'affiche ; `cle`, s'il diffère (une traduction), est le nom sous lequel la valeur est rangée. */
  parametres: { nom: string; cle?: string; defaut?: unknown; modulationDe?: string; unite?: string }[];
}

export interface EtapeDemo {
  /** Le nœud visible. */
  id: string;
  titre: string;
  resume: string;
  /** « Nom : valeur », dans l'ordre de la fiche. */
  reglages: string[];
  message?: string;
  apercu: Apercu;
  /** L'étape précédente alimente celle-ci : une arête les relie. */
  suitLaPrecedente: boolean;
}

const REGLAGES_MAX = 8;

function formaterValeur(v: unknown, anglais: boolean): string {
  if (typeof v === "number") return (Math.round(v * 1000) / 1000).toLocaleString(anglais ? "en-US" : "fr-FR", { useGrouping: false });
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 39) + "…" : v;
  if (typeof v === "boolean") return anglais ? (v ? "yes" : "no") : (v ? "oui" : "non");
  return "";
}

/**
 * L'ordre dans lequel MONTRER les nœuds. Le tri topologique du moteur est valide mais indifférent
 * à la lecture : il calcule volontiers toutes les sources d'abord, puis leurs traitements, si bien
 * qu'un son et le traitement qu'il reçoit se trouvaient séparés par des nœuds sans rapport. On
 * suit ici les chaînes : parmi les nœuds prêts, on prend d'abord un successeur du dernier montré,
 * sinon le premier prêt dans l'ordre du moteur. L'ordre reste topologique.
 */
export function ordreDeLecture(ordre: string[], aretes: { source: string; target: string }[]): string[] {
  const dans = new Set(ordre);
  const aretesUtiles = aretes.filter((a) => dans.has(a.source) && dans.has(a.target) && a.source !== a.target);
  const restant = new Map(ordre.map((id) => [id, 0]));
  for (const a of aretesUtiles) restant.set(a.target, (restant.get(a.target) ?? 0) + 1);
  const rang = new Map(ordre.map((id, i) => [id, i]));
  const faits = new Set<string>();
  const sortie: string[] = [];
  const pile: string[] = [];
  while (sortie.length < ordre.length) {
    const prets = ordre.filter((id) => !faits.has(id) && (restant.get(id) ?? 0) === 0);
    if (!prets.length) { sortie.push(...ordre.filter((id) => !faits.has(id))); break; }
    let choisi: string | undefined;
    // Le successeur prêt du nœud le plus récemment montré dont la chaîne n'est pas épuisée.
    while (pile.length && !choisi) {
      const dernier = pile[pile.length - 1];
      choisi = prets
        .filter((id) => aretesUtiles.some((a) => a.source === dernier && a.target === id))
        .sort((x, y) => (rang.get(x) ?? 0) - (rang.get(y) ?? 0))[0];
      if (!choisi) pile.pop();
    }
    choisi ??= prets[0];
    faits.add(choisi);
    sortie.push(choisi);
    pile.push(choisi);
    for (const a of aretesUtiles) if (a.source === choisi) restant.set(a.target, (restant.get(a.target) ?? 0) - 1);
  }
  return sortie;
}

/**
 * Les étapes d'une exécution, dans l'ordre de lecture (cf. `ordreDeLecture`).
 *
 * Le moteur exécute un graphe APLATI : une boucle y est recopiée à chaque tour, un méta-nœud
 * remplacé par son contenu. Les copies d'un même nœud visible sont regroupées : l'étape prend la
 * place de la PREMIÈRE et le résultat de la DERNIÈRE, celui du dernier tour.
 */
export function etapesDeLExecution(
  exec: ExecutionCourante,
  decrire: (ficheId: string) => DescriptionFiche | null,
  exclure: (ficheId: string) => boolean,
  anglais = false,
): EtapeDemo[] {
  const parVisible = new Map<string, EtapeDemo>();
  const visibleDe = (id: string) => exec.expansions.get(id) ?? id;
  for (const id of ordreDeLecture(exec.ordre, exec.aretes)) {
    const noeud = exec.noeuds.find((n) => n.id === id);
    const ficheId = String(noeud?.data.ficheId ?? "");
    if (!noeud || !ficheId || exclure(ficheId)) continue;
    const apercu = choisirApercu(exec.resultats.get(id));
    if (!apercu) continue;
    const fiche = decrire(ficheId);
    if (!fiche) continue;
    const visible = visibleDe(id);
    const valeurs = (noeud.data.parametres ?? {}) as Record<string, unknown>;
    const reglages = fiche.parametres
      .filter((p) => !p.modulationDe)
      .map((p) => {
        const brute = valeurs[p.cle ?? p.nom] ?? p.defaut;
        const v = formaterValeur(brute, anglais);
        const unite = p.unite && typeof brute === "number" ? ` ${p.unite}` : "";
        return v === "" ? "" : `${p.nom} : ${v}${unite}`;
      })
      .filter((r) => r !== "")
      .slice(0, REGLAGES_MAX);
    const label = typeof noeud.data.label === "string" && noeud.data.label.trim() ? noeud.data.label.trim() : "";
    parVisible.set(visible, {
      id: visible, titre: label || fiche.nom, resume: fiche.resume, reglages,
      message: exec.messages.get(id), apercu, suitLaPrecedente: false,
    });
  }
  // Une étape « suit la précédente » quand une chaîne d'arêtes mène de l'une à l'autre, fût-ce par
  // des nœuds qui n'ont rien montré (un routage, une analyse sans sortie visible).
  const etapes = [...parVisible.values()];
  const successeurs = new Map<string, Set<string>>();
  for (const a of exec.aretes) {
    const s = visibleDe(a.source), t = visibleDe(a.target);
    if (s === t) continue;
    if (!successeurs.has(s)) successeurs.set(s, new Set());
    successeurs.get(s)!.add(t);
  }
  const montre = new Set(etapes.map((e) => e.id));
  const mene = (depuis: string, vers: string) => {
    const vus = new Set<string>(), file = [depuis];
    while (file.length) {
      for (const n of successeurs.get(file.shift()!) ?? []) {
        if (n === vers) return true;
        if (!vus.has(n) && !montre.has(n)) { vus.add(n); file.push(n); }
      }
    }
    return false;
  };
  for (let i = 1; i < etapes.length; i++) etapes[i].suitLaPrecedente = mene(etapes[i - 1].id, etapes[i].id);
  return etapes;
}

export interface SegmentDemo {
  etape: EtapeDemo;
  index: number;
  /** En secondes, depuis le début de la vidéo. */
  debut: number;
  duree: number;
}

export interface PlanDemo {
  titre: string;
  /** Durée du carton d'ouverture, 0 sans titre. */
  ouverture: number;
  segments: SegmentDemo[];
  duree: number;
}

/** Le son d'une étape commence un peu après le début de son segment, le temps de lire le titre. */
export const DECALAGE_SON = 0.4;
/** Et s'arrête un peu avant la fin, pour que la transition vers l'étape suivante se fasse au silence. */
export const MARGE_FIN = 0.3;
/** Fondu de sortie d'un son coupé avant sa fin. */
export const FONDU_COUPE = 0.15;
export const DUREE_OUVERTURE = 3;

export function planifier(etapes: EtapeDemo[], options: { dureeParNoeud: number; titre?: string }): PlanDemo {
  const d = Math.max(1, options.dureeParNoeud);
  const titre = (options.titre ?? "").trim();
  const ouverture = titre ? DUREE_OUVERTURE : 0;
  const segments = etapes.map((etape, index) => ({ etape, index, debut: ouverture + index * d, duree: d }));
  return { titre, ouverture, segments, duree: ouverture + segments.length * d };
}

/** Ce qu'on entend d'un son dans son segment : de 0 à `jouable` secondes. */
export function dureeJouable(son: AudioBuffer, segment: SegmentDemo): number {
  return Math.max(0, Math.min(son.duration, segment.duree - DECALAGE_SON - MARGE_FIN));
}

/**
 * La bande-son : chaque son à sa place, en stéréo, à la fréquence demandée. Un son plus long que
 * son segment est coupé avec un fondu ; un son mono est posé sur les deux canaux ; au-delà de
 * deux canaux, les deux premiers sont gardés — l'étiquette de disposition ne voyage pas jusqu'ici.
 */
export function bandeSon(plan: PlanDemo, frequence = 48000): AudioBuffer {
  const longueur = Math.max(1, Math.ceil(plan.duree * frequence));
  const sortie = new AudioBuffer({ numberOfChannels: 2, length: longueur, sampleRate: frequence });
  const g = sortie.getChannelData(0), d = sortie.getChannelData(1);
  for (const seg of plan.segments) {
    if (seg.etape.apercu.genre !== "audio") continue;
    const son = seg.etape.apercu.son;
    const jouable = dureeJouable(son, seg);
    const coupe = jouable < son.duration - 1e-6;
    const n = Math.floor(jouable * frequence);
    const debut = Math.round((seg.debut + DECALAGE_SON) * frequence);
    const pas = son.sampleRate / frequence;
    const cg = son.getChannelData(0);
    const cd = son.numberOfChannels > 1 ? son.getChannelData(1) : cg;
    const fonduEntree = Math.round(0.005 * frequence);
    const fonduSortie = Math.round((coupe ? FONDU_COUPE : 0.005) * frequence);
    for (let i = 0; i < n && debut + i < longueur; i++) {
      // Interpolation linéaire : la bande-son d'une vidéo passe par un codec avec perte, et un
      // rééchantillonnage plus fin ne s'y entendrait pas.
      const x = i * pas, k = Math.floor(x), f = x - k;
      const k2 = Math.min(k + 1, cg.length - 1);
      let gain = 1;
      if (i < fonduEntree) gain = i / fonduEntree;
      if (n - i < fonduSortie) gain = Math.min(gain, (n - i) / fonduSortie);
      g[debut + i] += gain * (cg[k] + (cg[k2] - cg[k]) * f);
      d[debut + i] += gain * (cd[k] + (cd[k2] - cd[k]) * f);
    }
  }
  return sortie;
}

/** Le segment affiché à l'instant t, ou `null` pendant le carton d'ouverture. */
export function segmentA(plan: PlanDemo, t: number): SegmentDemo | null {
  if (t < plan.ouverture) return null;
  for (const s of plan.segments) if (t < s.debut + s.duree) return s;
  return plan.segments[plan.segments.length - 1] ?? null;
}

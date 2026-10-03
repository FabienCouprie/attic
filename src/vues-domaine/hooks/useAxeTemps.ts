// ui/hooks/useAxeTemps.ts — Un axe de temps qu'on zoome, qu'on fait défiler, et qu'une tête de
// lecture suit pendant qu'on écoute.
//
// CE QUE CE CROCHET PORTE, ET POURQUOI IL EST À PART. Les règles de calcul vivent dans `axe-temps.ts`,
// sans React, parce qu'elles se démontrent. Ce qui reste ici est ce qui ne se démontre pas : l'état,
// l'élément audio, la boucle d'animation, les gestes. Les deux lignes de temps de l'application
// peuvent s'en servir, là où l'une seule avait tout cela.
//
// LA TÊTE DE LECTURE EST LUE, JAMAIS CALCULÉE. Sa position vient de `currentTime` de l'élément audio,
// relue à chaque image. Compter le temps soi-même depuis le départ paraîtrait plus simple et
// dériverait : un élément audio ne joue pas exactement à la vitesse d'une horloge, et il s'arrête
// quand le système le décide.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  defilementAncre, defilementPourCentrer, defilementPourSuivre, fenetre, tempsDepuisX, xDepuisTemps,
  zoomAjuste, zoomBorne, zoomMolette, type Fenetre,
} from "../axe-temps";

export interface OptionsAxeTemps {
  /** L'étendue montrée, en secondes. Zéro tant qu'on ne sait rien. */
  etendue: number;
  /** L'origine de l'étendue : l'instant de son bord gauche. Négatif pour un montage qui commence avant zéro. */
  origine?: number;
  /** La largeur utile du dessin, en pixels. */
  largeurPx: number;
  /** Le son à écouter, s'il y en a un. Ignoré quand une horloge extérieure est fournie. */
  url?: string;
  /** Une horloge extérieure, qui remplace alors l'élément audio. Voir `horloge` ci-dessous. */
  horloge?: Horloge;
}

/**
 * Une horloge de lecture, quelle qu'elle soit.
 *
 * ELLE S'INTERROGE, ELLE NE SE PUBLIE PAS, et c'est ce qui permet à cet axe de suivre indifféremment
 * un élément audio ou un graphe Web Audio monté en direct : les deux savent dire où ils en sont quand
 * on le leur demande. Une horloge qui publierait sa position dans un état React la ferait passer par
 * un rendu, et une horloge de son n'attend pas les rendus.
 */
export interface Horloge {
  position: () => number;
  enLecture: boolean;
  allerA: (instant: number) => void;
  basculer: () => void;
}

export interface AxeTemps {
  /** Le zoom en pourcentage de l'ajustement à la largeur. 100 montre tout. */
  zoomPct: number;
  changerZoom: (pourcent: number) => void;
  /** Pixels par seconde. */
  zoom: number;
  fen: Fenetre;
  /** La tête de lecture, en instant ABSOLU (origine comprise). */
  pos: number;
  enLecture: boolean;
  /** À poser sur l'élément `<audio>` du composant. */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /** L'abscisse d'un instant absolu, dans la zone dessinée. */
  X: (instantAbsolu: number) => number;
  /** L'instant absolu d'une abscisse. */
  tempsDe: (x: number) => number;
  /** Zoom ancré sur le pointeur : l'instant visé ne bouge pas. */
  surMolette: (deltaY: number, xPointeur: number) => void;
  /** Porter la lecture à un instant absolu. */
  allerA: (instantAbsolu: number) => void;
  basculerLecture: () => void;
  /** Centrer la vue sur un instant compté depuis l'origine : ce que fait la barre de défilement. */
  centrerSur: (instantDepuisOrigine: number) => void;
}

export function useAxeTemps({ etendue, origine = 0, largeurPx, url, horloge }: OptionsAxeTemps): AxeTemps {
  const [zoomPct, setZoomPct] = useState(100);
  const [defilement, setDefilement] = useState(0);
  // LA POSITION EST GARDÉE EN INSTANT ABSOLU, parce que c'est ce que rend `currentTime` : la sortie
  // d'un montage commence à zéro, donc son temps de lecture EST la seconde absolue de la ligne. Les
  // fonctions de `axe-temps.ts`, elles, comptent depuis l'origine de l'étendue : chaque passage de
  // l'une à l'autre retranche ou rajoute `origine`, et c'est le seul endroit où ces deux repères se
  // rencontrent.
  const [posAbsolue, setPosAbsolue] = useState(0);
  const [enLectureEl, setEnLectureEl] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // L'horloge extérieure prend la place de l'élément audio quand il y en a une, et elle prend TOUT :
  // l'état de lecture, la position, les commandes. Mêler les deux ferait suivre une tête de lecture qui
  // n'est pas celle du son qu'on entend.
  const enLecture = horloge ? horloge.enLecture : enLectureEl;
  const horlogeRef = useRef(horloge);
  horlogeRef.current = horloge;

  const zoom = zoomAjuste(largeurPx, etendue, zoomPct);
  const fen = fenetre(largeurPx, zoom, etendue, defilement);

  // LE DÉFILEMENT SE RAMÈNE DANS SES BORNES DÈS QUE LA VUE CHANGE. Élargir le nœud ou dézoomer fait
  // rétrécir l'étendue défilable : sans cela, la vue resterait posée après la fin, sur du vide.
  useEffect(() => {
    setDefilement((d) => (d > fen.maxDefilement ? fen.maxDefilement : d));
  }, [fen.maxDefilement]);

  // LA FENÊTRE SE LIT DANS UNE RÉFÉRENCE, ET NON DANS LA DÉPENDANCE DE L'EFFET. `fen` est un objet
  // neuf à chaque rendu : le nommer en dépendance démontait et remontait la boucle d'animation à
  // CHAQUE IMAGE, puisque chaque image écrit la position et provoque un rendu. La référence garde la
  // fenêtre à jour sans que la boucle ait à se reconstruire.
  const fenRef = useRef(fen);
  fenRef.current = fen;
  const origineRef = useRef(origine);
  origineRef.current = origine;

  // La tête de lecture, relue à chaque image, et la vue qui la rattrape quand elle sort.
  useEffect(() => {
    if (!enLecture) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      // UNE DERNIÈRE LECTURE QUAND ELLE S'ARRÊTE. La boucle vient de se taire, et l'affichage garderait
      // sinon l'avant-dernière image : la fin du montage, là où la tête est en fait revenue au début.
      const h = horlogeRef.current;
      if (h) setPosAbsolue(h.position());
      return;
    }
    const tour = () => {
      const h = horlogeRef.current;
      const t = h ? h.position() : audioRef.current?.currentTime;
      if (t !== undefined) {
        setPosAbsolue(t);
        const ou = defilementPourSuivre(t - origineRef.current, fenRef.current);
        if (ou !== null) setDefilement(ou);
      }
      rafRef.current = requestAnimationFrame(tour);
    };
    rafRef.current = requestAnimationFrame(tour);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [enLecture]);

  // Un son qui change repart de son début : la tête d'avant ne voudrait plus rien dire. UNE HORLOGE
  // EXTÉRIEURE N'EST PAS CONCERNÉE, et c'est tout l'intérêt du graphe vivant : elle joue les pistes
  // elles-mêmes, qu'un nouveau rendu ne remplace pas, donc l'écoute continue pendant qu'on règle.
  useEffect(() => {
    if (horlogeRef.current) return;
    setPosAbsolue(0); setEnLectureEl(false);
  }, [url]);

  const X = useCallback(
    (absolu: number) => xDepuisTemps(absolu - origine, fen.debutVisible, zoom),
    [origine, fen.debutVisible, zoom],
  );
  const tempsDe = useCallback(
    (x: number) => origine + tempsDepuisX(x, fen.debutVisible, zoom),
    [origine, fen.debutVisible, zoom],
  );

  // LE CURSEUR DE ZOOM GARDE LE MILIEU DE LA VUE, comme la molette garde l'instant sous le pointeur.
  // Sans ancre, grossir laissait la vue posée sur son bord gauche : ce qu'on regardait s'échappait
  // vers la droite, et il fallait le rattraper au défilement après chaque cran. Un curseur n'a pas de
  // pointeur sur la ligne de temps, donc son ancre est le milieu de ce qu'il montre.
  const changerZoom = useCallback((pourcent: number) => {
    const pct = zoomBorne(pourcent);
    const milieu = fen.debutVisible + fen.largeurVisible / 2;
    setZoomPct(pct);
    setDefilement(defilementPourCentrer(
      milieu, fenetre(largeurPx, zoomAjuste(largeurPx, etendue, pct), etendue, defilement)));
  }, [fen.debutVisible, fen.largeurVisible, largeurPx, etendue, defilement]);

  /** Centrer la vue sur un instant compté depuis l'origine : ce que fait la barre de défilement. */
  const centrerSur = useCallback((instantDepuisOrigine: number) => {
    setDefilement(defilementPourCentrer(instantDepuisOrigine, fenRef.current));
  }, []);

  const surMolette = useCallback((deltaY: number, xPointeur: number) => {
    const vise = tempsDepuisX(xPointeur, fen.debutVisible, zoom);
    const pct = zoomMolette(zoomPct, deltaY);
    setZoomPct(pct);
    setDefilement(defilementAncre(vise, xPointeur, zoomAjuste(largeurPx, etendue, pct), largeurPx, etendue));
  }, [fen.debutVisible, zoom, zoomPct, largeurPx, etendue]);

  const allerA = useCallback((absolu: number) => {
    // LA LECTURE NE VA PAS AVANT ZÉRO. La sortie d'un montage commence à zéro, un début négatif
    // rognant le son : la part d'une piste qui précède zéro se voit mais ne sonne pas.
    const t = Math.max(0, absolu);
    setPosAbsolue(t);
    if (horlogeRef.current) horlogeRef.current.allerA(t);
    else if (audioRef.current) audioRef.current.currentTime = t;
  }, []);

  const basculerLecture = useCallback(() => {
    if (horlogeRef.current) { horlogeRef.current.basculer(); return; }
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setEnLectureEl(false));
    else el.pause();
  }, []);

  // L'ÉTAT SUIT L'ÉLÉMENT, ET NON L'INVERSE : la lecture peut s'arrêter sans nous, à la fin du son ou
  // parce que le système l'a décidé. Écouter ses événements est la seule façon de ne pas mentir.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || horlogeRef.current) return;
    const joue = () => setEnLectureEl(true);
    const pause = () => setEnLectureEl(false);
    const fini = () => { setEnLectureEl(false); setPosAbsolue(0); };
    el.addEventListener("play", joue);
    el.addEventListener("pause", pause);
    el.addEventListener("ended", fini);
    return () => {
      el.removeEventListener("play", joue);
      el.removeEventListener("pause", pause);
      el.removeEventListener("ended", fini);
    };
  }, [url]);

  return {
    zoomPct, changerZoom, zoom, fen,
    pos: posAbsolue,
    enLecture, audioRef, X, tempsDe, surMolette, allerA, basculerLecture, centrerSur,
  };
}

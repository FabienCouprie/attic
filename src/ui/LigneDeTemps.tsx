// ui/LigneDeTemps.tsx — La ligne de temps du Montage, sur le nœud.
//
// Une règle en secondes et une barre par piste branchée, à son instant et à sa durée réelle. On
// déplace une piste en tirant sa barre, on règle ses fondus en tirant ses coins supérieurs. Les
// réglages numériques restent dans l'inspecteur, pour la précision : la ligne de temps les écrit, ils
// la relisent — il n'y a qu'une vérité, les paramètres du nœud.
//
// ELLE A QUITTÉ L'INSPECTEUR, et c'est ce qui la rend utilisable. Le volet fait 280 pixels de large,
// dont 182 utiles après les marges et les étiquettes de piste, et il ne s'élargit pas. Comme l'échelle
// faisait tenir tout le montage dans cette largeur, un pixel valait 0,32 seconde sur une pièce de
// cinquante secondes et 1,78 seconde sur une pièce de cinq minutes, là où le réglage « Début » accepte
// le centième : le glissement était donc trente à cent fois plus grossier que la case, et il empirait
// à mesure que la pièce s'allongeait. Sur un nœud, la largeur se règle, et le zoom fait le reste.
//
// ET ELLE PORTE MAINTENANT LE LECTEUR, avec une tête de lecture qui suit la musique. C'était le vrai
// manque : le son s'écoutait sur le nœud, le dessin se regardait dans le volet, et rien ne disait où
// l'on en était. Placer un son sans voir où il tombe à l'écoute, c'est ce qui rendait le dessin
// décoratif. Le sélecteur multizones faisait tout cela depuis longtemps ; les règles communes sont
// désormais dans `axe-temps.ts` et `hooks/useAxeTemps.ts`.
//
// LES DURÉES VIENNENT DE LA DERNIÈRE EXÉCUTION. Seule l'exécution connaît la longueur d'un son
// branché ; tant que le graphe n'a pas tourné, une piste branchée s'affiche en pointillé sur une
// durée nominale, et la ligne de temps le dit.
//
// ET CE QU'ON ENTEND N'EST PLUS LE FICHIER RENDU, mais les pistes montées en direct. C'était le
// dernier blocage, et il était entier : toucher un réglage périme le résultat du nœud, le nœud se
// relance, produit un autre fichier, et un lecteur dont on change la source repart de zéro. Régler en
// écoutant était donc impossible, alors que c'est le seul geste du montage. Le graphe vivant est dans
// `hooks/useLectureVive.ts`, ses règles dans `audio/lecture-vive.ts` ; l'élément audio ne sert plus
// qu'à défaut de tampons, avant la première exécution.

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useAxeTemps } from "./hooks/useAxeTemps";
import { useLectureVive } from "./hooks/useLectureVive";
import { curseurDefilement, fractionDepuisZoom, zoomDepuisFraction } from "./axe-temps";
import { cheminOnde, enveloppe } from "./onde-piste";
import { rectsNotes, type NoteBoite } from "./notes-boite";
import { ouvrirAuNiveauDEcoute } from "./niveau-ecoute";
import {
  DUREE_INCONNUE, MODELE_MONTAGE, disposerMorceaux, disposerPistes, echelle, pasDeGraduation,
  valeurAuRepos, valeurDuGeste,
  type Geste, type LigneMontage, type ModeleLigne, type PisteMontage, type Vue,
} from "./ligne-temps-calcul";
import {
  appliquerGeste, collerMorceaux, couperA, remplacerMorceau, retirerMorceau, type Morceau,
} from "../audio/montage-morceaux";

export type { PisteMontage } from "./ligne-temps-calcul";
export { pasDeGraduation } from "./ligne-temps-calcul";

const HAUTEUR_PISTE = 34, REGLE = 22, POIGNEE = 9;
/** La largeur de la zone où l'on attrape la tête de lecture. Un trait d'un pixel ne s'attrape pas. */
const PRISE_TETE = 11;
/**
 * Les crans du curseur de zoom, sur sa fraction.
 *
 * Mille pour cinq cents fois : chaque cran multiplie par 1,0062, donc environ un pour cent par cran,
 * et un pixel de la piste en vaut deux. C'est plus fin que l'œil ne distingue sur le dessin, et c'est
 * ce qu'il faut pour que le geste soit continu plutôt que par sauts.
 */
const CRANS_ZOOM = 1000;
/** La largeur réservée aux étiquettes de piste, à gauche de la règle. */
const ZONE_G = 44;

type Prise = Geste & {
  x0: number;
  /** L'étendue figée pendant le geste : déplacer la dernière piste allonge le montage, et une étendue
   *  recalculée à chaque mouvement changerait le zoom, donc ferait glisser la barre sous le pointeur. */
  vue: Vue;
  /** Le morceau tel qu'il était à la prise, quand la ligne de temps porte des morceaux. */
  morceau?: Morceau;
};

/**
 * Qui, de toutes les lignes de temps montées, tient la sélection.
 *
 * POURQUOI UN PORTEUR UNIQUE. Les raccourcis s'écoutent sur la fenêtre, faute de quoi il faudrait
 * qu'un dessin SVG prenne le focus. Deux montages posés sur le canevas les recevraient donc tous
 * deux, et couper l'un couperait aussi l'autre. Le porteur est pris au clic et rendu au clic à vide.
 */
let porteurDeSelection: string | null = null;

/**
 * Ce qui a été copié ou coupé, commun à toutes les lignes de temps.
 *
 * IL EST COMMUN À DESSEIN : on copie un morceau sur un montage pour le coller sur un autre, et un
 * presse-papier par nœud l'interdirait. Il ne survit pas à la fermeture de la fenêtre, comme celui
 * des nœuds.
 */
let pressePapier: Morceau[] = [];

export function LigneDeTemps({
  pistes, branchees, params, onChanger, modele = MODELE_MONTAGE, audioUrl, sons, notes,
  noeudId, morceaux, onMorceaux,
}: {
  /** Les durées de la dernière exécution. */
  pistes: PisteMontage[];
  /** Les rangs des pistes branchées maintenant. */
  branchees: number[];
  params: Record<string, unknown>;
  onChanger: (nom: string, valeur: number) => void;
  /** Ce qu'une barre veut dire ici. Par défaut celle du Montage, qui est la première à s'en servir. */
  modele?: ModeleLigne;
  /** Le son rendu par le nœud, s'il a tourné. Son instant zéro est celui de la ligne de temps. */
  audioUrl?: string;
  /** Les tampons des pistes, par rang, désignés par la dernière exécution. Pour dessiner leur onde. */
  sons?: Record<number, AudioBuffer>;
  /** Les notes des boîtes, par rang, en fractions de leur durée propre. Ce que la Maquette montre au
   *  lieu d'une onde : elle porte des séquences, dont il n'y a pas d'onde à tirer. */
  notes?: Record<number, NoteBoite[]>;
  /** L'identité du nœud, pour que deux lignes de temps ne se disputent pas les raccourcis. */
  noeudId?: string;
  /**
   * Les morceaux posés, quand cette ligne de temps en porte.
   *
   * ABSENTS, UNE BARRE EST UNE PISTE, ce qui reste le cas de la maquette : un port, un instant, une
   * durée mesurée. Présents, une barre est un MORCEAU, qu'on coupe, déplace, copie et colle, et
   * plusieurs peuvent puiser au même port.
   */
  morceaux?: Morceau[];
  /** Ce que le geste écrit. Appelé une fois par geste, au relâchement, jamais à chaque image. */
  onMorceaux?: (morceaux: Morceau[]) => void;
}) {
  const { t, lang } = useI18n();
  const boite = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(400);
  const [prise, setPrise] = useState<Prise | null>(null);
  /** La tête de lecture est-elle tenue ? Le geste dure tant qu'on ne lâche pas. */
  const [teteSaisie, setTeteSaisie] = useState(false);
  /** Le morceau choisi, sur lequel portent couper, copier et coller. */
  const [selection, setSelection] = useState<string | null>(null);

  // LA MESURE NE DOIT PAS SE RÉPONDRE À ELLE-MÊME. Dans l'inspecteur, la largeur valait 280 pixels et
  // ne bougeait jamais : mesurer puis dessiner s'arrêtait au premier tour. Sur un nœud qui se
  // redimensionne, la largeur mesurée sert à dessiner, et ce qui est dessiné peut à son tour changer la
  // largeur du conteneur : l'observateur se rappelle, sans fin, et la fenêtre gèle. Deux précautions
  // donc : on ne retient une largeur que si elle a bougé d'au moins un pixel, et la mesure se fait sur
  // la boîte de contenu du conteneur, jamais sur ce qu'on y a mis.
  //
  // L'OBSERVATEUR SE POSE PAR LA RÉFÉRENCE ELLE-MÊME, ET NON PAR UN EFFET AU MONTAGE — relevé par
  // Fabien : « le graphique est comme coupé en deux », et le dessin s'arrêtait à la moitié du nœud.
  // Un effet aux dépendances vides ne s'exécute qu'une fois, sur l'élément présent À CET INSTANT ; or
  // tant que la ligne de temps n'a rien à montrer, elle rend un AUTRE div, celui du message, qui ne
  // portait pas la référence. L'observateur n'était donc jamais posé, et la largeur restait à sa
  // valeur de départ pour toujours, quelle que soit la taille du nœud. Mesuré : conteneur de 644
  // pixels, dessin de 400, soit 244 pixels de vide à droite où même les graduations s'arrêtaient.
  // Une référence de rappel suit l'élément : elle se détache de l'ancien et observe le nouveau, quel
  // que soit le div que le rendu a choisi.
  const observateur = useRef<ResizeObserver | null>(null);
  const attacherLaBoite = useCallback((el: HTMLDivElement | null) => {
    boite.current = el;
    observateur.current?.disconnect();
    observateur.current = null;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const w = el.clientWidth || 400;
      setLargeur((precedente) => (Math.abs(w - precedente) >= 1 ? w : precedente));
    });
    obs.observe(el);
    observateur.current = obs;
  }, []);
  useEffect(() => () => { observateur.current?.disconnect(); }, []);

  // L'APERÇU DU GESTE, ET POURQUOI IL NE S'ÉCRIT PAS TOUT DE SUITE. Écrire à chaque mouvement du
  // pointeur périmait le résultat du nœud à chaque image : le son rendu disparaissait, donc le lecteur
  // et la tête de lecture avec, et l'on réglait une piste sans plus rien entendre. Le geste garde
  // maintenant sa valeur en cours ici, et n'écrit qu'au relâchement — une seule écriture, une seule
  // relance. La valeur en cours est posée PAR-DESSUS les paramètres, et c'est la même fonction qui
  // dispose les pistes : l'aperçu est donc exactement ce que le relâchement produira.
  const [apercu, setApercu] = useState<{ nom: string; valeur: number } | null>(null);
  /** Le morceau en cours de geste, avec sa valeur du moment. Même rôle qu'`apercu`, côté morceaux. */
  const [apercuM, setApercuM] = useState<Morceau | null>(null);
  const paramsVus = apercu ? { ...params, [apercu.nom]: apercu.valeur } : params;

  /** La durée du son reçu sur une piste, ou la durée nominale tant que le graphe n'a pas tourné. */
  const dureeDe = (piste: number) => pistes.find((p) => p.piste === piste)?.duree ?? DUREE_INCONNUE;

  // LES MORCEAUX PASSENT AVANT LES RÉGLAGES quand la ligne de temps en porte. Une barre est alors un
  // MORCEAU, qu'on coupe et qu'on déplace, et plusieurs peuvent partager une piste ; sans eux, une
  // barre reste une piste, ce qui est le cas de la maquette.
  const morceauxVus = morceaux
    ? (apercuM ? morceaux.map((m) => (m.id === apercuM.id ? apercuM : m)) : morceaux)
    : null;
  const lignes = morceauxVus
    ? disposerMorceaux(morceauxVus, pistes)
    : disposerPistes(branchees, pistes, paramsVus, modele);
  // L'ŒIL SUIT LE GESTE, L'OREILLE SUIT LES RÉGLAGES ÉCRITS. Un glissement change sa valeur à chaque
  // mouvement du pointeur : la donner au graphe vivant reprogrammerait la piste soixante fois par
  // seconde, et l'on n'entendrait qu'un hachis. Le dessin montre donc où la barre va, et le son la
  // rejoint au relâchement — la même écriture qui relance le nœud.
  const lignesEcrites = morceaux
    ? (apercuM ? disposerMorceaux(morceaux, pistes) : lignes)
    : (apercu ? disposerPistes(branchees, pistes, params, modele) : lignes);
  const totale = prise?.vue ?? echelle(lignes);
  const utile = Math.max(100, largeur - ZONE_G - 8);

  /**
   * Les rangées du dessin : une par piste branchée, et non une par barre.
   *
   * C'EST CE QUI FAIT D'UNE PISTE UNE PISTE. Plusieurs morceaux d'un même port se posent sur la même
   * rangée, à la suite ou en se recouvrant, comme sur un banc de montage ; leur donner chacun sa
   * ligne rendrait le dessin illisible dès la première coupe. Une piste branchée mais vide garde sa
   * rangée, sans quoi on n'aurait nulle part où coller.
   */
  const rangs = morceaux
    ? [...new Set([...branchees, ...lignes.map((l) => l.k)])].sort((a, b) => a - b)
    : lignes.map((l) => l.k);
  const rangeeDe = (k: number) => Math.max(0, rangs.indexOf(k));

  // LE GRAPHE VIVANT, et ce qu'il change. Les pistes sont montées en direct depuis leurs tampons : un
  // niveau se pose sans rien interrompre, un début ne reprend que sa piste, et surtout la relance du
  // nœud ne coupe plus l'écoute, puisque ce n'est plus le fichier rendu qu'on entend. C'était le vrai
  // blocage : régler une piste périmait le résultat, donc le lecteur, donc la tête de lecture.
  const vive = useLectureVive(lignesEcrites.flatMap((l) => {
    const son = sons?.[l.k];
    return son ? [{
      // LA CLÉ EST CELLE DU MORCEAU quand il y en a un : deux morceaux d'une même piste
      // s'écraseraient l'un l'autre dans les tables de l'écoute, et l'on n'en entendrait qu'un.
      k: l.id ?? l.k, son, debutSec: l.debut, dureeSec: l.duree, gainDb: l.gain,
      fonduEntreeSec: l.entree, fonduSortieSec: l.sortie, dansSec: l.dans ?? 0,
    }] : [];
  }));
  const axe = useAxeTemps({
    etendue: totale.etendue, origine: totale.debutMin, largeurPx: utile, url: audioUrl,
    horloge: vive.prete ? vive : undefined,
  });
  /** Y a-t-il quelque chose à entendre : les pistes en direct, ou à défaut le son rendu. */
  const ecoutable = vive.prete || !!audioUrl;

  // ── Couper, copier, coller ──
  //
  // TOUT CE DONT LES RACCOURCIS ONT BESOIN PASSE PAR UNE RÉFÉRENCE, et l'écoute n'est posée qu'une
  // fois. La tête de lecture change soixante fois par seconde : la nommer en dépendance démonterait
  // et remonterait l'écoute à chaque image.
  const pourRaccourcis = useRef({ morceaux, selection, pos: 0, dureeDe, onMorceaux });
  pourRaccourcis.current = { morceaux, selection, pos: axe.pos, dureeDe, onMorceaux };

  useEffect(() => {
    // LA CAPTURE PASSE AVANT LE CANEVAS. Le Ctrl+C du canevas copie les NŒUDS sélectionnés, et il
    // écoute lui aussi la fenêtre : sans priorité ni arrêt, couper un morceau aurait aussi coupé le
    // nœud qui le porte. On prend donc l'événement à la descente, et on l'arrête net quand il nous
    // revient.
    function surTouche(e: KeyboardEvent) {
      const { morceaux: ms, selection: sel, pos, dureeDe: duree, onMorceaux: ecrire } = pourRaccourcis.current;
      if (!ms || !ecrire || porteurDeSelection !== noeudId) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA"
        || cible.tagName === "SELECT" || cible.isContentEditable)) return;
      const choisi = ms.find((m) => m.id === sel) ?? null;
      const mod = e.ctrlKey || e.metaKey;
      const pris = () => { e.preventDefault(); e.stopImmediatePropagation(); };

      if (mod && e.key === "c" && choisi) { pressePapier = [choisi]; pris(); return; }
      if (mod && e.key === "x" && choisi) {
        pressePapier = [choisi];
        ecrire(retirerMorceau(ms, choisi.id));
        setSelection(null);
        pris(); return;
      }
      if (mod && e.key === "v" && pressePapier.length) {
        const colles = collerMorceaux(pressePapier, pos, ms);
        ecrire([...ms, ...colles]);
        setSelection(colles[0]?.id ?? null);
        pris(); return;
      }
      // COUPER À LA TÊTE DE LECTURE, qui est le geste du banc de montage : la coupe tombe sur tout ce
      // que la tête traverse, et non sur la seule barre choisie.
      if (!mod && (e.key === "s" || e.key === "S")) { ecrire(couperA(ms, pos, duree)); pris(); return; }
      if (!mod && (e.key === "Delete" || e.key === "Backspace") && choisi) {
        ecrire(retirerMorceau(ms, choisi.id));
        setSelection(null);
        pris();
      }
    }
    window.addEventListener("keydown", surTouche, true);
    return () => window.removeEventListener("keydown", surTouche, true);
  }, [noeudId]);

  if (!lignes.length) {
    // LA RÉFÉRENCE EST ICI AUSSI, et c'est tout l'objet du correctif : sans elle, l'observateur de
    // taille n'était jamais posé, et la largeur restait celle du départ quand les pistes arrivaient.
    // LA RÉFÉRENCE EST ICI AUSSI, et c'est tout l'objet du correctif : sans elle, l'observateur de
    // taille n'était jamais posé, et la largeur restait celle du départ quand les pistes arrivaient.
    return <div className="ligne-temps ligne-temps-vide" ref={attacherLaBoite}>{t(modele.cleVide)}</div>;
  }

  const px = axe.zoom;
  /** L'abscisse d'un instant absolu, dans le repère du dessin entier. */
  const X = (s: number) => ZONE_G + axe.X(s);
  const pas = pasDeGraduation(axe.fen.largeurVisible, utile);
  const graduations: number[] = [];
  const premiere = totale.debutMin + axe.fen.debutVisible;
  for (let s = Math.ceil(premiere / pas) * pas; s <= premiere + axe.fen.largeurVisible; s += pas) {
    graduations.push(+s.toFixed(6));
  }
  const hauteur = REGLE + Math.max(1, rangs.length) * HAUTEUR_PISTE + 6;
  const virgule = (v: number, d: number) => (lang === "en" ? v.toFixed(d) : v.toFixed(d).replace(".", ","));
  /** Le second nombre écrit dans la barre. Il n'y paraît que s'il dit quelque chose. */
  const legende = (l: LigneMontage) => {
    if (modele.legende === "gain" && l.gain !== 0) return ` · ${l.gain > 0 ? "+" : ""}${virgule(l.gain, 1)} dB`;
    if (modele.legende === "transposition" && l.transposition !== 0) {
      return ` · ${l.transposition > 0 ? "+" : ""}${virgule(l.transposition, 1)}`;
    }
    return "";
  };

  /**
   * Le tracé de l'onde d'une piste, ou `null` si son tampon n'est pas connu.
   *
   * LA PART DESSINÉE EST CELLE QUI SONNE. Un début négatif rogne le son d'autant, et la barre ne
   * couvre alors que ce qui reste : dessiner le son entier dans cette barre montrerait un début qui
   * n'existe pas. `l.duree` est la durée VUE, `son.duration` la durée du son.
   */
  const ondeDe = (l: LigneMontage): string | null => {
    const son = sons?.[l.k];
    if (!son || !son.duration) return null;
    const y = REGLE + rangeeDe(l.k) * HAUTEUR_PISTE + 4, h = HAUTEUR_PISTE - 8;
    const x0 = X(l.debut), w = Math.max(2, l.duree * px);
    if (w <= 1) return null;
    const rogne = Math.max(0, -l.debut);
    // UN MORCEAU NE MONTRE QUE SA PART DU SON, de `dans` à la fin de ce qu'il joue. Sans cela, deux
    // morceaux nés d'une même coupe montreraient chacun l'onde entière, et l'on ne verrait pas où
    // l'on a coupé — or c'est précisément ce que l'œil cherche sur un banc de montage.
    const dans = Math.max(0, l.dans ?? 0);
    const de = Math.min(1, (dans + rogne) / son.duration);
    const a = Math.min(1, Math.max(de, (dans + rogne + l.duree) / son.duration));
    return cheminOnde(enveloppe(son), x0, w, y, h, { de, a });
  };

  /**
   * Les notes d'une boîte dans sa barre, ce que la Maquette montre là où le Montage montre une onde.
   *
   * Une boîte porte une séquence, dont il n'y a pas d'onde à tirer : une barre sans son contenu ne
   * dirait que la place et la durée, et l'on poserait une boîte sans voir ce qu'on pose.
   */
  const notesDe = (l: LigneMontage) => {
    const notesBoite = notes?.[l.k];
    if (!notesBoite?.length) return [];
    const y = REGLE + rangeeDe(l.k) * HAUTEUR_PISTE + 4, h = HAUTEUR_PISTE - 8;
    return rectsNotes(notesBoite, X(l.debut), Math.max(2, l.duree * px), y, h);
  };

  /**
   * L'abscisse d'un pointeur DANS LE REPÈRE DU DESSIN, et non en pixels d'écran.
   *
   * POURQUOI LA CONVERSION EST NÉCESSAIRE — relevé par Fabien : « on peut avancer la tête de lecture
   * mais de façon très imprécise ». Ce n'était pas de l'imprécision, c'était une erreur systématique.
   * React Flow met le nœud à l'échelle : `clientX` et `getBoundingClientRect` parlent en pixels
   * d'ÉCRAN, quand la disposition du dessin et `zoom` comptent en pixels de MISE EN PAGE. Mesuré à
   * l'échelle 0,5 : cliquer la graduation « 4 s » portait la tête à 1,66 s, et « 8 s » à 3,66 s.
   *
   * L'échelle se déduit du conteneur lui-même, par le rapport de sa largeur écran à sa largeur de
   * mise en page : rien ici n'a besoin de connaître React Flow, ni d'aller lui demander son zoom.
   */
  const xDessinDuPointeur = (e: React.PointerEvent): number => {
    const el = boite.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const echelle = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
    return (e.clientX - r.left) / (echelle || 1);
  };
  /** L'instant que le pointeur désigne sur la règle ou sur le dessin. */
  const instantDuPointeur = (e: React.PointerEvent) => axe.tempsDe(xDessinDuPointeur(e) - ZONE_G);

  /**
   * Prendre la tête de lecture et la porter où l'on veut, sans lâcher — demandé par Fabien.
   *
   * La règle ne répondait qu'au CLIC : on posait la tête, et pour la corriger il fallait viser de
   * nouveau. Le geste est maintenant continu, sur la règle comme sur la tête elle-même, qui porte une
   * zone de prise sur toute la hauteur du dessin.
   */
  const saisirTete = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setTeteSaisie(true);
    axe.allerA(instantDuPointeur(e));
  };

  /** L'échelle que React Flow applique au nœud : un pixel d'écran vaut ce nombre de pixels de dessin. */
  const echelleDuDessin = (): number => {
    const el = boite.current;
    if (!el || el.offsetWidth <= 0) return 1;
    return el.getBoundingClientRect().width / el.offsetWidth || 1;
  };

  const saisir = (e: React.PointerEvent, l: LigneMontage, quoi: Prise["quoi"]) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    // LE CLIC CHOISIT LA BARRE, et le même geste peut la déplacer : on ne demande pas de cliquer
    // d'abord puis de tirer ensuite. Le porteur de la sélection change ici, de sorte qu'un second
    // montage posé sur le canevas ne réponde pas aux mêmes raccourcis.
    const m = morceaux?.find((x) => x.id === l.id);
    if (m) { setSelection(m.id); porteurDeSelection = noeudId ?? null; }
    setPrise({ piste: l.k, quoi, x0: e.clientX, valeur0: valeurAuRepos(quoi, l), vue: totale, morceau: m });
  };
  const bouger = (e: React.PointerEvent) => {
    // LA TÊTE PASSE AVANT : elle se prend sur la règle, qui recouvre toute la largeur du dessin, et
    // aucune piste n'est alors saisie. Les deux gestes ne peuvent pas courir ensemble.
    if (teteSaisie) { axe.allerA(instantDuPointeur(e)); return; }
    if (!prise) return;
    // MAJ DIVISE LE PAS PAR DIX, ALT PAR CENT. Sans cela, le plus petit déplacement possible vaut un
    // pixel, soit tout ce que la largeur laisse : au zoom d'ajustement d'une pièce de cinquante
    // secondes, un tiers de seconde. Le réglage accepte le centième, et le geste doit pouvoir y aller.
    const finesse = e.altKey ? 0.01 : e.shiftKey ? 0.1 : 1;
    // L'ÉCART EST CONVERTI EN PIXELS DE DESSIN AVANT D'ÊTRE LU EN SECONDES. Il est mesuré en pixels
    // d'ÉCRAN, et le dessin est mis à l'échelle par React Flow : sans cette division, la barre suivait
    // le pointeur à la moitié de sa vitesse dès que le canevas était dézoomé. Mesuré à l'échelle
    // 0,514 : un déplacement de 100 pixels portait la piste de 2,48 s au lieu de 4,47.
    const ecart = ((e.clientX - prise.x0) / (px * echelleDuDessin())) * finesse;
    if (prise.morceau) { setApercuM(appliquerGeste(prise.morceau, prise.quoi as never, ecart)); return; }
    const l = lignes.find((x) => x.k === prise.piste);
    if (!l) return;
    setApercu(valeurDuGeste(prise, ecart, l));
  };
  const lacher = (e: React.PointerEvent) => {
    if (teteSaisie) {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      setTeteSaisie(false);
      return;
    }
    if (!prise) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    // UNE SEULE ÉCRITURE PAR GESTE, au relâchement : c'est elle qui périme le résultat du nœud et
    // déclenche sa relance. Un geste qui aurait écrit à chaque image aurait relancé cent fois.
    if (apercuM && morceaux) onMorceaux?.(remplacerMorceau(morceaux, apercuM));
    else if (apercu) onChanger(apercu.nom, apercu.valeur);
    setApercu(null);
    setApercuM(null);
    setPrise(null);
  };

  /** L'instant que désigne une abscisse sur une piste horizontale, par sa FRACTION de largeur. */
  const instantSurLaPiste = (e: React.PointerEvent): number => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return 0;
    // UNE FRACTION, ET NON DES PIXELS : React Flow met le nœud à l'échelle, et le rectangle comme le
    // pointeur sont mesurés dans la même échelle. Leur rapport n'en dépend donc pas.
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * totale.etendue;
  };
  const curseur = curseurDefilement(axe.fen, totale.etendue);

  return (
    // `nowheel` REND LA MOLETTE À LA LIGNE DE TEMPS — relevé par Fabien : « on peut zoomer mais ce
    // n'est pas pratique ». Sans cette classe, React Flow saisit la molette avant que le `onWheel` du
    // dessin ne soit appelé, et l'on zoomait le CANEVAS en croyant zoomer la ligne. Mesuré : une
    // molette sur le dessin faisait passer l'échelle du canevas de 0,624 à 0,737, et le facteur de la
    // ligne de temps ne bougeait pas d'un cran. La notice promettait pourtant ce zoom.
    <div className="ligne-temps nowheel" ref={attacherLaBoite}>
      <svg width={largeur} height={hauteur} role="img" aria-label={t(modele.cleTitre)}
        // CLIQUER À VIDE REND LA SÉLECTION. Les barres et la règle arrêtent l'événement, si bien
        // qu'il n'arrive ici que depuis une place où rien n'est posé. Sans cela on ne pourrait jamais
        // désélectionner, et les raccourcis resteraient armés sur un morceau qu'on ne regarde plus.
        onPointerDown={() => { if (selection !== null) { setSelection(null); porteurDeSelection = null; } }}
        onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacher}
        onWheel={(e) => { e.preventDefault(); axe.surMolette(e.deltaY, e.clientX - (boite.current?.getBoundingClientRect().left ?? 0) - ZONE_G); }}>
        {graduations.map((s) => (
          <g key={s}>
            <line x1={X(s)} x2={X(s)} y1={REGLE - 6} y2={hauteur} className="ligne-temps-grad" />
            <text x={X(s) + 3} y={REGLE - 9} className="ligne-temps-texte">{virgule(s, pas < 1 ? 1 : 0)} s</text>
          </g>
        ))}
        {/* LA RÈGLE PORTE LA LECTURE : on y pose la tête, et on la TIENT pour la porter où l'on veut,
            comme sur un banc de montage. Le geste ne s'arrête qu'au relâchement. */}
        <rect x={ZONE_G} y={0} width={Math.max(0, largeur - ZONE_G)} height={REGLE - 6}
          fill="transparent" style={{ cursor: "ew-resize" }}
          onPointerDown={saisirTete} />
        <line x1={X(0)} x2={X(0)} y1={REGLE - 6} y2={hauteur} className="ligne-temps-zero" />
        {/* L'ÉTIQUETTE EST POSÉE PAR RANGÉE, ET NON PAR BARRE : plusieurs morceaux partagent une
            piste, et écrire « P1 » devant chacun d'eux répéterait le même nom en surimpression. */}
        {rangs.map((k, rangee) => (
          <text key={`etiquette-${k}`} x={4} y={REGLE + rangee * HAUTEUR_PISTE + HAUTEUR_PISTE / 2 + 2}
            className="ligne-temps-texte">{`${lang === "en" ? "T" : "P"}${k + 1}`}</text>
        ))}
        {lignes.map((l) => {
          const y = REGLE + rangeeDe(l.k) * HAUTEUR_PISTE + 4, h = HAUTEUR_PISTE - 8;
          const x0 = X(l.debut), w = Math.max(2, l.duree * px);
          const we = Math.min(w, l.entree * px), ws = Math.min(w, l.sortie * px);
          const choisi = !!l.id && l.id === selection;
          return (
            <g key={l.id ?? l.k} className={`ligne-temps-piste${l.connue ? "" : " ligne-temps-inconnue"}${prise?.piste === l.k ? " ligne-temps-prise" : ""}${choisi ? " ligne-temps-choisi" : ""}`}>
              <rect x={x0} y={y} width={w} height={h} rx={3} className="ligne-temps-barre"
                style={{ cursor: "grab" }} onPointerDown={(e) => saisir(e, l, "corps")} />
              {/* L'ONDE DE LA PISTE DANS SA BARRE. Elle ne prend pas les événements : c'est la barre
                  qu'on tire, et une onde qui les interceperait rendrait la piste immobile. La part
                  dessinée est celle qui SONNE : un début négatif rogne le son par la gauche, et
                  montrer le son entier ferait croire que ce qui est rogné s'entend. */}
              {ondeDe(l) && (
                <path d={ondeDe(l)!} className="ligne-temps-onde" pointerEvents="none" />
              )}
              {/* LES NOTES DE LA BOÎTE, pour une ligne de temps qui porte des séquences. Elles ne
                  prennent pas les événements non plus : c'est la barre qu'on tire. */}
              {notesDe(l).map((r, i) => (
                <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h}
                  className="ligne-temps-note" pointerEvents="none" />
              ))}
              {/* Les fondus : deux triangles qui mangent les coins, comme sur un banc de montage. */}
              {modele.poignees.includes("entree") && we > 0
                && <path d={`M${x0},${y + h} L${x0},${y} L${x0 + we},${y} Z`} className="ligne-temps-fondu" pointerEvents="none" />}
              {modele.poignees.includes("sortie") && ws > 0
                && <path d={`M${x0 + w},${y + h} L${x0 + w},${y} L${x0 + w - ws},${y} Z`} className="ligne-temps-fondu" pointerEvents="none" />}
              {modele.poignees.includes("entree") && (
                <rect x={x0 + we - POIGNEE / 2} y={y - 2} width={POIGNEE} height={POIGNEE} rx={2} className="ligne-temps-poignee"
                  style={{ cursor: "ew-resize" }} onPointerDown={(e) => saisir(e, l, "entree")}>
                  <title>{t("montage.fonduEntree")}</title>
                </rect>
              )}
              {modele.poignees.includes("sortie") && (
                <rect x={x0 + w - ws - POIGNEE / 2} y={y - 2} width={POIGNEE} height={POIGNEE} rx={2} className="ligne-temps-poignee"
                  style={{ cursor: "ew-resize" }} onPointerDown={(e) => saisir(e, l, "sortie")}>
                  <title>{t("montage.fonduSortie")}</title>
                </rect>
              )}
              {/* LA DURÉE SE TIRE PAR LE BORD DROIT, sur toute la hauteur de la barre : ce n'est pas
                  un coin qu'on entame, c'est la barre entière qu'on allonge. */}
              {modele.poignees.includes("duree") && (
                <rect x={x0 + w - POIGNEE / 2} y={y} width={POIGNEE} height={h} rx={2} className="ligne-temps-poignee"
                  style={{ cursor: "ew-resize" }} onPointerDown={(e) => saisir(e, l, "duree")}>
                  <title>{t("maquette.dureeBoite")}</title>
                </rect>
              )}
              {w > 70 && (
                <text x={x0 + Math.max(we, 6)} y={y + h - 7} className="ligne-temps-texte ligne-temps-legende" pointerEvents="none">
                  {`${virgule(l.debut, 2)} s${legende(l)}`}
                </text>
              )}
            </g>
          );
        })}
        {/* La tête de lecture par-dessus tout le reste : c'est elle qu'on suit des yeux. */}
        {ecoutable && (
          <>
            {/* ET ELLE SE PREND ELLE-MÊME, sur toute la hauteur du dessin. Un trait d'un pixel ne
                s'attrape pas : la zone de prise est large de PRISE_TETE, centrée dessus, et invisible.
                Elle est posée AVANT le trait pour que celui-ci reste visible par-dessus, et elle
                couvre les pistes, où une piste saisie l'emporterait sinon sur la tête. */}
            <rect x={X(axe.pos) - PRISE_TETE / 2} y={0} width={PRISE_TETE} height={hauteur}
              fill="transparent" style={{ cursor: "ew-resize" }} onPointerDown={saisirTete} />
            <line x1={X(axe.pos)} x2={X(axe.pos)} y1={0} y2={hauteur} className="ligne-temps-tete" pointerEvents="none" />
          </>
        )}
      </svg>

      {/* LA BARRE DE DÉFILEMENT, AU-DESSUS DU LECTEUR — demandée par Fabien. Zoomé, on ne pouvait se
          déplacer qu'à la molette, qui ne répondait pas, ou en attendant que la tête de lecture
          ramène la vue. Son curseur porte deux nouvelles à la fois : OÙ l'on est, par sa position, et
          COMBIEN l'on voit, par sa largeur — couvrant toute la piste, il dit qu'il n'y a rien à faire
          défiler. Elle est alignée sur le dessin et non sur le nœud : la colonne de gauche porte les
          étiquettes de piste, et le curseur ne correspondrait plus à la règle. */}
      <div className="ligne-temps-defilement" style={{ marginLeft: ZONE_G }}
        title={t("montage.defilement")}
        onPointerDown={(e) => {
          e.preventDefault(); e.stopPropagation();
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          axe.centrerSur(instantSurLaPiste(e));
        }}
        onPointerMove={(e) => { if (e.buttons !== 0) axe.centrerSur(instantSurLaPiste(e)); }}
        onPointerUp={(e) => { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); }}>
        <div className="ligne-temps-defilement-curseur"
          style={{ left: `${curseur.debut * 100}%`, width: `${curseur.largeur * 100}%` }} />
      </div>

      {ecoutable && (
        <div className="ligne-temps-transport">
          {/* L'ÉLÉMENT AUDIO NE SERT QU'À DÉFAUT DE TAMPONS : avant la première exécution, ou pour une
              ligne de temps dont le nœud n'en désigne pas. Caché, parce que ses commandes sont celles de
              la ligne de temps : deux jeux de boutons pour un même son se contrediraient. */}
          {!vive.prete && audioUrl && (
            <audio ref={axe.audioRef} src={audioUrl} style={{ display: "none" }}
              onLoadedMetadata={ouvrirAuNiveauDEcoute} />
          )}
          <button type="button" className="nodrag" onPointerDown={(e) => e.stopPropagation()}
            onClick={axe.basculerLecture}
            title={t(axe.enLecture ? "montage.pause" : "montage.lire")}>
            {axe.enLecture ? "❚❚" : "▶"}
          </button>
          <span className="ligne-temps-texte">{virgule(axe.pos, 2)} s</span>
          {/* LE CURSEUR PORTE UNE FRACTION, ET LE ZOOM S'EN DÉDUIT GÉOMÉTRIQUEMENT. Réglé sur le
              pourcentage lui-même, il valait 102 unités par pixel : toute la plage utile, de une à
              dix fois, tenait dans les NEUF PREMIERS PIXELS d'une piste de 489, et l'on ne pouvait
              que sauter d'un extrême à l'autre. Mille crans sur la fraction donnent un rapport
              constant par cran, comme la molette. Voir `axe-temps.ts`. */}
          <input type="range" className="nodrag" min={0} max={CRANS_ZOOM} step={1}
            value={Math.round(fractionDepuisZoom(axe.zoomPct) * CRANS_ZOOM)}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => axe.changerZoom(zoomDepuisFraction(Number(e.target.value) / CRANS_ZOOM))}
            title={t("montage.zoom")} />
          <span className="ligne-temps-texte">{`×${(axe.zoomPct / 100).toFixed(1)}`}</span>
        </div>
      )}
      {lignes.some((l) => !l.connue) && <div className="ligne-temps-note">{t("montage.dureesInconnues")}</div>}
    </div>
  );
}

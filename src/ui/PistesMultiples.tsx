// ui/PistesMultiples.tsx — Six sons l'un sous l'autre, deux fois : de loin, et de près.
//
// POURQUOI UN SEUL DESSIN PAR VUE, ET NON SIX VISUALISEURS EMPILÉS. L'axe du temps commun est tout
// l'intérêt du composant : dessiner les six bandes sur la même surface le donne par construction, là
// où six tracés séparés demanderaient de tenir six zooms et six défilements en accord.
//
// DEUX VUES, UNE SEULE BARRE DE DÉFILEMENT — demandé par Fabien. Celle du haut ne change pas : elle
// montre tout, du début à la fin de la plus longue piste, et c'est elle qu'on vient lire pour
// comparer des durées. Celle du bas montre la portion que la barre désigne, et c'est elle qu'on
// resserre pour aller voir de près. La vue du haut porte le cadre de ce que la vue du bas regarde,
// sans quoi on ne saurait pas où l'on se trouve une fois serré.
//
// LE ZOOM GAGNE EN FINESSE, IL N'AGRANDIT PAS — tant qu'il reste au-dessus de la colonne fine. Le
// nœud garde soixante-cinq mille colonnes par piste, et la vue y taille la portion visible à la
// largeur qu'elle a. Voir `audio/pistes-visu.ts`, où ce coût et cette borne sont écrits.
//
// CE QU'IL DESSINE VIENT DE L'EXÉCUTION, et non du son. Le nœud pose sur lui-même l'enveloppe de
// chaque piste, jamais les tampons : six sons retenus pour l'affichage pèseraient des dizaines de
// mégaoctets.
//
// L'ÉCHELLE VERTICALE EST COMMUNE ET FIXE, de −1 à 1. Ajuster chaque bande à sa propre crête ferait
// paraître un son faible aussi ample qu'un son fort, et c'est précisément la comparaison qu'on vient
// chercher. La crête est écrite à côté de la bande, pour ceux qui la veulent en chiffres.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type WheelEvent } from "react";
import { NodeResizer } from "@xyflow/react";
import { plageDenveloppe, type EnveloppeFine } from "../audio/pistes-visu";

export interface PisteVue {
  piste: number;
  dureeSec: number;
  crete: number;
  fine: EnveloppeFine;
}

const HAUTEUR_MIN_BANDE = 26;
const MARGE_GAUCHE = 26;
const HAUTEUR_AXE = 16;
/** Le grossissement de départ de la vue du bas : assez pour qu'elle serve, pas au point de perdre. */
const ZOOM_DEPART = 8;
// Au-delà d'environ cent trente, la fenêtre tient dans moins de colonnes fines qu'elle n'a de
// pixels, et le tracé s'agrandit au lieu de gagner. On laisse aller un peu plus loin, pour qui veut
// lire une pointe en gros, et pas au-delà.
const ZOOM_MAX = 512;
const ZOOM_MIN = 1;

const format = (sec: number): string =>
  sec >= 60 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`
    : sec >= 1 ? `${sec.toFixed(2)} s`
      : `${(sec * 1000).toFixed(sec >= 0.01 ? 0 : 1)} ms`;

interface Fenetre { debutSec: number; finSec: number }

/**
 * Les bandes d'une fenêtre de temps, dessinées sur une toile.
 *
 * La même fonction sert aux deux vues : l'une reçoit la durée entière, l'autre la portion désignée
 * par la barre. Les faire diverger aurait fini par donner deux dessins qui ne se ressemblent plus,
 * alors que l'intérêt de la paire est justement qu'ils se ressemblent.
 */
function dessiner(
  canvas: HTMLCanvasElement, boite: HTMLDivElement,
  pistes: PisteVue[], fenetre: Fenetre, cadre: Fenetre | null,
): void {
  const l = Math.max(80, Math.floor(boite.clientWidth));
  const h = Math.max(HAUTEUR_MIN_BANDE + HAUTEUR_AXE, Math.floor(boite.clientHeight));
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(l * ratio);
  canvas.height = Math.floor(h * ratio);
  canvas.style.width = `${l}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, l, h);
  if (pistes.length === 0) return;

  const { debutSec, finSec } = fenetre;
  const span = Math.max(1e-9, finSec - debutSec);
  const largeur = l - MARGE_GAUCHE;
  const bande = (h - HAUTEUR_AXE) / pistes.length;
  const xDe = (sec: number) => MARGE_GAUCHE + ((sec - debutSec) / span) * largeur;

  pistes.forEach((p, rang) => {
    const haut = rang * bande;
    const milieu = haut + bande / 2;
    // Le fond d'une bande sur deux : sans lui, six ondes sur un même fond se confondent.
    if (rang % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      ctx.fillRect(MARGE_GAUCHE, haut, largeur, bande);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.moveTo(MARGE_GAUCHE, milieu);
    ctx.lineTo(l, milieu);
    ctx.stroke();

    // LA PISTE S'ARRÊTE OÙ ELLE S'ARRÊTE : on ne dessine que la part d'elle qui tombe dans la
    // fenêtre. C'est ce rapport qu'on vient lire, et l'étirer à toute la largeur l'effacerait.
    const a = Math.max(debutSec, 0);
    const b = Math.min(finSec, p.dureeSec);
    if (b > a && p.dureeSec > 0) {
      const x0 = xDe(a);
      const sienne = xDe(b) - x0;
      const colonnes = plageDenveloppe(p.fine, a / p.dureeSec, b / p.dureeSec, sienne);
      const n = colonnes.length;
      if (n > 0) {
        ctx.fillStyle = "rgba(138,164,255,0.95)";
        const pasX = sienne / n;
        const demi = (bande / 2) * 0.88;
        for (let i = 0; i < n; i++) {
          const c = colonnes[i];
          const y1 = milieu - c.max * demi;
          const y2 = milieu - c.min * demi;
          ctx.fillRect(x0 + i * pasX, y1, Math.max(0.6, pasX), Math.max(0.8, y2 - y1));
        }
      }
    }

    ctx.fillStyle = "rgba(233,224,240,0.75)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.piste + 1), 8, milieu);
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(169,155,184,0.9)";
    ctx.fillText(`${format(p.dureeSec)} · ${p.crete.toFixed(2)}`, MARGE_GAUCHE + 4, haut + 2);
  });

  // LE CADRE DE CE QUE L'AUTRE VUE REGARDE, posé sur celle du haut. Serré à deux dixièmes de
  // seconde sur trois minutes, il devient un trait : c'est encore le seul repère qui dise où l'on
  // est allé, d'où la largeur minimale de deux pixels.
  if (cadre) {
    const x1 = Math.max(MARGE_GAUCHE, xDe(cadre.debutSec));
    const x2 = Math.min(l, xDe(cadre.finSec));
    const large = Math.max(2, x2 - x1);
    ctx.fillStyle = "rgba(138,164,255,0.12)";
    ctx.fillRect(x1, 0, large, h - HAUTEUR_AXE);
    ctx.strokeStyle = "rgba(138,164,255,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x1 + 0.5, 0.5, Math.max(1, large - 1), h - HAUTEUR_AXE - 1);
  }

  // L'axe du temps, commun à toutes les bandes : c'est lui qui fait la comparaison.
  const y = h - HAUTEUR_AXE;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(MARGE_GAUCHE, y);
  ctx.lineTo(l, y);
  ctx.stroke();
  ctx.fillStyle = "rgba(169,155,184,0.9)";
  ctx.font = "10px system-ui, sans-serif";
  ctx.textBaseline = "top";
  for (let k = 0; k <= 4; k++) {
    const x = MARGE_GAUCHE + (k / 4) * largeur;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 4);
    ctx.stroke();
    ctx.textAlign = k === 4 ? "right" : k === 0 ? "left" : "center";
    ctx.fillText(format(debutSec + (k / 4) * span), x, y + 5);
  }
  ctx.textAlign = "left";
}

export function PistesMultiples({ pistes, selected }: { pistes: PisteVue[]; selected?: boolean }) {
  const hoteHaut = useRef<HTMLDivElement | null>(null);
  const hoteBas = useRef<HTMLDivElement | null>(null);
  const toileHaut = useRef<HTMLCanvasElement | null>(null);
  const toileBas = useRef<HTMLCanvasElement | null>(null);
  const barre = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(ZOOM_DEPART);
  const [debut01, setDebut01] = useState(0);

  const duree = pistes.length > 0 ? Math.max(...pistes.map((p) => p.dureeSec), 1e-6) : 1;
  const span = duree / zoom;
  const debutSec = Math.max(0, Math.min(duree - span, debut01 * duree));
  const fenetre: Fenetre = { debutSec, finSec: debutSec + span };

  const dessinerTout = useCallback(() => {
    if (toileHaut.current && hoteHaut.current) {
      dessiner(toileHaut.current, hoteHaut.current, pistes, { debutSec: 0, finSec: duree },
        zoom > 1 ? fenetre : null);
    }
    if (toileBas.current && hoteBas.current) {
      dessiner(toileBas.current, hoteBas.current, pistes, fenetre, null);
    }
  }, [pistes, duree, zoom, fenetre.debutSec, fenetre.finSec]);

  useEffect(() => {
    dessinerTout();
    // Le nœud se redimensionne : le dessin suit sa boîte, sans quoi il resterait à la taille qu'il
    // avait au premier rendu.
    const observateur = new ResizeObserver(dessinerTout);
    if (hoteHaut.current) observateur.observe(hoteHaut.current);
    if (hoteBas.current) observateur.observe(hoteBas.current);
    return () => observateur.disconnect();
  }, [dessinerTout]);

  // LA BARRE EST UNE VRAIE BARRE DE DÉFILEMENT, et non un curseur : l'épaisseur de son ascenseur dit
  // quelle part du son on regarde, ce qu'un curseur ne dit pas. Le contenu qu'elle fait défiler est
  // une bande vide large de `zoom` fois la barre ; c'est le navigateur qui dessine et qui mesure.
  useLayoutEffect(() => {
    const b = barre.current;
    if (!b) return;
    const parcours = b.scrollWidth - b.clientWidth;
    const voulu = parcours > 0 ? debutSec / Math.max(1e-9, duree - span) * parcours : 0;
    if (Math.abs(b.scrollLeft - voulu) > 0.5) b.scrollLeft = voulu;
  }, [zoom, debutSec, duree, span]);

  const surDefilement = () => {
    const b = barre.current;
    if (!b) return;
    const parcours = b.scrollWidth - b.clientWidth;
    setDebut01(parcours > 0 ? (b.scrollLeft / parcours) * (1 - 1 / zoom) : 0);
  };

  // LA MOLETTE ZOOME AUTOUR DU POINT VISÉ, et non autour du bord : resserrer sur un clic repéré à
  // l'œil demande que ce clic reste sous le curseur, sinon il sort du cadre au premier cran.
  const surMolette = (e: WheelEvent<HTMLDivElement>) => {
    const boite = hoteBas.current?.getBoundingClientRect();
    if (!boite) return;
    const part = Math.max(0, Math.min(1,
      (e.clientX - boite.left - MARGE_GAUCHE) / Math.max(1, boite.width - MARGE_GAUCHE)));
    const vise = debutSec + part * span;
    const suivant = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (e.deltaY > 0 ? 1 / 1.3 : 1.3)));
    const spanSuivant = duree / suivant;
    setZoom(suivant);
    setDebut01(Math.max(0, Math.min(1 - 1 / suivant,
      (vise - part * spanSuivant) / Math.max(1e-9, duree))));
  };

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={260} minHeight={200} />
      <div className="attic-pistes-multiples nodrag nowheel">
        <div ref={hoteHaut} className="attic-pistes-vue">
          <canvas ref={toileHaut} />
          {pistes.length === 0 && <span className="attic-pistes-multiples-vide">—</span>}
        </div>
        <div ref={hoteBas} className="attic-pistes-vue" onWheel={surMolette}>
          <canvas ref={toileBas} />
        </div>
        <div ref={barre} className="attic-pistes-barre" onScroll={surDefilement}>
          <div style={{ width: `${zoom * 100}%`, height: 1 }} />
        </div>
        <div className="attic-pistes-pied">
          <span>{format(debutSec)} → {format(fenetre.finSec)}</span>
          <span>×{zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}</span>
        </div>
      </div>
    </>
  );
}

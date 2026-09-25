// ui/PistesMultiples.tsx — Six sons l'un sous l'autre, sur le même axe du temps.
//
// POURQUOI UN SEUL DESSIN, ET NON SIX VISUALISEURS EMPILÉS. L'axe du temps commun est tout l'intérêt
// du composant : dessiner les six bandes sur la même surface le donne par construction, là où six
// tracés séparés demanderaient de tenir six zooms et six défilements en accord.
//
// CE QU'IL DESSINE VIENT DE L'EXÉCUTION, et non du son. Le nœud pose sur lui-même l'enveloppe de
// chaque piste — deux mille colonnes de minimum et maximum, cf. `audio/pistes-visu.ts` —, jamais les
// tampons : six sons retenus pour l'affichage pèseraient des dizaines de mégaoctets.
//
// L'ÉCHELLE VERTICALE EST COMMUNE ET FIXE, de −1 à 1. Ajuster chaque bande à sa propre crête ferait
// paraître un son faible aussi ample qu'un son fort, et c'est précisément la comparaison qu'on vient
// chercher. La crête est écrite à côté de la bande, pour ceux qui la veulent en chiffres.

import { useEffect, useRef } from "react";
import { NodeResizer } from "@xyflow/react";

export interface ColonneVue { min: number; max: number }
export interface PisteVue {
  piste: number;
  dureeSec: number;
  crete: number;
  colonnes: ColonneVue[];
}

const HAUTEUR_MIN_BANDE = 26;
const MARGE_GAUCHE = 26;
const HAUTEUR_AXE = 16;

const format = (sec: number): string =>
  sec >= 60 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}` : `${sec.toFixed(2)} s`;

export function PistesMultiples({ pistes, selected }: { pistes: PisteVue[]; selected?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const hote = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const boite = hote.current;
    if (!canvas || !boite) return;

    const dessiner = () => {
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

      const duree = Math.max(...pistes.map((p) => p.dureeSec), 1e-6);
      const largeur = l - MARGE_GAUCHE;
      const bande = (h - HAUTEUR_AXE) / pistes.length;

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

        // LA PISTE S'ARRÊTE OÙ ELLE S'ARRÊTE : sa largeur est sa durée rapportée à la plus longue.
        // C'est ce rapport qu'on vient lire, et l'étirer à toute la largeur l'effacerait.
        const sienne = (p.dureeSec / duree) * largeur;
        const n = p.colonnes.length;
        if (n > 0) {
          ctx.fillStyle = "rgba(138,164,255,0.95)";
          const pasX = sienne / n;
          const demi = (bande / 2) * 0.88;
          for (let i = 0; i < n; i++) {
            const c = p.colonnes[i];
            const y1 = milieu - c.max * demi;
            const y2 = milieu - c.min * demi;
            ctx.fillRect(MARGE_GAUCHE + i * pasX, y1, Math.max(0.6, pasX), Math.max(0.8, y2 - y1));
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
        ctx.fillText(format((k / 4) * duree), x, y + 5);
      }
      ctx.textAlign = "left";
    };

    dessiner();
    // Le nœud se redimensionne : le dessin suit sa boîte, sans quoi il resterait à la taille qu'il
    // avait au premier rendu.
    const observateur = new ResizeObserver(dessiner);
    observateur.observe(boite);
    return () => observateur.disconnect();
  }, [pistes]);

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={260} minHeight={120} />
      <div ref={hote} className="attic-pistes-multiples nodrag">
        <canvas ref={ref} />
        {pistes.length === 0 && <span className="attic-pistes-multiples-vide">—</span>}
      </div>
    </>
  );
}

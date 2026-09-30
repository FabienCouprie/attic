// ui/lecteur-audio.tsx — Le lecteur audio de l'interface, et le temps écrit à côté.
//
// POURQUOI CE MODULE EXISTE. Le transport du navigateur n'affiche les secondes qu'ENTIÈRES, et il
// les tronque : un son d'une demi-seconde s'y lit « 0:00 / 0:00 », et le temps écoulé d'un son
// d'une seconde reste à zéro d'un bout à l'autre de la lecture. La durée n'est pourtant pas fausse,
// et c'est mesuré : sur cinq sons de 0,5, 1, 1,5, 2 et 5 secondes, l'élément rend exactement ces
// cinq durées. C'est l'affichage qui n'a pas la résolution des sons que ce dépôt fabrique, dont
// beaucoup durent moins de deux secondes. Le transport est laissé tel quel, et le temps est donné
// au centième au-dessous.
//
// ET IL EST ICI PLUTÔT QUE RECOPIÉ. Sept endroits de l'interface posaient le même élément, chacun
// avec ses propres gestionnaires : le relevé y serait devenu sept relevés, qui auraient divergé.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as PointerEventReact } from "react";

import { ouvrirAuNiveauDEcoute } from "./niveau-ecoute";

/** Un temps en minutes, secondes et centièmes. Rien d'exploitable se lit « — ». */
export function tempsAuCentieme(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const c = Math.floor((sec % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${c.toString().padStart(2, "0")}`;
}

interface Props {
  /** La source. Indéfinie, le lecteur reste vide et ne porte pas de relevé, comme avant lui. */
  src?: string;
  /** La classe de l'élément. Certaines vues cherchent le lecteur du nœud par la sienne. */
  className?: string;
  style?: CSSProperties;
  /** L'élément lui-même, pour les vues qui le pilotent ou s'y calent. */
  elementRef?: (el: HTMLAudioElement | null) => void;
  onPointerDown?: (e: PointerEventReact<HTMLAudioElement>) => void;
  /** Les traces de console que les lecteurs de nœud écrivaient déjà. */
  trace?: boolean;
}

export function LecteurAudio({
  src, className = "attic-node-audio nodrag", style, elementRef, onPointerDown, trace,
}: Props) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [ou, setOu] = useState(0);
  const [duree, setDuree] = useState(NaN);
  const anim = useRef(0);

  // LE RAPPEL DE L'APPELANT EST LU AU MOMENT DE POSER, non capturé à la construction : la fonction
  // qui pose la référence reste donc la même d'un rendu à l'autre, et React cesse de détacher puis
  // rattacher l'élément à chaque fois.
  const rappel = useRef(elementRef);
  rappel.current = elementRef;
  const poser = useCallback((el: HTMLAudioElement | null) => {
    ref.current = el;
    rappel.current?.(el);
  }, []);

  // LE RELEVÉ SUIT LA LECTURE À L'IMAGE, et non par l'événement « timeupdate » : celui-ci ne se
  // déclenche qu'environ quatre fois par seconde, ce qui rendrait le relevé d'un son d'une seconde
  // aussi grossier que le compteur qu'il remplace.
  const suivre = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setOu(el.currentTime);
    if (!el.paused && !el.ended) anim.current = requestAnimationFrame(suivre);
  }, []);

  const arreter = useCallback(() => {
    cancelAnimationFrame(anim.current);
    setOu(ref.current?.currentTime ?? 0);
  }, []);

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  return (
    <>
      <audio
        key={src} ref={poser} className={className} controls src={src} style={style}
        onPointerDown={onPointerDown}
        onLoadedMetadata={(e) => {
          ouvrirAuNiveauDEcoute(e);
          setDuree(e.currentTarget.duration);
          setOu(e.currentTarget.currentTime);
          if (trace) console.log("[audio player] loadedmetadata", e.currentTarget.duration, e.currentTarget.src);
        }}
        onPlay={(e) => { suivre(); if (trace) console.log("[audio player] play", e.currentTarget.src); }}
        onPause={arreter}
        onEnded={arreter}
        onSeeked={arreter}
        onError={(e) => console.error("[audio player] error", e.currentTarget.error, e.currentTarget.src)}
      />
      {src && (
        <div className="attic-node-duree">{tempsAuCentieme(ou)} / {tempsAuCentieme(duree)}</div>
      )}
    </>
  );
}

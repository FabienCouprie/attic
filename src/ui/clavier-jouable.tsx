// ui/clavier-jouable.tsx — Le clavier de 88 touches d'un nœud : géométrie, jeu, enregistrement.
//
// POURQUOI CE FICHIER EXISTE. Il y a maintenant DEUX claviers jouables au niveau du nœud — « Clavier
// mélodie », qui joue une synthèse FM ou un SoundFont, et « Clavier SFZ », qui joue une banque
// d'échantillons. Tout ce qui n'est pas la façon de faire du son leur est commun : la géométrie des
// quatre-vingt-huit touches, le choix de la touche sous le curseur, l'enregistrement de ce qu'on
// joue, le clavier de l'ordinateur. Recopier cela aurait aussi recopié ses corrections — la division
// par l'échelle de React Flow et la libération du pointeur ont chacune coûté une mesure dans
// l'application, et ce genre de correctif ne se recopie jamais deux fois.
//
// CE QUI RESTE À L'APPELANT est exactement ce qui diffère : `presser` fait sonner une note et rend
// de quoi l'arrêter. Le reste — quand presser, quelle vélocité, quelle note — est ici.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { clavierDoitJouer } from "./clavier-physique";
import { NOTE_MAX, NOTE_MIN, disposition, largeurBlanchePour, nomNote, noteALaPosition } from "./clavier-disposition";

import type { Note } from "../audio/note";
export const PROPORTION_NOIRE = 0.62;

export type NoteEnregistree = Note;

/** Une note en train de sonner : on ne garde que de quoi l'arrêter. */
export interface VoixVivante {
  arreter: () => void;
}

/** Ce que l'appelant fournit : faire sonner une note, et rendre de quoi l'éteindre. */
export type Presseur = (note: number, velocite: number) => VoixVivante;

export function useClavierJouable(id: string, presseur: Presseur) {
  const contRef = useRef<HTMLDivElement>(null), touchesRef = useRef<HTMLDivElement>(null);
  const [hauteurTouches, setHauteurTouches] = useState(90);
  // LA LARGEUR EST MESUREE AU MEME TITRE QUE LA HAUTEUR, et c'est elle qui decide de la taille des
  // touches : les quatre-vingt-huit tiennent alors dans le noeud, quelle que soit sa taille, et se
  // voient d'un coup. A vingt-quatre pixels fixes, le clavier en faisait 1248 dans un noeud de 500.
  const [largeurDispo, setLargeurDispo] = useState(0);
  useEffect(() => {
    const el = touchesRef.current; if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setHauteurTouches(entry.contentRect.height);
      setLargeurDispo(entry.contentRect.width);
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const dispo = useMemo(
    () => disposition(NOTE_MIN, NOTE_MAX, largeurBlanchePour(largeurDispo)),
    [largeurDispo],
  );
  // IL NE RESTE A DEFILER QUE SI LE NOEUD EST TROP ETROIT pour la largeur minimale. On arrive alors
  // centre sur le do3, la ou se joue une melodie, plutot que sur le la0 tout en bas du piano.
  useEffect(() => {
    const el = touchesRef.current; if (!el) return;
    if (dispo.largeurTotale <= el.clientWidth) { el.scrollLeft = 0; return; }
    const do3 = dispo.blanches.find((k) => k.note === 48);
    if (do3) el.scrollLeft = Math.max(0, do3.x - dispo.largeurBlanche);
  }, [dispo]);

  const activesRef = useRef<Map<number, VoixVivante>>(new Map());
  const debutRef = useRef(0), enRegRef = useRef(false), dernierePresseRef = useRef(0);
  const seqRef = useRef<NoteEnregistree[]>([]);
  const [enReg, setEnReg] = useState(false), [touches, setTouches] = useState<Set<number>>(new Set());
  const [, setVersion] = useState(0), { setNodes } = useReactFlow();
  const pointerEnfonce = useRef(false);
  const presseurRef = useRef(presseur);
  presseurRef.current = presseur;

  /** La vélocité se déduit du rythme de frappe : jouer vite, c'est jouer fort. */
  function calculerVelocite(): number {
    const now = performance.now(), delta = now - dernierePresseRef.current;
    dernierePresseRef.current = now;
    if (delta < 80) return 120;
    if (delta < 150) return 100;
    if (delta < 300) return 80;
    return 60;
  }
  const arreter = useCallback((note: number) => {
    const o = activesRef.current.get(note);
    if (o) { o.arreter(); activesRef.current.delete(note); }
  }, []);
  const presser = useCallback((note: number) => {
    const velocite = calculerVelocite();
    setTouches((p) => new Set(p).add(note));
    activesRef.current.set(note, presseurRef.current(note, velocite));
    if (enRegRef.current) {
      seqRef.current.push({ note, velocite, debut: (performance.now() - debutRef.current) / 1000, fin: 0 });
      setVersion((v) => v + 1);
    }
  }, []);
  const relacher = useCallback((note: number) => {
    setTouches((p) => { const n = new Set(p); n.delete(note); return n; });
    arreter(note);
    if (enRegRef.current) {
      for (const s of seqRef.current) if (s.note === note && s.fin === 0) {
        s.fin = (performance.now() - debutRef.current) / 1000; break;
      }
      setVersion((v) => v + 1);
    }
  }, [arreter]);

  function trouverNoteDepuisPointer(e: React.PointerEvent): number | null {
    const el = touchesRef.current; if (!el) return null;
    const rect = el.getBoundingClientRect();
    // Le noeud vit dans un canevas que React Flow met a l'echelle : `getBoundingClientRect`
    // rend des pixels ECRAN, quand la disposition des touches et `scrollLeft` sont en
    // pixels de mise en page. Sans cette division, un clic tombait plusieurs touches plus
    // loin des que le zoom n'etait pas exactement 1 — mesure dans l'application, viser le
    // do diese 4 enfoncait le sol diese 4.
    const echelle = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
    // `clientLeft`/`clientTop` : l'epaisseur des bordures du conteneur — dont la
    // garniture de 4 px au-dessus des touches —, que `rect` compte mais que ni
    // `scrollLeft` ni la disposition des touches ne comptent.
    const x = (e.clientX - rect.left) / (echelle || 1) - el.clientLeft + el.scrollLeft;
    const y = (e.clientY - rect.top) / (echelle || 1) - el.clientTop;
    return noteALaPosition(x, y, hauteurTouches, dispo, PROPORTION_NOIRE);
  }
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointerEnfonce.current = true;
    const note = trouverNoteDepuisPointer(e);
    if (note !== null) presser(note);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointerEnfonce.current) return;
    if (e.buttons === 0) { onPointerUp(); return; }
    const note = trouverNoteDepuisPointer(e);
    if (note !== null && !touches.has(note)) presser(note);
  }
  function onPointerUp() {
    pointerEnfonce.current = false;
    for (const note of activesRef.current.keys()) relacher(note);
  }

  function demarrerEnreg() {
    seqRef.current = []; setVersion((v) => v + 1);
    enRegRef.current = true; debutRef.current = performance.now(); setEnReg(true);
  }
  function arreterEnreg() {
    enRegRef.current = false; setEnReg(false);
    const now = performance.now();
    for (const s of seqRef.current) if (s.fin === 0) s.fin = (now - debutRef.current) / 1000;
    setNodes((nds) => nds.map((nd) => nd.id === id
      ? { ...nd, data: { ...nd.data, sequenceNotes: [...seqRef.current] } } : nd));
    setVersion((v) => v + 1);
  }
  function effacer() {
    seqRef.current = []; setVersion((v) => v + 1);
    for (const [n] of activesRef.current) arreter(n);
    setTouches(new Set());
    setNodes((nds) => nds.map((nd) => nd.id === id ? { ...nd, data: { ...nd.data, sequenceNotes: [] } } : nd));
  }

  const [octaveClavier, setOctaveClavier] = useState(4);
  const keyMap = useMemo(() => {
    const m = new Map<string, number>(), blancs = "zxcvbnm", noirs = "sdghj";
    const notesBlanches = [0, 2, 4, 5, 7, 9, 11], notesNoires = [1, 3, 6, 8, 10];
    const base = octaveClavier * 12;
    for (let i = 0; i < blancs.length; i++) m.set(blancs[i].toUpperCase(), base + notesBlanches[i]);
    for (let i = 0; i < noirs.length; i++) m.set(noirs[i].toUpperCase(), base + notesNoires[i]);
    return m;
  }, [octaveClavier]);
  // LE CLAVIER PHYSIQUE N'ÉCOUTE QUE POUR LE NŒUD SÉLECTIONNÉ.
  //
  // L'écoute était posée sur `window` sans condition, dès que la vue était montée — or React Flow
  // monte la vue de TOUS les nœuds du graphe. Un clavier posé ailleurs sonnait donc pendant qu'on
  // travaillait autre part, deux claviers sonnaient ensemble, et taper du texte dans un paramètre
  // jouait des notes. La règle et ses raisons vivent dans `clavier-physique.ts`, avec ses tests.
  const selectionne = useStore(
    useCallback((etat: any) => Boolean(etat.nodeLookup.get(id)?.selected), [id]),
  );
  useEffect(() => {
    if (!selectionne) return;
    function onKD(e: KeyboardEvent) {
      if (e.repeat || !clavierDoitJouer({ selectionne: true, cible: e.target })) return;
      if (e.key === "ArrowUp" || e.key === "=") { setOctaveClavier((o) => Math.min(o + 1, 7)); return; }
      if (e.key === "ArrowDown" || e.key === "-") { setOctaveClavier((o) => Math.max(o - 1, 2)); return; }
      const note = keyMap.get(e.key.toUpperCase());
      if (note !== undefined && !activesRef.current.has(note)) presser(note);
    }
    function onKU(e: KeyboardEvent) {
      // Le relâchement n'est PAS conditionné à la cible : une touche enfoncée sur le clavier puis
      // relâchée après un clic ailleurs doit s'éteindre, sinon la note reste tenue pour toujours.
      const note = keyMap.get(e.key.toUpperCase());
      if (note !== undefined) relacher(note);
    }
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup", onKU);
    return () => {
      window.removeEventListener("keydown", onKD);
      window.removeEventListener("keyup", onKU);
      // Désélectionner pendant qu'une touche est enfoncée laisserait la note sonner sans personne
      // pour la relâcher : on éteint tout ce qui sonne en partant.
      for (const note of [...activesRef.current.keys()]) relacher(note);
    };
  }, [keyMap, presser, relacher, selectionne]);

  return {
    contRef, touchesRef, dispo, hauteurTouches,
    touches, seq: seqRef.current, seqRef, enReg,
    presser, relacher, arreter, activesRef,
    onPointerDown, onPointerMove, onPointerUp,
    demarrerEnreg, arreterEnreg, effacer,
    octaveClavier, nomNote,
  };
}

/**
 * Les touches, telles qu'on les voit et telles qu'on les joue.
 *
 * Chaque touche est un vrai bouton, portant sa hauteur et son etat enfonce : on
 * peut la lire, la cibler au clavier, et la designer dans un test. Le pointeur,
 * lui, est traite sur le conteneur pour que le glissando fonctionne.
 */
export function TouchesClavier({ clavier }: { clavier: ReturnType<typeof useClavierJouable> }) {
  const { dispo, hauteurTouches, touches, touchesRef } = clavier;
  return (
    <div className="clavier-touches"
      ref={touchesRef}
      onPointerDown={clavier.onPointerDown} onPointerMove={clavier.onPointerMove}
      onPointerUp={clavier.onPointerUp} onPointerCancel={clavier.onPointerUp}
      onLostPointerCapture={clavier.onPointerUp}>
      {/* Hauteurs en PIXELS, tirees d'une seule mesure : en pourcentage, elles se
          resolvaient a zero — aucun parent n'ayant de hauteur definie, les touches
          noires ne se voyaient pas. Le meme nombre sert au test de position, si bien
          que ce qu'on voit et ce qu'on joue ne peuvent plus diverger. */}
      <div className="clavier-interieure"
        style={{ width: dispo.largeurTotale, position: "relative", height: hauteurTouches }}>
        {dispo.blanches.map((b) => (
          <button key={b.note} type="button" tabIndex={-1}
            className={"clavier-blanche" + (touches.has(b.note) ? " enfoncee" : "")}
            data-note={b.note} data-pitch={nomNote(b.note)} aria-pressed={touches.has(b.note)}
            style={{ position: "absolute", left: b.x, width: b.largeur - 1, height: hauteurTouches, top: 0 }}>
            {b.note % 12 === 0 && <span className="clavier-etiquette">{nomNote(b.note)}</span>}
          </button>
        ))}
        {dispo.noires.map((k) => (
          <button key={k.note} type="button" tabIndex={-1}
            className={"clavier-noire" + (touches.has(k.note) ? " enfoncee" : "")}
            data-note={k.note} data-pitch={nomNote(k.note)} aria-pressed={touches.has(k.note)}
            style={{ position: "absolute", left: k.x, width: k.largeur, height: Math.round(hauteurTouches * PROPORTION_NOIRE), top: 0 }} />
        ))}
      </div>
    </div>
  );
}

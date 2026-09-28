// ui/hooks/useLectureVive.ts — Le graphe vivant du montage : les pistes montées en direct.
//
// CE QUE CE CROCHET PORTE. Les règles vivent dans `audio/lecture-vive.ts`, sans React ni Web Audio,
// parce qu'elles se démontrent. Ce qui reste ici ne se teste pas sous vitest : le contexte audio, les
// sources programmées, l'horloge. Le crochet n'a donc aucune décision à lui — il applique.
//
// DEUX GAINS PAR PISTE, ET C'EST TOUT L'INTÉRÊT. Le premier porte la forme des fondus, posée d'avance
// par `setValueCurveAtTime` : une courbe programmée ne se modifie plus. Le second porte le niveau,
// une valeur simple qu'on écrit quand on veut. Mettre le niveau dans la courbe, comme le fait le
// rendu, obligerait à reprendre la source à chaque décibel — donc à interrompre le son qu'on règle.
//
// L'HORLOGE S'INTERROGE, elle ne se publie pas. `position()` se lit à chaque image, comme on lisait
// `currentTime` d'un élément audio : c'est ce qui permet à `useAxeTemps` de suivre l'une ou l'autre
// sans rien savoir de leur nature. Publier la position dans un état React la ferait passer par un
// rendu, et l'horloge du son n'attend pas les rendus.
import { useCallback, useEffect, useRef, useState } from "react";
import { calerSource, courbeDeGain, gainLineaire } from "../../audio/apercu-video";
import {
  departDeLecture, differencePistes, finDeMontage, positionVive, segmentSonnant,
  type Depart, type EtatPiste, type ReglagesVifs,
} from "../../audio/lecture-vive";

/** Une piste à entendre : son rang, son tampon, ses réglages. */
export interface PisteVive extends ReglagesVifs {
  k: number;
  son: AudioBuffer;
}

export interface LectureVive {
  /** Vrai s'il y a quelque chose à entendre : sans tampon, la ligne de temps garde le lecteur du son rendu. */
  prete: boolean;
  enLecture: boolean;
  /** La tête de lecture, interrogée à chaque image. */
  position: () => number;
  allerA: (instant: number) => void;
  basculer: () => void;
}

/** De quoi programmer sans buter sur l'instant courant. */
const MARGE_PROG = 0.02;
/** Le temps que met un niveau pour rejoindre sa valeur : assez court pour suivre, assez long pour ne pas claquer. */
const GLISSE_NIVEAU = 0.02;

interface Vivante {
  source: AudioBufferSourceNode;
  fondu: GainNode;
  niveau: GainNode;
}

// UN NUMÉRO PAR TAMPON, et la signature voit alors un son remplacé par un autre. Sans lui, une piste
// rebranchée sur un autre générateur aux mêmes réglages gardait l'ancien son à l'oreille : la
// comparaison des états l'aurait vu, mais l'effet ne se serait pas réveillé pour la faire. La table est
// faible, donc un tampon oublié n'y laisse rien.
const numeros = new WeakMap<AudioBuffer, number>();
let prochainNumero = 1;
function numeroDeSon(son: AudioBuffer): number {
  let n = numeros.get(son);
  if (!n) { n = prochainNumero++; numeros.set(son, n); }
  return n;
}

export function useLectureVive(pistes: PisteVive[]): LectureVive {
  const [enLecture, setEnLecture] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const vivantes = useRef(new Map<number, Vivante>());
  /** Ce qui est programmé en ce moment : c'est à cet état qu'on compare pour ne reprendre que le nécessaire. */
  const programme = useRef(new Map<number, EtatPiste>());
  const departRef = useRef<Depart>({ t0: 0, auCtx: 0 });
  /** La tête quand rien ne joue : une horloge arrêtée ne dit plus où l'on en est. */
  const arretRef = useRef(0);
  const enLectureRef = useRef(false);
  const finRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pistesRef = useRef(pistes);
  pistesRef.current = pistes;

  // LA TÊTE NE DÉPASSE PAS LA FIN DU MONTAGE. Le minuteur qui rend la main a quelques dizaines de
  // millisecondes de marge, et l'horloge du contexte, elle, ne s'arrête jamais : sans cette borne, le
  // temps affiché continuerait au-delà du dernier son.
  const position = useCallback(() => {
    if (!enLectureRef.current || !ctxRef.current) return arretRef.current;
    return positionVive(departRef.current, ctxRef.current.currentTime, finDeMontage(pistesRef.current));
  }, []);

  const arreterPiste = useCallback((k: number) => {
    const v = vivantes.current.get(k);
    if (!v) return;
    try { v.source.stop(); } catch { /* déjà arrêtée */ }
    v.source.onended = null;
    v.source.disconnect(); v.fondu.disconnect(); v.niveau.disconnect();
    vivantes.current.delete(k);
  }, []);

  const arreterTout = useCallback(() => {
    for (const k of [...vivantes.current.keys()]) arreterPiste(k);
    programme.current = new Map();
    if (finRef.current) { clearTimeout(finRef.current); finRef.current = null; }
  }, [arreterPiste]);

  /**
   * Programmer une piste pour qu'elle tombe juste, la tête étant à `tete`.
   *
   * LE ROGNAGE EST FAIT AVANT LE CALAGE, et dans cet ordre seulement. `segmentSonnant` ramène la piste
   * à ce qui sonne — un début négatif ôte le commencement du son, et le fondu d'entrée se réapplique à
   * ce qui reste, comme au rendu. `calerSource` traite ensuite tout autre chose : la tête déjà entrée
   * dans la piste, dont le fondu d'entrée est cette fois derrière nous.
   */
  const programmerPiste = useCallback((p: PisteVive, tete: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    arreterPiste(p.k);
    const seg = segmentSonnant(p);
    if (!seg) return;
    // La durée ne dépasse pas ce que le tampon contient : au-delà, le fondu de sortie tomberait dans le vide.
    const utile = Math.min(seg.dureeSec, Math.max(0, p.son.duration - seg.rogneSec));
    if (!(utile > 0)) return;
    const calage = calerSource(seg.debutSec, utile, tete);
    if (!calage) return;

    const source = ctx.createBufferSource();
    source.buffer = p.son;
    const fondu = ctx.createGain();
    const niveau = ctx.createGain();
    // LA COURBE NE PORTE QUE LA FORME DES FONDUS : `gainDb` à zéro vaut un facteur de un, et le niveau
    // reste sur son propre gain, où l'on peut encore l'écrire.
    const courbe = courbeDeGain(
      { gainDb: 0, fonduEntreeMs: p.fonduEntreeSec * 1000, fonduSortieMs: p.fonduSortieSec * 1000 },
      utile, calage.decalage,
    );
    const quand = ctx.currentTime + MARGE_PROG + calage.quand;
    fondu.gain.setValueCurveAtTime(courbe, quand, Math.max(0.001, calage.duree));
    niveau.gain.value = gainLineaire(p.gainDb);
    source.connect(fondu).connect(niveau).connect(ctx.destination);
    source.start(quand, seg.rogneSec + calage.decalage, calage.duree);
    source.onended = () => { source.disconnect(); fondu.disconnect(); niveau.disconnect(); };
    vivantes.current.set(p.k, { source, fondu, niveau });
  }, [arreterPiste]);

  /** Le minuteur qui rend la main à la fin : l'horloge du contexte, elle, ne s'arrête jamais. */
  const armerLaFin = useCallback((tete: number) => {
    if (finRef.current) clearTimeout(finRef.current);
    const fin = finDeMontage(pistesRef.current);
    const restant = fin - tete;
    if (!(restant > 0)) { finRef.current = null; return; }
    finRef.current = setTimeout(() => {
      arreterTout();
      // LA TÊTE REVIENT AU DÉBUT QUAND LE MONTAGE EST FINI. La laisser sur la fin paraissait plus
      // fidèle, et c'était un piège : le bouton relançait alors la lecture depuis la fin, où il n'y a
      // rien à jouer, donc aucun minuteur d'arrêt à armer, et le temps affiché croissait sans fin.
      arretRef.current = 0;
      enLectureRef.current = false;
      setEnLecture(false);
    }, (restant + MARGE_PROG) * 1000 + 50);
  }, [arreterTout]);

  const jouer = useCallback((demandee: number) => {
    if (!pistesRef.current.length) return;
    const tete = departDeLecture(demandee, finDeMontage(pistesRef.current));
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    void ctx.resume();
    arreterTout();
    departRef.current = { t0: tete, auCtx: ctx.currentTime + MARGE_PROG };
    for (const p of pistesRef.current) programmerPiste(p, tete);
    programme.current = new Map(pistesRef.current.map((p) => [p.k, etatDe(p)]));
    arretRef.current = tete;
    enLectureRef.current = true;
    setEnLecture(true);
    armerLaFin(tete);
  }, [arreterTout, programmerPiste, armerLaFin]);

  const arreter = useCallback(() => {
    arretRef.current = position();
    arreterTout();
    enLectureRef.current = false;
    setEnLecture(false);
  }, [arreterTout, position]);

  const basculer = useCallback(() => {
    if (enLectureRef.current) arreter();
    else jouer(arretRef.current);
  }, [arreter, jouer]);

  const allerA = useCallback((instant: number) => {
    // LA LECTURE NE VA PAS AVANT ZÉRO : la sortie d'un montage commence à zéro, et la part d'une piste
    // qui précède se voit sans sonner.
    const t = Math.max(0, instant);
    arretRef.current = t;
    if (enLectureRef.current) jouer(t);
  }, [jouer]);

  // ── N'appliquer que ce qui a bougé ──
  //
  // LA SIGNATURE DÉCIDE, ET NON LE RENDU. La tête de lecture provoque soixante rendus par seconde :
  // reprogrammer à chacun couperait le son en continu. Ce qui doit décider, c'est ce qu'on entendrait.
  const signature = pistes
    .map((p) => `${p.k}#${numeroDeSon(p.son)}:${p.debutSec}:${p.dureeSec}:${p.gainDb}:${
      p.fonduEntreeSec}:${p.fonduSortieSec}`)
    .join("|");
  const nombreDeSons = pistes.length;

  useEffect(() => {
    if (!enLectureRef.current || !ctxRef.current) return;
    const voulu = new Map(pistesRef.current.map((p) => [p.k, etatDe(p)]));
    const d = differencePistes(programme.current, voulu);
    const tete = position();
    for (const k of d.aArreter) arreterPiste(k);
    for (const k of [...d.aDemarrer, ...d.aReprogrammer]) {
      const p = pistesRef.current.find((x) => x.k === k);
      if (p) programmerPiste(p, tete);
    }
    for (const k of d.aRegler) {
      const v = vivantes.current.get(k);
      const p = pistesRef.current.find((x) => x.k === k);
      // LE NIVEAU GLISSE, IL NE SAUTE PAS : une valeur posée d'un coup pendant qu'un son joue claque.
      if (v && p && ctxRef.current) {
        v.niveau.gain.setTargetAtTime(gainLineaire(p.gainDb), ctxRef.current.currentTime, GLISSE_NIVEAU);
      }
    }
    programme.current = voulu;
    if (d.aArreter.length || d.aDemarrer.length || d.aReprogrammer.length) armerLaFin(tete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Plus rien à entendre : le transport n'a plus d'objet.
  useEffect(() => {
    if (nombreDeSons === 0 && enLectureRef.current) arreter();
  }, [nombreDeSons, arreter]);

  useEffect(() => () => {
    for (const k of [...vivantes.current.keys()]) {
      const v = vivantes.current.get(k);
      if (v) { try { v.source.stop(); } catch { /* déjà arrêtée */ } }
    }
    if (finRef.current) clearTimeout(finRef.current);
    void ctxRef.current?.close();
  }, []);

  return { prete: nombreDeSons > 0, enLecture, position, allerA, basculer };
}

/** L'état comparable d'une piste : ses réglages et l'identité de son son. */
function etatDe(p: PisteVive): EtatPiste {
  return {
    son: p.son,
    debutSec: p.debutSec, dureeSec: p.dureeSec, gainDb: p.gainDb,
    fonduEntreeSec: p.fonduEntreeSec, fonduSortieSec: p.fonduSortieSec,
  };
}

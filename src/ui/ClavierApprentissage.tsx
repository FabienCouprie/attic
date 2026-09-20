// ui/ClavierApprentissage.tsx — Le MIDI reçu, joué sous les yeux sur les 88 touches.
//
// Le « Clavier mélodie » se joue à la souris ; celui-ci regarde. Il relit le MIDI que le nœud a
// produit — c'est-à-dire exactement ce qu'il fait entendre, canal choisi et adaptation
// comprises —, attribue chaque note à une main, et allume les touches au fil de la lecture.
//
// DEUX CHOIX QUI FONT TOUT L'INTÉRÊT :
//
//  1. La position vient de l'ÉLÉMENT AUDIO, jamais d'une horloge à part. Une animation qui
//     compterait le temps de son côté dériverait de l'audio au bout de quelques secondes — et
//     un clavier en avance d'un temps sur ce qu'on entend n'apprend rien à personne.
//  2. Les deux mains sont de deux couleurs, par la même fonction que celle qui juge la
//     jouabilité (`assignerMains`). Voir la musique se séparer en deux est ce qu'on cherche ici,
//     et c'est ce qu'aucun lecteur MIDI ordinaire ne montre.

import { useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer } from "@xyflow/react";
import { parseMidi } from "midi-file";
import { analyserMidi } from "../audio";
import { assignerMains, type Main, type NoteJouee } from "../audio/conformite-clavier";
import { NOTE_MAX, NOTE_MIN, disposition, nomNote } from "./clavier-disposition";
import { useI18n } from "../i18n";

const LARGEUR_BLANCHE = 24, PROPORTION_NOIRE = 0.62;

interface Props {
  midi?: File;
  audioUrl?: string;
  /** Secondes de musique visibles au-dessus des touches, avant d'être jouées. */
  anticipation?: number;
}

/** Ce que la pluie de notes prend de la hauteur disponible ; le clavier garde le reste. */
const PART_PLUIE = 0.58;
const HAUTEUR_TOUCHES_MIN = 64;

const COULEURS: Record<Main, { corps: string; bord: string }> = {
  gauche: { corps: "rgba(42,157,143,0.78)", bord: "#5ed6c7" },
  droite: { corps: "rgba(76,110,245,0.78)", bord: "#8aa4ff" },
};

export function ClavierApprentissage({ midi, audioUrl, anticipation = 3 }: Props) {
  const { t } = useI18n();
  const racineRef = useRef<HTMLDivElement>(null);
  const touchesRef = useRef<HTMLDivElement>(null);
  const pluieRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [secours, setSecours] = useState(false);

  /**
   * L'horloge est le lecteur DU NŒUD, celui qu'affiche déjà l'atelier.
   *
   * En ajouter un second à la vue paraissait plus simple, et c'était un défaut : deux lecteurs
   * côte à côte, et le morceau joué deux fois en décalé si l'on appuie sur les deux. On va donc
   * chercher celui qui existe, et l'on ne montre le nôtre que s'il n'y en a pas — le temps du
   * premier rendu, ou si le nœud n'a pas produit d'audio.
   */
  useEffect(() => {
    const noeud = racineRef.current?.closest(".attic-node");
    const propre = noeud?.querySelector<HTMLAudioElement>("audio.attic-node-audio") ?? null;
    audioRef.current = propre;
    setSecours(!propre);
  }, [audioUrl, midi]);
  const [hauteurTouches, setHauteurTouches] = useState(90);
  const [notes, setNotes] = useState<NoteJouee[]>([]);
  const [mains, setMains] = useState<Main[]>([]);
  const [enfoncees, setEnfoncees] = useState<Map<number, Main>>(new Map());
  const [position, setPosition] = useState(0);

  const dispo = useMemo(() => disposition(NOTE_MIN, NOTE_MAX, LARGEUR_BLANCHE), []);

  // La hauteur disponible se partage entre la pluie et les touches. Un clavier réduit à un
  // trait ne servirait à rien : il garde un minimum, et la pluie prend ce qui reste.
  const [hauteurPluie, setHauteurPluie] = useState(140);
  useEffect(() => {
    const el = touchesRef.current; if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const totale = entry.contentRect.height;
      const touches = Math.max(HAUTEUR_TOUCHES_MIN, Math.round(totale * (1 - PART_PLUIE)));
      setHauteurTouches(touches);
      setHauteurPluie(Math.max(0, Math.round(totale - touches)));
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  // Le MIDI que le nœud a produit : c'est CE QUI EST ENTENDU, donc ce qu'il faut montrer.
  useEffect(() => {
    let annule = false;
    if (!midi) { setNotes([]); setMains([]); return; }
    void (async () => {
      try {
        const { notes: lues } = analyserMidi(parseMidi(new Uint8Array(await midi.arrayBuffer())));
        if (annule) return;
        const jouees: NoteJouee[] = lues
          .map((n) => ({ note: n.note, debut: n.debut, fin: n.fin, canal: n.canal, velociete: n.velociete }))
          .sort((a, b) => a.debut - b.debut || a.note - b.note);
        setNotes(jouees);
        setMains(assignerMains(jouees));
      } catch {
        if (!annule) { setNotes([]); setMains([]); }
      }
    })();
    return () => { annule = true; };
  }, [midi]);

  // Arriver centré sur la musique plutôt que sur le la 0 : sur un clavier de 88 touches, un
  // morceau qui tient dans deux octaves serait sinon hors de l'écran.
  useEffect(() => {
    const el = touchesRef.current;
    if (!el || notes.length === 0) return;
    const median = notes.map((n) => n.note).sort((a, b) => a - b)[Math.floor(notes.length / 2)];
    const touche = dispo.blanches.find((b) => b.note >= median) ?? dispo.blanches[0];
    el.scrollLeft = Math.max(0, touche.x - el.clientWidth / 2);
  }, [notes, dispo]);

  /**
   * La pluie de notes : ce qui va être joué, en descente vers sa propre touche.
   *
   * Le bas du cadre est L'INSTANT PRÉSENT, et c'est ce qui rend la chose lisible : une note
   * touche le clavier au moment exact où elle se met à sonner. Sa hauteur dessinée est sa durée,
   * si bien qu'on voit d'avance ce qui se tient et ce qui se pique.
   *
   * Le dessin partage le repère horizontal des touches — même origine, mêmes largeurs, tiré de
   * la même `disposition` —, et vit dans le MÊME conteneur défilant : une note ne peut donc pas
   * tomber à côté de la sienne, même après avoir fait défiler le clavier.
   */
  const dessinerPluie = (t: number) => {
    const canvas = pluieRef.current;
    if (!canvas || hauteurPluie <= 0) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const L = dispo.largeurTotale, H = hauteurPluie;
    if (canvas.width !== Math.round(L * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(L * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L, H);

    // Les repères des do, pour se situer en hauteur comme sur le clavier.
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (const b of dispo.blanches) {
      if (b.note % 12 !== 0) continue;
      ctx.beginPath(); ctx.moveTo(b.x + 0.5, 0); ctx.lineTo(b.x + 0.5, H); ctx.stroke();
    }

    const echelle = H / Math.max(0.5, anticipation);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.debut > t + anticipation) break; // trié par début : le reste est hors cadre
      if (n.fin <= t) continue;              // déjà passé sous le clavier
      const touche = dispo.blanches.find((b) => b.note === n.note) ?? dispo.noires.find((k) => k.note === n.note);
      if (!touche) continue;                 // hors des 88 touches : rien à faire tomber
      const bas = Math.min(H, H - (n.debut - t) * echelle);
      const haut = Math.max(0, H - (n.fin - t) * echelle);
      const hauteur = Math.max(2, bas - haut);
      const c = COULEURS[mains[i] ?? "droite"];
      const largeur = Math.max(3, touche.largeur - 2);
      ctx.fillStyle = c.corps;
      ctx.fillRect(touche.x + 1, haut, largeur, hauteur);
      // Un liseré en tête : c'est l'attaque, et c'est ce qu'on suit des yeux.
      ctx.fillStyle = c.bord;
      ctx.fillRect(touche.x + 1, Math.max(0, bas - 2), largeur, Math.min(2, hauteur));
    }

    // La ligne du présent, juste au-dessus des touches.
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.moveTo(0, H - 0.5); ctx.lineTo(L, H - 0.5); ctx.stroke();
  };

  // L'animation suit l'audio, et rien d'autre.
  useEffect(() => {
    if (notes.length === 0) return;
    let rafId = 0;
    let derniereCle = "";
    const battre = () => {
      // Le lecteur est relu à chaque image : l'atelier le remplace à chaque exécution (sa clé
      // est l'URL du résultat), et une référence gardée deviendrait muette après un relancement.
      const audio = audioRef.current
        ?? racineRef.current?.closest(".attic-node")?.querySelector<HTMLAudioElement>("audio.attic-node-audio");
      if (!audio) { rafId = requestAnimationFrame(battre); return; }
      const t = audio.currentTime;
      const actives = new Map<number, Main>();
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.debut > t) break; // trié par début : au-delà, plus rien ne sonne
        if (t < n.fin) actives.set(n.note, mains[i] ?? "droite");
      }
      // On ne réaffiche que si l'ensemble des touches a changé : soixante fois par seconde,
      // un setState inconditionnel ferait retracer les 88 touches pour rien.
      const cle = [...actives.entries()].sort((a, b) => a[0] - b[0]).map(([n, m]) => `${n}${m[0]}`).join(",");
      if (cle !== derniereCle) { derniereCle = cle; setEnfoncees(actives); }
      setPosition(t);
      dessinerPluie(t);
      rafId = requestAnimationFrame(battre);
    };
    rafId = requestAnimationFrame(battre);
    return () => cancelAnimationFrame(rafId);
    // La boucle capture `dessinerPluie` : elle doit se refaire quand la géométrie ou
    // l'anticipation changent, faute de quoi elle dessinerait avec les anciennes valeurs.
  }, [notes, mains, hauteurPluie, anticipation, dispo]);

  const duree = notes.reduce((m, n) => Math.max(m, n.fin), 0);
  const classeTouche = (note: number, base: string) => {
    const main = enfoncees.get(note);
    return base + (main ? ` enfoncee enfoncee-${main}` : "");
  };

  return (
    <div className="clavier" ref={racineRef} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={350} minHeight={240} />
      <div className="clavier-controles">
        {secours && (
          <audio ref={(el) => { if (el) audioRef.current = el; }} src={audioUrl}
            controls className="clavier-lecteur nodrag" />
        )}
        <span className="clavier-nb">{notes.length} {t("clavier.notes")}</span>
        <span className="clavier-position">{position.toFixed(1)} / {duree.toFixed(1)} s</span>
        <span className="clavier-legende">
          <i className="pastille-gauche" /> {t("clavier.gauche")}
          <i className="pastille-droite" /> {t("clavier.droite")}
        </span>
      </div>
      {/* La pluie et les touches vivent dans LE MÊME conteneur défilant, à la même largeur :
          un seul défilement les emporte ensemble, et une note ne peut pas tomber à côté. */}
      <div className="clavier-touches" ref={touchesRef}>
        <div className="clavier-interieure"
          style={{ width: dispo.largeurTotale, position: "relative", height: hauteurPluie + hauteurTouches }}>
          <canvas ref={pluieRef} className="clavier-pluie"
            style={{ position: "absolute", left: 0, top: 0, width: dispo.largeurTotale, height: hauteurPluie }} />
          {dispo.blanches.map((b) => (
            <div key={b.note} className={classeTouche(b.note, "clavier-blanche")}
              data-note={b.note} data-pitch={nomNote(b.note)}
              style={{ position: "absolute", left: b.x, width: b.largeur - 1, height: hauteurTouches, top: hauteurPluie }}>
              {b.note % 12 === 0 && <span className="clavier-etiquette">{nomNote(b.note)}</span>}
            </div>
          ))}
          {dispo.noires.map((k) => (
            <div key={k.note} className={classeTouche(k.note, "clavier-noire")}
              data-note={k.note} data-pitch={nomNote(k.note)}
              style={{ position: "absolute", left: k.x, width: k.largeur, height: Math.round(hauteurTouches * PROPORTION_NOIRE), top: hauteurPluie }} />
          ))}
        </div>
      </div>
    </div>
  );
}

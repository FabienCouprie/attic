// vues-domaine/ClavierIsomorphe.tsx — Le réseau sous les doigts, et ce qu'il joue.
//
// CE QUE CETTE VUE MONTRE, ET D'OÙ ELLE LE TIENT. Le réseau se calcule dans
// `clavier-isomorphe.ts`, qui ne sait rien de React ; il reste ici le dessin, le son d'une touche
// pressée, et le déplacement par période. L'accordage, lui, arrive par une ENTRÉE : il est donc lu
// sur le canal `_designe`, celui de ce qu'un run a désigné de ses entrées — ce qui le fait survivre
// à un changement de réglage, puisque régler ce composant ne touche pas à ce qu'il a reçu.
//
// LE DESSIN EST UNE GRILLE DROITE, ET NON UNE PHOTOGRAPHIE DU CLAVIER. Les rangées d'un clavier
// physique sont décalées d'un quart de touche ; les reproduire ici placerait chaque case entre deux
// cases de la rangée du dessus, et une forme vue à l'écran ne serait plus l'intervalle qu'elle a
// l'air d'être. La grille montre le RÉSEAU — une colonne à droite, un degré de plus ; une rangée en
// haut, un saut de plus — et chaque case porte la lettre de la touche qui la joue, lue sur la
// disposition de l'utilisateur. C'est la lettre qui fait le pont avec ses doigts, pas la géométrie.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer } from "@xyflow/react";

import { useI18n, traduire, valeurCanoniqueChoix } from "../i18n";
import { accordageEgal, degresParPeriode, decrireAccordage, type Accordage } from "../audio/accordage";
import { nomNote } from "../audio/nom-note";
import { gainDeNote, rendreSequence } from "../audio/midi-sequence";
import { reseau, sautDeRangee, tableDuReseau, RANGEES } from "../audio/clavier-isomorphe";
import { useClavierJouable } from "./clavier-jouable";
import { ecouterTampon } from "../ui/niveau-ecoute";
import type { VueProps } from "../ui/registre-vues";

/** De combien de tours on peut s'éloigner de la tonique, de part et d'autre. */
const TOURS_MAX = 3;

/** La lettre d'une touche quand la disposition n'est pas connue : sa lecture américaine. */
const lettreAmericaine = (code: string) => code.replace(/^(Key|Digit)/, "").toLowerCase();

export function ClavierIsomorphe({ id, data, def }: VueProps) {
  const { t } = useI18n();
  const params = data.parametres as Record<string, unknown> | undefined;

  // ─── L'accordage : celui qui est arrivé, ou le repli déclaré ───
  const recu = (data as { _designe?: { accordage?: Accordage } })._designe?.accordage;
  const accordage = useMemo<Accordage>(() => {
    const tonique = Number(params?.["Tonique"] ?? 60);
    const base = recu && Array.isArray(recu.degres) && recu.degres.length > 0
      ? recu
      : accordageEgal(Math.max(1, Math.round(Number(params?.["Degrés par période"] ?? 12) || 12)));
    return { ...base, reference: Number.isFinite(tonique) ? tonique : 60 };
  }, [recu, params?.["Degrés par période"], params?.["Tonique"]]);
  const branche = Boolean(recu && Array.isArray(recu.degres) && recu.degres.length > 0);

  // LE SAUT SE RÉSOUT COMME À L'EXÉCUTION, par la forme canonique du choix : un graphe peut porter
  // l'identifiant ou l'ancien libellé, français ou anglais, et les deux doivent dire la même chose.
  const saut = useMemo(() => {
    const pDef = def?.parametres?.find((p) => p.nom === "Saut de rangée");
    const brut = params?.["Saut de rangée"] ?? pDef?.defaut ?? "quinte";
    const cible = pDef ? String(valeurCanoniqueChoix(pDef, String(brut))) : "quinte";
    return sautDeRangee(accordage, cible);
  }, [accordage, def, params?.["Saut de rangée"]]);

  const [tour, setTour] = useState(0);
  const cases = useMemo(
    () => reseau(accordage, saut, tour * degresParPeriode(accordage)),
    [accordage, saut, tour],
  );
  const table = useMemo(() => tableDuReseau(cases), [cases]);

  // ─── Les lettres de la disposition de l'utilisateur ───
  const [lettres, setLettres] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const clavier = (navigator as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    if (!clavier?.getLayoutMap) return;
    let vivant = true;
    void clavier.getLayoutMap()
      .then((m) => { if (vivant) setLettres(new Map(m)); })
      .catch(() => { /* une disposition inconnue laisse la lecture américaine */ });
    return () => { vivant = false; };
  }, []);

  // ─── Le son d'une touche : la synthèse interne, continue par construction ───
  const ctxRef = useRef<AudioContext | null>(null);
  function getCtx() { if (!ctxRef.current) ctxRef.current = new AudioContext(); return ctxRef.current; }
  const volumeRef = useRef(80);
  volumeRef.current = Number(params?.["Volume"] ?? 80);

  const clavier = useClavierJouable(id, (note, velocite) => {
    // LE NIVEAU EST CELUI DU RENDU, par la formule que `audio/midi-sequence.ts` emploie pour la
    // sortie « Audio » : ce qu'on entend en jouant est ce que le nœud rendra. Un facteur écrit ici
    // aurait fait du jeu en direct une approximation de sa propre sortie.
    const niveau = gainDeNote(velocite, volumeRef.current);
    if (niveau <= 0) return { arreter: () => {} };
    const ctx = getCtx();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "triangle";
    // LA HAUTEUR EST FRACTIONNAIRE, et c'est tout l'objet : la conversion est continue, donc un
    // degré qui ne tombe pas sur un demi-ton sonne à sa place et non à celle du demi-ton voisin.
    osc.frequency.value = 440 * 2 ** ((note - 69) / 12);
    gain.gain.setValueAtTime(niveau, ctx.currentTime);
    // La descente garde sa forme, deux décades, quel que soit le niveau de départ.
    gain.gain.exponentialRampToValueAtTime(niveau * 0.01, ctx.currentTime + 1.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 1.4);
    return { arreter: () => { try { osc.stop(); } catch { /* une voix déjà morte */ } } };
  }, {
    noteSousLaTouche: useCallback((code: string) => table.get(code) ?? null, [table]),
    deplacer: useCallback((pas: number) => {
      setTour((x) => Math.max(-TOURS_MAX, Math.min(TOURS_MAX, x + pas)));
    }, []),
  });

  // CE BOUTON EST UN LECTEUR, ET J'AVAIS LU L'EXCEPTION À L'ENVERS. J'avais écrit ici que
  // « Volume » suffisait, étant un réglage déclaré. L'exception de `ui/niveau-ecoute.ts` vise un
  // lecteur dont le niveau EST le réglage d'écoute ; « Volume » règle le niveau du son PRODUIT, celui
  // que la sortie « Audio » porte aussi. Les deux se superposent donc, comme le `volume` d'un élément
  // audio se superpose au fichier qu'il joue : le rendu garde son niveau, l'écoute a le sien.
  async function rejouer() {
    const notes = clavier.seqRef.current.filter((s) => s.fin > s.debut);
    if (notes.length === 0) return;
    try {
      const buf = await rendreSequence(notes, "FM/Oscillateurs", Number(params?.["Volume"] ?? 80));
      ecouterTampon(getCtx(), buf);
    } catch (e) {
      console.error("[attic] Clavier isomorphe : rejeu impossible", e);
    }
  }

  const seq = clavier.seq;
  const parPeriode = degresParPeriode(accordage);
  return (
    <div className="clavier iso" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={420} minHeight={240} />
      <div className="clavier-controles">
        <button className={clavier.enReg ? "actif" : ""} onClick={clavier.demarrerEnreg} disabled={clavier.enReg}>⏺ {t("clavier.enreg")}</button>
        <button onClick={clavier.arreterEnreg} disabled={!clavier.enReg}>⏹ {t("clavier.arreter")}</button>
        <button onClick={rejouer} disabled={seq.length === 0 || clavier.enReg}>▶ {t("clavier.rejouer")}</button>
        <button onClick={clavier.effacer}>🗑 {t("clavier.effacer")}</button>
        <span className="clavier-nb">{seq.length} {t("clavier.notes")}</span>
        <span className="clavier-octave">
          ↑↓ {traduire("iso.tour", String(tour))} · {decrireAccordage(accordage, false)}
          {!branche && ` · ${traduire("iso.repli")}`}
        </span>
      </div>
      {/* Les rangées se dessinent de haut en bas, donc dans l'ordre inverse du réseau, qui compte
          la rangée du bas comme la rangée zéro. */}
      <div className="iso-reseau">
        {[...RANGEES.keys()].reverse().map((rangee) => (
          <div className="iso-rangee" key={rangee}>
            {/* UNE CASE S'ALLUME QUAND SA HAUTEUR SONNE, et non quand sa touche est enfoncée.
                Dans un réseau, le même degré occupe plusieurs cases : avec un saut plus court
                qu'une rangée, les premières cases d'une rangée répètent les dernières de celle du
                dessous. Les allumer toutes montre où ce degré se retrouve sous les doigts, et c'est
                aussi ce que dit la table des voix, qui n'en tient qu'une par hauteur. Pas
                d'`aria-pressed` pour autant : la touche voisine, elle, n'est pas enfoncée. */}
            {cases.filter((c) => c.rangee === rangee).map((c) => (
              <button type="button" key={c.code} tabIndex={-1}
                className={"iso-case" + (c.tonique ? " tonique" : "") + (clavier.touches.has(c.note) ? " sonne" : "")}
                data-code={c.code} data-rang={c.rang} data-pitch={nomNote(c.note)}
                data-sonne={clavier.touches.has(c.note) ? "true" : undefined}
                onPointerDown={() => clavier.presser(c.note)}
                onPointerUp={() => clavier.relacher(c.note)}
                onPointerLeave={() => clavier.relacher(c.note)}>
                <span className="iso-lettre">{lettres.get(c.code) ?? lettreAmericaine(c.code)}</span>
                <span className="iso-degre">{((c.rang % parPeriode) + parPeriode) % parPeriode}</span>
                <span className="iso-hauteur">{nomNote(c.note)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

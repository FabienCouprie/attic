// ui/vues-claviers.tsx — Claviers jouables et orchestres.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useState, useRef, useEffect, useCallback } from "react";
import { useReactFlow, NodeResizer } from "@xyflow/react";
import { useI18n, traduire } from "../i18n";
import { nomNote } from "./clavier-disposition";
import { TouchesClavier, useClavierJouable } from "./clavier-jouable";
import { useStatut } from "../ui/statuts";
import { parametresLecture, rendreNotes, voixPourNote, type Banque } from "../audio/clavier-banque";
import { chargerSfz, dossierDe } from "../audio/sfz";
import { banqueVive, oublierBanque } from "../audio/banques-vives";
import { decodeurElectron } from "../plugins/clavier-sfz";
import { DUREE_NOTE_LIVE, instrumentClavier, modeRenduClavier, volumeClavier } from "./clavier-son";
import { sf2Chargee } from "../plugins/soundfontGlobal";
import { rendreSequence } from "../audio/midi-sequence";
import { ClavierApprentissage as VueClavierApprentissage } from "./ClavierApprentissage";
import { INSTRUMENTS_ORCHESTRE } from "../audio/csound-orchestre";
import type { VueProps } from "../ui/registre-vues";

export function VueApprentissage({ data }: VueProps) {
  return (
    <VueClavierApprentissage
      midi={data.midiFichierSortie as File | undefined}
      audioUrl={data.audioResultatUrl as string | undefined}
      anticipation={Number((data.parametres as Record<string, unknown> | undefined)?.["Anticipation"] ?? 3) || 3}
    />
  );
}

export function ClavierMelodie({ id, data }: VueProps) {
  const { t } = useI18n();
  // Un 88 touches complet, La0 a Do8, comme un vrai clavier. La geometrie, le choix de la
  // touche sous le curseur et l'enregistrement vivent dans `clavier-jouable.tsx`, partages
  // avec « Clavier SFZ » : ce qui reste ici est la SEULE chose qui les distingue, la facon
  // de faire du son.
  const ctxRef = useRef<AudioContext | null>(null);
  function getCtx() { if (!ctxRef.current) ctxRef.current = new AudioContext(); return ctxRef.current; }
  /** Les reglages du noeud, lus a chaque note : ils peuvent changer entre deux touches. */
  function reglages() {
    const params = data.parametres as Record<string, unknown> | undefined;
    return {
      mode: modeRenduClavier(params, !!sf2Chargee()),
      instrument: instrumentClavier(params),
      volume: volumeClavier(params),
    };
  }
  /** La synthese interne, inchangee : immediate, et toujours disponible. */
  function jouerFM(note: number, ctx: AudioContext) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "triangle"; osc.frequency.value = 440 * 2 ** ((note - 69) / 12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
    return { arreter: () => { try { osc.stop(); } catch {} } };
  }
  /**
   * La meme note, rendue par le SoundFont choisi — c'est-a-dire par le chemin qui rendra
   * l'audio du noeud. Le rendu est asynchrone : si la touche est relachee avant qu'il
   * arrive, on n'emet rien plutot que de faire sonner une note deja finie.
   */
  function jouerSoundFont(note: number, ctx: AudioContext, r: ReturnType<typeof reglages>) {
    let source: AudioBufferSourceNode | null = null;
    let annule = false;
    void (async () => {
      try {
        const buf = await rendreSequence(
          [{ note, velocite: 100, debut: 0, fin: DUREE_NOTE_LIVE }],
          "SoundFont", r.volume, r.instrument.programme, r.instrument.banque,
        );
        if (annule) return;
        source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);
        source.start();
      } catch (e) {
        console.error("[attic] Clavier : rendu SoundFont impossible, retour a la synthese interne", e);
        if (!annule) jouerFM(note, ctx);
      }
    })();
    return { arreter: () => { annule = true; try { source?.stop(); } catch {} } };
  }
  const clavier = useClavierJouable(id, (note) => {
    const ctx = getCtx(), r = reglages();
    return r.mode === "SoundFont" ? jouerSoundFont(note, ctx, r) : jouerFM(note, ctx);
  });
  useEffect(() => () => { ctxRef.current?.close(); ctxRef.current = null; }, []);
  /**
   * « Rejouer » fait entendre CE QUE LE NOEUD RENDRA : la sequence passe par
   * `rendreSequence`, la meme fonction que l'execution, avec le meme mode et le meme
   * instrument. Elle etait auparavant rejouee a l'oscillateur, si bien qu'on ne pouvait
   * pas s'ecouter avant de lancer le graphe.
   */
  async function rejouer() {
    const ctx = getCtx();
    const notes = clavier.seqRef.current.filter((s) => s.fin > s.debut);
    if (notes.length === 0) return;
    const r = reglages();
    try {
      const buf = await rendreSequence(notes, r.mode, r.volume, r.instrument.programme, r.instrument.banque);
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      source.start();
    } catch (e) {
      console.error("[attic] Clavier : rejeu impossible", e);
    }
  }
  const seq = clavier.seq;
  return (
    <div className="clavier" ref={clavier.contRef} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={350} minHeight={220} />
      <div className="clavier-controles">
        <button className={clavier.enReg ? "actif" : ""} onClick={clavier.demarrerEnreg} disabled={clavier.enReg}>⏺ {t("clavier.enreg")}</button>
        <button onClick={clavier.arreterEnreg} disabled={!clavier.enReg}>⏹ {t("clavier.arreter")}</button>
        <button onClick={rejouer} disabled={seq.length === 0 || clavier.enReg}>▶ {t("clavier.rejouer")}</button>
        <button onClick={clavier.effacer}>🗑 {t("clavier.effacer")}</button>
        <span className="clavier-nb">{seq.length} {t("clavier.notes")}</span>
        <span className="clavier-octave">←↑→ {nomNote(clavier.octaveClavier * 12)}–{nomNote(clavier.octaveClavier * 12 + 11)}</span>
      </div>
      <TouchesClavier clavier={clavier} />
    </div>
  );
}

/**
 * Le clavier qui joue une BANQUE D'ECHANTILLONS : un fichier SFZ du disque, ou la banque
 * qui arrive par le graphe.
 *
 * CE QUI LE DISTINGUE DU PRECEDENT tient en une ligne : une note est ici un
 * `AudioBufferSourceNode` — le materiel relit l'echantillon et boucle tout seul, ce qui
 * rend la latence nulle et permet de tenir une note indefiniment quand la zone a une
 * boucle de maintien. Un SoundFont, lui, demandait un rendu hors ligne par note.
 *
 * LES RAPPORTS DE LECTURE VIENNENT DE `voixPourNote`, la meme fonction que le rendu du
 * graphe : ce qu'on entend en jouant et ce que le noeud rendra ne peuvent donc pas
 * diverger, ce qui etait tout l'interet de ce clavier.
 */
export function ClavierSfz({ id, data }: VueProps) {
  const { t } = useI18n();
  const ctxRef = useRef<AudioContext | null>(null);
  const banqueRef = useRef<Banque | null>(null);
  const [etat, setEtat] = useState<{ zones: number; basse: number; haute: number; nom: string } | null>(null);
  const [progres, setProgres] = useState("");
  const [erreur, setErreur] = useState("");
  const { setNodes } = useReactFlow();
  function getCtx() { if (!ctxRef.current) ctxRef.current = new AudioContext(); return ctxRef.current; }

  const adopter = useCallback((banque: Banque, nom: string) => {
    banqueRef.current = banque;
    setEtat({ zones: banque.zones.length, basse: banque.noteBasse, haute: banque.noteHaute, nom });
  }, []);

  // La banque que l'execution vient de deposer, quelle qu'en soit l'origine : un clavier
  // branche sur « Etaler sur le clavier » n'a alors rien a charger du disque, et un graphe
  // reouvert avec un chemin memorise retrouve son instrument des la premiere execution —
  // sans quoi le clavier restait muet jusqu'a ce qu'on recharge le fichier a la main.
  // Le statut change a chaque execution : c'est le seul signal dont la vue dispose. Il vient du
  // magasin d'execution depuis que l'etat a quitte le tableau des noeuds (`ui/statuts.ts`).
  const statutClavier = useStatut(id).statut;
  useEffect(() => {
    const vive = banqueVive(id);
    if (vive && vive.banque !== banqueRef.current) {
      adopter(vive.banque, vive.nom || t("clavier.sfz.duGraphe"));
    }
  }, [statutClavier, id, adopter, t]);

  /** Charge un `.sfz` designe par l'utilisateur, et retient son chemin dans le noeud. */
  async function choisirFichier() {
    const api = (window as any).api;
    if (!api?.ouvrirFichier) { setErreur(traduire("msg.n_cessite_electron")); return; }
    setErreur("");
    const choix = await api.ouvrirFichier({ filters: [{ name: "SFZ", extensions: ["sfz"] }] });
    if (!choix?.chemin || typeof choix.contenu !== "string") return;
    setProgres(traduire("clavier.sfz.chargement", "0", "?"));
    try {
      const charge = await chargerSfz(choix.contenu, dossierDe(choix.chemin),
        decodeurElectron(api, getCtx()),
        { surProgres: (faits, total) => setProgres(traduire("clavier.sfz.chargement", String(faits), String(total))) });
      setProgres("");
      if (charge.banque.zones.length === 0) {
        setErreur(traduire("clavier.sfz.echec", choix.nom ?? choix.chemin));
        return;
      }
      adopter(charge.banque, choix.nom ?? choix.chemin);
      oublierBanque(id);
      // Le chemin part dans les donnees du noeud : l'execution relira le meme fichier, et
      // il survit a la sauvegarde du graphe.
      setNodes((nds) => nds.map((nd) => nd.id === id
        ? { ...nd, data: { ...nd.data, sfzChemin: choix.chemin, sfzNom: choix.nom } } : nd));
    } catch (e: any) {
      setProgres("");
      setErreur(traduire("clavier.sfz.echec", e?.message ?? String(e)));
    }
  }

  const clavier = useClavierJouable(id, (note, velocite) => {
    const banque = banqueRef.current;
    if (!banque) return { arreter: () => {} };
    const voix = voixPourNote(banque, note, velocite, 1);
    if (!voix) return { arreter: () => {} };
    // LE FONDU DU RACCORD EST CELUI DU NŒUD, comme au rendu : le jeu en direct posait la boucle
    // telle quelle sur le materiel, qui saute de la fin au debut sans rien fondre, et chaque tour
    // laissait un clic. Releve par Fabien sur une note tenue.
    const p = parametresLecture(voix, Number((data.parametres as any)?.["Fondu de boucle"] ?? 20) / 1000);
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = p.audio;
    source.playbackRate.value = p.vitesse;
    if (p.boucle) { source.loop = true; source.loopStart = p.boucleDebut; source.loopEnd = p.boucleFin; }
    const gain = ctx.createGain();
    gain.gain.value = p.gain;
    source.connect(gain).connect(ctx.destination);
    source.start();
    return {
      arreter: () => {
        // Un relachement en douceur : couper la source net laisserait un clic, l'onde etant
        // arretee en pleine periode. Le temps est celui du parametre du noeud.
        const relachement = Math.max(0.005, Number((data.parametres as any)?.["Relâchement"] ?? 150) / 1000);
        try {
          const fin = ctx.currentTime + relachement;
          gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.0001, fin);
          source.stop(fin + 0.01);
        } catch { try { source.stop(); } catch {} }
      },
    };
  });
  useEffect(() => () => { ctxRef.current?.close(); ctxRef.current = null; }, []);

  /** « Rejouer » passe par `rendreNotes` : la fonction meme que l'execution du noeud. */
  function rejouer() {
    const banque = banqueRef.current;
    const notes = clavier.seqRef.current.filter((s) => s.fin > s.debut);
    if (!banque || notes.length === 0) return;
    const params = data.parametres as Record<string, unknown> | undefined;
    const buf = rendreNotes(notes, banque, {
      volume: Number(params?.["Volume"] ?? 80) / 100,
      relachement: Number(params?.["Relâchement"] ?? 150) / 1000,
      fonduBoucle: Number(params?.["Fondu de boucle"] ?? 20) / 1000,
    });
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    source.start();
  }

  const seq = clavier.seq;
  return (
    <div className="clavier" ref={clavier.contRef} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={350} minHeight={240} />
      <div className="clavier-controles">
        <button onClick={choisirFichier}>📂 {t("clavier.sfz.charger")}</button>
        <button className={clavier.enReg ? "actif" : ""} onClick={clavier.demarrerEnreg} disabled={clavier.enReg}>⏺ {t("clavier.enreg")}</button>
        <button onClick={clavier.arreterEnreg} disabled={!clavier.enReg}>⏹ {t("clavier.arreter")}</button>
        <button onClick={rejouer} disabled={seq.length === 0 || clavier.enReg || !etat}>▶ {t("clavier.rejouer")}</button>
        <button onClick={clavier.effacer}>🗑 {t("clavier.effacer")}</button>
        <span className="clavier-nb">{seq.length} {t("clavier.notes")}</span>
      </div>
      <div className="clavier-controles" data-role="sfz-etat">
        {progres && <span className="clavier-nb">{progres}</span>}
        {!progres && etat && (
          <span className="clavier-nb" data-zones={etat.zones}>
            🎹 {etat.nom} — {traduire("clavier.sfz.zones", String(etat.zones), nomNote(etat.basse), nomNote(etat.haute))}
          </span>
        )}
        {!progres && !etat && <span className="clavier-nb">{t("clavier.sfz.rien")}</span>}
        {erreur && <span className="clavier-nb" style={{ color: "#e06c75" }}>{erreur}</span>}
        <span className="clavier-octave">←↑→ {nomNote(clavier.octaveClavier * 12)}–{nomNote(clavier.octaveClavier * 12 + 11)}</span>
      </div>
      <TouchesClavier clavier={clavier} />
    </div>
  );
}

/**
 * « Banque SFZ » : une ligne, un bouton, aucun clavier.
 *
 * La vue ne charge rien — c'est l'execution qui lit le disque et decode les echantillons. Elle ne
 * sert qu'a DESIGNER le fichier, parce qu'un chemin ne se tape pas a la main : le dialogue natif
 * d'Electron le rend, et il part dans les donnees du noeud, ou il survit a la sauvegarde.
 */
export function VueBanqueSfz({ id, data }: VueProps) {
  const { t } = useI18n();
  const { setNodes } = useReactFlow();
  const [erreur, setErreur] = useState("");
  const params = (data.parametres ?? {}) as Record<string, unknown>;
  const surFichier = String(params["Source"] ?? "") === "fichier"
    || String(params["Source"] ?? "") === "Fichier SFZ";
  const nom = (data.sfzNom as string | undefined) ?? (data.sfzChemin as string | undefined);

  async function choisir() {
    const api = (window as any).api;
    if (!api?.ouvrirFichier) { setErreur(traduire("msg.n_cessite_electron")); return; }
    setErreur("");
    const choix = await api.ouvrirFichier({ filters: [{ name: "SFZ", extensions: ["sfz"] }] });
    if (!choix?.chemin) return;
    setNodes((nds) => nds.map((nd) => nd.id === id
      ? { ...nd, data: { ...nd.data, sfzChemin: choix.chemin, sfzNom: choix.nom } } : nd));
  }

  return (
    <div className="clavier-controles" style={{ padding: "4px 6px" }}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={choisir}>📂 {t("clavier.sfz.charger")}</button>
      <span className="clavier-nb">
        {surFichier ? (nom ?? t("banque.sfz.aucun")) : t("banque.sfz.integre")}
      </span>
      {erreur && <span className="clavier-nb" style={{ color: "#e06c75" }}>{erreur}</span>}
    </div>
  );
}

/**
 * La liste a cocher de l'« Orchestre Csound ».
 *
 * L'inspecteur n'a pas de type « choix multiple » : le reglage est donc un TEXTE, et cette vue
 * l'ecrit. Le texte reste lisible, sauvegardable et modifiable a la main — et l'ORDRE y compte,
 * puisqu'il decide des numeros d'instruments : cocher ajoute a la fin, decocher retire.
 */
export function VueOrchestreCsound({ id, data }: VueProps) {
  const { t } = useI18n();
  const { setNodes } = useReactFlow();
  const params = (data.parametres ?? {}) as Record<string, unknown>;
  const brut = String(params["Instruments"] ?? "");
  const choisis = brut.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const base = Math.max(1, Math.round(Number(params["Premier instrument"] ?? 1)) || 1);

  function basculer(idInstrument: string) {
    const suivant = choisis.includes(idInstrument)
      ? choisis.filter((x) => x !== idInstrument)
      : [...choisis, idInstrument];
    (data as { onChangerParametre?: (n: string, p: string, v: string | number) => void })
      .onChangerParametre?.(id, "Instruments", suivant.join(","));
    // `onChangerParametre` passe par l'application ; quand il manque — vue isolee —, on ecrit
    // directement dans le noeud pour que la case reste cochee.
    setNodes((nds) => nds.map((nd) => nd.id === id
      ? { ...nd, data: { ...nd.data, parametres: { ...(nd.data.parametres as object), Instruments: suivant.join(",") } } }
      : nd));
  }

  const familles = [...new Set(INSTRUMENTS_ORCHESTRE.map((i) => i.famille))];
  return (
    <div className="orchestre-csound" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={300} minHeight={220} />
      <div className="clavier-controles">
        <span className="clavier-nb">🎻 {t("orchestre.csound.titre")}</span>
        <span className="clavier-nb">
          {choisis.length === 0 ? t("orchestre.csound.aucun")
            : traduire("orchestre.csound.compte", String(choisis.length), String(base), String(base + choisis.length - 1))}
        </span>
      </div>
      <div className="orchestre-liste" style={{ overflowY: "auto", maxHeight: "calc(100% - 34px)", padding: "2px 6px" }}>
        {familles.map((famille) => (
          <div key={famille}>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{famille}</div>
            {INSTRUMENTS_ORCHESTRE.filter((i) => i.famille === famille).map((inst) => {
              const rang = choisis.indexOf(inst.id);
              return (
                <label key={inst.id} data-instrument={inst.id}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, lineHeight: "18px", cursor: "pointer" }}>
                  <input type="checkbox" checked={rang >= 0} onChange={() => basculer(inst.id)} />
                  <span style={{ opacity: rang >= 0 ? 1 : 0.75 }}>
                    {rang >= 0 ? `i${base + rang} · ` : ""}{inst.fr}
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Analyseur de spectre (FFT) ──

// ui/demo/useRealisateurDemo.tsx — Filmer l'application pendant qu'elle construit puis joue un graphe.
//
// Le scénario (`scenario.ts`, pur et testé) dit quoi montrer ; ce module le JOUE dans la vraie
// interface et enregistre la vraie fenêtre. Rien n'est redessiné : le canevas, la palette,
// l'inspecteur et les nœuds filmés sont ceux de l'application, pilotés pas à pas. Un curseur
// dessiné et des légendes sont posés par-dessus, dans la fenêtre, pour être filmés avec elle.
//
// COMMENT LA CONSTRUCTION EST RENDUE. Tous les nœuds sont d'abord posés CACHÉS (`hidden` de React
// Flow), puis la caméra est cadrée sur le graphe entier : chaque nœud apparaît donc à sa place
// définitive, et la vue ne bouge pas pendant la construction. Les câbles apparaissent de même.
//
// LE GRAPHE EST RENDU TEL QU'IL ÉTAIT. Une copie des nœuds, des arêtes, de la vue et de la sélection
// est prise au départ et reposée à la fin, que le film aille au bout, soit interrompu (Échap) ou
// échoue. Seuls restent les résultats du run, comme après un « Lancer » ordinaire.

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { registre } from "../../audio/adaptateur";
import { langueCourante, traduire } from "../../i18n";
import { scenarioDemo, type ActionDemo } from "./scenario";

export const EVENEMENT_FILMER = "attic:filmer-demo";

interface Params {
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<any[]>;
  setNodes: (f: (n: any[]) => any[]) => void;
  setEdges: (f: (e: any[]) => any[]) => void;
  rfInstanceRef: MutableRefObject<any>;
  setSel: (n: any) => void;
  lancerRef: MutableRefObject<any>;
  audioCtxRef: MutableRefObject<AudioContext | null>;
  resumeAudio: () => Promise<void>;
}

interface Curseur { x: number; y: number; ms: number; visible: boolean; appui: boolean }

/** Les champs d'affichage d'un résultat : effacés pendant la construction, pour un graphe vierge. */
const CHAMPS_RESULTAT = ["audioResultatUrl", "audioResultatBuffer", "audioResultatMessage", "imageResultatUrl", "imageResultatFile", "apercuCourbe", "scriptGenere", "midiFichierSortie"];

function attendre(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((ok, echec) => {
    if (signal.aborted) return echec(new DOMException("Annulé", "AbortError"));
    const t = setTimeout(ok, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); echec(new DOMException("Annulé", "AbortError")); }, { once: true });
  });
}

// Deux images, ou 120 ms au plus : une fenêtre masquée par une autre ne peint plus, et une attente
// d'image sans borne y suspendait le film entier.
const image = () => new Promise<void>((ok) => {
  const t = setTimeout(ok, 120);
  requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); ok(); }));
});

async function ouvrirCapture(): Promise<MediaStream> {
  const api = (window as any).api;
  if (api) {
    if (!api.captureMaFenetre) throw new Error(traduire("demoApp.redemarrer"));
    const id = await api.captureMaFenetre();
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: id, maxFrameRate: 30, maxWidth: 3840, maxHeight: 2160 } } as any,
    });
  }
  // Hors Electron : l'onglet courant, que le navigateur demande à l'utilisateur de partager.
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include" } as any);
}

/**
 * Attend la première image que la capture livre vraiment. Le temps zéro d'un enregistrement est
 * sa première image, et une capture peut mettre plusieurs secondes à en livrer une : sans cette
 * attente, le début du scénario se jouait avant que rien ne soit filmé — constaté, la construction
 * entière manquait au film. L'attente est BORNÉE : une fenêtre que rien ne repeint (masquée par une
 * autre) ne livre aucune image, et le film restait suspendu, le graphe caché — constaté.
 */
async function premiereImage(flux: MediaStream, signal: AbortSignal, limiteMs = 3000): Promise<number> {
  const t0 = performance.now();
  const v = document.createElement("video");
  v.muted = true;
  v.srcObject = flux;
  await v.play().catch(() => {});
  await new Promise<void>((ok, echec) => {
    const abandon = () => echec(new DOMException("Annulé", "AbortError"));
    signal.addEventListener("abort", abandon, { once: true });
    setTimeout(ok, limiteMs);
    const rvfc = (v as any).requestVideoFrameCallback?.bind(v);
    if (rvfc) rvfc(() => ok());
    else v.addEventListener("playing", () => ok(), { once: true });
  });
  v.pause();
  v.srcObject = null;
  return performance.now() - t0;
}

/** MediaRecorder n'écrit ni la durée ni l'index d'un WebM : on le recopie, sans réencoder, pour qu'il se parcoure. */
async function reindexer(brut: Blob): Promise<Blob> {
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ source: new mb.BlobSource(brut), formats: mb.ALL_FORMATS });
    const cible = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.WebMOutputFormat(), target: cible });
    const conversion = await mb.Conversion.init({ input, output });
    await conversion.execute();
    return cible.buffer ? new Blob([cible.buffer], { type: "video/webm" }) : brut;
  } catch (e) {
    console.warn("[attic] Démonstration : réindexation impossible, vidéo brute conservée.", e);
    return brut;
  }
}

export function useRealisateurDemo(params: Params): { calque: ReactNode; enCours: boolean } {
  // Les parametres changent a chaque rendu ; le film en cours lit toujours les derniers.
  const pRef = useRef(params);
  pRef.current = params;
  const [enCours, setEnCours] = useState(false);
  const [legende, setLegende] = useState("");
  const [titre, setTitre] = useState("");
  const [curseur, setCurseur] = useState<Curseur>({ x: 0, y: 0, ms: 0, visible: false, appui: false });
  const curseurRef = useRef(curseur);
  curseurRef.current = curseur;
  const abandonRef = useRef<AbortController | null>(null);

  const filmer = useCallback(async (demoId: string) => {
    const p = pRef.current;
    if (abandonRef.current) return;
    const rf = p.rfInstanceRef.current;
    const demo = p.noeudsRef.current.find((n) => n.id === demoId);
    if (!rf || !demo) return;
    const parametres = (demo.data?.parametres ?? {}) as Record<string, unknown>;
    const dureeParNoeud = typeof parametres["Durée par nœud"] === "number" ? (parametres["Durée par nœud"] as number) : 6;
    const titreDemo = typeof parametres["Titre"] === "string" ? (parametres["Titre"] as string) : "";

    const copieNoeuds = p.noeudsRef.current;
    const copieAretes = p.aretesRef.current;
    const copieVue = rf.getViewport();
    const autres = copieNoeuds.filter((n) => n.id !== demoId);
    // Les nœuds qui fabriquent une vidéo du graphe ne sont pas ce que la vidéo montre.
    const FICHES_VIDEO = new Set(["demonstration", "film-application"]);
    const actions = scenarioDemo(
      autres.filter((n) => !FICHES_VIDEO.has(String(n.data?.ficheId))).map((n) => ({ id: n.id, ficheId: String(n.data?.ficheId ?? ""), label: n.data?.label })),
      copieAretes.map((a) => ({ id: a.id, source: a.source, target: a.target })),
      (ficheId) => {
        const def = registre.trouverDef(ficheId);
        if (!def) return null;
        const en = langueCourante() === "en";
        return {
          nom: (en && def.nomEn) || def.nom,
          chemin: `${traduire(`univers.${def.univers}`)} › ${traduire(`famille.${def.famille}`)}`,
          reglable: def.parametres.some((q: any) => !q.modulationDe),
        };
      },
      {
        ajouter: traduire("demoApp.ajouter"), relier: traduire("demoApp.relier"), regler: traduire("demoApp.regler"),
        lancer: traduire("demoApp.lancer"), ecouter: traduire("demoApp.ecouter"), fin: traduire("demoApp.fin"),
      },
      { titre: titreDemo, dureeParNoeud },
    );

    let flux: MediaStream;
    try {
      flux = await ouvrirCapture();
    } catch (e: any) {
      alert(`${traduire("demoApp.captureRefusee")}${e?.message ? ` (${e.message})` : ""}`);
      return;
    }
    const abandon = new AbortController();
    abandonRef.current = abandon;
    const signal = abandon.signal;
    setEnCours(true);

    await p.resumeAudio();
    const ctx = p.audioCtxRef.current!;
    const sortieSon = ctx.createMediaStreamDestination();
    // UN SILENCE CONTINU SUR LA PISTE SON. Tant qu'aucun son n'y passe, la destination ne livre
    // rien, et l'enregistreur de Chromium retient la vidéo en attendant l'audio — en jetant les
    // images les plus anciennes. Constaté : tout ce qui précédait le premier résultat entendu, soit
    // la construction entière, manquait au film.
    const silence = ctx.createConstantSource();
    silence.offset.value = 0;
    silence.connect(sortieSon);
    silence.start();
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
    const enregistreur = new MediaRecorder(new MediaStream([...flux.getVideoTracks(), ...sortieSon.stream.getAudioTracks()]), { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const morceaux: Blob[] = [];
    enregistreur.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data); };
    const fini = new Promise<void>((ok) => { enregistreur.onstop = () => ok(); });
    // Une interruption par l'utilisateur, ou la fin du partage d'écran, arrête le film.
    flux.getVideoTracks()[0]?.addEventListener("ended", () => abandon.abort());

    const deplacer = async (x: number, y: number, ms: number) => {
      setCurseur({ x, y, ms, visible: true, appui: false });
      await attendre(ms, signal);
    };
    const appuyer = async () => {
      setCurseur({ ...curseurRef.current, ms: 0, appui: true });
      await attendre(160, signal);
      setCurseur({ ...curseurRef.current, ms: 0, appui: false });
    };
    const centreDe = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    };
    const elementNoeud = (id: string) => document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
    const montrerNoeud = (id: string) => p.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, hidden: false } : n)));
    const montrerArete = (id: string) => p.setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, hidden: false } : e)));

    const jouerAction = async (a: ActionDemo) => {
      const t0 = performance.now();
      const reste = async () => { const ms = a.duree * 1000 - (performance.now() - t0); if (ms > 0) await attendre(ms, signal); };
      if (a.genre === "titre") {
        setLegende(""); setTitre(a.legende);
        await reste();
        setTitre("");
        return;
      }
      setLegende(a.legende);
      if (a.genre === "ajouter") {
        const n = p.noeudsRef.current.find((x) => x.id === a.id);
        const depart = centreDe(document.querySelector(".palette-recherche"));
        if (depart && !curseurRef.current.visible) await deplacer(depart.x, depart.y, 0);
        else if (depart) await deplacer(depart.x, depart.y, 350);
        const pos = rf.flowToScreenPosition({ x: n.position.x + ((n.width ?? 220) / 2), y: n.position.y + 24 });
        await deplacer(pos.x, pos.y, 650);
        montrerNoeud(a.id);
        await appuyer();
      } else if (a.genre === "relier") {
        const arete = p.aretesRef.current.find((e) => e.id === a.arete);
        const poignee = (id: string, handle: string | undefined, sens: "source" | "target") =>
          (handle ? document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"] .react-flow__handle[data-handleid="${CSS.escape(handle)}"]`) : null)
          ?? document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"] .react-flow__handle.${sens}`);
        const de = centreDe(poignee(a.source, arete?.sourceHandle, "source"));
        const vers = centreDe(poignee(a.target, arete?.targetHandle, "target"));
        if (de && vers) {
          await deplacer(de.x, de.y, 400);
          setCurseur({ ...curseurRef.current, appui: true });
          await deplacer(vers.x, vers.y, 600);
          setCurseur({ ...curseurRef.current, appui: false });
        }
        montrerArete(a.arete);
      } else if (a.genre === "regler") {
        const c = centreDe(elementNoeud(a.id)?.querySelector(".attic-node-titre, .attic-node-entete") ?? elementNoeud(a.id));
        if (c) await deplacer(c.x, c.y, 450);
        await appuyer();
        const n = p.noeudsRef.current.find((x) => x.id === a.id);
        if (n) p.setSel(n);
      } else if (a.genre === "lancer") {
        p.setSel(null);
        const c = centreDe(document.querySelector(".attic-btn-lancer"));
        if (c) await deplacer(c.x, c.y, 600);
        await appuyer();
        p.setNodes((nds) => nds.map((n) => (n.hidden ? { ...n, hidden: false } : n)));
        p.setEdges((eds) => eds.map((e) => (e.hidden ? { ...e, hidden: false } : e)));
        await image();
        await p.lancerRef.current?.();
        setCurseur({ ...curseurRef.current, visible: false });
      } else if (a.genre === "ecouter") {
        const n = p.noeudsRef.current.find((x) => x.id === a.id);
        const d = n?.data ?? {};
        const son = d.audioResultatBuffer instanceof AudioBuffer ? (d.audioResultatBuffer as AudioBuffer) : null;
        const visible = !!(son || d.imageResultatUrl || d.apercuCourbe || d.scriptGenere);
        if (!n || !visible) return; // rien à écouter ni à voir : on passe
        const el = elementNoeud(a.id);
        const r = el?.getBoundingClientRect();
        const zoom = rf.getViewport().zoom;
        const w = r ? r.width / zoom : (n.width ?? 220), h = r ? r.height / zoom : (n.height ?? 160);
        rf.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: Math.max(0.6, Math.min(1.2, zoom * 1.5)), duration: 700 });
        await attendre(750, signal);
        p.setSel(n);
        if (son) {
          const src = ctx.createBufferSource();
          src.buffer = son;
          src.connect(ctx.destination);
          src.connect(sortieSon);
          src.start();
          try {
            await attendre(Math.min(a.duree, son.duration + 0.6) * 1000, signal);
          } finally {
            try { src.stop(); } catch { /* déjà fini */ }
            src.disconnect();
          }
        } else {
          await attendre(Math.min(a.duree, 3) * 1000, signal);
        }
        return;
      } else if (a.genre === "fin") {
        p.setSel(null);
        rf.fitView({ duration: 800, padding: 0.2 });
      }
      await reste();
    };

    let video: Blob | null = null;
    try {
      // Le graphe, vierge et caché, cadré en entier : chaque nœud apparaîtra à sa place.
      p.setSel(null);
      p.setNodes(() => autres.map((n) => {
        const data = { ...n.data, statut: "attente" };
        for (const c of CHAMPS_RESULTAT) delete (data as any)[c];
        return { ...n, data, hidden: !["comment", "frame"].includes(String(n.data?.ficheId)), selected: false };
      }));
      // L'état de React arrive quelques images plus tard, et un rendu intermédiaire peut reposer
      // l'ancien : on attend que les nœuds soient VRAIMENT cachés avant de cadrer, en insistant.
      const decoratif = (n: any) => ["comment", "frame"].includes(String(n.data?.ficheId));
      for (let essai = 0; essai < 30; essai++) {
        await image();
        const courants = p.noeudsRef.current;
        if (!courants.some((n) => n.id === demoId) && courants.every((n) => n.hidden || decoratif(n))) break;
        p.setNodes((nds) => nds.filter((n) => n.id !== demoId).map((n) => (decoratif(n) ? n : { ...n, hidden: true })));
      }
      p.setEdges(() => copieAretes.map((e) => ({ ...e, hidden: true, selected: false })));
      await image();
      rf.fitView({ includeHiddenNodes: true, padding: 0.2, duration: 0 });
      await image();
      await premiereImage(flux, signal);
      enregistreur.start();
      await attendre(400, signal);
      for (const a of actions) await jouerAction(a);
      await attendre(300, signal);
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error("[attic] Démonstration filmée :", e);
    } finally {
      if (enregistreur.state !== "inactive") enregistreur.stop();
      await fini;
      flux.getTracks().forEach((t) => t.stop());
      try { silence.stop(); } catch { /* déjà arrêté */ }
      silence.disconnect();
      setLegende(""); setTitre(""); setCurseur((c) => ({ ...c, visible: false }));
      if (morceaux.length) video = await reindexer(new Blob(morceaux, { type: "video/webm" }));
      // Le graphe tel qu'il était, avec les résultats du run ; la démonstration porte son film.
      const url = video ? URL.createObjectURL(video) : null;
      const apres = new Map(p.noeudsRef.current.map((n) => [n.id, n]));
      p.setNodes(() => copieNoeuds.map((n) => {
        const courant = apres.get(n.id);
        const base = courant ? { ...courant, hidden: false } : n;
        if (n.id !== demoId || !url) return base;
        if (typeof n.data?._demoAppVideoUrl === "string") URL.revokeObjectURL(n.data._demoAppVideoUrl);
        return { ...n, data: { ...n.data, _demoAppVideoUrl: url, _demoAppVideoTaille: video!.size } };
      }));
      p.setEdges(() => copieAretes);
      rf.setViewport(copieVue);
      abandonRef.current = null;
      setEnCours(false);
    }
  }, []);

  useEffect(() => {
    const surDemande = (e: Event) => { void filmer(String((e as CustomEvent).detail?.id ?? "")); };
    const surTouche = (e: KeyboardEvent) => { if (e.key === "Escape") abandonRef.current?.abort(); };
    window.addEventListener(EVENEMENT_FILMER, surDemande);
    window.addEventListener("keydown", surTouche);
    return () => { window.removeEventListener(EVENEMENT_FILMER, surDemande); window.removeEventListener("keydown", surTouche); };
  }, [filmer]);

  const calque = enCours ? (
    <div className="demo-calque" aria-hidden="true">
      {titre && <div className="demo-titre"><span>{titre}</span></div>}
      {legende && <div className="demo-legende">{legende}</div>}
      {curseur.visible && (
        <div className={`demo-curseur${curseur.appui ? " demo-curseur-appui" : ""}`}
          style={{ transform: `translate(${curseur.x}px, ${curseur.y}px)`, transitionDuration: `${curseur.ms}ms` }}>
          <svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.5 L14.4 20.3 L11.3 13.7 L17.5 13.4 Z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        </div>
      )}
    </div>
  ) : null;

  return { calque, enCours };
}

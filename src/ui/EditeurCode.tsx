// ui/EditeurCode.tsx — Éditeur de code partagé (Python / Julia Processor).
//
// CHANGEMENT DE MODE (2026-07-18) : l'édition ne se fait PLUS dans le nœud.
// Deux tentatives d'édition en place ont échoué :
//  1. textarea contrôlé → re-renders du canevas qui mélangeaient les frappes ;
//  2. textarea non-contrôlé transparent superposé au <pre> coloré → dépend d'un
//     alignement au pixel près des deux calques, DANS un canevas soumis à
//     `transform: scale(zoom)` : curseur décalé d'un cran, sélection souris
//     fausse, lettres insérées avant la dernière — symptômes persistants en
//     packagé.
// Le nœud n'affiche désormais qu'un APERÇU coloré en lecture seule ; un clic
// (ou le bouton « Éditer ») ouvre une fenêtre superposée rendue par portal sur
// document.body : AUCUN ancêtre transformé, et un textarea ordinaire — curseur,
// sélection, copier/coller et Ctrl+Z sont ceux, natifs, d'un textarea nu.
//
// LA COULEUR REVIENT DANS LA FENÊTRE (2026-09-25), et le calque y est tenable
// parce que la cause de l'échec de 2026-07 était le canevas, non la technique :
// l'alignement de deux calques demande des coordonnées entières, or le canevas
// impose `transform: scale(zoom)` à tout ce qu'il contient. La fenêtre, elle,
// est montée sur `document.body` — pas d'ancêtre transformé, échelle 1.
//
// CE QUI TIENT L'ALIGNEMENT, ET RIEN D'AUTRE : la même fonte, la même taille,
// le même interlignage, le même remplissage, le même `white-space: pre`, le
// même `tab-size`, et le défilement recopié DANS LES DEUX AXES. L'horizontal
// est celui qu'on oublie, et il ne se voit qu'avec une ligne longue.
//
// LE TEXTE TAPÉ RESTE CELUI DU TEXTAREA, rendu transparent : le curseur, la
// sélection, l'annulation et la saisie au clavier demeurent natifs. Le calque
// coloré ne fait que se tenir dessous.
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";
import { ollamaGenerer } from "../plugins/ollama";
import { construirePrompt, extraireCode, rangerModeles, type LangageCode } from "./generation-code";

export type Token = { text: string; type: string };

/**
 * Ce que les deux calques de la fenêtre doivent partager EXACTEMENT.
 *
 * Écrit une seule fois et étalé dans les deux styles : une retouche du remplissage ou de la
 * tabulation sur l'un seulement décalerait les couleurs d'un caractère, et cela ne se verrait
 * qu'après coup, sur une ligne indentée.
 */
const STYLE_CALQUE = {
  margin: 0,
  padding: "10px 12px",
  fontFamily: "inherit" as const,
  fontSize: "inherit" as const,
  lineHeight: "inherit" as const,
  whiteSpace: "pre" as const,
  tabSize: 4,
  letterSpacing: "normal" as const,
  wordSpacing: "normal" as const,
};

interface Props {
  codeInitial: string;
  tokenize: (code: string) => Token[];
  couleurs: Record<string, string>;
  /**
   * Le langage, pour proposer une génération par un modèle local.
   *
   * FACULTATIF, ET L'ÉDITEUR MARCHE SANS. Sans lui, ou sans serveur Ollama joignable, la fenêtre
   * est exactement celle d'avant : le composant continue de fonctionner seul, comme aujourd'hui.
   */
  langage?: LangageCode;
  // Appelé (débouncé 400 ms, au blur et à la fermeture) avec le code courant.
  onSync: (code: string) => void;
  // Texte informatif (ex. « numpy + wave requis ») — affiché dans le pied du
  // nœud (après « N lignes · ») et dans l'en-tête de la fenêtre d'édition.
  suffixePied: string;
  // Titre de la fenêtre d'édition (ex. « Python Processor »).
  titre: string;
}

export function EditeurCode({ codeInitial, tokenize, couleurs, onSync, suffixePied, titre, langage }: Props) {
  const { t } = useI18n();
  const [ouvert, setOuvert] = useState(false);
  // Nombre de lignes AFFICHÉ dans la gouttière de la modale — état React :
  // la modale vit hors canevas, un re-render par frappe y est sans enjeu.
  const [nbLignesModale, setNbLignesModale] = useState(1);
  // Le texte du calque coloré. Il suit la frappe sans commander le textarea, qui reste non
  // contrôlé : c'est ce qui garde l'annulation native et empêche le curseur de sauter.
  const [codeModale, setCodeModale] = useState(codeInitial);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);
  const calqueRef = useRef<HTMLPreElement>(null);
  const syncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dernière valeur tapée : le flush au démontage ne peut pas compter sur
  // taRef (React peut avoir détaché la ref avant le cleanup).
  const dernierCode = useRef<string | null>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  // ── Génération par un modèle local (facultative) ──
  const [modeles, setModeles] = useState<string[]>([]);
  const [modele, setModele] = useState("");
  const [consigne, setConsigne] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreurIA, setErreurIA] = useState<string | null>(null);

  // La liste est demandée à l'OUVERTURE de la fenêtre, et pas au montage du nœud : interroger un
  // serveur à chaque nœud posé, pour un service dont on ne se servira peut-être jamais, serait payer
  // un appel réseau par nœud. Une erreur ici n'est pas une panne : elle dit simplement qu'il n'y a
  // pas de serveur, et la barre le signale au lieu de disparaître sans explication.
  useEffect(() => {
    if (!ouvert || !langage) return;
    let vivant = true;
    (async () => {
      const api = (window as unknown as { api?: { ollamaModeles?: () => Promise<{ modeles?: string[]; erreur?: string }> } }).api;
      if (!api?.ollamaModeles) { if (vivant) setErreurIA(t("code.ia.horsBureau")); return; }
      const r = await api.ollamaModeles();
      if (!vivant) return;
      if (r?.erreur || !r?.modeles?.length) { setErreurIA(r?.erreur ?? t("code.ia.aucunModele")); return; }
      const ranges = rangerModeles(r.modeles);
      setModeles(ranges);
      setModele((m) => (m && ranges.includes(m) ? m : ranges[0]));
      setErreurIA(null);
    })();
    return () => { vivant = false; };
  }, [ouvert, langage, t]);

  const synchroniser = useCallback(() => {
    if (syncRef.current) { clearTimeout(syncRef.current); syncRef.current = null; }
    if (taRef.current) onSyncRef.current(taRef.current.value);
  }, []);

  const fermer = useCallback(() => {
    synchroniser();
    setOuvert(false);
  }, [synchroniser]);

  const onInput = useCallback(() => {
    const code = taRef.current?.value ?? "";
    dernierCode.current = code;
    setCodeModale(code);
    setNbLignesModale(code.split("\n").length);
    if (syncRef.current) clearTimeout(syncRef.current);
    syncRef.current = setTimeout(() => {
      syncRef.current = null;
      if (taRef.current) onSyncRef.current(taRef.current.value);
    }, 400);
  }, []);

  /**
   * Poser le code engendré DANS le textarea, par la voie d'une insertion ordinaire.
   *
   * `execCommand` plutôt qu'une affectation de `value` : la pile d'annulation native est conservée,
   * donc Ctrl+Z ramène le code d'avant la génération. C'est la seule défaite possible d'une
   * proposition qu'on n'aime pas, et elle doit rester à portée de doigt.
   */
  const poserCode = useCallback((code: string) => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(0, ta.value.length);
    if (!document.execCommand("insertText", false, code)) {
      ta.setRangeText(code, 0, ta.value.length, "end");
    }
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.scrollTop = 0;
    ta.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, []);

  const engendrer = useCallback(async () => {
    if (!langage || !modele || !consigne.trim() || enCours) return;
    setEnCours(true);
    setErreurIA(null);
    try {
      // LE CODE ACTUEL PART AVEC LA DEMANDE : c'est ce qui permet « ajoute un fondu » au lieu de
      // tout réécrire. Le contrat du composant, lui, est joint dans tous les cas.
      const prompt = construirePrompt({
        langage, consigne, codeActuel: taRef.current?.value ?? "",
      });
      const r = await ollamaGenerer({ model: modele, prompt, options: { temperature: 0.2 } });
      if (r.erreur) { setErreurIA(r.erreur); return; }
      const code = extraireCode(r.reponse ?? "");
      if (!code.trim()) { setErreurIA(t("code.ia.videRetour")); return; }
      poserCode(code);
    } catch (e) {
      setErreurIA(String((e as Error)?.message ?? e));
    } finally {
      setEnCours(false);
    }
  }, [langage, modele, consigne, enCours, poserCode, t]);

  // Flush au DÉMONTAGE : si le composant disparaît avec un débounce en attente
  // (import de workflow, suppression du nœud, modale encore ouverte), ni
  // fermer() ni onBlur ne sont invoqués — sans ce cleanup, les 400 dernières
  // ms de frappe étaient perdues en silence.
  useEffect(() => () => {
    if (syncRef.current) {
      clearTimeout(syncRef.current);
      if (dernierCode.current != null) onSyncRef.current(dernierCode.current);
    }
  }, []);

  // ── Aperçu en lecture seule dans le nœud (coloré, cliquable) ──
  // Mémoïsé : AtelierNode n'est pas React.memo, donc chaque interaction du
  // canevas (drag, sélection, statut) re-rend cette vue — sans useMemo le
  // tokenizer complet tournait à chaque frame de drag pour un texte inchangé.
  const tokens = useMemo(() => tokenize(codeInitial), [codeInitial, tokenize]);
  const nbLignes = useMemo(() => codeInitial.split("\n").length, [codeInitial]);
  // Les jetons de la fenêtre, recalculés à la frappe. L'analyse est linéaire et ne parcourt que le
  // texte ouvert ; c'est le rendu des `span` qui coûte, et il reste sous la milliseconde aux
  // tailles de script que ces nœuds reçoivent.
  const tokensModale = useMemo(() => (ouvert ? tokenize(codeModale) : []), [ouvert, codeModale, tokenize]);
  const apercu = (
    <div
      className="nodrag nowheel"
      title={t("code.editerTitle")}
      onClick={(e) => {
        e.stopPropagation();
        // Le calque part du code affiché : sans cela, rouvrir après une modification venue d'ailleurs
        // colorerait l'ancien texte sous le nouveau.
        setCodeModale(codeInitial);
        setNbLignesModale(nbLignes);
        setOuvert(true);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "relative", flex: 1, minHeight: 0, cursor: "pointer",
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace", fontSize: 12, lineHeight: 1.5,
      }}
    >
      <pre style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        margin: 0, padding: "8px", overflow: "auto",
        background: "#1e1e1e", borderRadius: 4,
        whiteSpace: "pre", tabSize: 4,
      }}>
        {tokens.map((t, i) => (
          <span key={i} style={{ color: couleurs[t.type] || "#d4d4d4" }}>{t.text}</span>
        ))}
      </pre>
      <span style={{
        position: "absolute", top: 6, right: 10, fontSize: 10,
        padding: "2px 8px", borderRadius: 4, border: "1px solid #444",
        background: "rgba(30,30,30,0.9)", color: "#bbb", pointerEvents: "none",
      }}>✎ {t("code.editer")}</span>
    </div>
  );

  // ── Fenêtre d'édition — portal sur <body>, hors de tout transform ──
  const modal = ouvert ? createPortal(
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Ne pas laisser les raccourcis remonter à l'app (Ctrl+C copierait des
        // nœuds, Delete en supprimerait) pendant qu'on tape du code.
        e.stopPropagation();
        if (e.key === "Escape") fermer();
      }}
      onClick={(e) => { if (e.target === e.currentTarget) fermer(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        width: "min(900px, 92vw)", height: "min(640px, 88vh)",
        display: "flex", flexDirection: "column",
        background: "#1b1b1f", border: "1px solid #3a3a40", borderRadius: 8,
        boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderBottom: "1px solid #2c2c31",
          color: "#ddd", fontSize: 13,
        }}>
          <span style={{ fontWeight: 600 }}>{titre}</span>
          <span style={{ color: "#777", fontSize: 11 }}>{suffixePied}</span>
          <span style={{ flex: 1 }} />
          <button
            onClick={fermer}
            style={{
              fontSize: 12, padding: "4px 12px", cursor: "pointer",
              border: "1px solid #444", borderRadius: 4,
              background: "#2a9d8f", color: "#fff",
            }}
          >{t("code.fermer")}</button>
        </div>
        {/* LA BARRE DE GÉNÉRATION, et elle n'est qu'une commodité. Le composant écrit son code à la
            main comme avant ; sans serveur local, la barre dit pourquoi elle ne peut rien et laisse
            tout le reste intact. Le code engendré arrive dans l'éditeur, jamais dans une exécution :
            on le lit, on le corrige, on lance. */}
        {langage && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderBottom: "1px solid #2c2c31", background: "#1f1f24",
          }}>
            <span style={{ color: "#888", fontSize: 11 }}>{t("code.ia.titre")}</span>
            <input
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void engendrer(); } }}
              placeholder={t("code.ia.placeholder")}
              disabled={modeles.length === 0}
              style={{
                flex: 1, minWidth: 0, fontSize: 12, padding: "4px 8px",
                background: "#161619", color: "#d4d4d4",
                border: "1px solid #3a3a40", borderRadius: 4, outline: "none",
              }}
            />
            <select
              value={modele}
              onChange={(e) => setModele(e.target.value)}
              disabled={modeles.length === 0}
              title={t("code.ia.modele")}
              style={{
                fontSize: 11, padding: "4px 6px", maxWidth: 200,
                background: "#161619", color: "#bbb",
                border: "1px solid #3a3a40", borderRadius: 4,
              }}
            >
              {modeles.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button
              onClick={() => void engendrer()}
              disabled={enCours || modeles.length === 0 || !consigne.trim()}
              style={{
                fontSize: 12, padding: "4px 12px",
                cursor: enCours || modeles.length === 0 || !consigne.trim() ? "default" : "pointer",
                border: "1px solid #444", borderRadius: 4,
                background: enCours || modeles.length === 0 || !consigne.trim() ? "#2a2a30" : "#3a6ea5",
                color: "#fff", whiteSpace: "nowrap",
              }}
            >{enCours ? t("code.ia.enCours") : t("code.ia.generer")}</button>
          </div>
        )}
        {langage && erreurIA && (
          <div style={{ padding: "4px 12px", fontSize: 11, color: "#e07a5f", background: "#1f1f24" }}>
            {erreurIA}
          </div>
        )}
        {/* Gouttière + zone de code. La gouttière est une colonne SÉPARÉE (pas
            un calque superposé) : l'alignement ne demande que la même fonte et
            le même interlignage — rien à dérégler. Elle rend aux tracebacks
            Python/Julia (« line 47 ») leur utilité. */}
        <div style={{
          flex: 1, display: "flex", minHeight: 0,
          fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
          fontSize: 13, lineHeight: 1.5,
        }}>
          <pre ref={gutterRef} aria-hidden="true" style={{
            margin: 0, padding: "10px 6px 10px 10px", overflow: "hidden",
            background: "#17171a", color: "#555", textAlign: "right",
            minWidth: 40, userSelect: "none", whiteSpace: "pre",
            borderRadius: "0 0 0 8px",
            fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit",
          }}>
            {Array.from({ length: nbLignesModale }, (_, i) => i + 1).join("\n")}
          </pre>
          {/* Les deux calques. Le coloré dessous, en lecture seule et sans événements ; le textarea
              dessus, texte transparent et curseur visible. Leurs styles de fonte et de remplissage
              sont écrits une seule fois, dans `STYLE_CALQUE`, pour qu'aucun des deux ne puisse
              dériver de l'autre à la faveur d'une retouche. */}
          <div style={{ position: "relative", flex: 1, minHeight: 0, borderRadius: "0 0 8px 0", overflow: "hidden" }}>
            <pre ref={calqueRef} aria-hidden="true" style={{
              ...STYLE_CALQUE,
              position: "absolute", inset: 0, overflow: "hidden",
              background: "#1e1e1e", color: "#d4d4d4", pointerEvents: "none",
            }}>
              {tokensModale.map((tk, i) => (
                <span key={i} style={{ color: couleurs[tk.type] || "#d4d4d4" }}>{tk.text}</span>
              ))}
              {"\n"}
            </pre>
            <textarea
              ref={taRef}
              className="attic-editeur-code-saisie"
              autoFocus
              defaultValue={codeInitial}
              onInput={onInput}
              onBlur={synchroniser}
              onScroll={(e) => {
                // LES DEUX AXES. Sans le second, une ligne longue décale les couleurs dès qu'on
                // déroule vers la droite, et le décalage passe inaperçu tant qu'on reste court.
                if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                if (calqueRef.current) {
                  calqueRef.current.scrollTop = e.currentTarget.scrollTop;
                  calqueRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const ta = e.currentTarget;
                  // execCommand préserve la pile d'annulation native (Ctrl+Z) et
                  // déclenche input (donc la synchro). Repli si l'API disparaît.
                  if (!document.execCommand("insertText", false, "    ")) {
                    ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end");
                    ta.dispatchEvent(new Event("input", { bubbles: true }));
                  }
                }
              }}
              style={{
                ...STYLE_CALQUE,
                position: "absolute", inset: 0, overflow: "auto",
                border: "none", outline: "none", resize: "none",
                // Le texte est transparent, le curseur ne l'est pas : c'est tout ce qui distingue
                // les deux calques, et c'est ce qui laisse voir le coloré dessous.
                background: "transparent", color: "transparent", caretColor: "#d4d4d4",
              }}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {apercu}
      <div style={{ fontSize: 10, marginTop: 4, color: "var(--text-muted)", background: "var(--bg-surface)", padding: "2px 4px", borderRadius: "0 0 6px 6px" }}>
        {nbLignes} {t("code.lignes")} · {suffixePied}
      </div>
      {modal}
    </>
  );
}

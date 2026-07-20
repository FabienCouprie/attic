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
// document.body : AUCUN ancêtre transformé, et un textarea VISIBLE ordinaire —
// pas de calque, pas d'alignement, rien à dérégler. Curseur, sélection,
// copier/coller et Ctrl+Z sont ceux, natifs, d'un textarea nu.
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

export type Token = { text: string; type: string };

interface Props {
  codeInitial: string;
  tokenize: (code: string) => Token[];
  couleurs: Record<string, string>;
  // Appelé (débouncé 400 ms, au blur et à la fermeture) avec le code courant.
  onSync: (code: string) => void;
  // Texte informatif (ex. « numpy + wave requis ») — affiché dans le pied du
  // nœud (après « N lignes · ») et dans l'en-tête de la fenêtre d'édition.
  suffixePied: string;
  // Titre de la fenêtre d'édition (ex. « Python Processor »).
  titre: string;
}

export function EditeurCode({ codeInitial, tokenize, couleurs, onSync, suffixePied, titre }: Props) {
  const [ouvert, setOuvert] = useState(false);
  // Nombre de lignes AFFICHÉ dans la gouttière de la modale — état React :
  // la modale vit hors canevas, un re-render par frappe y est sans enjeu.
  const [nbLignesModale, setNbLignesModale] = useState(1);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);
  const syncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dernière valeur tapée : le flush au démontage ne peut pas compter sur
  // taRef (React peut avoir détaché la ref avant le cleanup).
  const dernierCode = useRef<string | null>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

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
    setNbLignesModale(code.split("\n").length);
    if (syncRef.current) clearTimeout(syncRef.current);
    syncRef.current = setTimeout(() => {
      syncRef.current = null;
      if (taRef.current) onSyncRef.current(taRef.current.value);
    }, 400);
  }, []);

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
  const apercu = (
    <div
      className="nodrag nowheel"
      title="Cliquer pour éditer le code"
      onClick={(e) => { e.stopPropagation(); setNbLignesModale(nbLignes); setOuvert(true); }}
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
      }}>✎ Éditer</span>
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
          >Fermer (Échap)</button>
        </div>
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
          <textarea
            ref={taRef}
            autoFocus
            defaultValue={codeInitial}
            onInput={onInput}
            onBlur={synchroniser}
            onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
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
              flex: 1, margin: 0, padding: "10px 12px", border: "none", outline: "none",
              resize: "none", background: "#1e1e1e", color: "#d4d4d4",
              fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit",
              whiteSpace: "pre", tabSize: 4,
              borderRadius: "0 0 8px 0",
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {apercu}
      <div style={{ fontSize: 10, marginTop: 4, color: "var(--text-muted)", background: "var(--bg-surface)", padding: "2px 4px", borderRadius: "0 0 6px 6px" }}>
        {nbLignes} lignes · {suffixePied}
      </div>
      {modal}
    </>
  );
}

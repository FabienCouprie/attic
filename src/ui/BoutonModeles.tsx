// ui/BoutonModeles.tsx — L'icône qui récupère les modèles IA, à la demande.
//
// POURQUOI UNE ICÔNE, ET NON UN TÉLÉCHARGEMENT AU PREMIER USAGE. L'installeur allégé ne contient
// aucun modèle ONNX : 1,5 Go de moins. Les récupérer quand un nœud en a besoin ferait attendre au
// pire moment — au milieu d'un travail, sans l'avoir demandé, peut-être sans réseau. Ici c'est
// l'utilisateur qui décide quand, et il voit ce que ça pèse avant de commencer.
//
// ELLE SERT AUSSI DANS LA VERSION COMPLÈTE, et ce n'est pas un effet de bord : elle inventorie ce
// qui est présent et ne prend que le complément. Un modèle abîmé, tronqué par un disque plein ou
// par un antivirus, se répare donc d'un clic — le fichier retéléchargé va dans le dossier de
// l'utilisateur, que le résolveur regarde AVANT les ressources livrées.
//
// Tout ce qui se décide — quelle pastille, quelle infobulle, ce qu'un clic déclenche — vit dans
// `etat-modeles.ts` et s'y éprouve : sur un poste qui a déjà tous les modèles, cinq des six états
// ne s'affichent jamais.
import { useCallback, useEffect, useRef, useState } from "react";
import { traduire } from "../i18n";
import { apparenceModeles, aPrendre, sansAdresse, formaterOctets, type EtatModeles, type ModeleEtat, type ProgressionModeles } from "./etat-modeles";
import { langueCourante } from "../i18n";

const COULEURS: Record<string, string | undefined> = {
  complet: "#2a9d8f",
  manquants: "#e9a13b",
  telechargement: "#4c6ef5",
  extraction: "#4c6ef5",
  erreur: "#e44",
};

export function BoutonModeles({ etiquette }: { etiquette: string }) {
  const [etat, setEtat] = useState<EtatModeles | null>(null);
  const [progression, setProgression] = useState<ProgressionModeles | null>(null);
  const [panneau, setPanneau] = useState(false);
  const enVol = useRef(false);

  const rafraichir = useCallback(async () => {
    const api = (window as any).api;
    if (!api?.modelesEtat) return;
    try { setEtat(await api.modelesEtat()); } catch { /* le processus principal n'est pas là */ }
  }, []);

  useEffect(() => {
    rafraichir();
    const api = (window as any).api;
    // `modelesProgression` rend de quoi se désabonner : sans cela, chaque montage laisserait un
    // écouteur de plus, et la barre est remontée à chaque changement de langue ou de thème.
    const stop = api?.modelesProgression?.((e: ProgressionModeles) => {
      setProgression(e);
      if (e.phase === "fini" || e.phase === "annule" || e.phase === "erreur") {
        enVol.current = false;
        // L'inventaire est relu APRÈS la fin : c'est lui qui fait foi, pas le compte-rendu.
        rafraichir();
        if (e.phase !== "erreur") setProgression(null);
      }
    });
    return () => { stop?.(); };
  }, [rafraichir]);

  const apparence = apparenceModeles(etat, progression);

  // UN CLIC N'ENGAGE PLUS 1,9 Go D'UN COUP. Deux modèles pèsent à eux seuls 1,3 Go : le bouton
  // ouvre donc la liste de ce qui manque, avec le poids de chacun, et l'on prend ce qu'on veut —
  // un modèle, ou tout. Pendant un téléchargement, le bouton redevient ce qu'il était : un clic
  // l'interrompt.
  const telecharger = useCallback(async (ids?: string[]) => {
    const api = (window as any).api;
    if (!api || enVol.current) return;
    enVol.current = true;
    setPanneau(false);
    setProgression(null);
    const res = await api.modelesTelecharger?.(ids);
    enVol.current = false;
    if (res && !res.ok && !res.annule) setProgression({ phase: "erreur", erreur: res.erreur });
    await rafraichir();
  }, [rafraichir]);

  const cliquer = async () => {
    const api = (window as any).api;
    if (!apparence.actionnable || !api) return;
    if (apparence.interrompt) { await api.modelesAnnuler?.(); return; }
    if (enVol.current) return;
    const liste = aPrendre(etat, langueCourante() === "en");
    if (liste.length === 0) { setPanneau((v) => !v); return; }
    setPanneau((v) => !v);
  };

  const infobulle = `${etiquette} — ${traduire(apparence.cle, ...apparence.vars)}`;
  const couleur = COULEURS[apparence.variante];

  const anglais = langueCourante() === "en";
  const liste = aPrendre(etat, anglais);
  const muets = sansAdresse(etat, anglais);

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
    <button
      className="attic-btn-icon"
      title={infobulle}
      aria-label={infobulle}
      onClick={cliquer}
      disabled={!apparence.actionnable}
      style={{ position: "relative", width: 28, height: 28, color: couleur }}
    >
      {/* Une puce — le modèle — avec une flèche qui descend dedans : ce qu'on va chercher. */}
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
        <path d="M6.5 1v2.5M9.5 1v2.5M6.5 12.5V15M9.5 12.5V15M1 6.5h2.5M1 9.5h2.5M12.5 6.5H15M12.5 9.5H15" />
        {apparence.variante === "complet"
          ? <path d="M6 8l1.5 1.5L10.5 6.5" />
          : <path d="M8 5.5v4M6.5 8l1.5 1.5L9.5 8" />}
      </svg>
      {apparence.badge && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute", right: -2, bottom: -2,
            fontSize: apparence.badge.length > 2 ? 8 : 9, lineHeight: "10px",
            padding: "0 2px", borderRadius: 4,
            background: couleur ?? "var(--text-muted)", color: "#fff",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {apparence.badge}
        </span>
      )}
    </button>
    {panneau && (
      <div className="attic-modeles-panneau" onClick={(e) => e.stopPropagation()}>
        {liste.length > 0 ? (
          <>
            <button className="attic-modeles-tout" onClick={() => telecharger()}>
              {traduire("modeles.tout", liste.length, formaterOctets(liste.reduce((s, m) => s + m.octets, 0)))}
            </button>
            {liste.map((m: ModeleEtat) => (
              <button key={m.id} className="attic-modeles-ligne" onClick={() => telecharger([m.id])}
                title={traduire(m.partiel ? "modeles.partiel" : "modeles.prendre", m.nom)}>
                <span className="attic-modeles-nom">{m.nom}</span>
                <span className="attic-modeles-poids">{formaterOctets(m.octets)}</span>
              </button>
            ))}
          </>
        ) : (
          <div className="attic-modeles-vide">{traduire("modeles.rienAPrendre")}</div>
        )}
        {muets.length > 0 && (
          <div className="attic-modeles-vide">{traduire("modeles.sansAdresse", muets.length)}</div>
        )}
      </div>
    )}
    </span>
  );
}

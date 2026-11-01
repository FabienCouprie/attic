// ui/BarreMeta.tsx — Au-dessus du canevas : l'onglet et son ✕, les gestes de méta-composant, et le
// fil d'Ariane quand on est dans un méta.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : mêmes boutons, mêmes libellés, mêmes classes.
import { ID_ENTREE_FRONTIERE, ID_SORTIE_FRONTIERE } from "../core";
import { useI18n } from "../i18n";

export interface PropsBarreMeta {
  pile: { metaId: string; nom: string; nomEn?: string }[];
  ajouterNoeud: (ficheId: string) => void;
  grouperAvecBulles: () => void;
  degrouper: () => void;
  renommer: () => void;
  remonterA: (niveau: number) => void;
  fermerOnglet: (id: string) => void;
}

export function BarreMeta({ pile, ajouterNoeud, grouperAvecBulles, degrouper, renommer, remonterA, fermerOnglet }: PropsBarreMeta) {
  const { t, lang } = useI18n();
  return (
    <>
      <div className="attic-onglets">
        <span className="attic-onglet actif">
          <button className="attic-onglet-fermer" onClick={(e) => { e.stopPropagation(); fermerOnglet("wf-1"); }} title={t("workflow.nouveauTitre")}>✕</button>
        </span>
      </div>
      <div className="attic-meta-actions">
        {pile.length > 0 ? (
          <>
            <button onClick={() => ajouterNoeud(ID_ENTREE_FRONTIERE)} title={t("meta.ajoutEntree")}>➕ {t("meta.entree")}</button>
            <button onClick={() => ajouterNoeud(ID_SORTIE_FRONTIERE)} title={t("meta.ajoutSortie")}>➕ {t("meta.sortie")}</button>
          </>
        ) : (
          <>
            <button onClick={grouperAvecBulles} title={t("meta.grouperTitle")}>⊟ {t("meta.grouper")}</button>
            <button onClick={degrouper} title={t("meta.degrouperTitle")}>⊞ {t("meta.degrouper")}</button>
            <button onClick={renommer} title={t("meta.renommerTitle")}>✎ {t("meta.renommer")}</button>
          </>
        )}
      </div>
      {pile.length > 0 && (
        <div className="attic-filariane">
          <button onClick={() => remonterA(-1)}>{t("meta.atelier")}</button>            {pile.map((niv, i) => (
            <span key={i}>
              <span className="sep">›</span>
              <button onClick={() => remonterA(i)} disabled={i === pile.length - 1}>{lang === "en" && niv.nomEn ? niv.nomEn : niv.nom}</button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

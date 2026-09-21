// ui/Quiz.tsx — Le quiz jouable dans le nœud : une question, quatre boutons, et pourquoi.
//
// TROIS DÉCISIONS, ET ELLES TIENNENT TOUTE LA VUE.
//
//  1. LA VUE N'A PRESQUE PAS D'ÉTAT. Les réponses vivent dans le PARAMÈTRE « Réponses » du nœud,
//     pas ici : c'est ce qui les sauvegarde avec le projet, ce qui permet au corrigé de les lire, et
//     ce qui fait qu'on peut reprendre un tour de cinquante questions après avoir fermé
//     l'application. Le seul état local est de savoir si l'on est en train de REGARDER la
//     correction de la question qu'on vient de répondre — une information qui, elle, n'a aucune
//     raison de survivre à un rechargement.
//
//  2. LA SÉRIE VIENT DE LA MÊME FONCTION QUE L'EXÉCUTION (`seance`). Si la vue tirait la sienne, elle
//     poserait une question et le corrigé du nœud en corrigerait une autre, sans que rien ne le
//     signale. C'est le genre de désaccord qu'on ne découvre qu'en comptant les points à la main.
//
//  3. L'EXPLICATION S'AFFICHE APRÈS CHAQUE RÉPONSE, juste ou fausse. Un quiz qui se contente de
//     compter des points n'apprend rien : ce qu'on retient est la phrase qui dit POURQUOI, et c'est
//     pour cela que chaque question de la banque en porte une.

import { useMemo, useState } from "react";
import { NodeResizer } from "@xyflow/react";
import { useI18n } from "../i18n";
import { registre } from "../audio/adaptateur";
import { questionsCatalogue, type FicheQuiz } from "../quiz/catalogue";
import { nomTheme, reglagesDepuis, seance } from "../quiz/seance";
import { corriger, ecrireReponses, lettre, lireReponses, positionJuste, propositions } from "../quiz/tour";
import { enonceLangue, pourquoiLangue } from "../quiz/types";

interface Props {
  id: string;
  data: {
    parametres: Record<string, number | string>;
    onChangerParametre?: (id: string, nom: string, valeur: string | number) => void;
  };
}

export function Quiz({ id, data }: Props) {
  const { t, lang } = useI18n();
  const en = lang === "en";
  const [correction, setCorrection] = useState<number | null>(null);

  // Le catalogue ne change pas pendant qu'on joue : une fois suffit, et c'est plusieurs centaines
  // de questions à construire.
  const catalogue = useMemo(
    () => questionsCatalogue(registre.tousLesPlugins() as unknown as FicheQuiz[]), []);

  const reglages = useMemo(
    () => reglagesDepuis((nom, defaut) => data.parametres[nom] ?? defaut),
    [data.parametres]);

  const serie = useMemo(() => seance(reglages, catalogue), [reglages, catalogue]);

  const reponses = lireReponses(String(data.parametres["Réponses"] ?? ""));
  const rang = Math.min(reponses.length, serie.length);
  const bilan = corriger(serie, reponses);

  // On regarde la correction de la dernière question répondue, et seulement d'elle : une série
  // rechargée ou une graine changée remet la vue sur la question courante sans rien à nettoyer.
  const enCorrection = correction !== null && correction === reponses.length - 1 ? correction : null;
  const montre = enCorrection ?? rang;
  const posee = serie[Math.min(montre, serie.length - 1)];

  const changer = (nom: string, valeur: string | number) => data.onChangerParametre?.(id, nom, valeur);

  function repondre(position: number) {
    changer("Réponses", ecrireReponses([...reponses, position]));
    setCorrection(reponses.length);
  }

  function recommencer() {
    changer("Réponses", "");
    setCorrection(null);
  }

  function nouveauTour() {
    changer("Graine", Math.floor(Math.random() * 999999) + 1);
    changer("Réponses", "");
    setCorrection(null);
  }

  if (serie.length === 0) {
    return (
      <div className="attic-quiz nodrag" onPointerDown={(e) => e.stopPropagation()}>
        <NodeResizer minWidth={320} minHeight={240} />
        <div className="attic-quiz-vide">{t("quiz.vide")}</div>
      </div>
    );
  }

  const fini = rang >= serie.length && enCorrection === null;
  const pourcent = bilan.repondues > 0 ? Math.round((bilan.justes / bilan.repondues) * 100) : 0;

  return (
    <div className="attic-quiz nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={320} minHeight={240} />

      <div className="attic-quiz-tete">
        <span className="attic-quiz-theme">{nomTheme(posee.question.theme, en)}</span>
        <span className="attic-quiz-avance">{Math.min(rang + (fini ? 0 : 1), serie.length)} / {serie.length}</span>
        <span className="attic-quiz-score">
          {bilan.repondues > 0 ? `${t("quiz.score")} ${bilan.justes}/${bilan.repondues} · ${pourcent} %` : ""}
        </span>
        <button className="attic-quiz-btn-outil" title={t("quiz.recommencer")} onClick={recommencer}>↺</button>
        <button className="attic-quiz-btn-outil" title={t("quiz.nouveauTour")} onClick={nouveauTour}>⟳</button>
      </div>
      <div className="attic-quiz-jauge"><div style={{ width: `${(rang / serie.length) * 100}%` }} /></div>

      {fini ? (
        <div className="attic-quiz-bilan">
          <div className="attic-quiz-fini">{t("quiz.termine")} — {bilan.justes} / {bilan.repondues} ({pourcent} %)</div>
          <div className="attic-quiz-parTheme">
            {bilan.parTheme.map((x) => (
              <span key={x.theme}>{nomTheme(x.theme, en)} {x.justes}/{x.repondues}</span>
            ))}
          </div>
          {bilan.manquees.length === 0 ? (
            <div className="attic-quiz-juste">{t("quiz.sansFaute")}</div>
          ) : (
            <>
              <div className="attic-quiz-revoir">{t("quiz.revoir")}</div>
              {bilan.manquees.map((m) => (
                <div className="attic-quiz-manquee" key={m.rang}>
                  <div className="attic-quiz-enonce-petit">{m.rang + 1}. {enonceLangue(m.posee.question, en)}</div>
                  <div className="attic-quiz-bonne">
                    {lettre(positionJuste(m.posee))}. {propositions(m.posee, en)[positionJuste(m.posee)]}
                  </div>
                  <div className="attic-quiz-pourquoi">{pourquoiLangue(m.posee.question, en)}</div>
                </div>
              ))}
            </>
          )}
          <div className="attic-quiz-actions">
            <button className="attic-quiz-btn-suite" onClick={nouveauTour}>{t("quiz.nouveauTour")}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="attic-quiz-enonce">{enonceLangue(posee.question, en)}</div>
          <div className="attic-quiz-choix">
            {propositions(posee, en).map((texte, i) => {
              const juste = i === positionJuste(posee);
              const donnee = enCorrection !== null ? reponses[enCorrection] : -1;
              const etat = enCorrection === null ? ""
                : juste ? " juste" : i === donnee ? " faux" : " pale";
              return (
                <button
                  key={i}
                  className={`attic-quiz-prop${etat}`}
                  disabled={enCorrection !== null}
                  onClick={() => repondre(i)}
                >
                  <span className="attic-quiz-lettre">{lettre(i)}</span>{texte}
                </button>
              );
            })}
          </div>
          {enCorrection !== null && (
            <div className="attic-quiz-retour">
              <div className={reponses[enCorrection] === positionJuste(posee) ? "attic-quiz-juste" : "attic-quiz-rate"}>
                {reponses[enCorrection] === positionJuste(posee) ? `✓ ${t("quiz.juste")}` : `✗ ${t("quiz.faux")}`}
              </div>
              <div className="attic-quiz-pourquoi">{pourquoiLangue(posee.question, en)}</div>
              <div className="attic-quiz-actions">
                <button className="attic-quiz-btn-suite" onClick={() => setCorrection(null)}>{t("quiz.suivante")}</button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="attic-quiz-pied">{t("quiz.astuceLancer")}</div>
    </div>
  );
}

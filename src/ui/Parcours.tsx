// ui/Parcours.tsx — Le parcours dans le nœud : une étape, une liste qui se coche, une leçon.
//
// TROIS DÉCISIONS, ET ELLES TIENNENT TOUTE LA VUE.
//
//  1. LA VUE REGARDE L'ATELIER, ET C'EST LA SEULE QUI LE PEUT. Un plugin ne reçoit que ses
//     entrées et ses réglages — il ne voit ni les nœuds ni les arêtes. Une vue, elle, est montée
//     à l'intérieur de React Flow et peut lire le graphe entier. C'est ce qui rend possible
//     l'essentiel du parcours : vérifier ce que l'élève a réellement construit, et le vérifier
//     pendant qu'il le construit, sans rien lui demander de cliquer.
//
//  2. LA PROGRESSION VIT DANS LE PARAMÈTRE « ACCOMPLIS », pas ici. C'est ce qui la sauvegarde
//     avec le projet, ce qui permet au bulletin de la lire, et ce qui fait qu'un parcours
//     interrompu se reprend là où il s'était arrêté. Le seul état local est l'endroit où l'on
//     regarde et le fait d'avoir ouvert l'indice — deux informations qui n'ont aucune raison de
//     survivre à un rechargement.
//
//  3. LA LEÇON S'AFFICHE APRÈS LA RÉUSSITE, ET LA RÉUSSITE SE CLIQUE. La liste se coche toute
//     seule, mais l'étape ne se valide qu'au bouton : c'est ce moment d'arrêt qui fait lire la
//     leçon. Une étape qui se validerait d'elle-même ferait défiler le parcours sans qu'on
//     apprenne quoi que ce soit — exactement le défaut du tutoriel qu'on voulait éviter.

import { useMemo, useState } from "react";
import { NodeResizer, useEdges, useNodes } from "@xyflow/react";
import { useI18n } from "../i18n";
import { registre } from "../audio/adaptateur";
import { statutDe } from "./statuts";
import { instantane, type LienBrut, type NoeudBrut } from "../parcours/atelier";
import { examiner, tousCoches } from "../parcours/conditions";
import { jugerCibles, mesurerCopie } from "../parcours/mesures";
import { chapitreDe, exerciceCourant, listeCourante, nomChapitre, rangDans, reglagesDepuis } from "../parcours/seance";
import { CHAPITRES, EXERCICES } from "../parcours/exercices";
import { bilan, noter, oublier, titreGagne } from "../parcours/voyage";
import type { Point } from "../parcours/types";

interface Props {
  id: string;
  data: {
    parametres: Record<string, number | string>;
    onChangerParametre?: (id: string, nom: string, valeur: string | number) => void;
  };
}

export function Parcours({ id, data }: Props) {
  const { t, lang } = useI18n();
  const en = lang === "en";
  const noeuds = useNodes();
  const liens = useEdges();
  const [vu, setVu] = useState<number | null>(null);
  const [indice, setIndice] = useState(false);
  const [celebre, setCelebre] = useState<string | null>(null);

  // Les rubriques d'une fiche ne se lisent pas sur le nœud : elles viennent du registre, comme
  // pour le thème « Catalogue » du quiz. Une fois suffit — le registre ne bouge pas en cours de
  // route.
  const rubriques = useMemo(() => {
    const m = new Map<string, { univers: string; famille: string }>();
    for (const f of registre.tousLesPlugins() as unknown as { id: string; univers: string; famille: string }[]) {
      m.set(f.id, { univers: f.univers, famille: f.famille });
    }
    return m;
  }, []);

  const atelier = useMemo(
    () => instantane(noeuds as unknown as NoeudBrut[], liens as unknown as LienBrut[],
      (ficheId) => rubriques.get(ficheId), (n) => statutDe(n).statut),
    [noeuds, liens, rubriques]);

  const reglages = useMemo(
    () => reglagesDepuis((nom, defaut) => String(data.parametres[nom] ?? defaut)),
    [data.parametres]);

  const liste = useMemo(() => listeCourante(reglages), [reglages]);
  const rang = Math.min(vu ?? rangDans(reglages), Math.max(0, liste.length - 1));
  const exercice = liste[rang] ?? exerciceCourant(reglages);

  // Le son soumis : celui qui alimente l'entrée « Copie ». On le mesure une fois par rendu de
  // l'amont, et non à chaque rendu de la vue — une pondération K sur trois minutes de stéréo
  // n'est pas gratuite.
  const copie = useMemo(() => {
    const amont = new Set(liens.filter((l) => l.target === id).map((l) => l.source));
    for (const n of noeuds) {
      if (!amont.has(n.id)) continue;
      const buffer = (n.data as { audioResultatBuffer?: AudioBuffer }).audioResultatBuffer;
      if (buffer instanceof AudioBuffer) return buffer;
    }
    return null;
  }, [noeuds, liens, id]);

  const mesure = useMemo(() => (copie ? mesurerCopie(copie) : null), [copie]);

  const points: Point[] = useMemo(() => {
    if (!exercice) return [];
    const surAtelier = examiner(exercice.condition, atelier);
    const surLeSon = exercice.cibles ? jugerCibles(exercice.cibles, mesure) : [];
    return [...surAtelier, ...surLeSon];
  }, [exercice, atelier, mesure]);

  const b = useMemo(() => bilan(EXERCICES, CHAPITRES, reglages.accomplis), [reglages]);
  const fait = exercice ? reglages.accomplis.includes(exercice.id) : false;
  const pret = tousCoches(points);
  const chapitre = chapitreDe(exercice);
  const titre = titreGagne(b.epreuvesReussies, en);

  const changer = (nom: string, valeur: string | number) => data.onChangerParametre?.(id, nom, valeur);

  function valider() {
    if (!exercice) return;
    changer("Accomplis", noter(String(data.parametres["Accomplis"] ?? ""), exercice.id));
    // ON S'ARRÊTE SUR L'ÉTAPE QU'ON VIENT DE RÉUSSIR. Sans ce `setVu`, le rang suit la progression
    // et saute à l'étape suivante dans le même rendu : la leçon n'est jamais lue, et le parcours
    // défile comme le tutoriel qu'on voulait éviter. Constaté dans l'application.
    setVu(rang);
    setCelebre(exercice.id);
    setIndice(false);
  }

  function suivante() {
    setCelebre(null);
    setIndice(false);
    setVu(rang + 1 < liste.length ? rang + 1 : null);
  }

  function refaire() {
    if (!exercice) return;
    changer("Accomplis", oublier(String(data.parametres["Accomplis"] ?? ""), exercice.id));
    setCelebre(null);
  }

  function aller(pas: number) {
    setCelebre(null);
    setIndice(false);
    setVu(Math.min(Math.max(0, rang + pas), liste.length - 1));
  }

  if (!exercice) {
    return (
      <div className="attic-parcours nodrag" onPointerDown={(e) => e.stopPropagation()}>
        <NodeResizer minWidth={340} minHeight={260} />
        <div className="attic-parcours-vide">{t("parcours.vide")}</div>
      </div>
    );
  }

  const montreLecon = celebre === exercice.id || (fait && vu !== null);

  return (
    <div className="attic-parcours nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={340} minHeight={260} />

      <div className="attic-parcours-tete">
        <span className={`attic-parcours-chapitre${exercice.epreuve ? " epreuve" : ""}`}>
          {chapitre ? nomChapitre(chapitre.id, en) : ""}
        </span>
        <span className="attic-parcours-avance">{rang + 1} / {liste.length}</span>
        <span className="attic-parcours-titre-gagne">{titre}</span>
        <button className="attic-parcours-btn-outil" title={t("parcours.precedente")} onClick={() => aller(-1)}>‹</button>
        <button className="attic-parcours-btn-outil" title={t("parcours.suivante")} onClick={() => aller(1)}>›</button>
      </div>
      <div className="attic-parcours-jauge"><div style={{ width: `${(b.accomplis / Math.max(1, b.total)) * 100}%` }} /></div>

      <div className="attic-parcours-corps">
        <div className="attic-parcours-nom">
          {fait && <span className="attic-parcours-coche">✓</span>}
          {en ? exercice.titreEn : exercice.titre}
        </div>
        <div className="attic-parcours-enonce">{en ? exercice.enonceEn : exercice.enonce}</div>

        <ul className="attic-parcours-liste">
          {points.map((p, i) => (
            <li key={i} className={p.satisfait ? "ok" : ""}>
              <span className="attic-parcours-puce">{p.satisfait ? "✓" : "·"}</span>
              {en ? p.texteEn : p.texte}
            </li>
          ))}
        </ul>

        {indice && <div className="attic-parcours-indice">{en ? exercice.indiceEn : exercice.indice}</div>}

        {montreLecon && (
          <div className="attic-parcours-lecon">
            <div className="attic-parcours-lecon-tete">{t("parcours.lecon")}</div>
            {en ? exercice.leconEn : exercice.lecon}
          </div>
        )}
      </div>

      <div className="attic-parcours-actions">
        {!indice && !montreLecon && (
          <button className="attic-parcours-btn" onClick={() => setIndice(true)}>{t("parcours.indice")}</button>
        )}
        {fait
          ? <button className="attic-parcours-btn" onClick={refaire}>{t("parcours.refaire")}</button>
          : <button className={`attic-parcours-btn-suite${pret ? "" : " pale"}`} disabled={!pret} onClick={valider}>
              {pret ? t("parcours.valider") : t("parcours.enCours")}
            </button>}
        {(montreLecon || fait) && rang + 1 < liste.length && (
          <button className="attic-parcours-btn-suite" onClick={suivante}>{t("parcours.etapeSuivante")}</button>
        )}
      </div>

      <div className="attic-parcours-pied">
        {b.accomplis} / {b.total} · {t("parcours.epreuves")} {b.epreuvesReussies}/{b.epreuvesTotal}
      </div>
    </div>
  );
}

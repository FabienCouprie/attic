// ui/ArbreRythmiqueVue.tsx — L'arbre rythmique qui se déplie, dessiné au trait.
//
// POURQUOI UNE VUE ET NON UN CHAMP DE TEXTE SEUL. La notation en listes est juste et pénible à
// remplir : compter les parenthèses d'un arbre à trois étages n'apprend rien sur la musique.
// Demandé par Fabien. Le texte reste pourtant la source de vérité, et cette vue l'écrit : un arbre
// venu d'ailleurs se colle toujours dans le réglage, et ce qui est dessiné ici s'y relit.
//
// AU TRAIT, DANS LE TON DU PLAN TECHNIQUE. La première version posait des aplats sépia, orange et
// violet, choisis pour eux-mêmes : dans un thème de bleu de méthode, ils faisaient tache. Un dessin
// industriel se lit à ses filets d'épaisseur constante, à ses hachures et à ses lignes de cote, et
// l'arbre en emprunte le vocabulaire — qui se trouve être aussi le plus lisible. Aucune couleur
// n'est écrite dans ce fichier : les classes vivent dans `atelier.css` et lisent les variables du
// thème, de sorte que la vue suive celui-ci sans qu'on y revienne.
//
// CE QUE LA VUE NE CALCULE PAS. Ni la géométrie, ni les retouches : elles vivent dans
// `audio/arbre-disposition.ts`, avec leurs tests. Ce fichier place des traits et écoute des clics.
// C'est la règle du dépôt depuis qu'un clavier a joué la blanche quand on visait le dièse.

import { useCallback, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";

import {
  ajouterApres, changerPoids, disposerArbre, diviser, etatDe, fusionner,
  mettreEtat, retirer, type Case, type Chemin,
} from "../audio/arbre-disposition";
import { derouler, ecrireArbre, lireArbre, type Mesure } from "../audio/arbre-rythmique";
import { useI18n } from "../i18n";

import type { VueProps } from "./vues";

const HAUTEUR_ETAGE = 26;
const HAUTEUR_BRANCHE = 18;
const HAUTEUR_COTE = 26;
const MARGE = 8;
const L = 1000;
const DIVISIONS = [2, 3, 4, 5, 6, 7];

const memeChemin = (a: Chemin | null, b: Chemin) =>
  !!a && a.length === b.length && a.every((x, i) => x === b[i]);

export function ArbreRythmiqueVue({ id, data }: VueProps) {
  const { t } = useI18n();
  const { setNodes } = useReactFlow();
  const [choisi, setChoisi] = useState<Chemin | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; chemin: Chemin } | null>(null);

  const parametres = (data as { parametres?: Record<string, unknown> }).parametres ?? {};
  const texte = String(parametres["Arbre"] ?? "(4/4 (1 1 1 1))");

  // UN ARBRE ILLISIBLE NE DOIT PAS FAIRE DISPARAÎTRE LA VUE : on retombe sur une mesure vide et
  // l'on dit pourquoi, sans quoi une parenthèse en trop laisserait un nœud muet et inexplicable.
  const { mesures, erreur } = useMemo(() => {
    try {
      const m = lireArbre(texte);
      return { mesures: m.length > 0 ? m : lireArbre("(4/4 (1 1 1 1))"), erreur: null as string | null };
    } catch (e: any) {
      return { mesures: lireArbre("(4/4 (1 1 1 1))"), erreur: String(e?.message ?? e) };
    }
  }, [texte]);

  const ecrire = useCallback((suivant: Mesure[]) => {
    const valeur = ecrireArbre(suivant);
    (data as { onChangerParametre?: (n: string, p: string, v: string | number) => void })
      .onChangerParametre?.(id, "Arbre", valeur);
    // Quand l'application ne fournit pas le rappel — vue isolée —, on écrit dans le nœud
    // directement, sans quoi le dessin reviendrait à son état d'avant la retouche.
    setNodes((nds) => nds.map((n) => n.id === id
      ? { ...n, data: { ...n.data, parametres: { ...(n.data.parametres as object), Arbre: valeur } } }
      : n));
  }, [data, id, setNodes]);

  const disposition = useMemo(() => disposerArbre(mesures), [mesures]);
  const evenements = useMemo(() => derouler(mesures, 120), [mesures]);
  const dureeTotale = evenements.reduce((s, e) => Math.max(s, e.debut + e.duree), 0) || 1;

  const hauteurArbre = disposition.etages * HAUTEUR_ETAGE;
  const hauteur = MARGE * 2 + hauteurArbre + HAUTEUR_COTE + 12;
  const yCote = MARGE + hauteurArbre + 14;

  const agir = (f: (m: readonly Mesure[], c: Chemin) => Mesure[], chemin: Chemin) => {
    ecrire(f(mesures, chemin));
    setMenu(null);
  };

  const surCase = (c: Case, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setChoisi(c.chemin);
    if (e.type === "contextmenu") {
      const boite = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
      setMenu({ x: e.clientX - boite.left, y: e.clientY - boite.top, chemin: c.chemin });
    }
  };

  const noeudChoisi = choisi ? disposition.cases.find((c) => memeChemin(choisi, c.chemin)) : null;
  /** L'état de la branche choisie, ou rien du tout : une division ne sonne pas, donc n'en a pas. */
  const etat = noeudChoisi && noeudChoisi.feuille ? etatDe(noeudChoisi.noeud) : null;
  const etatMenu = menu
    ? (() => {
      const c = disposition.cases.find((x) => memeChemin(menu.chemin, x.chemin));
      return c && c.feuille ? etatDe(c.noeud) : null;
    })()
    : null;

  /** Les groupes irréguliers, pour les annoncer d'un crochet comme on le fait sur une partition. */
  const crochets = useMemo(() => {
    const parGroupe = new Map<number, { debut: number; fin: number; nolet: number }>();
    for (const e of evenements) {
      if (e.nolet <= 0) continue;
      const g = parGroupe.get(e.groupe);
      if (g) { g.fin = Math.max(g.fin, e.debut + e.duree); }
      else parGroupe.set(e.groupe, { debut: e.debut, fin: e.debut + e.duree, nolet: e.nolet });
    }
    return [...parGroupe.values()];
  }, [evenements]);

  return (
    <div className="arbre-rythmique-vue" style={{ position: "relative", padding: 4 }}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>

      <div className="clavier-controles" style={{ gap: 4, flexWrap: "wrap" }}>
        <span className="clavier-nb">{t("arbre.titre")}</span>
        {noeudChoisi ? (
          <>
            {DIVISIONS.map((n) => (
              <button key={n} title={t("arbre.diviser")}
                onClick={() => agir((m, c) => diviser(m, c, n), noeudChoisi.chemin)}>÷{n}</button>
            ))}
            <button title={t("arbre.fusionner")} onClick={() => agir(fusionner, noeudChoisi.chemin)}>⊟</button>
            <button title={t("arbre.poids.plus")} onClick={() => agir((m, c) => changerPoids(m, c, 1), noeudChoisi.chemin)}>＋</button>
            <button title={t("arbre.poids.moins")} onClick={() => agir((m, c) => changerPoids(m, c, -1), noeudChoisi.chemin)}>－</button>
            {/* LES TROIS ÉTATS SE MONTRENT, ILS NE SE DEVINENT PAS. Ils avaient l'air de trois
                choix, alors que « note » est l'état NEUTRE : celui de toute branche qui n'est ni
                muette ni liée. Rien n'indiquait où en était la branche choisie, et le bouton
                « note » ne faisait rien la moitié du temps. Il est marqué quand il s'applique, et
                éteint sur une division, qui n'a pas d'état puisqu'elle ne sonne pas. */}
            <button className={etat === "note" ? "arbre-etat-actif" : ""} disabled={etat === null}
              title={t(etat === null ? "arbre.note.division" : "arbre.note")}
              onClick={() => agir((m, c) => mettreEtat(m, c, "note"), noeudChoisi.chemin)}>♪</button>
            <button className={etat === "silence" ? "arbre-etat-actif" : ""}
              title={t(etat === null ? "arbre.silence.division" : "arbre.silence")}
              onClick={() => agir((m, c) => mettreEtat(m, c, "silence"), noeudChoisi.chemin)}>𝄽</button>
            <button className={etat === "liee" ? "arbre-etat-actif" : ""}
              title={t(etat === null ? "arbre.liee.division" : "arbre.liee")}
              onClick={() => agir((m, c) => mettreEtat(m, c, "liee"), noeudChoisi.chemin)}>⌣</button>
            <button title={t("arbre.ajouter")} onClick={() => agir(ajouterApres, noeudChoisi.chemin)}>＋▸</button>
            <button title={t("arbre.retirer")} onClick={() => agir(retirer, noeudChoisi.chemin)}>✕</button>
          </>
        ) : <span className="clavier-nb">{t("arbre.choisir")}</span>}
      </div>

      {erreur && <div className="arbre-erreur">{erreur}</div>}

      <svg className="arbre-svg" viewBox={`0 0 ${L} ${hauteur}`} height={hauteur}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => { setMenu(null); setChoisi(null); }}>
        <defs>
          {/* Les hachures d'un silence : la manière du dessin technique de dire qu'une aire est
              d'une autre nature, plutôt qu'un aplat qui attirerait l'œil sur le vide. */}
          <pattern id={`hachures-${id}`} width="6" height="6" patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="arbre-hachure" />
          </pattern>
        </defs>

        <rect className="arbre-fond" x="0" y="0" width={L} height={hauteur} />

        {/* Une ligne par étage : le repère sur lequel les branches se posent. */}
        {Array.from({ length: disposition.etages }, (_, e) => (
          <line key={`g${e}`} className="arbre-grille"
            x1="0" y1={MARGE + e * HAUTEUR_ETAGE + HAUTEUR_BRANCHE} x2={L}
            y2={MARGE + e * HAUTEUR_ETAGE + HAUTEUR_BRANCHE} />
        ))}

        {disposition.mesures.map((m) => (
          <g key={`m${m.rang}`}>
            <line className="arbre-barre" x1={m.x * L} y1={MARGE - 3} x2={m.x * L} y2={yCote + 10} />
            <text className="arbre-metrique" x={m.x * L + 4} y={hauteur - 2}>
              {m.metrique[0]}/{m.metrique[1]}
            </text>
          </g>
        ))}
        <line className="arbre-barre" x1={L} y1={MARGE - 3} x2={L} y2={yCote + 10} />

        {/* Le dépliage : un trait descend de chaque branche divisée vers le milieu de ses parts. */}
        {disposition.cases.filter((c) => !c.feuille).map((c) => {
          const y = MARGE + c.profondeur * HAUTEUR_ETAGE + HAUTEUR_BRANCHE;
          const enfants = disposition.cases.filter((e) =>
            e.profondeur === c.profondeur + 1 && e.x >= c.x - 1e-9 && e.x < c.x + c.largeur - 1e-9);
          return (
            <g key={`a${c.chemin.join("-")}`}>
              <line className="arbre-attache" x1={(c.x + c.largeur / 2) * L} y1={y}
                x2={(c.x + c.largeur / 2) * L} y2={y + (HAUTEUR_ETAGE - HAUTEUR_BRANCHE) / 2} />
              {enfants.map((e) => (
                <line key={`al${e.chemin.join("-")}`} className="arbre-attache"
                  x1={(c.x + c.largeur / 2) * L} y1={y + (HAUTEUR_ETAGE - HAUTEUR_BRANCHE) / 2}
                  x2={(e.x + e.largeur / 2) * L} y2={y + HAUTEUR_ETAGE - HAUTEUR_BRANCHE} />
              ))}
            </g>
          );
        })}

        {disposition.cases.map((c) => {
          const y = MARGE + c.profondeur * HAUTEUR_ETAGE;
          const etat = etatDe(c.noeud);
          const actif = memeChemin(choisi, c.chemin);
          const largeur = Math.max(2, c.largeur * L - 2);
          const classes = ["arbre-branche"];
          if (!c.feuille) classes.push("est-divisee");
          if (actif) classes.push("est-choisie");
          return (
            <g key={c.chemin.join("-")}
              onClick={(e) => surCase(c, e)} onContextMenu={(e) => surCase(c, e)}>
              {etat === "silence" && (
                <rect x={c.x * L + 1} y={y} width={largeur} height={HAUTEUR_BRANCHE}
                  fill={`url(#hachures-${id})`} pointerEvents="none" />
              )}
              <rect className={classes.join(" ")} x={c.x * L + 1} y={y}
                width={largeur} height={HAUTEUR_BRANCHE} rx={1} />
              {largeur > 20 && (
                <text className="arbre-etiquette" x={c.x * L + largeur / 2 + 1} y={y + HAUTEUR_BRANCHE / 2}
                  textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                  {etat === "liee" ? `⌣${c.noeud.valeur}` : etat === "silence" ? "" : c.noeud.valeur}
                </text>
              )}
            </g>
          );
        })}

        {/* LA LIGNE DE COTE : ce qu'on entendra, mesuré comme sur un plan. Un filet continu porte
            les extrémités de chaque événement ; les notes s'y marquent en plein, les silences en
            tireté. */}
        <line className="arbre-cote" x1="0" y1={yCote} x2={L} y2={yCote} />
        {evenements.map((e, i) => {
          const x1 = (e.debut / dureeTotale) * L;
          const x2 = ((e.debut + e.duree) / dureeTotale) * L;
          return (
            <g key={`c${i}`}>
              <line className="arbre-cote-tick" x1={x1} y1={yCote - 4} x2={x1} y2={yCote + 4} />
              <line className={e.silence ? "arbre-cote-silence" : "arbre-cote-note"}
                x1={x1 + 1} y1={yCote} x2={Math.max(x1 + 1, x2 - 1)} y2={yCote} />
            </g>
          );
        })}
        <line className="arbre-cote-tick" x1={L} y1={yCote - 4} x2={L} y2={yCote + 4} />

        {crochets.map((g, i) => {
          const x1 = (g.debut / dureeTotale) * L;
          const x2 = (g.fin / dureeTotale) * L;
          const y = yCote - 9;
          return (
            <g key={`n${i}`}>
              <path className="arbre-crochet" d={`M${x1} ${y + 4} L${x1} ${y} L${x2} ${y} L${x2} ${y + 4}`} />
              <text className="arbre-crochet-nombre" x={(x1 + x2) / 2} y={y - 1} textAnchor="middle">
                {g.nolet}
              </text>
            </g>
          );
        })}
      </svg>

      {menu && (
        <div className="arbre-menu" style={{ left: menu.x, top: menu.y }}>
          {DIVISIONS.map((n) => (
            <button key={n} onClick={() => agir((m, c) => diviser(m, c, n), menu.chemin)}>
              {t("arbre.diviser.en")} {n}
            </button>
          ))}
          <button className="arbre-menu-coupure" onClick={() => agir(fusionner, menu.chemin)}>{t("arbre.fusionner")}</button>
          <button className={etatMenu === "note" ? "arbre-etat-actif" : ""} disabled={etatMenu === null}
            onClick={() => agir((m, c) => mettreEtat(m, c, "note"), menu.chemin)}>{t("arbre.note")}</button>
          <button className={etatMenu === "silence" ? "arbre-etat-actif" : ""}
            onClick={() => agir((m, c) => mettreEtat(m, c, "silence"), menu.chemin)}>{t("arbre.silence")}</button>
          <button className={etatMenu === "liee" ? "arbre-etat-actif" : ""}
            onClick={() => agir((m, c) => mettreEtat(m, c, "liee"), menu.chemin)}>{t("arbre.liee")}</button>
          <button className="arbre-menu-coupure" onClick={() => agir(ajouterApres, menu.chemin)}>{t("arbre.ajouter")}</button>
          <button onClick={() => agir(retirer, menu.chemin)}>{t("arbre.retirer")}</button>
        </div>
      )}
    </div>
  );
}

// ui/RouleauSequence.tsx — Une séquence, enfin visible sans passer par la gravure.
//
// CE QU'ELLE MONTRE QUE LA PORTÉE NE MONTRE PAS. Le rouleau a un axe de hauteurs CONTINU : une note
// à 60,5 s'y pose entre deux rangées et chevauche les deux. Sur une portée, la même note est une
// tête posée sur la ligne du do avec un signe à côté, et l'écart se lit au lieu de se voir. Comme
// c'est le microton qui a justifié le flux de séquences — voir `audio/sequence.ts` —, il fallait un
// affichage qui ne le rende pas à un demi-ton.
//
// ELLE MONTRE AUSSI TROIS CHOSES QUE LA GRAVURE TAIT : le recouvrement réel des voix dans le temps,
// que des portées séparées ne laissent pas comparer d'un regard ; la nuance de chaque note, qui
// n'est écrite nulle part ailleurs dans ce dépôt ; et le silence final, cette durée voulue qui
// dépasse la dernière note et dont l'absence a déjà raccourci des rendus.
//
// AUCUNE GÉOMÉTRIE ICI. Elle vit dans `ui/rouleau-calcul.ts`, avec ses tests : c'est la règle du
// dépôt depuis qu'un clavier a joué la blanche quand on visait le dièse.
//
// AUCUNE COULEUR ICI NON PLUS. Les classes vivent dans `atelier.css` et lisent les variables du
// thème, comme celles de l'arbre rythmique.
//
// LES LIBELLÉS SONT EN HTML, HORS DU DESSIN, et ce n'est pas un détail de rangement. Le dessin
// s'étire pour remplir la largeur du nœud, quelle qu'elle soit, ce qui veut dire une échelle
// différente sur les deux axes ; un texte posé dedans serait écrasé en largeur. Les règles sont donc
// deux bandes de `div` placées en pourcentage, et le SVG ne porte que des traits, dont l'épaisseur
// est tenue constante par `vector-effect`.

import { useMemo } from "react";

import { estSequence, type Sequence } from "../audio/sequence";
import { useI18n } from "../i18n";

import { disposerRouleau, L_ROULEAU, NUANCES } from "./rouleau-calcul";
import type { VueProps } from "./vues";

/** Le carré du document : les fractions du calcul sont multipliées par lui sur les deux axes. */
const C = L_ROULEAU;

/** Combien de couleurs de voix `atelier.css` déclare ; au-delà, on recommence la série. */
const COULEURS_VOIX = 6;

export function RouleauSequence({ id, data }: VueProps) {
  const { t } = useI18n();
  const recue = (data as unknown as { _rouleauSequence?: Sequence })._rouleauSequence;
  // LE CHAMP EST TRAVERSÉ SANS TYPE, et la vue existe avant toute exécution : `estSequence` répond
  // d'un seul coup aux deux cas, l'absence et la forme. Un nœud qu'on vient de poser n'a rien reçu,
  // et dessiner une géométrie calculée sur `undefined` viderait le nœud sans rien expliquer.
  const sequence = estSequence(recue) ? recue : null;
  const r = useMemo(() => (sequence ? disposerRouleau(sequence) : null), [sequence]);

  if (!r) {
    return (
      <div className="rouleau">
        <div className="rouleau-entete"><span className="rouleau-titre">{t("rouleau.titre")}</span></div>
        <div className="rouleau-vide">{t("rouleau.vide")}</div>
      </div>
    );
  }

  const notes = r.barres.length + r.laissees;
  return (
    <div className="rouleau">
      <div className="rouleau-entete">
        <span className="rouleau-titre">{sequence?.titre || t("rouleau.titre")}</span>
        <span className="rouleau-chiffre">{notes} {t("rouleau.notes")}</span>
        <span className="rouleau-chiffre">{r.duree.toFixed(2)} s</span>
        {sequence?.tempo ? <span className="rouleau-chiffre">{Math.round(sequence.tempo)} {t("rouleau.tempo")}</span> : null}
        {r.microtons > 0 && (
          <span className="rouleau-chiffre rouleau-microtons">{r.microtons} {t("rouleau.microtons")}</span>
        )}
      </div>

      <div className="rouleau-corps">
        {/* La règle des hauteurs : un nom par do, et rien entre eux — douze étiquettes par octave
            ne se liraient pas, et le damier des touches noires dit le reste. */}
        <div className="rouleau-regle-hauteurs">
          {r.rangees.filter((x) => x.etiquette).map((x) => (
            <span key={x.note} className="rouleau-nom-hauteur"
              style={{ top: `${(x.y + r.epaisseur / 2) * 100}%` }}>{x.etiquette}</span>
          ))}
        </div>

        <div className="rouleau-dessin">
          <svg className="rouleau-svg" viewBox={`0 0 ${C} ${C}`} preserveAspectRatio="none">
            <defs>
              {/* Les hachures du silence final, comme celles d'un silence sur l'arbre rythmique :
                  la manière du dessin technique de dire qu'une aire est d'une autre nature. */}
              <pattern id={`rouleau-hachures-${id}`} width="8" height="8"
                patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="8" className="rouleau-hachure" />
              </pattern>
            </defs>

            <rect className="rouleau-fond" x="0" y="0" width={C} height={C} />

            {/* Le damier des touches noires : c'est lui qui fait qu'un rouleau se lit sans étiquettes. */}
            {r.rangees.filter((x) => x.noire).map((x) => (
              <rect key={`n${x.note}`} className="rouleau-rangee-noire"
                x="0" y={x.y * C} width={C} height={r.epaisseur * C} />
            ))}

            {/* Un filet à chaque do : le repère d'octave, d'où l'on compte les autres rangées. */}
            {r.rangees.filter((x) => x.etiquette).map((x) => (
              <line key={`o${x.note}`} className="rouleau-octave"
                x1="0" y1={(x.y + r.epaisseur) * C} x2={C} y2={(x.y + r.epaisseur) * C} />
            ))}

            {r.graduations.map((g) => (
              <line key={`t${g.secondes}`} className="rouleau-graduation"
                x1={g.x * C} y1="0" x2={g.x * C} y2={C} />
            ))}

            {/* LE SILENCE FINAL, hachuré : la séquence dure plus longtemps que sa dernière note, et
                c'est une durée voulue qu'un rendu doit respecter. */}
            {r.xFinNotes < 1 - 1e-6 && (
              <rect className="rouleau-queue" x={r.xFinNotes * C} y="0"
                width={(1 - r.xFinNotes) * C} height={C} fill={`url(#rouleau-hachures-${id})`} />
            )}

            {r.barres.map((b, i) => (
              <rect key={i} x={b.x * C} y={b.y * C}
                width={b.largeur * C} height={r.epaisseur * C}
                className={[
                  "rouleau-note",
                  `voix-${b.voix % COULEURS_VOIX}`,
                  `nuance-${b.nuance}`,
                  b.microton ? "est-microton" : "",
                ].filter(Boolean).join(" ")}>
                <title>{`${b.nom} · ${b.debut.toFixed(3)}–${b.fin.toFixed(3)} s`}</title>
              </rect>
            ))}
          </svg>
        </div>
      </div>

      {/* La règle du temps, sous le dessin et alignée sur lui. LES DEUX BOUTS SONT ANCRÉS PAR LEUR
          BORD, non par leur milieu : centrées, la première graduation débordait à gauche et la
          dernière serait tombée hors du cadre. Celles du milieu restent centrées sur leur trait. */}
      <div className="rouleau-regle-temps">
        {r.graduations.map((g) => (
          <span key={g.secondes} className="rouleau-nom-temps"
            style={{ left: `${g.x * 100}%`, transform: `translateX(${g.x > 0.98 ? -100 : g.x < 0.02 ? 0 : -50}%)` }}>
            {g.etiquette}
          </span>
        ))}
      </div>

      <div className="rouleau-pied">
        {r.voix.map((v) => (
          <span key={v.numero} className={`rouleau-voix voix-${v.numero % COULEURS_VOIX}`}>
            <i className="rouleau-pastille" />
            {v.nom || `${t("rouleau.voix")} ${v.numero + 1}`}
            <b>{v.notes}</b>
          </span>
        ))}
        {r.laissees > 0 && (
          <span className="rouleau-avertissement">{r.laissees} {t("rouleau.laissees")}</span>
        )}
        {r.xFinNotes < 1 - 1e-6 && (
          <span className="rouleau-chiffre">
            {t("rouleau.silence")} {(r.duree - r.finNotes).toFixed(2)} s
          </span>
        )}
      </div>
    </div>
  );
}

/** Le nombre de bandes de nuance, réexporté pour la feuille de style qui en déclare autant. */
export { NUANCES };

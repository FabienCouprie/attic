// ui/journal-de-session.ts — Le travail en cours survit à une fermeture, voulue ou non.
//
// ═══ POURQUOI CE MODULE, ET LA MESURE QUI L'A OUVERT ═══
//
// Point 9 d'une revue critique du dépôt, le 2026-10-25 : « Un plantage sans fichier ouvert perd tout
// depuis la dernière sauvegarde manuelle. La sauvegarde automatique ne tourne que si un fichier de
// projet est ouvert. »
//
// VÉRIFIÉ, ET C'EST PIRE QUE CELA. Quatre mesures :
//
//   · `decisionSauvegardeAuto` rend « sans-fichier » dès que le chemin courant est absent : sans
//     fichier ouvert, la sauvegarde automatique ne fait rien, et c'est voulu — elle écrit un fichier.
//   · `memoriserEncours()`, qui écrit l'en-cours relu au démarrage, n'était appelé QUE par le bouton
//     « Recharger ».
//   · il n'y avait ni `beforeunload`, ni `pagehide`, ni minuteur ;
//   · et côté Electron, `window-all-closed` appelle `app.quit()`, rien de plus.
//
// Donc ce n'était pas seulement un plantage : FERMER LA FENÊTRE PROPREMENT PERDAIT AUSSI TOUT. Une
// heure de travail sans fichier ouvert partait entière.
//
// CE QUI MANQUAIT N'ÉTAIT PAS LA RESTAURATION. `attic-encours` est relu au démarrage et le graphe
// revient : tout le mécanisme était là, et personne ne l'alimentait.
//
// ═══ LA RÈGLE QUI PROTÈGE LA SESSION, ET ELLE EST LA RAISON DE CE MODULE ═══
//
// LA RESTAURATION EST ASYNCHRONE. `App.tsx` lit `attic-encours` dans un effet `async` : au montage,
// le graphe est VIDE, et il se remplit ensuite. Un journal qui écrirait à chaque changement du
// graphe écrirait donc `{ nodes: [] }` AVANT que la restauration ait eu lieu — c'est-à-dire qu'il
// DÉTRUIRAIT la session qu'il est censé sauver, et silencieusement.
//
// Le journal ne s'arme donc que sur un graphe NON VIDE. Conséquences, écrites pour qu'on ne les
// redécouvre pas :
//
//   · un démarrage sur canevas vide n'écrit rien — il n'y a rien à perdre ;
//   · une restauration qui remplit le graphe l'arme, et tout ce qui suit est journalisé ;
//   · une restauration qui ÉCHOUE ne l'arme pas, et l'en-cours abîmé reste intact plutôt que d'être
//     écrasé par du vide ;
//   · vider le canevas une fois le journal armé s'écrit, lui : c'est un geste, pas un démarrage.
//
// ═══ ET UN DÉLAI, PARCE QU'UNE ÉCRITURE N'EST PAS GRATUITE ═══
//
// Écrire l'en-cours demande de parcourir le graphe et de le sérialiser. Déplacer un nœud produit
// une dizaine de changements par seconde ; écrire à chacun serait payer dix fois pour un seul geste.
// On attend donc que le geste CESSE. Ce qui reste en jeu est au plus le délai, et la fermeture le
// vide de toute façon.

/** Ce que le journal sait faire. */
export interface JournalDeSession {
  /**
   * Déclare qu'on peut écrire. Sans cela, `noter` ne fait rien.
   *
   * C'est le garde-fou de la restauration asynchrone : voir l'en-tête.
   */
  armer(): void;
  estArme(): boolean;
  /** Le graphe a changé. Programme une écriture quand les changements cessent. */
  noter(): void;
  /** Écrit tout de suite, s'il y a quelque chose en attente. Ce que la fermeture appelle. */
  vider(): void;
  /** Oublie ce qui attendait, sans écrire. Ce qu'un démontage appelle. */
  annuler(): void;
  enAttente(): boolean;
  /** Combien d'écritures ont eu lieu. Pour les cas, et pour un relevé. */
  ecritures(): number;
  /** Combien ont été ÉCARTÉES pour ne pas écraser ce qu'un autre avait écrit. */
  ecartees(): number;
}

export interface ReglagesJournal {
  /** Écrit l'en-cours. Rend `false` si l'écriture a échoué — un quota dépassé, par exemple. */
  ecrire: () => boolean;
  /**
   * Quelqu'un d'AUTRE a-t-il écrit l'en-cours depuis notre dernier changement ? `depuis` est
   * l'instant de ce changement.
   *
   * ═══ POURQUOI CE GARDE EXISTE, ET IL VIENT D'UNE CI ROUGE ═══
   *
   * Ce journal a cassé un cas de `pont-electron-vivant.spec.ts` au premier passage, et le mécanisme
   * est réel, pas un artefact de test. Ce cas-là POSE un en-cours depuis la page, puis recharge :
   *
   *     localStorage.setItem("attic-encours", …)   ← la semence
   *     page.reload()                              ← `pagehide` part
   *
   * Le vidage de fermeture écrivait alors le graphe COURANT par-dessus la semence, et le nœud
   * attendu n'arrivait jamais. Le même mécanisme vaut dans l'application : une SECONDE FENÊTRE —
   * `nouvelle-fenetre` existe — écraserait la session de la première en se fermant.
   *
   * LA RÈGLE EST DONC : on n'écrase que ce qu'on a écrit soi-même. Un en-cours dont la date est
   * postérieure à notre dernier changement vient d'ailleurs ; un en-cours SANS date aussi, puisque
   * nous en posons toujours une.
   */
  ecritPourAutrui?: (depuis: number) => boolean;
  /**
   * Combien de millisecondes de calme avant d'écrire.
   *
   * CE QU'UNE ÉCRITURE COÛTE EST MESURÉ, ET LE SEUIL EST UN CHOIX — les deux ne doivent pas être
   * confondus. Mesuré dans l'application : **323 octets et 0,005 ms** pour sérialiser et stocker un
   * graphe d'un nœud ; le plus gros graphe livré fait 14 Ko pour 17 nœuds, donc l'ordre de grandeur
   * reste la fraction de milliseconde. Le coût n'est donc PAS ce qui commande le délai.
   *
   * CE QUI LE COMMANDE est qu'un geste continu — un nœud qu'on déplace — produit une dizaine de
   * changements par seconde, et qu'on veut une écriture par geste et non dix. 1500 ms est le temps
   * au bout duquel on tient un geste pour fini : c'est un jugement, assumé comme tel, et ce qui
   * reste en jeu est au plus ce délai puisque la fermeture vide ce qui attendait.
   */
  delaiMs?: number;
  /** Le minuteur, injectable pour que les cas ne dépendent pas de l'horloge. */
  differer?: (f: () => void, ms: number) => unknown;
  annulerDifferé?: (jeton: unknown) => void;
}

export const DELAI_JOURNAL_MS = 1500;

export function creerJournalDeSession(r: ReglagesJournal): JournalDeSession {
  const delai = r.delaiMs ?? DELAI_JOURNAL_MS;
  const differer = r.differer ?? ((f, ms) => setTimeout(f, ms));
  const annulerDifferé = r.annulerDifferé ?? ((j) => clearTimeout(j as ReturnType<typeof setTimeout>));

  let arme = false;
  let jeton: unknown = null;
  let compte = 0;
  let ecartes = 0;
  /** L'instant de notre dernier changement, pour ne pas écraser ce qu'un autre a écrit après. */
  let dernierNote = 0;

  const ecrireMaintenant = () => {
    jeton = null;
    // ON N'ÉCRASE QUE CE QU'ON A ÉCRIT SOI-MÊME : voir `ecritPourAutrui`.
    if (r.ecritPourAutrui?.(dernierNote)) { ecartes += 1; return; }
    if (r.ecrire()) compte += 1;
  };

  return {
    armer() { arme = true; },
    estArme: () => arme,

    noter() {
      if (!arme) return;
      dernierNote = Date.now();
      // ON REPOUSSE L'ÉCHÉANCE à chaque changement : c'est ce qui fait qu'un geste continu — un
      // nœud qu'on déplace — n'écrit qu'une fois, à la fin.
      if (jeton !== null) annulerDifferé(jeton);
      jeton = differer(ecrireMaintenant, delai);
    },

    vider() {
      if (jeton === null) return;
      annulerDifferé(jeton);
      ecrireMaintenant();
    },

    annuler() {
      if (jeton === null) return;
      annulerDifferé(jeton);
      jeton = null;
    },

    enAttente: () => jeton !== null,
    ecritures: () => compte,
    ecartees: () => ecartes,
  };
}

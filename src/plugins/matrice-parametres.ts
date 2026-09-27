// plugins/matrice-parametres.ts — Une ligne par paramètre, des centaines d'événements d'un coup.
//
// CE QUE CE NŒUD REND EST UNE PARTITION, non du son : elle se branche sur le nœud Csound, qui la
// joue avec un orchestre. C'est la raison pour laquelle il est rangé avec les autres nœuds Csound
// plutôt que dans la génération, comme la partition aléatoire avant lui.
//
// LE CALCUL EST DANS `audio/matrice-parametres.ts`, éprouvé ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { estCourbe, reechantillonner } from "../audio/courbe";
import {
  combienDEvenements, construireMatrice, deployer, lireChamp, matriceVersPartition,
  type Colonne,
} from "../audio/matrice-parametres";

const en = () => langueCourante() === "en";

/** Les champs libres offerts, de p4 à p9. */
const RANGS = [4, 5, 6, 7, 8, 9];

export const fiches: FicheAudio[] = ([
  {
    id: "matrice-parametres",
    nom: "Matrice de paramètres", nomEn: "Parameter Matrix",
    univers: "Autres", famille: "Csound wrapper",
    resume: "Décrit une synthèse paramètre par paramètre plutôt qu'événement par événement, et rend la partition Csound.",
    resumeEn: "Describes a synthesis parameter by parameter rather than event by event, and returns the Csound score.",
    notice: "Décrit une synthèse paramètre par paramètre et rend la partition Csound correspondante.\n\nUne synthèse additive de deux cents partiels ne s'écrit pas événement par événement. On écrit une ligne pour les fréquences, une pour les amplitudes, une pour les durées, et chacune vaut pour tous les événements à la fois. C'est la structure que l'on trouve dans OMChroma sous le nom de class-array.\n\nUn champ s'écrit de trois façons. Un nombre seul vaut pour tous les événements. Une suite de nombres séparés par des espaces donne les premières valeurs, et la dernière se répète pour les événements restants ; c'est une répétition et non une boucle, une liste bouclée fabriquant une périodicité que personne n'a demandée et qui s'entendrait comme un rythme. Deux nombres séparés par deux points décrivent une rampe droite du premier au second, répartie sur les événements, bornes comprises.\n\n« Événements » fixe leur nombre. À zéro, il est déduit : c'est la longueur de la plus longue suite écrite. Une rampe ne compte pas, s'étirant à toute longueur, et une matrice de constantes seules donne un unique événement.\n\n« Instrument » est le numéro écrit en tête de chaque ligne, p1.\n\n« Départs » et « Durées » sont p2 et p3, que Csound attend à cette place et interprète lui-même. Ils s'écrivent comme les autres champs.\n\n« p4 » à « p9 » sont les champs libres, dont le sens dépend de l'orchestre qui les lit. Un champ laissé vide n'est pas écrit, et les suivants ne se décalent pas pour autant : un champ vide entre deux champs remplis laisse un trou que l'orchestre lirait de travers, donc les rangs écrits sont dits dans l'analyse.\n\n« Courbe » reçoit une ligne qui remplace un champ, choisi par « Champ piloté ». Elle est lue en autant de points qu'il y a d'événements, puis étalée entre « Minimum » et « Maximum ».\n\n« Décimales » fixe la précision des nombres écrits.\n\nLa sortie « Partition » rend le texte, qui se branche sur le nœud Csound. La sortie « Analyse » donne le nombre d'événements, les rangs écrits, et pour chacun ses premières et dernières valeurs.\n\nLe message donne le nombre d'événements, le nombre de champs et la durée couverte.",
    noticeEn: "Describes a synthesis parameter by parameter and returns the corresponding Csound score.\n\nAn additive synthesis of two hundred partials is not written event by event. One writes a line for the frequencies, one for the amplitudes, one for the durations, and each holds for every event at once. This is the structure found in OMChroma under the name class-array.\n\nA field is written in three ways. A single number holds for every event. A series of numbers separated by spaces gives the first values, and the last repeats for the remaining events; this is a repetition and not a loop, a looped list manufacturing a periodicity nobody asked for and which would be heard as a rhythm. Two numbers separated by a colon describe a straight ramp from the first to the second, spread over the events, bounds included.\n\n« Events » sets their number. At zero it is deduced: it is the length of the longest series written. A ramp does not count, stretching to any length, and a matrix of constants alone gives a single event.\n\n« Instrument » is the number written at the head of each line, p1.\n\n« Onsets » and « Lengths » are p2 and p3, which Csound expects at that place and interprets itself. They are written like the other fields.\n\n« p4 » to « p9 » are the free fields, whose meaning depends on the orchestra that reads them. A field left empty is not written, and the following ones do not shift for that: an empty field between two filled ones would leave a hole the orchestra would misread, so the ranks written are stated in the analysis.\n\n« Curve » receives a line that replaces one field, chosen by « Driven field ». It is read at as many points as there are events, then spread between « Minimum » and « Maximum ».\n\n« Decimals » sets the precision of the numbers written.\n\nThe « Score » output returns the text, which connects to the Csound node. The « Analysis » output gives the number of events, the ranks written, and for each its first and last values.\n\nThe message gives the number of events, the number of fields and the length covered.",
    entrees: [{ nom: "Courbe", nomEn: "Curve", type: "courbe", requis: false }],
    sorties: [
      { nom: "Partition", nomEn: "Score", type: "texte" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Événements", nomEn: "Events", plage: [0, 2000], pas: 1, defaut: 0,
        doc: "Combien d'événements. À zéro, la longueur de la plus longue suite écrite.",
        docEn: "How many events. At zero, the length of the longest series written." },
      { nom: "Instrument", nomEn: "Instrument", plage: [1, 99], pas: 1, defaut: 1,
        doc: "Le numéro écrit en tête de chaque ligne, p1.",
        docEn: "The number written at the head of each line, p1." },
      { nom: "Départs", nomEn: "Onsets", type: "texte", defaut: "0:2", defautEn: "0:2",
        doc: "Les instants, p2. Un nombre, une suite, ou une rampe écrite « de:à ».",
        docEn: "The instants, p2. A number, a series, or a ramp written « from:to »." },
      { nom: "Durées", nomEn: "Lengths", type: "texte", defaut: "0.5", defautEn: "0.5",
        doc: "Les durées, p3.", docEn: "The lengths, p3." },
      ...RANGS.map((r, i) => ({
        nom: `p${r}`, nomEn: `p${r}`, type: "texte" as const,
        defaut: i === 0 ? "0.3" : i === 1 ? "200:2000" : "",
        defautEn: i === 0 ? "0.3" : i === 1 ? "200:2000" : "",
        doc: `Le champ p${r}, dont le sens dépend de l'orchestre qui le lit. Vide, il n'est pas écrit.`,
        docEn: `The p${r} field, whose meaning depends on the orchestra that reads it. Empty, it is not written.`,
      })),
      { nom: "Champ piloté", nomEn: "Driven field", type: "choix",
        options: ["Aucun", ...RANGS.map((r) => `p${r}`)],
        optionsEn: ["None", ...RANGS.map((r) => `p${r}`)],
        optionIds: ["aucun", ...RANGS.map((r) => String(r))],
        defaut: "Aucun", defautEn: "None",
        doc: "Le champ que la courbe branchée remplace.",
        docEn: "The field the connected curve replaces." },
      { nom: "Minimum", nomEn: "Minimum", plage: [-10000, 10000], pas: 0.1, defaut: 0,
        doc: "La valeur que le plus bas de la courbe prend.",
        docEn: "The value the lowest point of the curve takes." },
      { nom: "Maximum", nomEn: "Maximum", plage: [-10000, 10000], pas: 0.1, defaut: 1,
        doc: "La valeur que le plus haut de la courbe prend.",
        docEn: "The value the highest point of the curve takes." },
      { nom: "Décimales", nomEn: "Decimals", plage: [0, 6], pas: 1, defaut: 4,
        doc: "La précision des nombres écrits.", docEn: "The precision of the numbers written." },
    ],
    async executer(ctx: any) {
      const depart = lireChamp(ctx.paramTexte("Départs", "0:2"));
      const duree = lireChamp(ctx.paramTexte("Durées", "0.5"));
      const libres = RANGS
        .map((rang) => ({ rang, champ: lireChamp(ctx.paramTexte(`p${rang}`, "")) }))
        .filter((c): c is { rang: number; champ: NonNullable<ReturnType<typeof lireChamp>> } => c.champ !== null);

      const demande = Math.round(ctx.paramNombre("Événements", 0));
      const combien = demande > 0
        ? demande
        : combienDEvenements([depart, duree, ...libres.map((c) => c.champ)]);
      if (combien <= 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en()
            ? "No event: write a series somewhere, or set their number."
            : "Aucun événement : écrire une suite quelque part, ou en fixer le nombre.",
        };
      }

      const colonnes: Colonne[] = libres.map((c) => ({ rang: c.rang, nom: `p${c.rang}`, champ: c.champ }));

      // LA COURBE REMPLACE UN CHAMP, elle ne s'y ajoute pas : deux valeurs pour un même p-field ne
      // voudraient rien dire, et laisser la courbe perdre contre un texte écrit serait pire, celui
      // qui la branche l'ayant fait exprès.
      const courbe = ctx.entree(0);
      const pilote = ctx.paramTexte("Champ piloté", "aucun");
      let deLaCourbe: number[] | null = null;
      if (estCourbe(courbe) && pilote !== "aucun") {
        const rang = Number(pilote);
        const points = Array.from(reechantillonner(courbe, combien));
        const bas = Math.min(...points), haut = Math.max(...points);
        const mini = ctx.paramNombre("Minimum", 0), maxi = ctx.paramNombre("Maximum", 1);
        deLaCourbe = points.map((p) =>
          haut - bas < 1e-12 ? (mini + maxi) / 2 : mini + ((p - bas) / (haut - bas)) * (maxi - mini));
        const place = colonnes.findIndex((c) => c.rang === rang);
        const remplacant: Colonne = { rang, nom: `p${rang}`, champ: { forme: "liste", valeurs: deLaCourbe } };
        if (place >= 0) colonnes[place] = remplacant;
        else colonnes.push(remplacant);
      }

      const matrice = construireMatrice(colonnes, combien);
      const debuts = depart ? deployer(depart, combien) : new Array(combien).fill(0);
      const durees = duree ? deployer(duree, combien) : new Array(combien).fill(1);
      const decimales = Math.round(ctx.paramNombre("Décimales", 4));
      const instrument = Math.round(ctx.paramNombre("Instrument", 1));

      const fin = Math.max(...debuts.map((d, i) => d + durees[i]), 0);
      const partition = matriceVersPartition(debuts, durees, matrice, {
        instrument, decimales,
        entete: [
          `${combien} ${en() ? "events" : "événements"} · ${matrice.rangs.length} ${en() ? "fields" : "champs"} · ${fin.toFixed(3)} s`,
          `p1 ${en() ? "instrument" : "instrument"} · p2 ${en() ? "onset" : "départ"} · p3 ${en() ? "length" : "durée"}`
            + (matrice.rangs.length > 0 ? ` · ${matrice.rangs.map((r) => `p${r}`).join(" ")}` : ""),
        ],
      });

      const bornes = (v: readonly number[]) => v.length === 0
        ? "-"
        : `${v[0].toFixed(3)} … ${v[v.length - 1].toFixed(3)}`;
      const rangPilote = deLaCourbe ? Number(pilote) : NaN;
      const lignes = matrice.rangs.map((rang, k) => {
        const colonne = matrice.lignes.map((l) => l[k]);
        const marque = rang === rangPilote ? `  ${en() ? "(curve)" : "(courbe)"}` : "";
        return `  p${rang}  ${bornes(colonne)}${marque}`;
      });
      const analyse = [
        `${combien} ${en() ? "events" : "événements"} · i${instrument} · ${fin.toFixed(3)} s`,
        "",
        `  p2 ${bornes(debuts)}`,
        `  p3 ${bornes(durees)}`,
        ...lignes,
        "",
        deLaCourbe
          ? `${en() ? "curve drives" : "la courbe pilote"} p${pilote}`
          : (en() ? "no curve connected" : "aucune courbe branchée"),
      ].join("\n");

      return {
        valeurs: [partition, analyse],
        message: `${combien} ${en() ? "events" : "événements"} · ${matrice.rangs.length} ${en() ? "fields" : "champs"} · ${fin.toFixed(2)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);

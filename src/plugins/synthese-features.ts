// plugins/synthese-features.ts — Le chemin inverse : du vecteur de caractéristiques au son.
//
// La logique est dans `audio/synthese-features.ts`, testée ; ce fichier n'est que la prise. Le
// nœud mesure son propre résultat et affiche l'écart : c'est la seule chose qui distingue un
// procédé vérifiable d'une boîte qui rend du plausible.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { ecartParFamille, lireCible, synthetiser } from "../audio/synthese-features";
import { extraireVecteurFeatures } from "../audio/features-piste";

/** Relit le JSON rendu par « Caractéristiques de piste ». */
export function lireVecteurJson(texte: unknown): { vecteur: number[]; etiquettes: string[] } | null {
  if (typeof texte !== "string" || texte.trim() === "") return null;
  try {
    const o = JSON.parse(texte);
    if (!Array.isArray(o?.vecteur) || !Array.isArray(o?.etiquettes)) return null;
    if (o.vecteur.length !== o.etiquettes.length || o.vecteur.length === 0) return null;
    if (!o.vecteur.every((v: unknown) => typeof v === "number" && Number.isFinite(v))) return null;
    return { vecteur: o.vecteur as number[], etiquettes: o.etiquettes as string[] };
  } catch {
    return null;
  }
}

export const fiches: FicheAudio[] = ([
  {
    id: "synthese-features", nom: "Synthèse par caractéristiques", nomEn: "Feature Synthesis",
    univers: "Entrées", famille: "Génération",
    resume: "Fabrique un son à partir des quarante mesures qui le décrivent, et affiche de combien il s'en approche.",
    resumeEn: "Builds a sound from the forty measurements that describe it, and shows how close it comes.",
    notice: "Le chemin inverse de « Caractéristiques de piste » : on lui donne un vecteur, il rend un son.\n\nCe que le composant ne peut pas faire. Le vecteur ne détermine pas un son : il en détermine une classe infinie. Deux pistes très différentes peuvent partager leur tempo, leur centroïde, leur chroma et leurs coefficients cepstraux. Ce composant ne reproduit donc rien — il fabrique un son dont le vecteur mesuré s'approche de la cible, et il vous dit de combien.\n\nLes quatre familles ne s'inversent pas également. Le tempo n'est pas une mesure à retrouver mais un réglage à poser : on choisit la cadence. Le chroma se répartit exactement — douze poids, douze classes de hauteur dans ces proportions. Le centroïde se résout : pour une série harmonique dont les amplitudes décroissent en un sur k puissance alpha, le centroïde est une fonction monotone de alpha, qu'on inverse par dichotomie sur le spectre réellement produit. Les coefficients cepstraux, eux, résistent : Meyda en calcule treize sur vingt-six bandes mel, et remonter donne une enveloppe lissée. C'est à cela que servent les MFCC — jeter ce détail —, et aucune inversion ne le rendra.\n\nCe que le tour complet donne, mesuré. Le centroïde revient à quelques pour cent : 797 visés, 803 obtenus. Les trois classes de hauteur dominantes sont les mêmes, dans des proportions voisines. Les coefficients cepstraux reviennent approximativement, ce qui est attendu.\n\nLe tempo demande une explication. La synthèse place une note tous les 60 divisés par le tempo secondes : le tempo produit est bien celui demandé. Mais le détecteur lit souvent un sous-multiple — 40 ou 60 pour 120 selon la graine —, parce que des notes toutes de même force ne lui donnent aucun accent pour trancher entre un battement et son double. L'écart affiché sur cette famille vient donc de la mesure et non de la synthèse.",
    noticeEn: "The reverse path of « Track Features »: give it a vector, it returns a sound.\n\nWhat it cannot do, and what should be known first. The vector does not determine a sound: it determines an infinite class of them. Two very different tracks can share their tempo, centroid, chroma and cepstral coefficients. This node therefore reproduces nothing — it builds a sound whose measured vector comes close to the target, and it tells you how close.\n\nThe four families do not invert equally. Tempo is not a measurement to recover but a setting to impose: one chooses the rate. Chroma is allocated exactly — twelve weights, twelve pitch classes in those proportions. The centroid is solved: for a harmonic series whose amplitudes fall as one over k to the alpha, the centroid is a monotone function of alpha, inverted by bisection on the spectrum actually produced. The cepstral coefficients resist: Meyda computes thirteen of them over twenty-six mel bands, and going back gives a smoothed envelope. That is what MFCCs are for — discarding that detail — and no inversion will restore it.\n\nWhat the round trip gives, measured. The centroid comes back within a few per cent: 797 targeted, 803 obtained. The three dominant pitch classes are the same, in close proportions. The cepstral coefficients come back approximately, which is expected.\n\nThe tempo needs an explanation. The synthesis places one note every 60 divided by the tempo seconds: the tempo produced IS the one asked for. But the detector often reads a sub-multiple — 40 or 60 for 120 depending on the seed — because notes all of equal strength give it no accent to choose between a beat and its double. The deviation shown for that family therefore comes from the measurement, not from the synthesis.",
    entrees: [{ nom: "Vecteur", nomEn: "Vector", type: "texte", requis: false }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Écart", nomEn: "Deviation", type: "texte" },
    ],
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [1, 60], pas: 1, defaut: 8, unite: "s",
        doc: "Durée du son fabriqué. Plus long, les proportions du chroma se réalisent mieux — il faut assez de notes pour qu'une répartition en douze classes se voie.",
        docEn: "Length of the sound built. Longer, the chroma proportions come out better — enough notes are needed for a twelve-class allocation to show." },
      { nom: "Octave", nomEn: "Octave", type: "curseur", plage: [1, 7], pas: 1, defaut: 4,
        doc: "Octave des fondamentales. Le vecteur ne porte pas la hauteur absolue : le chroma dit quelles classes, jamais dans quel registre. C'est donc à vous de le choisir, et ce choix déplace le centroïde obtenu.",
        docEn: "Octave of the fundamentals. The vector carries no absolute pitch: chroma says which classes, never in which register. The choice is yours, and it moves the centroid obtained." },
      { nom: "Partiels", nomEn: "Partials", type: "curseur", plage: [4, 48], pas: 1, defaut: 24,
        doc: "Nombre de partiels par note. Peu, et le centroïde visé peut être hors de portée — une série courte ne monte pas assez haut. Beaucoup, et le son gagne en richesse sans que la mesure change beaucoup.",
        docEn: "Number of partials per note. Few, and the target centroid may be out of reach — a short series does not reach high enough. Many, and the sound gains richness without the measurement changing much." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 5,
        doc: "Graine de l'ordre des notes. Les proportions du chroma ne changent pas avec elle — elles sont réparties exactement —, seul l'ordre change. Une même graine rejoue le même son.",
        docEn: "Seed for the note order. The chroma proportions do not change with it — they are allocated exactly — only the order does. The same seed replays the same sound." },
      { nom: "Vérifier", nomEn: "Verify", type: "choix", options: ["Oui", "Non"], optionsEn: ["Yes", "No"],
        optionIds: ["oui", "non"], defaut: "Oui", defautEn: "Yes",
        doc: "Remesurer le son produit et afficher l'écart famille par famille. C'est la seule preuve que le composant s'approche de quelque chose, et cela double son temps de calcul. « Non » ne rend que le son.",
        docEn: "Re-measure the sound produced and show the deviation family by family. It is the only proof the node comes close to anything, and it doubles the computation time. « No » returns the sound only." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const lu = lireVecteurJson(ctx.entree(0));
      if (!lu) return { valeurs: [null, null], message: traduire("msg.syntheseFeatures.sansVecteur") };

      const cible = lireCible(lu.vecteur, lu.etiquettes);
      const frequence = 44100;
      const son = synthetiser(cible, {
        dureeSec: ctx.paramNombre("Durée", 8),
        frequence,
        octave: Math.round(ctx.paramNombre("Octave", 4)),
        nPartiels: Math.round(ctx.paramNombre("Partiels", 24)),
        graine: Math.round(ctx.paramNombre("Graine", 5)),
      });
      const sortie = new AudioBuffer({ numberOfChannels: 1, length: son.length, sampleRate: frequence });
      // Une copie dont le tampon est un ArrayBuffer simple : `copyToChannel` refuse un
      // Float32Array dont le tampon pourrait être partagé, distinction que TypeScript tient.
      sortie.copyToChannel(new Float32Array(son), 0);

      if (ctx.paramTexte("Vérifier", "oui") === "non") {
        return { valeurs: [sortie, ""], message: traduire("msg.syntheseFeatures.sansVerif") };
      }

      const { vecteur: obtenu } = extraireVecteurFeatures(sortie);
      const ecarts = ecartParFamille(lu.vecteur, obtenu, lu.etiquettes);
      const indice = (prefixe: string) => lu.etiquettes.findIndex((l) => l.startsWith(prefixe));
      const iTempo = indice("Tempo"), iCentroide = indice("Centroïde");
      const lignes = [
        `${en ? "family" : "famille"}                 ${en ? "deviation" : "écart"}`,
        ...ecarts.map((e) => `  ${e.famille.padEnd(20)} ${(e.ecart * 100).toFixed(1)} %`),
        "",
        `${en ? "Tempo" : "Tempo"} : ${lu.vecteur[iTempo].toFixed(0)} → ${obtenu[iTempo].toFixed(0)}`,
        `${en ? "Centroid" : "Centroïde"} : ${lu.vecteur[iCentroide].toFixed(0)} → ${obtenu[iCentroide].toFixed(0)} Hz`,
        "",
        en
          ? "A tempo read as a sub-multiple comes from the detector, not the synthesis: one note is placed per beat, exactly."
          : "Un tempo lu en sous-multiple vient du détecteur et non de la synthèse : une note est posée par battement, exactement.",
      ];
      const pire = ecarts.reduce((a, b) => (b.ecart > a.ecart ? b : a), ecarts[0]);
      return {
        valeurs: [sortie, lignes.join("\n")],
        message: traduire("msg.syntheseFeatures.resume",
          (ecarts.find((e) => e.famille === "centroïde")?.ecart ?? 0).toFixed(3),
          pire.famille, (pire.ecart * 100).toFixed(0)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);

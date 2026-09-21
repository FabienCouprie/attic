// quiz/catalogue.ts — Les questions que le catalogue écrit tout seul.
//
// TROIS CENTS NŒUDS SONT TROP POUR ÊTRE CONNUS, et c'est le vrai problème que ce thème traite :
// on ne cherche pas un nœud qu'on ne sait pas exister. Ces questions ne sont donc pas de la
// trivialité de rangement — elles font réviser ce qu'on a sous la main.
//
// ELLES SONT ENGENDRÉES, ET C'EST LA DÉCISION QUI COMPTE. Les écrire à la main aurait donné deux
// choses fausses : une banque en retard d'une version sur le catalogue, et une banque qui se
// périme en silence chaque fois qu'un nœud change de famille. Ici, la question EST le catalogue :
// elle lit les mêmes fiches que l'application exécute, si bien qu'elle ne peut ni mentir ni
// vieillir. Six ou sept cents questions justes, gratuitement, et à jour par construction.
//
// DEUX FAMILLES DE QUESTIONS, et chacune a sa raison :
//
//  1. RECONNAÎTRE UN NŒUD À SON RÉSUMÉ. Les leurres sont pris DANS LA MÊME FAMILLE, jamais au
//     hasard du catalogue : distinguer « Ampleur » de « Largeur stéréo » apprend quelque chose,
//     le distinguer d'« Export MIDI » n'apprend rien. C'est ce qui fait de ces questions les plus
//     difficiles du thème, et non les plus faciles.
//  2. SITUER UN NŒUD DANS L'ARBORESCENCE. Savoir qu'un outil est rangé dans Traitement › Effets
//     plutôt que dans Analyse est exactement ce qui permet de le retrouver au clic suivant.
//
// CE QUI EST ÉCARTÉ, ET POURQUOI. Les nœuds internes (méta-composants, frontières, zone de test)
// et les résumés en double : deux nœuds de même résumé donneraient une question à deux bonnes
// réponses, ce qui est la faute la plus grave qu'un quiz puisse commettre. Le vérifier coûte une
// ligne, et cette ligne n'aura jamais à être maintenue.

import { traduireDans } from "../i18n";
import type { Question } from "./types";

/** Le peu qu'il faut savoir d'une fiche pour en tirer des questions. */
export interface FicheQuiz {
  id: string;
  nom: string;
  nomEn?: string;
  resume: string;
  resumeEn?: string;
  univers: string;
  famille: string;
}

/** Les identifiants qui ne désignent pas un nœud du catalogue. */
const INTERNE = (id: string) =>
  id.startsWith("__") || id.startsWith("meta-") || id.startsWith("frontiere");

function empreinte(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Trois leurres pris dans une liste, de façon déterministe mais pas toujours les mêmes.
 *
 * La liste est TOURNÉE d'un cran qui dépend de l'identifiant de la question : sans cela, les trois
 * premiers de la famille serviraient de leurres à tous ses membres, et l'on apprendrait la liste
 * des leurres au lieu d'apprendre les nœuds.
 */
function leurres<T>(candidats: readonly T[], cle: string, combien = 3): T[] {
  if (candidats.length < combien) return [];
  const debut = empreinte(cle) % candidats.length;
  const out: T[] = [];
  for (let k = 0; k < candidats.length && out.length < combien; k++) {
    out.push(candidats[(debut + k) % candidats.length]);
  }
  return out;
}

const familleEn = (f: string) => traduireDans("en", `famille.${f}`);
const universEn = (u: string) => traduireDans("en", `univers.${u}`);

/**
 * Les questions que le catalogue donné engendre.
 *
 * Pure et injectée : le nœud lui passe le registre vivant, les tests une petite liste écrite à la
 * main. C'est ce qui permet d'éprouver les règles — unicité des résumés, leurres de même famille —
 * sans dépendre de l'état du catalogue le jour où le test tourne.
 */
export function questionsCatalogue(fiches: readonly FicheQuiz[]): Question[] {
  const utiles = fiches.filter((f) => !INTERNE(f.id) && f.nom && f.resume && f.resume.trim().length > 0);
  const comptesResume = new Map<string, number>();
  for (const f of utiles) comptesResume.set(f.resume, (comptesResume.get(f.resume) ?? 0) + 1);

  const familles = [...new Set(utiles.map((f) => f.famille))].sort();
  const out: Question[] = [];

  for (const f of utiles) {
    // ── 1. Reconnaître le nœud à son résumé ──
    if (comptesResume.get(f.resume) === 1) {
      const memeFamille = utiles.filter((a) => a.famille === f.famille && a.nom !== f.nom);
      const memeUnivers = utiles.filter((a) => a.univers === f.univers && a.nom !== f.nom);
      const vivier = memeFamille.length >= 3 ? memeFamille : memeUnivers.length >= 3 ? memeUnivers : utiles.filter((a) => a.nom !== f.nom);
      const tires = leurres(vivier.slice().sort((a, b) => a.id.localeCompare(b.id)), `nom-${f.id}`);
      if (tires.length === 3) {
        out.push({
          id: `catalogue-nom-${f.id}`, theme: "catalogue", niveau: 2,
          enonce: `Quel nœud fait ceci : « ${f.resume} » ?`,
          enonceEn: `Which node does this: « ${f.resumeEn ?? f.resume} » ?`,
          choix: [f.nom, ...tires.map((a) => a.nom)],
          choixEn: [f.nomEn ?? f.nom, ...tires.map((a) => a.nomEn ?? a.nom)],
          pourquoi: `« ${f.nom} » — ${f.univers} › ${f.famille}. Les trois autres propositions sont des nœuds voisins, de la même famille.`,
          pourquoiEn: `« ${f.nomEn ?? f.nom} » — ${universEn(f.univers)} › ${familleEn(f.famille)}. The other three options are neighbouring nodes, from the same family.`,
        });
      }
    }

    // ── 2. Situer le nœud dans l'arborescence ──
    if (familles.length >= 4) {
      const memeUnivers = [...new Set(utiles.filter((a) => a.univers === f.univers).map((a) => a.famille))]
        .filter((x) => x !== f.famille).sort();
      const ailleurs = familles.filter((x) => x !== f.famille && !memeUnivers.includes(x));
      const vivier = [...memeUnivers, ...ailleurs];
      const tires = leurres(vivier, `famille-${f.id}`);
      if (tires.length === 3) {
        out.push({
          id: `catalogue-famille-${f.id}`, theme: "catalogue", niveau: 1,
          enonce: `À quelle famille appartient le nœud « ${f.nom} » ?`,
          enonceEn: `Which family does the node « ${f.nomEn ?? f.nom} » belong to?`,
          choix: [f.famille, ...tires],
          choixEn: [familleEn(f.famille), ...tires.map(familleEn)],
          pourquoi: `${f.univers} › ${f.famille}. Son résumé : « ${f.resume} »`,
          pourquoiEn: `${universEn(f.univers)} › ${familleEn(f.famille)}. Its summary: « ${f.resumeEn ?? f.resume} »`,
        });
      }
    }
  }

  // ── 3. Une question sur la taille du catalogue, qui se met à jour elle-même ──
  const n = utiles.length;
  const dizaine = Math.round(n / 10) * 10;
  if (n > 60) {
    out.push({
      id: "catalogue-nombre", theme: "catalogue", niveau: 1,
      enonce: "Combien de nœuds le catalogue d'Attic compte-t-il, à cette version ?",
      enonceEn: "How many nodes does Attic's catalog hold, at this version?",
      choix: [`environ ${dizaine}`, `environ ${dizaine - 60}`, `environ ${dizaine + 80}`, `environ ${Math.round(n / 20) * 10}`],
      choixEn: [`about ${dizaine}`, `about ${dizaine - 60}`, `about ${dizaine + 80}`, `about ${Math.round(n / 20) * 10}`],
      pourquoi: `${n} nœuds sont interrogés par ce quiz, en écartant les nœuds internes. Le chiffre est compté sur le registre vivant, à l'instant où la question est posée : il n'y a rien à mettre à jour.`,
      pourquoiEn: `${n} nodes are surveyed by this quiz, internal nodes aside. The figure is counted on the live registry, at the instant the question is asked: there is nothing to update.`,
    });
  }

  return out;
}

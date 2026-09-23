// plugins/banque-sfz.ts — Une banque d'échantillons, sans clavier.
//
// CE QUI MANQUAIT. Le seul chemin pour amener un `.sfz` du disque dans un graphe était « Clavier
// SFZ », dont les quatre-vingt-huit touches sont inutiles dans un arrangement : quatre parties, c'est
// quatre claviers qui mangent le canevas pour rien. Ce nœud ne fait que la banque.
//
// ET IL APPORTE LE KIT. Attic livre son propre kit de batterie — huit sons aux notes du General MIDI,
// synthétisés par Attic lui-même et embarqués dans l'installeur, comme le SF2 par défaut. C'est la
// source par DÉFAUT du nœud : posé sur le canevas sans rien régler, il donne une batterie jouable.
//
// LE MODE KIT EST CE QUI REND LA BATTERIE JUSTE. Une banque de hauteurs cherche toujours « la zone la
// plus proche » : mesuré sur un vrai kit, la touche 37 jouait la grosse caisse un demi-ton plus haut,
// et la touche 60 le crash à ×1,888. Un kit, lui, ne transpose rien et laisse muette une touche sans
// son. Le fichier le dit lui-même — régions d'une seule touche, ou `pitch_keytrack=0` — et le nœud le
// détecte ; le réglage permet de trancher quand on veut l'autre lecture.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { rendreNotes, type Banque } from "../audio/clavier-banque";
import { chargerSfz, dossierDe } from "../audio/sfz";
import { CHEMIN_KIT_EMBARQUE } from "../audio/kit-batterie";
import { decodeurElectron } from "./clavier-sfz";

export const fiches: FicheAudio[] = ([
  {
    id: "banque-sfz", nom: "Banque SFZ", nomEn: "SFZ Bank",
    univers: "Entrées", famille: "Audio",
    resume: "Charge une banque d'échantillons SFZ (le kit de batterie intégré, ou un fichier du disque) sans clavier.",
    resumeEn: "Loads an SFZ sample bank (the built-in drum kit, or a file from disk) with no keyboard.",
    entrees: [],
    sorties: [
      { nom: "Banque", nomEn: "Bank", type: "banque" },
      { nom: "Aperçu", nomEn: "Preview", type: "audio" },
    ],
    parametres: [
      { nom: "Source", nomEn: "Source", type: "choix",
        options: ["Kit intégré", "Fichier SFZ"], optionsEn: ["Built-in kit", "SFZ file"],
        optionIds: ["integre", "fichier"], defaut: "Kit intégré", defautEn: "Built-in kit",
        doc: "Kit intégré : la batterie intégrée, huit sons aux notes du General MIDI (36 grosse caisse, 38 caisse claire, 42 charley fermé…), synthétisés et embarqués dans l'application, donc disponibles sans réseau ni téléchargement. Fichier SFZ : un `.sfz` du disque, désigné par le bouton 📂 du composant ; ses échantillons sont lus à côté de lui.",
        docEn: "Built-in kit: eight sounds on General MIDI notes (36 kick, 38 snare, 42 closed hi-hat…), synthesized and bundled with the application, hence available with no network and no download. SFZ file: a `.sfz` from disk, chosen with the node's 📂 button; its samples are read beside it." },
      { nom: "Type de banque", nomEn: "Bank type", type: "choix",
        options: ["Automatique", "Hauteurs", "Kit"], optionsEn: ["Automatic", "Pitched", "Kit"],
        optionIds: ["auto", "hauteurs", "kit"], defaut: "Automatique", defautEn: "Automatic",
        doc: "Comment la banque se joue. Automatique : le fichier tranche lui-même, des régions d'une seule touche, ou un `pitch_keytrack=0`, désignent un kit. Hauteurs : une touche est une hauteur ; la zone la plus proche est rééchantillonnée, et aucune touche ne reste muette. Kit : une touche est un son ; rien n'est transposé, et une touche sans son ne joue rien. Imposer « Hauteurs » sur un kit fait jouer la grosse caisse un demi-ton plus haut sur la touche 37 ; c'est parfois l'effet qu'on cherche, mais il vaut mieux le savoir.",
        docEn: "How the bank plays. Automatic: the file decides, single-key regions, or a `pitch_keytrack=0`, mark a kit. Pitched: a key is a pitch; the nearest zone is resampled and no key stays silent. Kit: a key is a sound; nothing is transposed, and a key with no sound plays nothing. Forcing « Pitched » on a kit makes key 37 play the kick a semitone higher, sometimes that is the effect you want, but better to know it." },
      { nom: "Aperçu", nomEn: "Preview", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Rend un aperçu audio : une note par touche de la banque, l'une après l'autre, et non une par zone, sans quoi une banque à couches ferait entendre trois fois la même note. S'il y a des couches de vélocité, un escalier de nuances suit, sur une seule touche, de la plus douce à la plus forte : c'est la seule façon d'entendre ce qu'elles apportent.",
        docEn: "Renders an audio preview: one note per key of the bank, one after another, not one per zone, otherwise a layered bank would sound the same note three times. If there are velocity layers, a staircase of dynamics follows on a single key, from softest to loudest: the only way to hear what they bring." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.lireTexte) return { valeurs: [null, null], message: traduire("msg.n_cessite_electron") };
      const integre = ctx.paramTexte("Source", "integre") !== "fichier";
      const chemin = integre ? CHEMIN_KIT_EMBARQUE : (ctx.noeud.data.sfzChemin as string | undefined);
      if (!chemin) return { valeurs: [null, null], message: traduire("msg.sfz.sansFichier") };

      const texte = await api.lireTexte(chemin);
      if (typeof texte !== "string" || texte === "") {
        // Le kit embarqué absent est un cas à part : ce n'est pas l'utilisateur qui s'est trompé de
        // fichier, c'est l'installation qui est incomplète. On le dit autrement.
        return {
          valeurs: [null, null],
          message: integre ? traduire("msg.sfz.kitAbsent") : traduire("msg.sfz.illisible", chemin),
        };
      }
      const mode = ctx.paramTexte("Type de banque", "auto") as "auto" | "hauteurs" | "kit";
      const charge = await chargerSfz(texte, dossierDe(chemin), decodeurElectron(api, ctx.runtime), { mode });
      if (charge.banque.zones.length === 0) {
        return { valeurs: [null, null], message: traduire("msg.sfz.aucuneZone", String(charge.manquants.length)) };
      }
      const banque = charge.banque;

      // L'aperçu : chaque son l'un après l'autre. Pour un kit, c'est la seule façon d'entendre les
      // huit percussions sans MIDI ; pour une banque de hauteurs, cela fait entendre le découpage.
      let apercu: AudioBuffer | null = null;
      if (ctx.paramTexte("Aperçu", "oui") !== "non") {
        const pas = banque.kit ? 0.28 : 0.35;
        // Une note par RACINE, et non par zone : une banque à trois couches a trois zones sur la même
        // touche, et les jouer toutes ferait entendre trois fois la même note.
        const racines = [...new Set(banque.zones.map((z) => z.racine))].sort((a, b) => a - b);
        const notes = racines.map((racine, i) => ({
          note: racine, velocite: 100, debut: i * pas, fin: i * pas + pas * 0.9,
        }));
        // Puis, s'il y a des couches, un ESCALIER DE NUANCES sur une seule touche : la même note
        // jouée de la plus douce à la plus forte. C'est la seule façon d'entendre ce que les couches
        // apportent, et cela tient en quelques notes de plus quel que soit le nombre de touches.
        const couches = banque.zones.filter((z) => z.racine === racines[Math.floor(racines.length / 2)]);
        if (couches.length > 1) {
          const debutEscalier = notes.length * pas + 0.3;
          couches
            .slice()
            .sort((a, b) => (a.velHaute ?? 127) - (b.velHaute ?? 127))
            .forEach((z, i) => notes.push({
              note: z.racine,
              velocite: Math.max(1, Math.min(127, Math.round(((z.velBasse ?? 0) + (z.velHaute ?? 127)) / 2))),
              debut: debutEscalier + i * pas,
              fin: debutEscalier + i * pas + pas * 0.9,
            }));
        }
        apercu = rendreNotes(notes, banque, { volume: 0.85, relachement: 0.02 });
      }

      const morceaux = [traduire(banque.kit ? "msg.sfz.kitLu" : "msg.sfz.lu",
        String(banque.zones.length), String(banque.largeur))];
      morceaux.push(traduire("msg.sfz.etendue", String(banque.noteBasse), String(banque.noteHaute)));
      if (charge.couches > 1) morceaux.push(traduire("msg.sfz.nbCouches", String(charge.couches)));
      if (integre) morceaux.push(traduire("msg.sfz.integre"));
      if (charge.manquants.length) morceaux.push(traduire("msg.sfz.manquants", String(charge.manquants.length)));
      if (charge.couchesEcartees) morceaux.push(traduire("msg.sfz.couches", String(charge.couchesEcartees)));
      if (charge.sfz.ignores.length) {
        morceaux.push(traduire("msg.sfz.ignores", String(charge.sfz.ignores.length), charge.sfz.ignores.slice(0, 3).join(", ")));
      }
      return { valeurs: [banque as unknown as null, apercu], message: morceaux.join(" · ") };
    },
  },
] as FicheAudio[]).map(avecDoc);

export type { Banque };

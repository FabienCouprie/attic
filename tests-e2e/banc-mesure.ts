// tests-e2e/banc-mesure.ts — Mesurer un composant sans se tromper sur ce qu'on mesure.
//
// POURQUOI CE FICHIER EXISTE, et c'est une faute de ma part qu'il répare.
//
// J'ai mesuré ces composants une vingtaine de fois par des scripts improvisés dans la console, et je
// me suis trompé trois fois sur la mesure elle-même, pas sur le code mesuré :
//
//   • j'ai annoncé « 6 ms de gel » pour un calcul synchrone, ce qui est impossible : le module venait
//     du cache du rechargement à chaud, et je mesurais la version d'après en croyant tenir celle
//     d'avant ;
//   • j'ai publié une liste de vingt et un composants « au-dessus de la seconde », obtenue en les
//     enchaînant dans une même page : la pression mémoire gonflait les temps jusqu'à cinquante-quatre
//     fois, et `echo-ping-pong` y figurait à 1 629 ms pour 30 ms réels ;
//   • j'ai comparé un temps à froid à un temps à chaud sans le dire.
//
// LES QUATRE PRÉCAUTIONS SONT DONC ÉCRITES ICI PLUTÔT QUE RÉINVENTÉES :
//
//   1. LA VERSION CHARGÉE EST PROUVÉE. `marqueurs` cherche des motifs dans la source de la fonction
//      exécutée. Sans cette preuve, une mesure « avant » peut porter sur le code d'après.
//   2. UN COMPOSANT PAR CONTEXTE NEUF. La page est rechargée entre deux mesures, sans quoi elles
//      s'influencent.
//   3. LE GEL SE MESURE PAR `MessageChannel`, que l'arrière-plan ne ralentit pas, là où
//      `requestAnimationFrame` ne tire pas du tout dans un onglet caché. Zéro message signifie un gel
//      TOTAL, non l'absence de gel.
//   4. L'ENTRÉE EST DÉTERMINISTE, sans quoi deux empreintes ne se comparent pas.
//   5. LES CHOIX SONT CANONISÉS COMME L'APPLICATION LE FAIT. Un paramètre « choix » porte une
//      ÉTIQUETTE et un IDENTIFIANT, et le moteur réel canonise l'une vers l'autre. Une première
//      version de ce banc rendait l'étiquette brute : la tolérance de la reconstruction de phase
//      valait alors `parseFloat("10⁻⁶")`, c'est-à-dire DIX, les exposants en exposant n'étant pas des
//      chiffres. Le composant annonçait « 0 % intégré » et je l'ai pris pour un défaut du composant.
//      Il intègre 99,8 % avec le bon réglage. L'instrument mesurait un chemin que personne n'emprunte.

import type { Page } from "@playwright/test";

import type { Descripteurs } from "../src/audio/descripteurs-comparaison";

export type { Descripteurs };

/** La fréquence et la durée de l'entrée d'essai. Changer l'une invalide toutes les empreintes. */
export const FREQUENCE = 48000;
export const DUREE_SEC = 3;

export interface Mesure {
  /** Les marqueurs demandés, et s'ils ont été trouvés dans la source exécutée. */
  version: Record<string, boolean>;
  /** Temps total de l'exécution, en millisecondes. */
  ms: number;
  /**
   * Le plus long intervalle sans que le fil principal ait pu tourner, en millisecondes.
   * `null` quand AUCUN message n'est passé : le gel a duré toute l'exécution.
   */
  gelMs: number | null;
  messages: number;
  message: string | null;
  /** Une empreinte par sortie audio, « rms/crête », neuf décimales ; `null` pour les autres. */
  empreintes: (string | null)[];
  /**
   * Les descripteurs de la première sortie audio, quand on les demande.
   *
   * Leur calcul vit dans `src/audio/descripteurs-comparaison.ts`, avec ses cas : écrit ici, il
   * aurait été dans un `page.evaluate`, donc hors d'atteinte de tout garde.
   */
  descripteurs: Descripteurs | null;
  /**
   * Chaque sortie audio, encodée en WAV, quand on la demande — et le son d'essai avec.
   *
   * POURQUOI LE SON D'ESSAI EN FAIT PARTIE. On ne juge pas un effet sans entendre ce qui y est
   * entré : une réverbération sur un son qu'on n'a jamais entendu sec ne dit rien. Il part donc
   * avec, une fois, sous le rang −1.
   */
  wavs: {
    rang: number; base64: string;
    /** La durée du FICHIER, donc ce qu'on entend : bornée quand une borne est demandée. */
    secondes: number;
    /**
     * La durée que le composant a vraiment rendue, bornée ou non.
     *
     * LES DEUX SONT NÉCESSAIRES DÈS QU'UNE BORNE EXISTE. Un clip tronqué qui n'annoncerait que sa
     * durée de fichier ferait croire qu'un composant rend six secondes quand il en rend
     * cinquante-quatre — et c'est exactement l'étiquette fausse que j'avais d'abord écrite dans le
     * catalogue, en promettant la durée rendue et en reportant la durée coupée.
     */
    secondesRendues: number;
    crete: number;
  }[];
  erreur: string | null;
}

/**
 * Exécute un composant dans la page et rend sa mesure.
 *
 * La page est rechargée à chaque appel : c'est la précaution 2, et elle coûte une seconde.
 */
export async function mesurerComposant(
  page: Page, url: string, ficheId: string,
  options: {
    marqueurs?: string[];
    parametres?: Record<string, string | number>;
    /**
     * Les rangs d'entrée qui reçoivent le son d'essai. Par défaut la seule entrée 0.
     *
     * UN COMPOSANT QUI EN DEMANDE DEUX NE SE MESURE PAS AVEC UNE. La convolution de deux sons rend
     * null sans son second son, et son empreinte serait vide. Le rang est déclaré plutôt que deviné
     * du type des entrées : nourrir toutes les entrées audio par défaut changerait ce que mesurent
     * les composants à seconde entrée facultative, dont les empreintes sont déjà enregistrées.
     */
    entreesAudio?: number[];
    /**
     * Relever en plus les descripteurs de la première sortie audio.
     *
     * Ils coûtent une analyse spectrale de plus par mesure, et ne servent qu'à COMPARER : la base
     * d'empreintes, elle, n'en a pas besoin et ne doit pas ralentir pour eux.
     */
    descripteurs?: boolean;
    /**
     * Encoder les sorties audio en WAV, pour les ÉCOUTER.
     *
     * Le verbe `écouter` est le seul des cinq qui rende autre chose qu'un texte, et c'est le seul
     * qui rende ce pour quoi ce logiciel existe. Le banc tenait déjà le son ; il le jetait.
     */
    wav?: boolean;
    /**
     * Un son de référence à la place du son d'essai, en WAV encodé en base64.
     *
     * POURQUOI LE BANC DOIT POUVOIR EN RECEVOIR UN, ET POURQUOI CE N'EST PAS LE SIEN. Le son
     * d'essai est fait pour MESURER : trois secondes de deux sinus et d'un filet de bruit, le même
     * à la neuvième décimale depuis l'origine, et c'est sur lui que reposent les soixante-douze
     * empreintes. Un catalogue qu'on ÉCOUTE demande autre chose — une réverbération sur deux sinus
     * ne dit rien à l'oreille. Les deux sons coexistent donc, chacun pour son office, et le son
     * d'essai reste le défaut : aucune empreinte ne bouge.
     *
     * IL EST RÉÉCHANTILLONNÉ À LA FRÉQUENCE DU BANC quand il n'y est pas, pour que tout le
     * catalogue soit à un seul taux. Sans cela, un composant qui hérite du taux de son entrée
     * rendrait un clip à 24 kHz pendant qu'un composant qui impose le sien en rendrait un à 48, et
     * deux clips voisins ne se compareraient plus. Le rééchantillonnage n'invente rien : il ne
     * remonte pas le plafond du contenu.
     */
    sourceWav?: string;
    /**
     * La durée maximale de chaque WAV rendu, en secondes.
     *
     * UNE SORTIE NE FAIT PAS LA DURÉE DE SON ENTRÉE : mesuré sur `canon-de-proportions`, deux
     * secondes à l'entrée donnaient des aperçus de cinquante-quatre. Sans borne, un catalogue de
     * trois cent soixante-sept clips est de taille indéterminée.
     */
    wavMaxSec?: number;
    /**
     * La profondeur des WAV rendus, en bits. Seize par défaut, comme l'encodeur du dépôt.
     *
     * RELEVÉ EN LE VÉRIFIANT, ET C'ÉTAIT UN DÉFAUT : le catalogue devait être en trente-deux bits
     * flottants, et ses premiers fichiers sortaient en seize bits entiers. `bufferVersWavBlob`
     * prend seize par défaut, et la préférence de l'utilisateur ne vit que dans la localStorage,
     * vide dans une page neuve. La profondeur se demande donc, elle ne se devine pas.
     *
     * LE DÉFAUT RESTE SEIZE pour qu'`écouter` et les soixante-douze empreintes ne bougent pas.
     */
    wavBits?: 16 | 24 | 32;
  } = {},
): Promise<Mesure> {
  await page.goto(url);
  await page.waitForSelector(".attic-app", { timeout: 15000 });
  return await page.evaluate(async ([id, marqueurs, parametres, frequence, dureeSec, entreesAudio, veutDescripteurs, veutWav, sourceWav, wavMaxSec, wavBits]) => {
    const idx = await import("/src/plugins/index.ts");
    // La canonisation du moteur réel, importée plutôt que réécrite : une seconde version dériverait.
    const { defautCanoniqueChoix } = await import("/src/i18n.tsx");
    const fiche = (idx as any).toutesLesFiches.find((f: any) => f.id === id);
    if (!fiche) {
      return { version: {}, ms: 0, gelMs: null, messages: 0, message: null, empreintes: [],
        descripteurs: null, wavs: [], erreur: `fiche « ${id} » absente du registre` };
    }

    const source = String(fiche.executer);
    const version: Record<string, boolean> = {};
    for (const m of marqueurs as string[]) version[m] = source.includes(m);

    // Entrée déterministe : un générateur congruentiel, jamais Math.random.
    const n = Math.round(frequence * dureeSec);
    let buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: frequence });
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let x = 12345 + c;
      for (let i = 0; i < n; i++) {
        const t = i / frequence;
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        d[i] = 0.35 * Math.sin(2 * Math.PI * (220 + c) * t)
             + 0.15 * Math.sin(2 * Math.PI * 660 * t)
             + (x / 0x7fffffff - 0.5) * 0.06;
      }
    }

    // UN SON DE RÉFÉRENCE PREND LA PLACE DU SON D'ESSAI, quand on en fournit un. Le défaut reste le
    // son d'essai : c'est ce qui garantit qu'aucune des soixante-douze empreintes ne bouge.
    if (sourceWav) {
      // `tamponDepuisWav` ET NON `decodeAudioData`, qui rééchantillonne en silence au taux du
      // contexte : on veut d'abord les échantillons EXACTS du fichier, puis décider nous-mêmes.
      const ew = await import("/src/audio/empreinte-wav.ts");
      const brut = (ew as any).tamponDepuisWav(
        Uint8Array.from(atob(sourceWav as string), (ch: string) => ch.charCodeAt(0)).buffer);
      if (brut.sampleRate === frequence) {
        buf = brut;
      } else {
        // LE RÉÉCHANTILLONNAGE PASSE PAR UN RENDU HORS LIGNE, la machinerie du navigateur, plutôt
        // que par une interpolation écrite ici : un rééchantillonneur maison serait un second
        // algorithme à éprouver, pour un gain nul.
        const cible = Math.round(brut.duration * frequence);
        const hl = new OfflineAudioContext(brut.numberOfChannels, cible, frequence);
        const src = hl.createBufferSource();
        src.buffer = brut;
        src.connect(hl.destination);
        src.start();
        buf = await hl.startRendering();
      }
    }

    // LES VALEURS D'ESSAI DES AUTRES TYPES viennent du domaine, où un cas les tient et où un autre
    // refuse qu'un type de flux neuf arrive sans valeur ni raison écrite. Le SON, lui, reste ici :
    // son générateur congruentiel est ce que `core/hasard-prive.test.ts` interdit dans `src/`, et
    // le remplacer déplacerait les soixante-douze empreintes sans qu'un composant ait changé.
    const ve = await import("/src/audio/valeurs-essai.ts");

    const reglages = parametres as Record<string, string | number>;
    const rangs = entreesAudio as number[];

    // UN PORT « SPECTROGRAMME » NE REÇOIT PAS UN TAMPON AUDIO. Le composant le refuserait et le banc
    // mesurerait un refus, c'est-à-dire rien. Le spectrogramme d'essai est l'analyse du MÊME son
    // déterministe, au paramétrage de la référence : il reste donc reproductible d'une passe à
    // l'autre, ce qui est la condition pour qu'une empreinte veuille dire quelque chose.
    const veutSpectre = (fiche.entrees || []).some((p: any, i: number) => rangs.includes(i) && p?.type === "spectrogramme");
    let spectre: any = null;
    if (veutSpectre) {
      const sm = await import("/src/audio/spectrogramme-mel.ts");
      const mel = await import("/src/audio/mel.ts");
      const p = { ...(mel as any).PARAMETRES_RIFFUSION, echantillonnage: frequence };
      spectre = { canaux: [(sm as any).melDepuisSignal(buf.getChannelData(0), p)], parametres: p };
    }
    // CHAQUE RANG REÇOIT CE QUE SON PORT DÉCLARE, et non un tampon audio quel que soit le port.
    //
    // CE QUE CELA DÉBLOQUE, ET C'EST UN CHIFFRE QUI L'A RÉCLAMÉ. Sur les 367 composants qui rendent
    // de l'audio, soixante exigent d'abord autre chose : une séquence, un MIDI, un texte, un
    // accordage, une banque. Nourris d'un `AudioBuffer`, ils rendaient un REFUS — le banc mesurait
    // alors le refus, c'est-à-dire rien, et aucun des trois verbes ne pouvait les atteindre.
    //
    // LE SOUS-TYPE COMPTE AUSSI : une notation, un ABC et une invite de modèle sont trois textes
    // différents, et quatre composants sur cinq refusent celui des autres.
    //
    // Un type sans valeur d'essai garde le son, qui est ce que ce banc a toujours donné.
    const pourRang = (i: number) => {
      if (!rangs.includes(i)) return null;
      const port = (fiche.entrees || [])[i];
      if (port?.type === "spectrogramme") return spectre;
      const v = (ve as any).valeurDEssai(port?.type, port?.sousType, { source: buf });
      return v ?? buf;
    };

    const ctx = {
      noeud: { id: "banc", data: { ficheId: id, parametres: reglages } },
      runtime: null, repertoireTravail: null,
      entree: (i: number) => pourRang(i),
      entrees: () => rangs.map((i) => pourRang(i)),
      paramNombre: (nom: string, def: number) => {
        if (typeof reglages[nom] === "number") return reglages[nom] as number;
        const p = (fiche.parametres || []).find((q: any) => q.nom === nom);
        return typeof p?.defaut === "number" ? p.defaut : def;
      },
      paramTexte: (nom: string, def: string) => {
        const p = (fiche.parametres || []).find((q: any) => q.nom === nom);
        // Un réglage imposé est canonisé comme le ferait l'inspecteur, pour qu'on puisse l'écrire
        // sous son étiquette lisible sans que le composant reçoive autre chose que son identifiant.
        if (typeof reglages[nom] === "string") {
          return p ? String((defautCanoniqueChoix as any)({ ...p, defaut: reglages[nom] })) : reglages[nom] as string;
        }
        if (!p || typeof p.defaut !== "string") return def;
        return String((defautCanoniqueChoix as any)(p));
      },
      onProgress: () => {},
      signal: new AbortController().signal,
    };

    // La sonde : un MessageChannel que l'arrière-plan ne ralentit pas.
    const canal = new MessageChannel();
    const instants: number[] = [];
    let actif = true;
    canal.port1.onmessage = () => {
      instants.push(performance.now());
      if (actif) canal.port2.postMessage(0);
    };
    canal.port2.postMessage(0);

    const debut = performance.now();
    let resultat: any = null;
    let erreur: string | null = null;
    try {
      resultat = await fiche.executer(ctx);
    } catch (e) {
      erreur = String((e as Error)?.message ?? e).slice(0, 120);
    }
    const ms = Math.round(performance.now() - debut);
    actif = false;

    let plusLong = 0;
    for (let i = 1; i < instants.length; i++) {
      plusLong = Math.max(plusLong, instants[i] - instants[i - 1]);
    }

    const empreintes = ((resultat && resultat.valeurs) || []).map((v: any) => {
      if (v instanceof AudioBuffer) {
        let somme = 0, crete = 0;
        for (let c = 0; c < v.numberOfChannels; c++) {
          const d = v.getChannelData(c);
          for (let i = 0; i < d.length; i++) {
            somme += d[i] * d[i];
            crete = Math.max(crete, Math.abs(d[i]));
          }
        }
        const rms = Math.sqrt(somme / (v.length * v.numberOfChannels));
        return `${rms.toFixed(9)}/${crete.toFixed(9)}`;
      }
      // UNE COURBE SE SURVEILLE AUSSI, et le défaut de la suite logistique l'a montré : elle ne
      // portait que cinq paliers là où l'on en attend des dizaines, et aucune empreinte ne l'aurait
      // dit. Le nombre de PALIERS est donc relevé en plus du niveau : c'est lui qui distingue une
      // suite d'un escalier, à valeur efficace presque égale.
      if (v && ArrayBuffer.isView(v.valeurs) && typeof v.cadence === "number") {
        const d = v.valeurs as Float32Array;
        let somme = 0, crete = 0, paliers = 0, prec: number | null = null;
        for (let i = 0; i < d.length; i++) {
          somme += d[i] * d[i];
          crete = Math.max(crete, Math.abs(d[i]));
          const arrondi = Math.round(d[i] * 1e6) / 1e6;
          if (arrondi !== prec) { paliers++; prec = arrondi; }
        }
        const rms = d.length ? Math.sqrt(somme / d.length) : 0;
        return `courbe ${rms.toFixed(9)}/${crete.toFixed(9)} · ${d.length} valeurs · ${paliers} paliers`;
      }
      // UN SPECTROGRAMME SE SURVEILLE AUSSI, et sans cela le composant qui l'ANALYSE échapperait à la
      // base : sa sortie n'est pas de l'audio, donc son empreinte aurait été vide, et le garde de
      // couverture l'aurait refusé à juste titre. Les trois dimensions sont relevées avec le niveau,
      // pour la même raison que les paliers d'une courbe : un spectrogramme qui perdrait une trame ou
      // une bande garderait à peu près la même valeur efficace.
      if (v && Array.isArray(v.canaux) && v.parametres) {
        let somme = 0, crete = 0, n = 0;
        for (const trames of v.canaux) {
          for (const t of trames as Float32Array[]) {
            for (let i = 0; i < t.length; i++) { somme += t[i] * t[i]; crete = Math.max(crete, t[i]); n++; }
          }
        }
        const rms = n ? Math.sqrt(somme / n) : 0;
        const dim = `${v.canaux.length}×${v.canaux[0]?.length ?? 0}×${v.canaux[0]?.[0]?.length ?? 0}`;
        return `spectrogramme ${rms.toFixed(9)}/${crete.toFixed(9)} · ${dim}`;
      }
      return null;
    });

    // LES DESCRIPTEURS, SUR LA PREMIÈRE SORTIE AUDIO SEULEMENT. Un composant à deux sorties audio
    // n'a pas « deux timbres » à comparer : il en a un, et des variantes. Les relever sur toutes
    // rendrait un tableau que personne ne lit, et il faudrait choisir laquelle compte — ce qui est
    // exactement la décision qu'on veut éviter de prendre à la place de celui qui mesure.
    let descripteurs: any = null;
    const premiere = ((resultat && resultat.valeurs) || []).find((v: any) => v instanceof AudioBuffer);
    if (veutDescripteurs && premiere) {
      try {
        // LE CALCUL N'EST PAS ICI, ET C'EST VOULU : écrit dans ce `page.evaluate`, il aurait été
        // hors d'atteinte de tout cas. Un canal confondu ou une entrée et une sortie échangées
        // auraient rendu le même beau tableau. Il vit donc dans un module du domaine, éprouvé par
        // des cas à réponse connue, et le banc ne fait que l'appeler.
        const dc = await import("/src/audio/descripteurs-comparaison.ts");
        descripteurs = (dc as any).descripteursComparaison(premiere as AudioBuffer, buf);
      } catch (e) {
        // UN DESCRIPTEUR QUI LÈVE NE DOIT PAS FAIRE PASSER LE COMPOSANT POUR FAUTIF : la mesure du
        // composant, elle, a réussi, et c'est elle que la base d'empreintes surveille.
        descripteurs = { erreurDescripteurs: String((e as Error)?.message ?? e).slice(0, 120) };
      }
    }

    // ─── LE SON, ENCODÉ POUR QU'ON L'ENTENDE ───
    //
    // L'encodeur est celui du dépôt, `bufferVersWavBlob` : écrire un second en-tête WAV ici serait
    // la faute que ce dépôt répare le plus souvent. Le base64 se fait PAR TRANCHES, sans quoi
    // `String.fromCharCode(...octets)` fait déborder la pile dès le mégaoctet — une sortie de trois
    // secondes en seize bits stéréo en pèse 1,15.
    const wavs: any[] = [];
    if (veutWav) {
      const io = await import("/src/audio/io.ts");
      // LA BORNE SE POSE AVANT L'ENCODAGE, et elle rend la DURÉE RÉELLE dans `secondes` : un clip
      // tronqué qui s'annoncerait entier ferait croire qu'un composant rend six secondes quand il
      // en rend cinquante-quatre. Le relevé dit donc ce qu'on entend, et le message du nœud, lui,
      // continue de dire ce que le composant a vraiment produit.
      const borner = (b: AudioBuffer): AudioBuffer => {
        const max = wavMaxSec as number;
        if (!max || b.duration <= max) return b;
        const trames = Math.round(max * b.sampleRate);
        const coupe = new AudioBuffer({
          numberOfChannels: b.numberOfChannels, length: trames, sampleRate: b.sampleRate,
        });
        for (let c = 0; c < b.numberOfChannels; c++) {
          coupe.getChannelData(c).set(b.getChannelData(c).subarray(0, trames));
        }
        return coupe;
      };
      const enBase64 = async (brut: AudioBuffer) => {
        const b = borner(brut);
        const octets = new Uint8Array(
          await (io as any).bufferVersWavBlob(b, undefined, false, { bits: wavBits }).arrayBuffer());
        let s = "";
        for (let i = 0; i < octets.length; i += 0x8000) {
          s += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000) as any);
        }
        let crete = 0;
        for (let c = 0; c < b.numberOfChannels; c++) {
          const d = b.getChannelData(c);
          for (let i = 0; i < d.length; i++) crete = Math.max(crete, Math.abs(d[i]));
        }
        return { base64: btoa(s), secondes: b.duration, secondesRendues: brut.duration, crete };
      };
      // LE SON D'ESSAI PORTE LE RANG −1 : on ne juge pas un effet sans entendre ce qui y est entré.
      wavs.push({ rang: -1, ...(await enBase64(buf)) });
      const valeurs = (resultat && resultat.valeurs) || [];
      for (let rang = 0; rang < valeurs.length; rang++) {
        const v = valeurs[rang];
        if (v instanceof AudioBuffer && v.length > 0) wavs.push({ rang, ...(await enBase64(v)) });
      }
    }

    return {
      version, ms,
      // Zéro message : le gel a duré toute l'exécution, ce qui n'est pas « aucun gel ».
      gelMs: instants.length === 0 ? null : Math.round(plusLong),
      messages: instants.length,
      message: resultat && typeof resultat.message === "string" ? resultat.message : null,
      empreintes, descripteurs, wavs, erreur,
    };
  }, [ficheId, options.marqueurs ?? [], options.parametres ?? {}, FREQUENCE, DUREE_SEC,
      options.entreesAudio ?? [0], options.descripteurs ?? false, options.wav ?? false,
      options.sourceWav ?? "", options.wavMaxSec ?? 0, options.wavBits ?? 16] as const);
}

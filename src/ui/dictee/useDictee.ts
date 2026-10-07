// ui/dictee/useDictee.ts — Écouter le micro, et en tirer des gestes.
//
// LA RECONNAISSANCE TOURNE AU FIL DE L'EAU, et c'est ce pour quoi Vosk est fait : le moteur reçoit
// le signal par tranches et rend des résultats à mesure, sans qu'on ait à attendre la fin. Chaque
// résultat devient un geste, et le canevas bouge pendant qu'on parle.
//
// LE SIGNAL PASSE PAR UN WORKLET, et non par un `ScriptProcessorNode`. Le second est déprécié et
// tourne sur le fil de l'interface : la reconnaissance y partagerait le fil avec le rendu du
// canevas, qui est précisément ce qui bouge pendant qu'on parle.
//
// LE MOTEUR, LUI, A DÉJÀ SON WORKER : `vosk-browser` en lance un et y tient son WebAssembly. Ce
// module ne fait que joindre le micro à ce worker, et traduire ce qu'il rend.
import { useCallback, useEffect, useRef, useState } from "react";
import { FREQUENCE_VOSK, MODELES, chargerModele } from "../../plugins/vosk-asr";
import { nomsDeDictee } from "../../plugins/prompt-graphe";
import { grammaireDeDictee, interpreterDictee, type ApparieurFlou, type Commande, type NomDicte } from "./commandes-dictee";
import { apparierFlou } from "../../plugins/appariement-flou";

/** Le code du worklet, posé en blob : il n'a pas de fichier à lui pour ne rien ajouter au paquet. */
const WORKLET = `
class RelaisDictee extends AudioWorkletProcessor {
  process(entrees) {
    const voie = entrees[0] && entrees[0][0];
    if (voie && voie.length) this.port.postMessage(new Float32Array(voie));
    return true;
  }
}
registerProcessor("relais-dictee", RelaisDictee);
`;

export interface EtatDictee {
  ecoute: boolean;
  /** Ce que le moteur comprend à l'instant, avant d'avoir tranché. */
  partiel: string;
  /** Vide tant que rien ne cloche ; sinon ce qu'il faut dire à l'utilisateur. */
  erreur: string;
}

type Reconnaisseur = {
  acceptWaveformFloat(tampon: Float32Array, frequence: number): void;
  retrieveFinalResult(): void;
  remove(): void;
  on(evenement: string, ecouteur: (m: never) => void): void;
};

/**
 * L'écoute, et les gestes qu'elle rend.
 *
 * `surCommandes` est appelé à chaque résultat tranché par le moteur, avec les gestes de ce
 * résultat. L'appelant décide ce qu'il en fait ; ce module ne connaît pas le canevas.
 */
export function useDictee(
  langue: "fr" | "en",
  surCommandes: (commandes: Commande[]) => void,
): EtatDictee & { basculer: () => void } {
  const [ecoute, setEcoute] = useState(false);
  const [partiel, setPartiel] = useState("");
  const [erreur, setErreur] = useState("");
  const arretRef = useRef<(() => void) | null>(null);
  const commandesRef = useRef(surCommandes);
  commandesRef.current = surCommandes;

  const arreter = useCallback(() => {
    arretRef.current?.();
    arretRef.current = null;
    setEcoute(false);
    setPartiel("");
  }, []);
  // Le mot d'arrêt est reconnu dans un écouteur posé avant que `arreter` ne soit à portée : la
  // référence est là pour que le même geste serve au bouton et à la voix.
  const arreterRef = useRef(arreter);
  arreterRef.current = arreter;

  const demarrer = useCallback(async () => {
    setErreur("");
    let flux: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let rec: Reconnaisseur | null = null;
    try {
      const noms: NomDicte[] = await nomsDeDictee(langue === "en");
      // LA RESSEMBLANCE EST MONTÉE ICI, et passée au découpage, qui n'en connaît que la forme.
      //
      // ELLE NE TIRE QUE RAREMENT À VOCABULAIRE FERMÉ, et il faut le dire. La grammaire ne laissant
      // sortir que des mots du catalogue, l'appariement exact les prend presque toujours : relevé
      // sur les trois lectures fermées, la ressemblance ne change aucune des trois, « spectre
      // gamme » désignant exactement le composant « Gamme » avant qu'elle n'ait son tour. Elle
      // rattrape ce qui reste, un mot qui n'est qu'un morceau d'un nom plus long, et elle sera à sa
      // place le jour où le vocabulaire s'ouvrira : c'est là qu'elle est mesurée utile, trois noms
      // techniques retrouvés sur trois que l'exact perdait.
      const catalogue = noms.map((n) => ({ id: n.ficheId, nom: n.nom }));
      const flou: ApparieurFlou = (fenetre) => {
        const r = apparierFlou(fenetre, catalogue);
        return r.length > 0 ? { ficheId: r[0].id, score: r[0].score } : null;
      };
      const modele = await chargerModele((MODELES[langue] ?? MODELES.fr).fichier);
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      // LE CONTEXTE EST OUVERT À LA FRÉQUENCE DU MOTEUR : le navigateur rééchantillonne lui-même,
      // ce qui évite de le refaire à la main sur chaque tranche.
      ctx = new AudioContext({ sampleRate: FREQUENCE_VOSK });
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
      const grammaire = grammaireDeDictee(noms, langue);
      rec = new (modele as unknown as {
        KaldiRecognizer: new (f: number, g?: string) => Reconnaisseur;
      }).KaldiRecognizer(FREQUENCE_VOSK, JSON.stringify([...grammaire, "[unk]"]));
      rec.on("partialresult", (m: never) => {
        setPartiel((m as { result: { partial?: string } }).result.partial ?? "");
      });
      rec.on("result", (m: never) => {
        const texte = (m as { result: { text?: string } }).result.text ?? "";
        setPartiel("");
        if (!texte.trim()) return;
        const commandes = interpreterDictee(texte, noms, langue, flou);
        commandesRef.current(commandes);
        // « TERMINÉ » S'ARRÊTE ICI, et non chez l'appelant : c'est l'écoute qu'il ferme, et elle
        // n'appartient qu'à ce module. Les gestes qui le précèdent dans le même résultat ont déjà
        // été rendus, de sorte qu'on ne perd pas ce qui a été dit avant le mot d'arrêt.
        if (commandes.some((c) => c.quoi === "terminer")) arreterRef.current?.();
      });
      const source = ctx.createMediaStreamSource(flux);
      const relais = new AudioWorkletNode(ctx, "relais-dictee");
      relais.port.onmessage = (e: MessageEvent<Float32Array>) => {
        rec?.acceptWaveformFloat(e.data, FREQUENCE_VOSK);
      };
      source.connect(relais);
      // LE WORKLET N'EST PAS RELIÉ À LA SORTIE : il n'a rien à faire entendre, et le brancher
      // renverrait le micro dans les haut-parleurs.
      arretRef.current = () => {
        try { relais.port.onmessage = null; relais.disconnect(); source.disconnect(); } catch { /* déjà fermé */ }
        try { rec?.retrieveFinalResult(); rec?.remove(); } catch { /* déjà rendu */ }
        flux?.getTracks().forEach((t) => t.stop());
        void ctx?.close();
      };
      setEcoute(true);
    } catch (e) {
      // UNE PERMISSION REFUSÉE N'EST PAS UNE PANNE, et il faut tout de même défaire ce qui a été
      // ouvert avant elle : sans cela le micro resterait pris et le modèle chargé pour rien.
      flux?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      try { rec?.remove(); } catch { /* jamais créé */ }
      setErreur(e instanceof Error ? e.message : String(e));
      setEcoute(false);
    }
  }, [langue]);

  const basculer = useCallback(() => {
    if (ecoute) arreter();
    else void demarrer();
  }, [ecoute, arreter, demarrer]);

  // Le micro ne survit pas à la fenêtre : sans cela, un onglet fermé le laisserait pris.
  useEffect(() => () => { arretRef.current?.(); }, []);

  return { ecoute, partiel, erreur, basculer };
}

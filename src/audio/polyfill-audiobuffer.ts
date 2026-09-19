// audio/polyfill-audiobuffer.ts — Un AudioBuffer en JavaScript pur, pour les tests.
//
// POURQUOI IL EXISTE. Soixante-quatre fichiers de test commençaient par
// `import "node-web-audio-api/polyfill.js"`, qui installe l'API Web Audio complète — et charge
// un MODULE NATIF. Vitest donnant un processus à chaque fichier, ce module se chargeait
// soixante-quatre fois par lancement de la suite, et l'un de ces processus s'effondrait de
// temps à autre : « Worker exited unexpectedly with exit code 3221225477 », c'est-à-dire
// 0xC0000005, une violation d'accès Windows. Le fichier en cours disparaissait alors du
// décompte sans qu'aucun test n'échoue — une suite qui ne dit pas ce qu'elle reproche.
// Mesuré : un lancement complet sur trois.
//
// Or la plupart de ces fichiers ne veulent pas de l'API Web Audio : ils veulent le CONTENEUR.
// `klein.ts` et `risset.ts`, par exemple, construisent des `new AudioBuffer({...})` et lisent
// leurs canaux ; aucun contexte, aucune carte son, aucun décodage. Pour eux, un module natif
// est du risque sans contrepartie.
//
// Ce fichier fournit donc le conteneur seul, en une cinquantaine de lignes sans dépendance. Il
// n'installe rien s'il trouve un `AudioBuffer` déjà en place : un test qui a besoin du vrai
// portage — décodage, contexte hors ligne, rendu — continue d'importer `node-web-audio-api`, et
// les deux imports peuvent coexister dans le même fichier sans que celui-ci n'écrase celui-là.

/** La part d'AudioBuffer dont se servent les modules d'Attic : le conteneur et ses canaux. */
export class AudioBufferPur {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly canaux: Float32Array[];

  constructor(options: { numberOfChannels?: number; length: number; sampleRate: number }) {
    this.numberOfChannels = Math.max(1, Math.floor(options.numberOfChannels ?? 1));
    this.length = Math.max(0, Math.floor(options.length));
    this.sampleRate = options.sampleRate;
    this.duration = this.sampleRate > 0 ? this.length / this.sampleRate : 0;
    this.canaux = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length));
  }

  getChannelData(canal: number): Float32Array {
    const c = this.canaux[canal];
    if (!c) throw new Error(`AudioBuffer : canal ${canal} inexistant (${this.numberOfChannels} canaux)`);
    return c;
  }

  /**
   * Copie vers un canal, en respectant la borne de destination.
   *
   * Le vrai `copyToChannel` ne déborde pas : il s'arrête à la fin du canal, même si la source
   * est plus longue. Un polyfill qui laisserait `set` jeter une exception ferait échouer des
   * tests que le navigateur passe — c'est la différence qui compte ici.
   */
  copyToChannel(source: Float32Array, canal: number, debut = 0): void {
    const c = this.getChannelData(canal);
    const place = Math.max(0, c.length - debut);
    c.set(source.length > place ? source.subarray(0, place) : source, debut);
  }

  copyFromChannel(destination: Float32Array, canal: number, debut = 0): void {
    const c = this.getChannelData(canal);
    const dispo = Math.max(0, c.length - debut);
    destination.set(c.subarray(debut, debut + Math.min(destination.length, dispo)));
  }
}

const g = globalThis as typeof globalThis & { AudioBuffer?: unknown };
// Ne rien écraser : un fichier qui charge aussi le portage natif garde le vrai.
if (typeof g.AudioBuffer === "undefined") {
  g.AudioBuffer = AudioBufferPur as unknown as typeof AudioBuffer;
}

// scripts/soundhelix/TemoinSoundHelix.java — Fait rendre au programme SoundHelix 0.9 un morceau
// d'essai, sans le jouer, pour en tirer les témoins de `src/audio/temoins-soundhelix/`.
//
// POURQUOI PAR CE DÉTOUR. Le lecteur MIDI de SoundHelix écrit son fichier `.mid` AVANT de jouer en
// temps réel, et rien ne permet de sauter la lecture : lancé tel quel, le programme ouvre le
// synthétiseur de Java et fait entendre le morceau. Ce harnais appelle la génération
// (`SongUtils.generateSong`), puis la seule écriture du fichier (`MidiPlayer.saveMidiFiles`,
// méthode privée, par réflexion). Aucun périphérique MIDI n'est ouvert, rien ne s'entend.
//
// CE QU'IL N'EST PAS. Il ne fait pas partie d'Attic et n'est jamais livré : il se compile contre
// l'installation de SoundHelix 0.9 de celui qui régénère les témoins, par
// `scripts/temoins-soundhelix.mjs`, qui dit où la trouver. SoundHelix est sous GPLv3 ; ce fichier
// n'en recopie rien, il appelle son interface publique et deux membres privés par leur nom.
//
// RELEVÉ LE 2026-11-28 : deux générations du même XML sous le même nom rendent un `.mid` et un
// relevé identiques à l'octet. Le nom du morceau est la graine.
//
// Arguments : fichier-xml nom-du-morceau sortie.mid sortie.txt

import java.io.File;
import java.io.PrintWriter;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import com.soundhelix.component.player.impl.MidiPlayer;
import com.soundhelix.misc.ActivityMatrix;
import com.soundhelix.misc.ActivityVector;
import com.soundhelix.misc.Arrangement;
import com.soundhelix.misc.Chord;
import com.soundhelix.misc.Harmony;
import com.soundhelix.misc.Sequence;
import com.soundhelix.misc.SongContext;
import com.soundhelix.misc.Structure;
import com.soundhelix.misc.Track;
import com.soundhelix.util.HarmonyUtils;
import com.soundhelix.util.SongUtils;

public class TemoinSoundHelix {
    /**
     * Une ligne du relevé, finie par un saut de ligne seul (le caractère 10) : le dépôt range ses
     * textes en LF (`.gitattributes`), et `println` écrirait CRLF sous Windows, si bien qu'un témoin
     * régénéré ne serait plus le même octet pour octet que celui qui est versionné.
     */
    private static void ligne(PrintWriter w, String texte) {
        w.print(texte);
        w.print((char) 10);
    }

    private static Object champ(Object objet, String nom) throws Exception {
        Field f = objet.getClass().getDeclaredField(nom);
        f.setAccessible(true);
        return f.get(objet);
    }

    public static void main(String[] args) throws Exception {
        SongContext ctx = SongUtils.generateSong(new File(args[0]).toURI().toURL(), args[1]);
        MidiPlayer lecteur = (MidiPlayer) ctx.getPlayer();
        lecteur.setMidiFilename(args[2]);
        Field contexte = MidiPlayer.class.getDeclaredField("songContext");
        contexte.setAccessible(true);
        contexte.set(lecteur, ctx);
        Method ecrire = MidiPlayer.class.getDeclaredMethod("saveMidiFiles");
        ecrire.setAccessible(true);
        ecrire.invoke(lecteur);

        Structure s = ctx.getStructure();
        try (PrintWriter w = new PrintWriter(args[3], "UTF-8")) {
            ligne(w, "nom=" + ctx.getSongName());
            ligne(w, "graine=" + ctx.getRandomSeed());
            ligne(w, "mesures=" + s.getBars());
            ligne(w, "tempsParMesure=" + s.getBeatsPerBar());
            ligne(w, "ticsParTemps=" + s.getTicksPerBeat());
            ligne(w, "tics=" + s.getTicks());
            ligne(w, "velociteMax=" + s.getMaxVelocity());
            ligne(w, "milliBPM=" + lecteur.getMilliBPM());
            ligne(w, "transposition=" + champ(lecteur, "transposition"));
            ligne(w, "groove=" + Arrays.toString((int[]) champ(lecteur, "groove")).replaceAll("[\\[\\] ]", ""));

            List<Integer> debuts = HarmonyUtils.getChordSectionStartTicks(ctx);
            for (int k = 0; k < debuts.size(); k++) {
                ligne(w, "section " + k + " tic=" + debuts.get(k));
            }

            Harmony h = ctx.getHarmony();
            for (int tic = 0; tic < s.getTicks(); ) {
                Chord c = h.getChord(tic);
                int duree = h.getChordTicks(tic);
                ligne(w, "accord tic=" + tic + " tics=" + duree + " nom=" + c + " hauteurs="
                        + c.getLowPitch() + "," + c.getMiddlePitch() + "," + c.getHighPitch());
                tic += duree;
            }

            ActivityMatrix m = ctx.getActivityMatrix();
            for (Iterator<ActivityVector> it = m.iterator(); it.hasNext(); ) {
                ActivityVector av = it.next();
                ligne(w, "voix " + av.getName() + " segments="
                        + Arrays.toString(av.getSegmentLengths()).replaceAll("[\\[\\] ]", ""));
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> canaux = (Map<String, Object>) champ(lecteur, "channelMap");
            Arrangement arrangement = ctx.getArrangement();
            for (Iterator<Arrangement.ArrangementEntry> it = arrangement.iterator(); it.hasNext(); ) {
                Arrangement.ArrangementEntry entree = it.next();
                Object dc = canaux.get(entree.getInstrument());
                Track piste = entree.getTrack();
                for (int i = 0; i < piste.size(); i++) {
                    StringBuilder b = new StringBuilder();
                    for (Iterator<Sequence.SequenceEntry> e = piste.get(i).iterator(); e.hasNext(); ) {
                        Sequence.SequenceEntry se = e.next();
                        if (b.length() > 0) {
                            b.append(',');
                        }
                        if (se.isPause()) {
                            b.append("-/").append(se.getTicks());
                        } else {
                            b.append(se.getPitch()).append(se.isLegato() ? "~" : "").append('/')
                                    .append(se.getTicks()).append(':').append(se.getVelocity());
                        }
                    }
                    ligne(w, "sequence instrument=" + entree.getInstrument() + " type=" + piste.getType()
                            + " canal=" + ((int) champ(dc, "channel") + 1) + " programme=" + champ(dc, "program")
                            + " rang=" + i + " entrees=" + b);
                }
            }
        }
    }
}

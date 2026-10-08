; ───────────────────────────────────────────────────────────────────────────────────────────────
; NEVER INSTALL INTO, NOR UNINSTALL FROM, A SOURCE CHECKOUT.
;
; THIS IS WRITTEN FROM A LOSS, NOT FROM A WORRY. On 2026-10-08 an Attic installation was living in
; `E:\attic`, the source directory: the installer had once been pointed at it, `.gitignore` recorded
; the fact, and the note it carried ended with "that does not replace uninstalling the application
; from here". Installing v5.0.0 — to the default `C:\Program Files\Attic`, not to `E:\attic` —
; read the previous install location out of the registry and ran the old uninstaller silently
; first. An electron-builder uninstaller does `RMDir /r "$INSTDIR"`. `E:\attic` was emptied: the
; working tree, `.git`, and everything git ignored — the models, the SoundFont, `presets/`,
; `work/`, the user's own media. What was committed survived on the remote; the rest did not.
;
; THE DESTRUCTIVE STEP WAS NOT THE ONE ANYONE WATCHED. Nobody ran the uninstaller. It was run by
; an installer, silently, on a path chosen months earlier, while the operator was installing to a
; different directory entirely. No dialog named `E:\attic`, and nothing asked.
;
; SO THE TEST IS ON THE DIRECTORY, NOT ON INTENT, and it is made in two places:
;   · `customInit` runs inside `.onInit`, BEFORE the install section runs the old uninstaller.
;     That is the exact point at which the loss above could have been refused.
;   · `customUnInit` runs inside `un.onInit`, so an uninstaller launched by any route — an update,
;     the Control Panel, the shortcut — stops before deleting anything.
;
; WHAT COUNTS AS A CHECKOUT IS A FORM, not this project's name: a `.git` directory, a
; `package.json`, a `src` directory, a `node_modules` directory. Any one is enough. A real Attic
; installation has none of the four at its top level — it holds `Attic.exe`, `resources\`,
; `locales\` and the Chromium `.pak` files — so an ordinary install or update is not touched. The
; guard would equally refuse somebody else's checkout, which is the point: it protects a working
; tree, not a particular repository.
;
; `/SD IDOK` gives the message a defined answer under `/S`; the `Abort` fires either way, which is
; what matters, since the silent run is the dangerous one.
!macro atticRefuserArbreDeSources ETIQUETTE MESSAGE
  IfFileExists "$INSTDIR\.git\*.*" ${ETIQUETTE}_source
  IfFileExists "$INSTDIR\package.json" ${ETIQUETTE}_source
  IfFileExists "$INSTDIR\src\*.*" ${ETIQUETTE}_source
  IfFileExists "$INSTDIR\node_modules\*.*" ${ETIQUETTE}_source
  Goto ${ETIQUETTE}_ok
  ${ETIQUETTE}_source:
  MessageBox MB_OK|MB_ICONSTOP /SD IDOK "${MESSAGE}"
  Abort
  ${ETIQUETTE}_ok:
!macroend

!macro customInit
  !insertmacro atticRefuserArbreDeSources "init" "Attic will not install here.$\n$\n$INSTDIR looks like a source checkout: it holds a .git, package.json, src or node_modules.$\n$\nThe uninstaller deletes everything in its install directory, and an update runs it without asking. Installing here would put a working tree one update away from being erased.$\n$\nChoose an empty directory, or the default one."

  ; Check free disk space on the drive that will hold $INSTDIR.
  ; GetDiskFreeSpaceEx returns three 64-bit values and a boolean return code.
  StrCpy $0 $INSTDIR 1
  System::Call 'kernel32::GetDiskFreeSpaceEx(t "$0:\", *l .r1, *l .r2, *l .r3) i .r4'
  IntCmp $4 0 ok

  ; Minimum required free space: 2 GiB.
  ;
  ; IT WAS LOWERED TO 1 GiB ON 2026-10-08 AND THAT WAS WRONG, found by measuring the published
  ; v5.0.0 installer. The reasoning was that the installer no longer carries the ONNX models, so
  ; it needed less room — but this check guards what the install COSTS ON DISK, not what the user
  ; downloads, and those are different numbers. Measured on Attic-Setup-5.0.0.exe:
  ;
  ;   downloaded installer            440,512,087 bytes   (440.5 MB / 420.1 MiB)
  ;   its payload, app-64.7z          439,931,366 bytes   extracted to %TEMP% during install
  ;   the installed application       996,717,321 bytes   (996.7 MB / 950.5 MiB), 733 files
  ;
  ; At a 1 GiB threshold a drive with exactly 1,073,741,824 bytes free PASSED the check and was
  ; then left 77,024,503 bytes — and that ignores %TEMP%. When the temporary directory sits on the
  ; install drive, which is the default C: case, the payload and the expanded application are on
  ; it at the same time: a peak of 1,436,648,687 bytes, 1.34 GiB. The check let that through.
  ;
  ; 2 GiB covers the peak with room to spare, and the division below can only express whole GiB.
  ; RE-MEASURE RATHER THAN TRUST THIS COMMENT: extract a published installer with
  ; `7z x Attic-Setup-X.Y.Z.exe`, then `7z l "$PLUGINSDIR/app-64.7z"` prints the uncompressed
  ; total on its last line. That is the installed footprint.
  ;
  ; What is embedded, and what it weighs inside the installed application — the SoundFont is the
  ; largest single item, and it stays bundled: it is what every MIDI instrument sounds through.
  ;
  ;   resources\sf2                 148,398,306     resources\sfz                      369,972
  ;   resources\music collection     77,857,745     resources\exemples                 105,920
  ;   resources\magenta              76,775,321     resources\THIRD_PARTY.md            37,341
  ;   resources\bin (songsee)         6,450,755     resources\TERMS_OF_USE.txt           1,072
  ;
  ; That is 309,996,432 bytes of bundled resources (310.0 MB / 295.6 MiB); the rest of the
  ; 996,717,321 is Electron and the application itself. An earlier version of this comment said
  ; "373.5 MB of sources" and listed Csound, which is not an extraResources entry, while omitting
  ; songsee, which is: it had been measured on a working copy holding three music files absent
  ; from the collection manifest and an example absent from git.
  ;
  ; The AI models are fetched afterwards, from inside the app, and need their own space: the
  ; largest single package is 1.7 GB. The app shows each one's size before downloading it, so that
  ; choice is made with the figures in view — it is not this installer's business to reserve it.
  System::Int64Op $1 / 1073741824
  Pop $5
  ; IntCmp syntax: value1 value2 jump_equal jump_less jump_more
  IntCmp $5 2 ok less ok
less:
  MessageBox MB_OK "Insufficient disk space.$\nThis installer requires at least 2 GB of free space on drive $0:.$\nThe application takes about 950 MiB once installed, and the installer needs room to unpack it first.$\nThe AI models are downloaded later, from inside the app, and need additional space.$\nPlease free some space and run the installer again."
  Abort

  ok:
!macroend

; L'AUTRE MOITIÉ DU CONTRAT, et celle qui aurait arrêté la perte même si l'installation avait déjà
; été faite au mauvais endroit : un désinstalleur qui s'apprête à effacer un arbre de sources
; s'arrête. Le cas silencieux — l'ancien désinstalleur lancé par un installeur neuf — passe par ici
; comme les autres.
!macro customUnInit
  !insertmacro atticRefuserArbreDeSources "uninit" "Attic will not uninstall from here.$\n$\n$INSTDIR looks like a source checkout: it holds a .git, package.json, src or node_modules.$\n$\nUninstalling deletes everything in this directory, which would take the working tree with it. Remove the application files by hand if that is what you meant."
!macroend

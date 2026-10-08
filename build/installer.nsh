!macro customInit
  ; Check free disk space on the drive that will hold $INSTDIR.
  ; GetDiskFreeSpaceEx returns three 64-bit values and a boolean return code.
  StrCpy $0 $INSTDIR 1
  System::Call 'kernel32::GetDiskFreeSpaceEx(t "$0:\", *l .r1, *l .r2, *l .r3) i .r4'
  IntCmp $4 0 ok

  ; Minimum required free space: 1 GB.
  ;
  ; It was 2 GB while the installer carried the ONNX models. Since 2026-10-08 it carries none:
  ; `public/oonx` left `build.extraResources`, and what remains — SoundFont, SFZ kit, Magenta
  ; checkpoints, demo collection, Csound, examples — measures 373.5 MB of sources. The last
  ; installer built without models measured 413,954,185 bytes, which is the figure this threshold
  ; rests on; re-measure it once a new one exists rather than trusting this comment.
  ;
  ; The AI models are fetched afterwards, from inside the app, and need their own space: the
  ; largest single package is 1.7 GB. The app shows each one's size before downloading it, so that
  ; choice is made with the figures in view — it is not this installer's business to reserve it.
  System::Int64Op $1 / 1073741824
  Pop $5
  ; IntCmp syntax: value1 value2 jump_equal jump_less jump_more
  IntCmp $5 1 ok less ok
less:
  MessageBox MB_OK "Insufficient disk space.$\nThis installer requires at least 1 GB of free space on drive $0:.$\nThe AI models are downloaded later, from inside the app, and need additional space.$\nPlease free some space and run the installer again."
  Abort

  ok:
!macroend

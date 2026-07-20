!macro customInit
  ; Check free disk space on the drive that will hold $INSTDIR.
  ; GetDiskFreeSpaceEx returns three 64-bit values and a boolean return code.
  StrCpy $0 $INSTDIR 1
  System::Call 'kernel32::GetDiskFreeSpaceEx(t "$0:\", *l .r1, *l .r2, *l .r3) i .r4'
  IntCmp $4 0 ok

  ; Minimum required free space: 2 GB (2 * 1024 * 1024 * 1024 bytes)
  System::Int64Op $1 / 1073741824
  Pop $5
  ; IntCmp syntax: value1 value2 jump_equal jump_less jump_more
  IntCmp $5 2 ok less ok
less:
  MessageBox MB_OK "Insufficient disk space.$\nThis installer requires at least 2 GB of free space on drive $0:.$\nPlease free some space and run the installer again."
  Abort

  ok:
!macroend

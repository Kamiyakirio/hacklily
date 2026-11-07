; Runtime registration is per user and optional. Only remove this installation's
; entries, preserving other applications and the protected Windows UserChoice.
!macro NSIS_HOOK_PREUNINSTALL
  ReadRegStr $R0 HKCU "Software\Classes\org.hacklily.app.LilyPond\shell\open\command" ""
  StrCmp $R0 '$"$INSTDIR\hacklily-desktop.exe$" $"%1$"' 0 hacklily_association_cleanup_done
  DeleteRegValue HKCU "Software\Classes\.ly\OpenWithProgids" "org.hacklily.app.LilyPond"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Hacklily"
  DeleteRegKey HKCU "Software\Classes\org.hacklily.app.LilyPond"
  DeleteRegKey HKCU "Software\Hacklily\FileAssociations"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  hacklily_association_cleanup_done:
!macroend

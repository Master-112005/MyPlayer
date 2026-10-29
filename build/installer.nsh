!macro customInstall
  CreateDirectory "$SMPROGRAMS\MyPlayer"
  CreateShortCut "$SMPROGRAMS\MyPlayer\MyMusic.lnk" "$INSTDIR\MyPlayer.exe" "--player=music" "$INSTDIR\resources\mymusicplayer.ico" 0
  CreateShortCut "$SMPROGRAMS\MyPlayer\MyCinema.lnk" "$INSTDIR\MyPlayer.exe" "--player=cinema" "$INSTDIR\resources\mycinema.ico" 0
  CreateShortCut "$DESKTOP\MyMusic.lnk" "$INSTDIR\MyPlayer.exe" "--player=music" "$INSTDIR\resources\mymusicplayer.ico" 0
  CreateShortCut "$DESKTOP\MyCinema.lnk" "$INSTDIR\MyPlayer.exe" "--player=cinema" "$INSTDIR\resources\mycinema.ico" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\MyPlayer\MyMusic.lnk"
  Delete "$SMPROGRAMS\MyPlayer\MyCinema.lnk"
  RMDir "$SMPROGRAMS\MyPlayer"
  Delete "$DESKTOP\MyMusic.lnk"
  Delete "$DESKTOP\MyCinema.lnk"
!macroend

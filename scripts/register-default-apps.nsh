!macro RegisterMusicAssociation EXT
  WriteRegStr HKCU "Software\Classes\MyMusic.${EXT}" "" "MyMusic ${EXT} audio"
  WriteRegStr HKCU "Software\Classes\MyMusic.${EXT}\DefaultIcon" "" "$INSTDIR\resources\mymusicplayer.ico,0"
  WriteRegStr HKCU "Software\Classes\MyMusic.${EXT}\shell\open\command" "" "$\"$INSTDIR\MyPlayer.exe$\" --player=music $\"%1$\""
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "MyMusic.${EXT}" ""
  WriteRegStr HKCU "Software\MyPlayer\MyMusic\Capabilities\FileAssociations" ".${EXT}" "MyMusic.${EXT}"
!macroend

!macro RegisterCinemaAssociation EXT
  WriteRegStr HKCU "Software\Classes\MyCinema.Video.${EXT}.1" "" "MyCinema ${EXT} video"
  WriteRegStr HKCU "Software\Classes\MyCinema.Video.${EXT}.1\DefaultIcon" "" "$INSTDIR\resources\mycinema.ico,0"
  WriteRegStr HKCU "Software\Classes\MyCinema.Video.${EXT}.1\shell\open\command" "" "$\"$INSTDIR\MyPlayer.exe$\" --player=cinema $\"%1$\""
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "MyCinema.Video.${EXT}.1" ""
  WriteRegStr HKCU "Software\MyPlayer\MyCinema\Capabilities\FileAssociations" ".${EXT}" "MyCinema.Video.${EXT}.1"
!macroend

!macro UnregisterMusicAssociation EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "MyMusic.${EXT}"
  DeleteRegKey HKCU "Software\Classes\MyMusic.${EXT}"
!macroend

!macro UnregisterCinemaAssociation EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "MyCinema.${EXT}"
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "MyCinema.Video.${EXT}.1"
  DeleteRegKey HKCU "Software\Classes\MyCinema.${EXT}"
  DeleteRegKey HKCU "Software\Classes\MyCinema.Video.${EXT}.1"
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\RegisteredApplications" "MyMusic" "Software\MyPlayer\MyMusic\Capabilities"
  WriteRegStr HKCU "Software\MyPlayer\MyMusic\Capabilities" "ApplicationName" "MyMusic"
  WriteRegStr HKCU "Software\MyPlayer\MyMusic\Capabilities" "ApplicationDescription" "Play your audio files with MyMusic"
  WriteRegStr HKCU "Software\MyPlayer\MyMusic\Capabilities" "ApplicationIcon" "$INSTDIR\resources\mymusicplayer.ico,0"
  CreateShortCut "$SMPROGRAMS\MyMusic.lnk" "$INSTDIR\MyPlayer.exe" "--player=music" "$INSTDIR\resources\mymusicplayer.ico" 0
  CreateShortCut "$SMPROGRAMS\MyCinema.lnk" "$INSTDIR\MyPlayer.exe" "--player=cinema" "$INSTDIR\resources\mycinema.ico" 0
  DeleteRegValue HKCU "Software\RegisteredApplications" "MyCinema"
  DeleteRegKey HKCU "Software\MyPlayer\MyCinema\Capabilities"
  !insertmacro UnregisterCinemaAssociation 3g2
  !insertmacro UnregisterCinemaAssociation 3gp
  !insertmacro UnregisterCinemaAssociation 3gpp
  !insertmacro UnregisterCinemaAssociation amv
  !insertmacro UnregisterCinemaAssociation asf
  !insertmacro UnregisterCinemaAssociation avi
  !insertmacro UnregisterCinemaAssociation bik
  !insertmacro UnregisterCinemaAssociation cam
  !insertmacro UnregisterCinemaAssociation cine
  !insertmacro UnregisterCinemaAssociation divx
  !insertmacro UnregisterCinemaAssociation drc
  !insertmacro UnregisterCinemaAssociation dsm
!insertmacro UnregisterCinemaAssociation dat
  !insertmacro UnregisterCinemaAssociation dv
  !insertmacro UnregisterCinemaAssociation evo
  !insertmacro UnregisterCinemaAssociation f4v
  !insertmacro UnregisterCinemaAssociation fli
  !insertmacro UnregisterCinemaAssociation flc
  !insertmacro UnregisterCinemaAssociation flv
  !insertmacro UnregisterCinemaAssociation gvi
  !insertmacro UnregisterCinemaAssociation h264
  !insertmacro UnregisterCinemaAssociation h265
  !insertmacro UnregisterCinemaAssociation hevc
  !insertmacro UnregisterCinemaAssociation m1v
  !insertmacro UnregisterCinemaAssociation m2p
  !insertmacro UnregisterCinemaAssociation m2t
  !insertmacro UnregisterCinemaAssociation m2ts
  !insertmacro UnregisterCinemaAssociation m2v
  !insertmacro UnregisterCinemaAssociation m4v
  !insertmacro UnregisterCinemaAssociation mjpeg
  !insertmacro UnregisterCinemaAssociation mjpg
  !insertmacro UnregisterCinemaAssociation mkv
  !insertmacro UnregisterCinemaAssociation mks
  !insertmacro UnregisterCinemaAssociation mod
  !insertmacro UnregisterCinemaAssociation mov
  !insertmacro UnregisterCinemaAssociation mp2
  !insertmacro UnregisterCinemaAssociation mp4
  !insertmacro UnregisterCinemaAssociation mpe
  !insertmacro UnregisterCinemaAssociation mpeg
  !insertmacro UnregisterCinemaAssociation mpeg1
  !insertmacro UnregisterCinemaAssociation mpeg2
  !insertmacro UnregisterCinemaAssociation mpeg4
  !insertmacro UnregisterCinemaAssociation mpg
  !insertmacro UnregisterCinemaAssociation mpv
  !insertmacro UnregisterCinemaAssociation mpv2
  !insertmacro UnregisterCinemaAssociation mts
  !insertmacro UnregisterCinemaAssociation mxf
  !insertmacro UnregisterCinemaAssociation nsv
  !insertmacro UnregisterCinemaAssociation nut
  !insertmacro UnregisterCinemaAssociation nuv
  !insertmacro UnregisterCinemaAssociation ogm
  !insertmacro UnregisterCinemaAssociation ogv
  !insertmacro UnregisterCinemaAssociation ogx
  !insertmacro UnregisterCinemaAssociation pva
  !insertmacro UnregisterCinemaAssociation qt
  !insertmacro UnregisterCinemaAssociation rec
  !insertmacro UnregisterCinemaAssociation rm
  !insertmacro UnregisterCinemaAssociation rmvb
  !insertmacro UnregisterCinemaAssociation roq
  !insertmacro UnregisterCinemaAssociation rv
  !insertmacro UnregisterCinemaAssociation smk
  !insertmacro UnregisterCinemaAssociation str
  !insertmacro UnregisterCinemaAssociation tp
  !insertmacro UnregisterCinemaAssociation trp
  !insertmacro UnregisterCinemaAssociation ts
  !insertmacro UnregisterCinemaAssociation vob
  !insertmacro UnregisterCinemaAssociation webm
  !insertmacro UnregisterCinemaAssociation wmv
  !insertmacro UnregisterCinemaAssociation wtv
  !insertmacro UnregisterCinemaAssociation xvid
  !insertmacro UnregisterCinemaAssociation y4m
  !insertmacro UnregisterCinemaAssociation yuv
  WriteRegStr HKCU "Software\RegisteredApplications" "MyCinema" "Software\MyPlayer\MyCinema\Capabilities"
  WriteRegStr HKCU "Software\MyPlayer\MyCinema\Capabilities" "ApplicationName" "MyCinema"
  WriteRegStr HKCU "Software\MyPlayer\MyCinema\Capabilities" "ApplicationDescription" "Play your video files with MyCinema"
  WriteRegStr HKCU "Software\MyPlayer\MyCinema\Capabilities" "ApplicationIcon" "$INSTDIR\resources\mycinema.ico,0"
  !insertmacro RegisterCinemaAssociation 3g2
  !insertmacro RegisterCinemaAssociation 3gp
  !insertmacro RegisterCinemaAssociation 3gpp
  !insertmacro RegisterCinemaAssociation amv
  !insertmacro RegisterCinemaAssociation asf
  !insertmacro RegisterCinemaAssociation avi
  !insertmacro RegisterCinemaAssociation bik
  !insertmacro RegisterCinemaAssociation cam
  !insertmacro RegisterCinemaAssociation cine
  !insertmacro RegisterCinemaAssociation divx
  !insertmacro RegisterCinemaAssociation drc
  !insertmacro RegisterCinemaAssociation dsm
  !insertmacro RegisterCinemaAssociation dat
  !insertmacro RegisterCinemaAssociation dv
  !insertmacro RegisterCinemaAssociation evo
  !insertmacro RegisterCinemaAssociation f4v
  !insertmacro RegisterCinemaAssociation fli
  !insertmacro RegisterCinemaAssociation flc
  !insertmacro RegisterCinemaAssociation flv
  !insertmacro RegisterCinemaAssociation gvi
  !insertmacro RegisterCinemaAssociation h264
  !insertmacro RegisterCinemaAssociation h265
  !insertmacro RegisterCinemaAssociation hevc
  !insertmacro RegisterCinemaAssociation m1v
  !insertmacro RegisterCinemaAssociation m2p
  !insertmacro RegisterCinemaAssociation m2t
  !insertmacro RegisterCinemaAssociation m2ts
  !insertmacro RegisterCinemaAssociation m2v
  !insertmacro RegisterCinemaAssociation m4v
  !insertmacro RegisterCinemaAssociation mjpeg
  !insertmacro RegisterCinemaAssociation mjpg
  !insertmacro RegisterCinemaAssociation mkv
  !insertmacro RegisterCinemaAssociation mks
  !insertmacro RegisterCinemaAssociation mod
  !insertmacro RegisterCinemaAssociation mov
  !insertmacro RegisterCinemaAssociation mp2
  !insertmacro RegisterCinemaAssociation mp4
  !insertmacro RegisterCinemaAssociation mpe
  !insertmacro RegisterCinemaAssociation mpeg
  !insertmacro RegisterCinemaAssociation mpeg1
  !insertmacro RegisterCinemaAssociation mpeg2
  !insertmacro RegisterCinemaAssociation mpeg4
  !insertmacro RegisterCinemaAssociation mpg
  !insertmacro RegisterCinemaAssociation mpv
  !insertmacro RegisterCinemaAssociation mpv2
  !insertmacro RegisterCinemaAssociation mts
  !insertmacro RegisterCinemaAssociation mxf
  !insertmacro RegisterCinemaAssociation nsv
  !insertmacro RegisterCinemaAssociation nut
  !insertmacro RegisterCinemaAssociation nuv
  !insertmacro RegisterCinemaAssociation ogm
  !insertmacro RegisterCinemaAssociation ogv
  !insertmacro RegisterCinemaAssociation ogx
  !insertmacro RegisterCinemaAssociation pva
  !insertmacro RegisterCinemaAssociation qt
  !insertmacro RegisterCinemaAssociation rec
  !insertmacro RegisterCinemaAssociation rm
  !insertmacro RegisterCinemaAssociation rmvb
  !insertmacro RegisterCinemaAssociation roq
  !insertmacro RegisterCinemaAssociation rv
  !insertmacro RegisterCinemaAssociation smk
  !insertmacro RegisterCinemaAssociation str
  !insertmacro RegisterCinemaAssociation tp
  !insertmacro RegisterCinemaAssociation trp
  !insertmacro RegisterCinemaAssociation ts
  !insertmacro RegisterCinemaAssociation vob
  !insertmacro RegisterCinemaAssociation webm
  !insertmacro RegisterCinemaAssociation wmv
  !insertmacro RegisterCinemaAssociation wtv
  !insertmacro RegisterCinemaAssociation xvid
  !insertmacro RegisterCinemaAssociation y4m
  !insertmacro RegisterCinemaAssociation yuv
  !insertmacro RegisterMusicAssociation mp3
  !insertmacro RegisterMusicAssociation m4a
  !insertmacro RegisterMusicAssociation aac
  !insertmacro RegisterMusicAssociation wav
  !insertmacro RegisterMusicAssociation flac
  !insertmacro RegisterMusicAssociation ogg
  !insertmacro RegisterMusicAssociation opus
  !insertmacro RegisterMusicAssociation wma
  !insertmacro RegisterMusicAssociation aiff
  !insertmacro RegisterMusicAssociation aif
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\MyMusic.lnk"
  Delete "$SMPROGRAMS\MyCinema.lnk"
  DeleteRegValue HKCU "Software\RegisteredApplications" "MyMusic"
  DeleteRegValue HKCU "Software\RegisteredApplications" "MyCinema"
  !insertmacro UnregisterMusicAssociation mp3
  !insertmacro UnregisterMusicAssociation m4a
  !insertmacro UnregisterMusicAssociation aac
  !insertmacro UnregisterMusicAssociation wav
  !insertmacro UnregisterMusicAssociation flac
  !insertmacro UnregisterMusicAssociation ogg
  !insertmacro UnregisterMusicAssociation opus
  !insertmacro UnregisterMusicAssociation wma
  !insertmacro UnregisterMusicAssociation aiff
  !insertmacro UnregisterMusicAssociation aif
  !insertmacro UnregisterCinemaAssociation 3g2
  !insertmacro UnregisterCinemaAssociation 3gp
  !insertmacro UnregisterCinemaAssociation 3gpp
  !insertmacro UnregisterCinemaAssociation amv
  !insertmacro UnregisterCinemaAssociation asf
  !insertmacro UnregisterCinemaAssociation avi
  !insertmacro UnregisterCinemaAssociation bik
  !insertmacro UnregisterCinemaAssociation cam
  !insertmacro UnregisterCinemaAssociation cine
  !insertmacro UnregisterCinemaAssociation divx
  !insertmacro UnregisterCinemaAssociation drc
  !insertmacro UnregisterCinemaAssociation dsm
!insertmacro UnregisterCinemaAssociation dat
  !insertmacro UnregisterCinemaAssociation dv
  !insertmacro UnregisterCinemaAssociation evo
  !insertmacro UnregisterCinemaAssociation f4v
  !insertmacro UnregisterCinemaAssociation fli
  !insertmacro UnregisterCinemaAssociation flc
  !insertmacro UnregisterCinemaAssociation flv
  !insertmacro UnregisterCinemaAssociation gvi
  !insertmacro UnregisterCinemaAssociation h264
  !insertmacro UnregisterCinemaAssociation h265
  !insertmacro UnregisterCinemaAssociation hevc
  !insertmacro UnregisterCinemaAssociation m1v
  !insertmacro UnregisterCinemaAssociation m2p
  !insertmacro UnregisterCinemaAssociation m2t
  !insertmacro UnregisterCinemaAssociation m2ts
  !insertmacro UnregisterCinemaAssociation m2v
  !insertmacro UnregisterCinemaAssociation m4v
  !insertmacro UnregisterCinemaAssociation mjpeg
  !insertmacro UnregisterCinemaAssociation mjpg
  !insertmacro UnregisterCinemaAssociation mkv
  !insertmacro UnregisterCinemaAssociation mks
  !insertmacro UnregisterCinemaAssociation mod
  !insertmacro UnregisterCinemaAssociation mov
  !insertmacro UnregisterCinemaAssociation mp2
  !insertmacro UnregisterCinemaAssociation mp4
  !insertmacro UnregisterCinemaAssociation mpe
  !insertmacro UnregisterCinemaAssociation mpeg
  !insertmacro UnregisterCinemaAssociation mpeg1
  !insertmacro UnregisterCinemaAssociation mpeg2
  !insertmacro UnregisterCinemaAssociation mpeg4
  !insertmacro UnregisterCinemaAssociation mpg
  !insertmacro UnregisterCinemaAssociation mpv
  !insertmacro UnregisterCinemaAssociation mpv2
  !insertmacro UnregisterCinemaAssociation mts
  !insertmacro UnregisterCinemaAssociation mxf
  !insertmacro UnregisterCinemaAssociation nsv
  !insertmacro UnregisterCinemaAssociation nut
  !insertmacro UnregisterCinemaAssociation nuv
  !insertmacro UnregisterCinemaAssociation ogm
  !insertmacro UnregisterCinemaAssociation ogv
  !insertmacro UnregisterCinemaAssociation ogx
  !insertmacro UnregisterCinemaAssociation pva
  !insertmacro UnregisterCinemaAssociation qt
  !insertmacro UnregisterCinemaAssociation rec
  !insertmacro UnregisterCinemaAssociation rm
  !insertmacro UnregisterCinemaAssociation rmvb
  !insertmacro UnregisterCinemaAssociation roq
  !insertmacro UnregisterCinemaAssociation rv
  !insertmacro UnregisterCinemaAssociation smk
  !insertmacro UnregisterCinemaAssociation str
  !insertmacro UnregisterCinemaAssociation tp
  !insertmacro UnregisterCinemaAssociation trp
  !insertmacro UnregisterCinemaAssociation ts
  !insertmacro UnregisterCinemaAssociation vob
  !insertmacro UnregisterCinemaAssociation webm
  !insertmacro UnregisterCinemaAssociation wmv
  !insertmacro UnregisterCinemaAssociation wtv
  !insertmacro UnregisterCinemaAssociation xvid
  !insertmacro UnregisterCinemaAssociation y4m
  !insertmacro UnregisterCinemaAssociation yuv
  DeleteRegKey HKCU "Software\MyPlayer\MyMusic"
  DeleteRegKey HKCU "Software\MyPlayer\MyCinema"
!macroend

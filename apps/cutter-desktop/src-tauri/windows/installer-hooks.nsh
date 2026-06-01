!macro _MIXLAB_STOP_PROCESS _PROCESS_NAME
  DetailPrint "Stopping ${_PROCESS_NAME} if it is running..."
  nsExec::ExecToLog 'taskkill /F /T /IM "${_PROCESS_NAME}"'
  Pop $0
!macroend

!macro _MIXLAB_STOP_RUNNING_APP
  !insertmacro _MIXLAB_STOP_PROCESS "MixLab Cutter.exe"
  !insertmacro _MIXLAB_STOP_PROCESS "cutter-api-sidecar-x86_64-pc-windows-msvc.exe"
  Sleep 1000
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _MIXLAB_STOP_RUNNING_APP
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro _MIXLAB_STOP_RUNNING_APP
!macroend

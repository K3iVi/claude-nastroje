# Instalace hlidace compactu pro Claude desktop (Windows).
# Zkopiruje skript do ~/.claude/hlidac-compact a zalozi ulohu Planovace, ktera ho pousti kazdou minutu.
#   -NaSucho  jen zapisuje do logu, co by udelal (nic nepise do oken)
#   -Uloha    nazev ulohy v Planovaci
param(
  [switch]$NaSucho,
  [string]$Uloha = 'Claude hlidac compact'
)
$ErrorActionPreference = 'Stop'

$data = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Claude-Data') -Directory -Filter 'claude_*' -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName 'claude-code-sessions') } | Select-Object -First 1
if (-not $data) {
  Write-Warning "Nenasel jsem data Claude desktop (%LOCALAPPDATA%\Claude-Data\claude_*\claude-code-sessions). Hlidac by nevidel zadna okna, instalaci koncim."
  exit 1
}

# mimo %LOCALAPPDATA%: Claude desktop (MSIX) tam zapisuje do virtualni kopie, Planovac by soubory nevidel
$cil = Join-Path $env:USERPROFILE '.claude\hlidac-compact'
New-Item -ItemType Directory -Force $cil | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'hlidac-compact.ps1') $cil -Force

$prepinac = if ($NaSucho) { '' } else { ' -Ostre' }
$vbs = @"
' Spusti hlidac bez blikajiciho okna PowerShellu (Planovac uloh)
Dim d : d = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & d & "\hlidac-compact.ps1""$prepinac", 0, True
"@
Set-Content (Join-Path $cil 'spust-skryte.vbs') $vbs -Encoding ASCII

$akce = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$cil\spust-skryte.vbs`""
$spoustec = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$nastaveni = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$kdo = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
Register-ScheduledTask -TaskName $Uloha -Action $akce -Trigger $spoustec -Settings $nastaveni -Principal $kdo `
  -Description 'Kompaktuje velka necinna okna Claude pred vyprsenim cache' -Force | Out-Null

$rezim = if ($NaSucho) { 'NA SUCHO (jen log)' } else { 'OSTRE' }
Write-Host "Hotovo: uloha '$Uloha' bezi kazdou minutu, rezim $rezim."
Write-Host "Skript a log: $cil (hlidac.log)"

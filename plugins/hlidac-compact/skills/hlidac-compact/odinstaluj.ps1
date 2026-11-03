# Odinstalace hlidace compactu: smaze ulohu Planovace a skripty.
#   -VcetneLogu  smaze i log a stav (jinak zustanou v ~/.claude/hlidac-compact)
param(
  [switch]$VcetneLogu,
  [string]$Uloha = 'Claude hlidac compact'
)
$ErrorActionPreference = 'Stop'
if (Get-ScheduledTask -TaskName $Uloha -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $Uloha -Confirm:$false
  Write-Host "Uloha '$Uloha' smazana."
}
$cil = Join-Path $env:USERPROFILE '.claude\hlidac-compact'
foreach ($f in 'hlidac-compact.ps1', 'spust-skryte.vbs') {
  $p = Join-Path $cil $f
  if (Test-Path $p) { Remove-Item $p -Force }
}
if ($VcetneLogu) {
  foreach ($f in 'hlidac.log', 'stav.json') {
    $p = Join-Path $cil $f
    if (Test-Path $p) { Remove-Item $p -Force }
  }
  if ((Test-Path $cil) -and -not (Get-ChildItem $cil -Force)) { Remove-Item $cil -Force }
}
Write-Host 'Hotovo.'

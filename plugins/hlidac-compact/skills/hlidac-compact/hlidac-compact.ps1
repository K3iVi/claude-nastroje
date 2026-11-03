# Hlidac compactu: velke okno Claude desktop, ktere je ~50-57 min necinne,
# zkompaktuje jeste s teplou cache (TTL 1 h). Model nevola, tokeny nestoji.
# Spousti Planovac uloh kazdou minutu. Bez -Ostre jen zapisuje, co by udelal.
param(
  [switch]$Ostre,
  [int]$MinTokens = 200000,
  [int]$OdMin = 50,
  [int]$DoMin = 57,
  [int]$NecinnostPcSec = 10
)

$ErrorActionPreference = 'Stop'
$home2 = Join-Path $env:USERPROFILE '.claude\hlidac-compact'
New-Item -ItemType Directory -Force $home2 | Out-Null
$log = Join-Path $home2 'hlidac.log'
$stavSoubor = Join-Path $home2 'stav.json'
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content $log -Encoding UTF8 }

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class HcWin {
  [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII p);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static uint IdleMs() { var l = new LII(); l.cbSize = 8; GetLastInputInfo(ref l); return (uint)Environment.TickCount - l.dwTime; }
}
"@

function FgProces {
  $p = 0; [void][HcWin]::GetWindowThreadProcessId([HcWin]::GetForegroundWindow(), [ref]$p)
  try { (Get-Process -Id $p).ProcessName } catch { '?' }
}

$dataDir = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Claude-Data') -Directory -Filter 'claude_*' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $dataDir) { exit 0 }
$sessDir = Join-Path $dataDir.FullName 'claude-code-sessions'
$projDir = Join-Path $env:USERPROFILE '.claude\projects'

function NactiOkna {
  Get-ChildItem $sessDir -Recurse -Filter 'local_*.json' | ForEach-Object {
    try { $j = Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return }
    [pscustomobject]@{
      id = $j.sessionId; cli = $j.cliSessionId; title = $j.title; archiv = [bool]$j.isArchived
      focus = [int64]$j.lastFocusedAt; edge = [int64]$j.lastTurnEdgeAt; akt = [int64]$j.lastActivityAt
    }
  }
}

# velikost kontextu = usage posledni odpovedi hlavniho vlakna (ctu jen konec souboru)
function Kontext($cli) {
  $f = Get-ChildItem $projDir -Directory | ForEach-Object { Join-Path $_.FullName "$cli.jsonl" } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $f) { return 0 }
  $fs = [IO.File]::Open($f, 'Open', 'Read', 'ReadWrite')
  try {
    $n = [Math]::Min($fs.Length, 2MB); [void]$fs.Seek(-$n, 'End')
    $buf = New-Object byte[] $n; [void]$fs.Read($buf, 0, $n)
  } finally { $fs.Close() }
  $radky = [Text.Encoding]::UTF8.GetString($buf) -split "`n"
  for ($i = $radky.Length - 1; $i -ge 1; $i--) {
    $r = $radky[$i]
    # compact bez nasledne odpovedi: usage pred nim je stara, plati postTokens
    if ($r -match '"subtype":"compact_boundary"') {
      try { return [int]($r | ConvertFrom-Json).compactMetadata.postTokens } catch { return 0 }
    }
    if ($r -notmatch '"type":"assistant"' -or $r -notmatch '"usage"' -or $r -match '"isSidechain":true') { continue }
    try { $u = ($r | ConvertFrom-Json).message.usage } catch { continue }
    return [int]$u.input_tokens + [int]$u.cache_read_input_tokens + [int]$u.cache_creation_input_tokens
  }
  return 0
}

$stav = @{}
if (Test-Path $stavSoubor) { (Get-Content $stavSoubor -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $stav[$_.Name] = [int64]$_.Value } }

$ted = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$okna = @(NactiOkna | Where-Object { -not $_.archiv })
$kandidati = foreach ($o in $okna) {
  $posl = [Math]::Max($o.edge, $o.akt)
  $min = ($ted - $posl) / 60000
  if ($min -lt $OdMin -or $min -gt $DoMin) { continue }
  if ($stav[$o.id] -eq $posl) { continue }      # tuhle pauzu uz jsme resili
  $tok = Kontext $o.cli
  if ($tok -lt $MinTokens) { continue }
  [pscustomobject]@{ o = $o; posl = $posl; min = [Math]::Round($min, 1); tok = $tok }
}
if (-not $kandidati) { exit 0 }

# posledni sance (od 55. min) promarnena -> oznameni; klik otevre okno, /compact uz napise uzivatel
function Hlaska($k) {
  if ($k.min -lt ($DoMin - 2) -or $stav["upo:" + $k.o.id] -eq $k.posl) { return }
  $stav["upo:" + $k.o.id] = $k.posl
  $esc = [Security.SecurityElement]::Escape($k.o.title)
  $odkaz = "claude://claude.ai/epitaxy/$($k.o.id)"
  $xml = "<toast activationType=`"protocol`" launch=`"$odkaz`" duration=`"long`"><visual><binding template=`"ToastGeneric`">" +
    "<text>Compact nestihl: $esc</text><text>Necinne $([int]$k.min) min, $([int]($k.tok / 1000))k. Cache vyprsi za par minut - klikni a napis /compact.</text>" +
    "</binding></visual></toast>"
  try {
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    $d = New-Object Windows.Data.Xml.Dom.XmlDocument; $d.LoadXml($xml)
    $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($d))
    Log "HLASKA: $($k.o.id) '$($k.o.title)'"
  } catch { Log "HLASKA selhala: $_" }
}

foreach ($k in $kandidati) {
  $o = $k.o
  $popis = "$($o.id) '$($o.title)' necinne $($k.min) min, kontext $($k.tok)"
  $idle = [HcWin]::IdleMs() / 1000
  if ($idle -lt $NecinnostPcSec) { Log "CEKAM (PC pouzivano pred $([int]$idle) s): $popis"; Hlaska $k; continue }
  if (-not $Ostre) { Log "NA SUCHO by kompaktoval: $popis"; $stav[$o.id] = $k.posl; continue }

  $predtim = $okna | Sort-Object focus -Descending | Select-Object -First 1
  $start = [Environment]::TickCount
  # sahl uzivatel na klavesnici/mys od zacatku zasahu? (necinnost kratsi nez doba zasahu)
  function Sahl { [HcWin]::IdleMs() -lt ([Environment]::TickCount - $start) }
  function Vrat { if ($predtim -and $predtim.id -ne $o.id) { Start-Process "claude://claude.ai/epitaxy/$($predtim.id)" } }
  Start-Process "claude://claude.ai/epitaxy/$($o.id)"
  $nahore = $null
  for ($t = 0; $t -lt 16; $t++) {        # az 4 s cekat na prepnuti, pri doteku hned pryc
    Start-Sleep -Milliseconds 250
    if (Sahl) { break }
    $nahore = NactiOkna | Sort-Object focus -Descending | Select-Object -First 1
    if ($nahore.id -eq $o.id) { Start-Sleep -Milliseconds 500; break }
  }
  $fg = FgProces
  if ((Sahl) -or $nahore.id -ne $o.id -or $fg -ne 'claude') {
    Log "ZRUSENO (otevrene $($nahore.id), popredi $fg, dotek $(Sahl)): $popis"
    Vrat; Hlaska $k; continue              # stav neukladam, zkusi se pri dalsim behu
  }
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.SendKeys]::SendWait('/compact')
  Start-Sleep -Milliseconds 700
  # SendKeys se pocita jako vstup, proto jen kratky prah: dotek v poslednich 0,4 s = uzivatel
  if ([HcWin]::IdleMs() -lt 400) {
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}'); Log "ZRUSENO pred Enterem (dotek): $popis"; Vrat; Hlaska $k; continue
  }
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Start-Sleep -Milliseconds 800
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')   # prvni Enter jen vybere prikaz z nabidky
  Log "KOMPAKTUJI: $popis"
  $stav[$o.id] = $k.posl
  Start-Sleep -Seconds 2
  Vrat
  break   # jedno okno na beh, dalsi vezme pristi beh za minutu
}

$stav | ConvertTo-Json | Set-Content $stavSoubor -Encoding UTF8

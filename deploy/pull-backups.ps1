# Pulls the production Postgres dumps (StockFlow + HouseBudget) from the server
# to this PC, so a copy exists outside the server. Run daily by the Windows task
# "PharmaStock - Pull prod DB backups". Copy of record: C:\Dev\PharmaStock\deploy\pull-backups.ps1
#
# - Downloads every /root/backups/*.dump not already here (size-checked).
# - Keeps local dumps for 60 days (server keeps 14).
# - On success writes the time to /root/backups/LAST_PULLED; the server's
#   backup-watchdog.sh e-mails an alert when that is older than 72 h.
# - Log: C:\Dev\prod-backups\pull.log
# Uses this user's SSH key (BatchMode, no password prompts).

$ErrorActionPreference = 'Stop'
$Server   = 'root@116.203.144.105'
$Remote   = '/root/backups'
$Root     = 'C:\Dev\prod-backups'
$Dest     = Join-Path $Root 'dumps'
$Log      = Join-Path $Root 'pull.log'
$KeepDays = 60
$ssh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$scp = Join-Path $env:WINDIR 'System32\OpenSSH\scp.exe'
$opts = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20')

function Write-Log($msg) {
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $Log -Value $line -Encoding utf8
    Write-Output $line
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
try {
    # "name size" for each remote dump
    $listing = & $ssh @opts $Server "cd $Remote && stat -c '%n %s' *.dump"
    if ($LASTEXITCODE -ne 0) { throw "ssh listing failed (exit $LASTEXITCODE)" }

    $new = 0; $have = 0
    foreach ($row in $listing) {
        $name, $size = $row.Trim() -split '\s+', 2
        if ($name -notmatch '^[a-z0-9_-]+\.dump$') { continue }
        $local = Join-Path $Dest $name
        if ((Test-Path $local) -and ((Get-Item $local).Length -eq [int64]$size)) { $have++; continue }

        $tmp = "$local.part"
        & $scp @opts -q "${Server}:$Remote/$name" $tmp
        if ($LASTEXITCODE -ne 0) { throw "scp failed for $name (exit $LASTEXITCODE)" }
        if ((Get-Item $tmp).Length -ne [int64]$size) { Remove-Item $tmp -Force; throw "size mismatch for $name" }
        Move-Item -Force $tmp $local
        $new++
    }
    if (($new + $have) -eq 0) { throw 'no dumps found on the server' }

    # Local retention
    $old = Get-ChildItem $Dest -Filter *.dump | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) }
    $old | Remove-Item -Force

    & $ssh @opts $Server "date -u +%FT%TZ > $Remote/LAST_PULLED"
    if ($LASTEXITCODE -ne 0) { throw "could not write LAST_PULLED (exit $LASTEXITCODE)" }

    $total = (Get-ChildItem $Dest -Filter *.dump | Measure-Object Length -Sum)
    Write-Log ("OK  new={0} already={1} removed={2} local={3} files {4:N1} MB" -f $new, $have, @($old).Count, $total.Count, ($total.Sum / 1MB))
    exit 0
}
catch {
    Write-Log "FAILED  $($_.Exception.Message)"
    exit 1
}

#!/bin/bash
# Daily backup STATUS report e-mailed to infos@mfspace.lu, styled like an MSP
# "Backup & Recovery" dashboard: KPI bars (status + last-successful-time) and a
# per-database table with a protected download link. Pure HTML table layout so it
# renders in any mail client. Reuses HouseBudget's LWS mailbox (SMTP_PASS from its
# .env, read at send time). Cron: /etc/cron.d/pg-backup. Log: /var/log/pg-backup.log.
set -uo pipefail
DIR=/root/backups
DBS=(housebudget pharmastock)
# Secret download-path token lives server-side (not in git): /root/secrets/dl-token
DL_TOKEN=$(cat /root/secrets/dl-token 2>/dev/null)
DL_BASE="https://guide.mfspace.lu/dl-${DL_TOKEN}"
FROM=infos@mfspace.lu
now=$(date +%s)
nowfmt=$(date -u +"%Y-%m-%d %H:%M UTC")
PGU=$(grep '^POSTGRES_USER=' /root/apps/stockflow/deploy/.env 2>/dev/null | cut -d= -f2-)
# Recipient is configurable from the StockFlow super-admin console (Settings →
# Daily backup report), stored in pharmastock."PlatformSettings" under the key
# 'backup.report.recipient'. Falls back to infos@mfspace.lu when unset/empty.
TO=$(docker exec deploy-db-1 psql -U "$PGU" -d pharmastock -tAc \
  "select \"Value\" from \"PlatformSettings\" where \"Key\"='backup.report.recipient'" 2>/dev/null | tr -d '[:space:]')
TO=${TO:-infos@mfspace.lu}

human() { b=${1:-0}; awk -v b="$b" 'BEGIN{ s="B KB MB GB TB"; split(s,a," "); i=1; while(b>=1024 && i<5){b/=1024;i++} printf (b>=10||i==1)?"%.0f %s":"%.1f %s", b, a[i] }'; }
dbsize() { docker exec deploy-db-1 psql -U "$PGU" -d "$1" -tAc "select pg_database_size('$1')" 2>/dev/null | tr -d '[:space:]'; }
age_h() { f="$1"; [ -f "$f" ] || { echo 999999; return; }; echo $(( (now - $(stat -c %Y "$f")) / 3600 )); }

# LAST_OK / LAST_PULLED ages (hours)
ts_age_h() { [ -f "$1" ] || { echo 999999; return; }; echo $(( (now - $(date -d "$(cat "$1")" +%s)) / 3600 )); }
ok_h=$(ts_age_h "$DIR/LAST_OK"); pulled_h=$(ts_age_h "$DIR/LAST_PULLED")

total=${#DBS[@]}
completed=0; witherr=0; inproc=0; unsucc=0; nobak=0
b_lt24=0; b_lt48=0; b_gt48=0; b_none=0
declare -A R_STATUS R_SEL R_DUMP R_AGE R_ERR R_BAR R_LINK R_SRC
for db in "${DBS[@]}"; do
  f=$(ls -t "$DIR/$db"-*.dump 2>/dev/null | head -1)
  src="Postgres (deploy-db-1)"
  if [ -z "$f" ]; then
    R_STATUS[$db]="No backups"; R_SEL[$db]="—"; R_DUMP[$db]="—"; R_ERR[$db]=1; R_LINK[$db]=""; R_SRC[$db]="$src"
    nobak=$((nobak+1)); b_none=$((b_none+1))
  else
    ageH=$(age_h "$f"); sz=$(stat -c %s "$f"); live=$(dbsize "$db")
    R_AGE[$db]=$ageH; R_DUMP[$db]=$(human "$sz"); R_SEL[$db]=$([ -n "$live" ] && human "$live" || echo "—"); R_SRC[$db]="$src"
    R_LINK[$db]="$DL_BASE/$(basename "$f")"
    if [ "$ageH" -lt 26 ]; then R_STATUS[$db]="Completed"; R_ERR[$db]=0; completed=$((completed+1));
    else R_STATUS[$db]="Unsuccessful"; R_ERR[$db]=1; unsucc=$((unsucc+1)); fi
    if   [ "$ageH" -lt 24 ]; then b_lt24=$((b_lt24+1));
    elif [ "$ageH" -lt 48 ]; then b_lt48=$((b_lt48+1));
    else b_gt48=$((b_gt48+1)); fi
    bar=""
    for i in $(seq 13 -1 0); do
      d=$(date -u -d "-$i day" +%Y%m%d)
      if ls "$DIR/$db-$d"-*.dump >/dev/null 2>&1; then c="#35b65a"; else c="#e3e3e3"; fi
      bar+="<td width=\"8\" height=\"16\" bgcolor=\"$c\" style=\"border:1px solid #ffffff;padding:0\"></td>"
    done
    R_BAR[$db]="$bar"
  fi
done
pct() { [ "${2:-0}" -eq 0 ] && echo 0 || echo $(( $1 * 100 / $2 )); }

# ---- one KPI bar row: label | count | bar(width%) | pct% ----
kpi() { # $1 label  $2 count  $3 total  $4 color
  local p; p=$(pct "$2" "$3")
  printf '<tr><td style="padding:3px 0;font-size:13px;color:#555;width:210px">%s</td><td style="padding:3px 8px;font-size:13px;color:#333;width:24px;text-align:right">%s</td><td style="padding:3px 0;width:360px"><table cellpadding="0" cellspacing="0" style="width:100%%;background:#eee;border-radius:3px"><tr><td style="height:14px;width:%s%%;background:%s;border-radius:3px;font-size:0;line-height:0">&nbsp;</td><td></td></tr></table></td><td style="padding:3px 10px;font-size:13px;color:#555;text-align:right;width:60px">%s%%</td></tr>' \
    "$1" "$2" "$p" "$4" "$p"
}
rows_status="$(kpi "No backups" "$nobak" "$total" "#9aa0a6")$(kpi "Completed" "$completed" "$total" "#35b65a")$(kpi "Completed with errors" "$witherr" "$total" "#e0a800")$(kpi "In process" "$inproc" "$total" "#f4c20d")$(kpi "Unsuccessful" "$unsucc" "$total" "#e5473f")"
rows_time="$(kpi "No successful backup" "$b_none" "$total" "#9aa0a6")$(kpi "Less than 24 hours ago" "$b_lt24" "$total" "#35b65a")$(kpi "Less than 48 hours ago" "$b_lt48" "$total" "#35b65a")$(kpi "More than 48 hours ago" "$b_gt48" "$total" "#e5473f")"

# ---- restore points per database ----
declare -A RP_ROWS RP_N RP_BYTES
nfiles=0; totbytes=0
for db in "${DBS[@]}"; do RP_ROWS[$db]=""; RP_N[$db]=0; RP_BYTES[$db]=0; done
for f in $(ls -t "$DIR"/*.dump 2>/dev/null); do
  bn=$(basename "$f"); db=${bn%%-*}; sz=$(stat -c %s "$f"); d=$(stat -c %Y "$f")
  [ -z "${RP_N[$db]+x}" ] && continue
  nfiles=$((nfiles+1)); totbytes=$((totbytes+sz)); RP_N[$db]=$((RP_N[$db]+1)); RP_BYTES[$db]=$((RP_BYTES[$db]+sz))
  dt=$(date -u -d "@$d" +"%Y-%m-%d %H:%M")
  RP_ROWS[$db]+="<tr style=\"border-bottom:1px solid #f1f1f1\"><td style=\"padding:6px 8px;font-size:12px;color:#555\">$dt UTC</td><td style=\"padding:6px 8px;font-size:12px;color:#555\">$(human "$sz")</td><td style=\"padding:6px 8px;font-size:12px;color:#2f9e5f\">OK</td><td style=\"padding:6px 8px;font-size:12px\"><a href=\"$DL_BASE/$bn\" style=\"color:#2563eb;text-decoration:none;font-weight:600\">&#x2B07; Download</a></td></tr>"
done
tot_h=$(human "$totbytes")

# ---- one module card per app (HouseBudget / PharmaStock, clearly distinct) ----
declare -A MOD_NAME MOD_COLOR MOD_ICON
MOD_NAME[housebudget]="HouseBudget"; MOD_COLOR[housebudget]="#5B5BF0"; MOD_ICON[housebudget]="&#x1F3E0;"
MOD_NAME[pharmastock]="PharmaStock"; MOD_COLOR[pharmastock]="#12b886"; MOD_ICON[pharmastock]="&#x1F4E6;"
modules=""
for db in "${DBS[@]}"; do
  nm="${MOD_NAME[$db]:-$db}"; col="${MOD_COLOR[$db]:-#555}"; ic="${MOD_ICON[$db]:-}"
  st="${R_STATUS[$db]}"; badge="#2f9e5f"; [ "$st" != "Completed" ] && badge="#e5473f"
  age="${R_AGE[$db]:-?}"; bar="${R_BAR[$db]:-}"
  modules+="<div style=\"border:1px solid #e8e8ee;border-radius:8px;overflow:hidden;margin:0 0 20px\">
    <div style=\"background:$col;padding:11px 16px\">
      <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>
        <td style=\"font-size:16px;font-weight:700;color:#ffffff\">$ic&nbsp; $nm</td>
        <td style=\"text-align:right\"><span style=\"font-size:12px;font-weight:700;color:#ffffff;background:$badge;padding:3px 12px;border-radius:12px\">$st</span></td>
      </tr></table>
    </div>
    <div style=\"padding:14px 16px\">
      <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"font-size:12px;color:#555\"><tr>
        <td style=\"padding:2px 0\">Dernière sauvegarde : <b style=\"color:#222\">il y a ${age} h</b></td>
        <td style=\"padding:2px 0\">Taille base : <b style=\"color:#222\">${R_SEL[$db]:-—}</b></td>
        <td style=\"padding:2px 0\">Taille dump : <b style=\"color:#222\">${R_DUMP[$db]:-—}</b></td>
        <td style=\"padding:2px 0\">Erreurs : <b style=\"color:#222\">${R_ERR[$db]:-0}</b></td>
      </tr></table>
      <div style=\"margin:10px 0 4px;font-size:11px;color:#888\">14 derniers jours</div>
      <table cellpadding=\"0\" cellspacing=\"0\"><tr>$bar</tr></table>
      <div style=\"margin:16px 0 6px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase\">Points de restauration (${RP_N[$db]} dumps &middot; $(human "${RP_BYTES[$db]}"))</div>
      <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border:1px solid #eee;border-radius:6px;overflow:hidden\">
        <tr style=\"background:#fafbfc;border-bottom:2px solid #eee\">
          <th style=\"text-align:left;padding:7px 8px;font-size:11px;color:#888;text-transform:uppercase\">Date (UTC)</th>
          <th style=\"text-align:left;padding:7px 8px;font-size:11px;color:#888;text-transform:uppercase\">Taille</th>
          <th style=\"text-align:left;padding:7px 8px;font-size:11px;color:#888;text-transform:uppercase\">Statut</th>
          <th style=\"text-align:left;padding:7px 8px;font-size:11px;color:#888;text-transform:uppercase\">Téléchargement</th>
        </tr>
        ${RP_ROWS[$db]}
      </table>
    </div>
  </div>"
done

# ---- assemble HTML ----
html=$(cat <<HTML
<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#333">
<div style="max-width:980px;margin:0 auto;background:#fff">
  <div style="background:#fff;border-bottom:3px solid #eceef1;padding:18px 24px">
    <div style="font-size:18px;font-weight:700;color:#222">Backup &amp; Recovery: toutes les bases · mfSPACE &nbsp;|&nbsp; Bases : $total &nbsp;|&nbsp; Completed : $completed &nbsp;|&nbsp; Unsuccessful : $unsucc</div>
    <div style="font-size:12px;color:#888;margin-top:4px">Rapport du $nowfmt · dernier dump réussi il y a ${ok_h} h · dernière copie PC il y a ${pulled_h} h</div>
  </div>
  <div style="padding:22px 24px">
    <div style="font-size:12px;font-weight:700;letter-spacing:.5px;color:#888;margin-bottom:8px">BACKUP STATUS</div>
    <table cellpadding="0" cellspacing="0" style="width:100%">$rows_status</table>
    <div style="font-size:12px;font-weight:700;letter-spacing:.5px;color:#888;margin:26px 0 8px">LAST SUCCESSFUL BACKUP TIME</div>
    <table cellpadding="0" cellspacing="0" style="width:100%">$rows_time</table>
    <div style="font-size:12px;font-weight:700;letter-spacing:.5px;color:#888;margin:28px 0 12px">DÉTAIL PAR MODULE ($nfiles dumps &middot; $tot_h)</div>
    $modules
    <div style="font-size:11px;color:#9aa0a6;margin-top:18px">Dumps quotidiens PostgreSQL (format custom <code>-Fc</code>, validés via <code>pg_restore -l</code>), rétention 14 jours, serveur 116.203.144.105. Lien de téléchargement direct (chemin secret, sans mot de passe). Généré par /root/bin/backup-report.sh.</div>
  </div>
</div>
</body></html>
HTML
)

# Preview mode: print the HTML and exit (no e-mail). Used to check the design.
if [ "${1:-}" = "--html" ]; then printf '%s\n' "$html"; exit 0; fi

# ---- send (HTML) via the LWS mailbox, same transport as backup-alert.sh ----
PASS=$(grep '^SMTP_PASS=' /root/apps/housebudget-v2/deploy/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
msg=$(mktemp); trap 'rm -f "$msg"' EXIT
{
  printf 'From: Serveur mfspace <%s>\r\n' "$FROM"
  printf 'To: %s\r\n' "$TO"
  printf 'Subject: [Sauvegarde] Statut quotidien · %d OK / %d KO\r\n' "$completed" "$unsucc"
  printf 'Date: %s\r\n' "$(date -R)"
  printf 'MIME-Version: 1.0\r\n'
  printf 'Content-Type: text/html; charset=utf-8\r\n\r\n'
  printf '%s\r\n' "$html"
} > "$msg"
send() { printf 'user = "%s:%s"\n' "$FROM" "$PASS" | curl -sS --max-time 90 --url smtp://mail.mfspace.lu:587 --ssl-reqd \
  --mail-from "$FROM" --mail-rcpt "$TO" -T "$msg" --config -; }
# One retry, then alert through the same channel so a silent miss is noticed.
if send || { sleep 20; send; }; then
  echo "$(date -u +%FT%TZ) report sent total=$total completed=$completed unsucc=$unsucc"
else
  /root/bin/backup-alert.sh "Rapport de sauvegarde NON envoyé" "L'e-mail de statut quotidien n'a pas pu partir vers infos@mfspace.lu (SMTP). Serveur 116.203.144.105. Voir /var/log/pg-backup.log." || true
  echo "$(date -u +%FT%TZ) report SEND FAILED"
fi

#!/bin/bash
# Sends a backup alert e-mail: backup-alert.sh "<subject>" "<body>".
# Installed at /root/bin/backup-alert.sh. Reuses HouseBudget's LWS mailbox; the
# password is read from its .env at send time (never copied). STARTTLS on 587 via
# curl; credentials go through a stdin config, not argv, so they never show up in `ps`.
# Sent as text + HTML so the mfSPACE signature (logo) shows like in the apps' e-mails;
# signature files: /root/bin/signature/signature.fr.{html,txt}.
set -euo pipefail
FROM=infos@mfspace.lu
TO=infos@mfspace.lu
SIG=/root/bin/signature
PASS=$(grep '^SMTP_PASS=' /root/apps/housebudget-v2/deploy/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
origin="$(hostname) 116.203.144.105 - /root/bin/backup-alert.sh"
sig_txt=$(cat "$SIG/signature.fr.txt" 2>/dev/null || echo "mfSPACE · infos@mfspace.lu")
sig_html=$(cat "$SIG/signature.fr.html" 2>/dev/null || echo "<p>mfSPACE · infos@mfspace.lu</p>")
esc() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
body_html=$(printf '%s' "$2" | esc)
b="mfspace-$(date +%s)-$$"
msg=$(mktemp); trap 'rm -f "$msg"' EXIT
{
  printf 'From: Serveur mfspace <%s>\r\nTo: %s\r\nSubject: [Sauvegarde] %s\r\nDate: %s\r\n' "$FROM" "$TO" "$1" "$(date -R)"
  printf 'MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="%s"\r\n\r\n' "$b"
  printf -- '--%s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' "$b"
  printf '%s\r\n\r\n%s\r\n\r\n-- \r\n%s\r\n\r\n' "$2" "$origin" "$sig_txt"
  printf -- '--%s\r\nContent-Type: text/html; charset=utf-8\r\n\r\n' "$b"
  printf '<html><body style="margin:0;padding:16px;background:#ffffff">'
  printf '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#1f2937;white-space:pre-wrap">%s</div>' "$body_html"
  printf '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9aa0a6;margin:14px 0 22px">%s</div>' "$origin"
  printf '<!-- mfspace-signature -->%s</body></html>\r\n\r\n' "$sig_html"
  printf -- '--%s--\r\n' "$b"
} > "$msg"
printf 'user = "%s:%s"\n' "$FROM" "$PASS" | curl -sS --max-time 60 --url smtp://mail.mfspace.lu:587 --ssl-reqd \
  --mail-from "$FROM" --mail-rcpt "$TO" -T "$msg" --config -

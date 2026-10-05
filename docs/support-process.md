# Support — ticket-handling process

How support requests flow from the apps to the super-admin, and how they are handled.
Code: `src/PharmaStock.Api/Services/SupportEndpoints.cs`, `SupportEmailActions.cs`,
`SupportNotifier.cs`; console `apps/web/src/screens/superadmin/Support.tsx`;
user screens `Support.tsx` (desktop/web) and `support.tsx` / `support-ticket.tsx` (mobile).

## 1. A user files a request

From any app: **Help → Support**. Always reachable, even with no business selected.

- The user picks a **type**: Bug / I'm blocked / Question.
- They write a **description** and can attach up to 5 **images**: 5 MB each, 15 MB total.
- **Context is attached automatically**: app and version, device or browser, the screen they came from, business and user.
- **Offline** (mobile and desktop): the request is queued and sent with the next sync.

## 2. Support is notified

An e-mail goes to **infos@mfspace.lu** (`SUPPORT_NOTIFY_EMAIL`). It contains:

- the request, its context and the screenshots as attachments;
- one-click buttons:
  - **✅ Mark resolved** / **⏳ In progress**: these open a confirmation page where you can also write a message to the user. The links are signed and expire after 14 days. Opening a link changes nothing until you press the button, because mail scanners pre-open links.
  - **Open in the console**: deep-links to `/superadmin/support?ticket=<id>`.

The console menu shows a **Support badge** with the number of requests awaiting support. It turns red when some are late.

## 3. Triage

**Priority** is set automatically: *I'm blocked* → **High**, everything else → **Normal**. It can be changed to Low, Normal, High or Urgent.

| Priority | Response target |
|---|---|
| Urgent | 4 h |
| High | 24 h |
| Normal | 72 h |
| Low | 7 days |

The clock runs while the request **awaits support**: when it's new, and again after each reply from the user.

Queues in the console:

- **To handle**: active requests awaiting support, sorted with the late ones first, then by priority, then by due time.
- **Late**: requests past their response target.
- **Unassigned**, **Mine**, **Resolved / closed**, **All**.

**Take it**: assigns the request to you and moves it to *In progress*. Replying to an unassigned request also takes it.

## 4. Handling

- **Reply**: the user gets a **pop-up** in their app on next open, focus, or within 3 minutes. They also get an **e-mail** if their account has one. The request is no longer "awaiting support".
- **Reply & resolve**: same, and the status becomes *Resolved*.
- **Internal note** (🔒): visible to support only, never sent to the user. It doesn't stop the response clock.
- **Change status**: Open, In progress, Resolved or Closed. *Resolved* and *Closed* notify the user.

## 5. After resolution

- The user sees **"✅ Request resolved"** as a pop-up, plus an e-mail if their address is known.
- If the problem persists, the user **replies** to the request. That **reopens** it (status *Open*, back in **To handle**), and support is e-mailed again.
- A *Resolved* request with no reaction is **closed automatically after 7 days**.

Every action is written to the **Audit log**: assign, priority, reply, status, e-mail action, auto-close.

## Configuration

These are environment variables on the API container. They live in the server's `deploy/docker-compose.yml`, and `SMTP_PASS` is in `deploy/.env`.

| Variable | Purpose |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM`, `SMTP_PASS` | Sending (MailKit, STARTTLS on 587) |
| `SUPPORT_NOTIFY_EMAIL` | Support inbox (default: `SMTP_FROM`) |
| `SUPPORT_CONSOLE_URL` | Console link in e-mails (default: `https://stock.mfspace.lu/superadmin/support`) |
| `SUPPORT_API_URL` | Base URL of the e-mail action links (default: `https://api.mfspace.lu`) |

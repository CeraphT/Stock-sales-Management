import { useState } from "react";

import { Button } from "@/components/Button";
import { useT } from "@/lib/i18n";
import { transportKind, usePrefsStore, type ReceiptWidth } from "@/lib/prefs";
import { printTestReceipt } from "@/lib/receipt";
import { detectPrinters, isTauri, probePrinter, type DetectedPrinter } from "@/lib/thermalPrinter";
import { toast } from "@/lib/toast";
import { useCompany } from "@/lib/useCompany";

export function PrinterSettings() {
  const t = useT();
  const company = useCompany().data;
  const receiptWidth = usePrefsStore((s) => s.receiptWidth);
  const autoPrint = usePrefsStore((s) => s.autoPrintReceipt);
  const thermalEnabled = usePrefsStore((s) => s.thermalEnabled);
  const thermalConnection = usePrefsStore((s) => s.thermalConnection);
  const thermalTarget = usePrefsStore((s) => s.thermalTarget);
  const thermalLabel = usePrefsStore((s) => s.thermalLabel);
  const thermalBaud = usePrefsStore((s) => s.thermalBaud);
  const setPref = usePrefsStore((s) => s.set);

  const [detecting, setDetecting] = useState(false);
  const [found, setFound] = useState<DetectedPrinter[]>([]);
  const [showNetwork, setShowNetwork] = useState(false);
  const [netAddr, setNetAddr] = useState("");
  const [verify, setVerify] = useState<"idle" | "checking" | "ok" | "fail">("idle");

  const connected = thermalTarget.trim() !== "";

  /** Save a printer as the active receipt printer and confirm it answers. */
  async function connectTo(target: string, label: string, connection: "usb" | "bluetooth" | "network") {
    setPref("thermalConnection", connection);
    setPref("thermalTarget", target);
    setPref("thermalLabel", label);
    setPref("thermalEnabled", true);
    setFound([]);
    setShowNetwork(false);
    setVerify("checking");
    try {
      await probePrinter({ kind: transportKind(connection), target, baud: thermalBaud });
      setVerify("ok");
    } catch {
      setVerify("fail");
    }
  }

  /** One-tap auto-detect: USB / USB-C / Bluetooth printers all surface as ports.
   * One match → connect it; several → let the user pick; none → gentle hint. */
  async function detect() {
    setShowNetwork(false);
    setFound([]);
    setDetecting(true);
    try {
      const list = await detectPrinters();
      if (list.length === 0) {
        toast(t("No printer found. Plug it in over USB or pair it over Bluetooth, then try again."), "info");
      } else if (list.length === 1) {
        await connectTo(list[0].target, list[0].label, "usb");
      } else {
        setFound(list);
      }
    } finally {
      setDetecting(false);
    }
  }

  function connectNetwork() {
    const addr = netAddr.trim();
    if (!/^.+:\d+$/.test(addr)) {
      toast(t("Enter the printer address as host:port, e.g. 192.168.1.50:9100"), "error");
      return;
    }
    connectTo(addr, `${t("Network printer")} (${addr})`, "network");
  }

  function disconnect() {
    setPref("thermalEnabled", false);
    setPref("thermalConnection", "usb");
    setPref("thermalTarget", "");
    setPref("thermalLabel", "");
    setFound([]);
    setShowNetwork(false);
    setNetAddr("");
    setVerify("idle");
    toast(t("Printer disconnected."), "info");
  }

  const widths: { v: ReceiptWidth; label: string; hint: string }[] = [
    { v: "58mm", label: "58 mm", hint: t("Narrow thermal roll") },
    { v: "80mm", label: "80 mm", hint: t("Standard thermal roll") },
    { v: "a4", label: "A4", hint: t("Full page / office printer") },
  ];

  function testPrint() {
    if (!company) return;
    printTestReceipt(
      {
        name: company.name,
        currency: company.currency,
        logoUrl: company.logoUrl,
        address: company.address,
        phone: company.phone,
        receiptFooter: company.receiptFooter,
      },
      company.taxId,
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-text-primary">🖨️ {t("Printer")}</h2>
        <Button variant="secondary" onClick={testPrint}>
          🧾 {t("Print a test receipt")}
        </Button>
      </div>

      {/* Paper width + auto-print, compact. */}
      <div className="space-y-3 rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Receipt width")}</span>
          {widths.map((w) => (
            <button
              key={w.v}
              onClick={() => setPref("receiptWidth", w.v)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                receiptWidth === w.v ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:bg-background"
              }`}
              title={w.hint}
            >
              {w.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={autoPrint} onChange={(e) => setPref("autoPrintReceipt", e.target.checked)} className="h-4 w-4" />
          {t("Auto-print receipt after each sale")}
        </label>
      </div>

      {/* Direct thermal (ESC/POS) receipt printer — zero-config auto-detect */}
      <div className="space-y-3 rounded-card border border-border bg-surface p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={thermalEnabled}
            onChange={(e) => {
              setPref("thermalEnabled", e.target.checked);
              if (e.target.checked && !connected) detect();
            }}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="block text-sm font-semibold text-text-primary">🖨️ {t("Print receipts directly to a thermal printer")}</span>
            <span className="block text-xs text-text-secondary">
              {t("Receipts only — they print straight to the printer with no dialog. Reports and PDFs still use the normal print dialog.")}
            </span>
          </span>
        </label>

        {thermalEnabled ? (
          <div className="space-y-3 border-t border-border pt-3">
            {!isTauri() ? (
              <p className="rounded-lg bg-accent-amber/10 px-3 py-2 text-xs text-accent-amber">
                ⚠ {t("Detecting a printer works only in the installed desktop app.")}
              </p>
            ) : null}

            {connected ? (
              <div className="rounded-xl border border-success/40 bg-success/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-text-primary">
                    {verify === "fail" ? "⚠️" : "✓"} {t("Connected")} — {thermalLabel || thermalTarget}
                  </div>
                  <button onClick={disconnect} className="text-xs font-semibold text-error hover:underline">
                    {t("Disconnect")}
                  </button>
                </div>
                {verify === "fail" ? (
                  <p className="mt-1 text-xs text-accent-amber">
                    {t("Saved, but the printer didn't answer — check it's on and connected, then print a test.")}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-text-secondary">{t("Receipts print here automatically. It reconnects on each print.")}</p>
                )}
                <div className="mt-2">
                  <Button variant="secondary" onClick={testPrint}>
                    🧾 {t("Print a test receipt")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-text-secondary">
                  {t("Plug your printer in over USB or USB-C, or pair it over Bluetooth in Windows settings — then detect it. No ports or settings to configure.")}
                </p>
                <Button onClick={detect} loading={detecting}>
                  🔍 {t("Detect my printer")}
                </Button>

                {found.length > 1 ? (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-text-primary">{t("Found several — pick your printer:")}</div>
                    {found.map((p) => (
                      <button
                        key={p.target}
                        onClick={() => connectTo(p.target, p.label, "usb")}
                        className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left text-sm hover:border-primary hover:bg-background"
                      >
                        <span className="text-text-primary">{p.label}</span>
                        <span className="text-xs font-semibold text-primary">{t("Connect")}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div>
                  <button onClick={() => setShowNetwork((v) => !v)} className="text-xs font-semibold text-primary hover:underline">
                    {t("Use a network printer instead")}
                  </button>
                  {showNetwork ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={netAddr}
                        onChange={(e) => setNetAddr(e.target.value)}
                        placeholder="192.168.1.50:9100"
                        className="h-11 flex-1 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
                      />
                      <Button variant="secondary" onClick={connectNetwork}>
                        {t("Connect")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

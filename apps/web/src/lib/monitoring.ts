import { DevicePlatform } from "@stockflow/core/api/enums";

/** Compact relative time ("just now", "5m ago", "3h ago", "2d ago", or a date). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then) || then <= 0) return "—";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** A device is "live" if it checked in within the last 5 minutes. */
export function isLive(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 5 * 60 * 1000;
}

export function platformMeta(p: DevicePlatform): { label: string; icon: string } {
  switch (p) {
    case DevicePlatform.Mobile:
      return { label: "Mobile", icon: "📱" };
    case DevicePlatform.Desktop:
      return { label: "Desktop", icon: "🖥️" };
    case DevicePlatform.Web:
      return { label: "Web", icon: "🌐" };
    default:
      return { label: "Unknown", icon: "❔" };
  }
}

/** "City, Country" / just one / the raw IP / "—". */
export function locationLabel(city: string | null, country: string | null, ip: string | null): string {
  const parts = [city, country].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return ip ?? "—";
}

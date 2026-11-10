import { useLanguageStore } from "./store";

/** BCP-47 locale for the language chosen in the app (not the phone's system
 * language), so dates and weekdays follow the FR/EN toggle. Pass it to
 * toLocaleDateString / toLocaleString / toLocaleTimeString instead of `undefined`. */
export function appLocale(): string {
  return useLanguageStore.getState().language === "en" ? "en-GB" : "fr-FR";
}

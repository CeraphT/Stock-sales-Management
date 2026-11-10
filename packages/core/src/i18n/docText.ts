import { getLanguageStore, type Language } from "./store";
import { translations, type TranslationKey } from "./translations";

/** Language chosen in the app, read at call time. Receipts, PDFs and printed
 * tickets are built outside React, so they cannot use useTranslation().
 * Falls back to French (the app default) if no store was created yet. */
export function docLanguage(): Language {
  try {
    return getLanguageStore().getState().language;
  } catch {
    return "fr";
  }
}

/** BCP-47 locale matching docLanguage(), for toLocaleString/toLocaleDateString. */
export function docLocale(): string {
  return docLanguage() === "en" ? "en-GB" : "fr-FR";
}

/** Non-hook translation for documents. `{n}`-style placeholders are filled from `vars`. */
export function dt(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = translations[docLanguage()][key] ?? translations.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

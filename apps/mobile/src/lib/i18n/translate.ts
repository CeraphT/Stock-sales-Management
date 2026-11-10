import { translations, type TranslationKey } from "@stockflow/core/i18n/translations";

import { useLanguageStore } from "./store";

/** Non-hook translation for code outside React components (alerts fired from
 * lib helpers, label maps). Reads the current in-app language at call time, so
 * call it when the text is shown, not at module load. Inside components prefer
 * `useTranslation()` so the screen re-renders when the language changes. */
export function tr(key: TranslationKey): string {
  const language = useLanguageStore.getState().language;
  return translations[language][key] ?? translations.en[key] ?? key;
}

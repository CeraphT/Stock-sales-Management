import { useCallback } from "react";

import { getLanguageStore } from "./store";
import { translations, type TranslationKey } from "./translations";

export function useTranslation() {
  const language = getLanguageStore()((s) => s.language);

  const t = useCallback((key: TranslationKey): string => translations[language][key] ?? translations.en[key] ?? key, [language]);

  return { t, language };
}

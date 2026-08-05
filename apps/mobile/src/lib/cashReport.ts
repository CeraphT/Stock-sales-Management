import * as Print from 'expo-print';

import { buildDailyRows, generateCashReportHtml, type DailyCashRow } from '@stockflow/core/cashReport';

export { buildDailyRows };
export type { DailyCashRow };

/** Open Android's native print / Save-as-PDF dialog for the daily cash report —
 * same approach as the receipt printer (src/lib/receipt/receiptActions.ts). */
export async function printCashReport(
  rows: DailyCashRow[],
  companyName: string,
  currency: string,
  from: string,
  to: string,
): Promise<void> {
  await Print.printAsync({ html: generateCashReportHtml(rows, companyName, currency, from, to) });
}

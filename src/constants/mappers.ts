/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const CURRENCY_MAP: Record<string, string> = {
  '840': 'USD ($)',
  '978': 'EUR (€)',
  '826': 'GBP (£)',
  '036': 'AUD ($)',
  '124': 'CAD ($)',
  '392': 'JPY (¥)',
  '710': 'ZAR (R)',
  '752': 'SEK (kr)',
  '756': 'CHF (Fr)',
  '056': 'BEF/EUR',
  '208': 'DKK',
  '246': 'FIM/EUR',
  '250': 'FRF/EUR',
  '276': 'DEM/EUR',
  '300': 'GRD/EUR',
  '372': 'IEP/EUR',
  '380': 'ITL/EUR',
  '442': 'LUF/EUR',
  '528': 'NLG/EUR',
  '620': 'PTE/EUR',
  '705': 'SIT/EUR',
  '724': 'ESP/EUR',
  '040': 'ATS/EUR',
};

export const COUNTRY_MAP: Record<string, string> = {
  '826': 'United Kingdom',
  '840': 'United States',
  '276': 'Germany',
  '250': 'France',
  '380': 'Italy',
  '724': 'Spain',
  '528': 'Netherlands',
  '756': 'Switzerland',
  '036': 'Australia',
  '124': 'Canada',
  '392': 'Japan',
  '710': 'South Africa',
  '752': 'Sweden',
  '578': 'Norway',
  '056': 'Belgium',
  '442': 'Luxembourg',
  '300': 'Greece',
  '372': 'Ireland',
  '620': 'Portugal',
  '208': 'Denmark',
  '246': 'Finland',
  '040': 'Austria',
};

export const MTI_MAP: Record<string, string> = {
  '1100': 'Auth Request',
  '1110': 'Auth Response',
  '1120': 'Auth Advice',
  '1130': 'Auth Advice Resp',
  '1140': 'Auth Notification',
  '1200': 'First Presentment',
  '1210': 'First Presentment Resp',
  '1240': 'Clearing Notification',
  '1400': 'Chargeback',
  '1410': 'Chargeback Resp',
  '1440': 'Chargeback Notification',
  '1600': 'Administrative',
  '1644': 'Fee Collection',
  '1740': 'Fee Collection Notification',
};

export const FUNCTION_CODE_MAP: Record<string, string> = {
  '200': 'First Presentment',
  '205': 'Second Presentment',
  '450': 'First Chargeback',
  '451': 'Second Chargeback',
  '454': 'Arbitration Chargeback',
  '691': 'Fee Collection',
  '700': 'Fee Collection Reversal',
  '100': 'Original Auth',
  '101': 'Partial Auth',
  '102': 'Full Auth',
  '453': 'Retrieval Request',
  '603': 'Retrieval Fulfillment',
};

export const IRD_MAP: Record<string, string> = {
  '01': 'Merit I - Standard Interch',
  '02': 'Merit II - Preferred Interch',
  '03': 'Merit III - Prime Interch',
  '04': 'Merit IV - Super Prime',
  '05': 'B2B/Corporate Interch',
  '06': 'Government/Utility',
  '07': 'Small Ticket',
  '08': 'High Value/Premium',
  '10': 'Tier 1 - Low Rate',
  '20': 'Tier 2 - Mid Rate',
  '30': 'Tier 3 - High Rate',
};

export function mapValue(value: string | number, map: Record<string, string>): string {
  const strVal = String(value).padStart(3, '0'); // Basic normalization
  const directMatch = map[String(value)];
  const paddedMatch = map[strVal];
  const shortVal = String(value).replace(/^0+/, '');
  const shortMatch = map[shortVal];

  return directMatch || paddedMatch || shortMatch || String(value);
}

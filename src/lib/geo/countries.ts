// Codes pays ISO 3166-1 alpha-2 + helpers d'affichage — ARCHITECTURE.md §23.
// Aucune table de traduction : les noms de pays viennent de `Intl.DisplayNames`
// (dispo côté Node 18+ ET navigateur), les drapeaux des Regional Indicator Symbols
// dérivés du code. Utilisé pour `HandballClub.country` et le `HomeClubPicker`.

// Liste officielle ISO 3166-1 alpha-2 (codes assignés couramment utilisés). Sert
// de `z.enum` pour valider une saisie de pays côté API — un code absent = rejet.
export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

const COUNTRY_CODE_SET = new Set<string>(COUNTRY_CODES);

export function isCountryCode(value: string): value is CountryCode {
  return COUNTRY_CODE_SET.has(value);
}

// Drapeau emoji d'un code pays : deux Regional Indicator Symbols (U+1F1E6..U+1F1FF)
// dérivés des deux lettres. "FR" -> 🇫🇷. Renvoie "" si le code n'est pas deux
// lettres A-Z (après passage en majuscules).
export function countryFlag(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + (upper.charCodeAt(0) - 65),
    A + (upper.charCodeAt(1) - 65),
  );
}

// Nom localisé d'un pays via l'API Intl (pas de dépendance, pas de table à
// maintenir). Repli sur le code brut si Intl.DisplayNames n'est pas dispo ou ne
// connaît pas le code.
export function countryName(code: string, locale: string): string {
  const upper = code.toUpperCase();
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(upper) ?? upper;
  } catch {
    return upper;
  }
}

// Liste { code, name, flag } triée par nom localisé — pour peupler un <select>.
// La France est épinglée en tête (public FR-first, cf. §23.1).
export function countryOptions(locale: string): { code: CountryCode; name: string; flag: string }[] {
  const rest = COUNTRY_CODES.filter((c) => c !== "FR")
    .map((code) => ({ code, name: countryName(code, locale), flag: countryFlag(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return [{ code: "FR" as CountryCode, name: countryName("FR", locale), flag: countryFlag("FR") }, ...rest];
}

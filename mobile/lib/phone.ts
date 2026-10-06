// "max" metadata is needed to tell mobile numbers from landlines.
import {
  AsYouType,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";
import examples from "libphonenumber-js/mobile/examples";

export type PhoneCheck =
  | { valid: true; e164: string; country: CountryCode }
  | { valid: false; error: string };

/**
 * Validates a number typed for the selected country, with the same libphonenumber
 * rules the API applies (backend/app/phone.py), so errors show before submitting.
 */
export function checkPhone(
  input: string,
  country: CountryCode,
  { mobileOnly = false }: { mobileOnly?: boolean } = {}
): PhoneCheck {
  const phone = parsePhoneNumberFromString(input.trim(), country);
  if (!phone || !phone.isValid())
    return { valid: false, error: "Enter a valid phone number" };
  if (phone.country !== country) {
    return {
      valid: false,
      error: "This number doesn't match the selected country",
    };
  }
  if (mobileOnly) {
    const type = phone.getType();
    if (type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") {
      return { valid: false, error: "Enter a mobile number" };
    }
  }
  return { valid: true, e164: phone.number, country };
}

export const dialCode = (country: CountryCode) =>
  `+${getCountryCallingCode(country)}`;

/** "+201001234567" -> "+20 10 01234567" for display. */
export const formatPhone = (e164: string) =>
  parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;

/** Splits a stored E.164 number back into country + national digits for editing. */
export function splitE164(
  e164: string
): { country: CountryCode; national: string } | null {
  const phone = parsePhoneNumberFromString(e164);
  if (!phone?.country) return null;
  return { country: phone.country, national: phone.formatNational() };
}

/** A valid example mobile number for the country, as it's written locally. */
export const exampleNumber = (country: CountryCode) =>
  getExampleNumber(country, examples)?.formatNational() ?? "";

/**
 * Formats the number as it's typed ("01012345678" -> "010 12345678"). Deleting isn't
 * reformatted, so backspacing over a space works as expected.
 */
export function formatAsTyped(
  previous: string,
  next: string,
  country: CountryCode
): string {
  if (next.length < previous.length) return next;
  return new AsYouType(country).input(next);
}

"""Phone number validation, using Google's libphonenumber rules for each country."""

import phonenumbers

MOBILE_TYPES = {
    phonenumbers.PhoneNumberType.MOBILE,
    # Some countries (e.g. the US) don't distinguish the two.
    phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE,
}


def normalize_phone(raw: str, country: str | None = None, *, mobile_only: bool = False) -> str:
    """Returns the number in E.164 form (e.g. +201001234567) or raises ValueError.

    `country` is an ISO 3166 alpha-2 code ("EG") used to interpret numbers written
    without a "+country code" prefix; numbers that start with "+" don't need it.
    `mobile_only` rejects landlines, e.g. for numbers that identify an account.
    """
    try:
        number = phonenumbers.parse(raw, country.upper() if country else None)
    except phonenumbers.NumberParseException as exc:
        raise ValueError("Enter a valid phone number") from exc

    if country and phonenumbers.region_code_for_number(number) != country.upper():
        raise ValueError(f"This isn't a valid number for {country.upper()}")
    if not phonenumbers.is_valid_number(number):
        raise ValueError("Enter a valid phone number")
    if mobile_only and phonenumbers.number_type(number) not in MOBILE_TYPES:
        raise ValueError("Enter a mobile number")
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)

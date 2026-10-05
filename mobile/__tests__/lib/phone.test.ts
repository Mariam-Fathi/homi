/**
 * @jest-environment node
 */
import { checkPhone, formatPhone, splitE164 } from "@/lib/phone";

describe("checkPhone", () => {
  it("normalizes a local Egyptian mobile to E.164", () => {
    expect(checkPhone("010 0123 4567", "EG", { mobileOnly: true })).toEqual({
      valid: true,
      e164: "+201001234567",
      country: "EG",
    });
  });

  it.each([
    ["0100123456", "one digit short"],
    ["0161234567", "not an Egyptian mobile prefix"],
    ["hello", "not a number"],
  ])("rejects %s (%s)", (input) => {
    expect(checkPhone(input, "EG").valid).toBe(false);
  });

  it("rejects a number from another country than the one selected", () => {
    const result = checkPhone("+966501234567", "EG");
    expect(result).toMatchObject({ valid: false });
  });

  it("accepts landlines as contacts but not for sign-in", () => {
    expect(checkPhone("02 2345 6789", "EG").valid).toBe(true);
    expect(checkPhone("02 2345 6789", "EG", { mobileOnly: true })).toEqual({
      valid: false,
      error: "Enter a mobile number",
    });
  });

  it("validates other countries by their own rules", () => {
    expect(checkPhone("050 123 4567", "SA", { mobileOnly: true })).toMatchObject({
      valid: true,
      e164: "+966501234567",
    });
  });
});

describe("formatting", () => {
  it("round-trips a stored number for editing and display", () => {
    expect(splitE164("+201001234567")).toEqual({ country: "EG", national: "010 01234567" });
    expect(formatPhone("+201001234567")).toBe("+20 10 01234567");
  });
});

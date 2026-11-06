import { describe, expect, it } from "vitest";
import { toDialablePhoneNumber } from "./phoneNumbers";

describe("emergency contact telephone links", () => {
  it("preserves short codes instead of prepending a country code", () => {
    expect(toDialablePhoneNumber("112")).toBe("112");
  });

  it("converts Nigerian domestic formatting to a dialable international number", () => {
    expect(toDialablePhoneNumber("0800 123 4567")).toBe("+2348001234567");
  });

  it("does not prepend Nigeria's country code to international numbers", () => {
    expect(toDialablePhoneNumber(" +234 (800) 123-4567 ")).toBe("+2348001234567");
    expect(toDialablePhoneNumber("2348001234567")).toBe("+2348001234567");
    expect(toDialablePhoneNumber("+44 7700 900123")).toBe("+447700900123");
    expect(toDialablePhoneNumber("0044 7700 900123")).toBe("+447700900123");
  });
});

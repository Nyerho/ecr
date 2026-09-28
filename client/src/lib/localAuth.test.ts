import { beforeEach, describe, expect, it } from "vitest";
import {
  checkPasswordRequirements,
  isPasswordStrong,
  registerLocalUser,
  signInLocalUser,
  PASSWORD_REQUIREMENT_HINT,
} from "./localAuth";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("localAuth password requirements", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  });

  it("evaluates password requirements correctly", () => {
    expect(checkPasswordRequirements("short")).toEqual({
      minLength: false,
      hasUpper: false,
      hasLower: true,
      hasNumber: false,
      hasSpecial: false,
    });

    expect(checkPasswordRequirements("ValidPass123!")).toEqual({
      minLength: true,
      hasUpper: true,
      hasLower: true,
      hasNumber: true,
      hasSpecial: true,
    });
    expect(isPasswordStrong("ValidPass123!")).toBe(true);
  });

  it("rejects registration for weak passwords lacking uppercase, lowercase, number, or symbol", () => {
    expect(() =>
      registerLocalUser({ name: "User", email: "u1@test.com", password: "lowercaseonly!" })
    ).toThrow(PASSWORD_REQUIREMENT_HINT);

    expect(() =>
      registerLocalUser({ name: "User", email: "u2@test.com", password: "UPPERCASEONLY1!" })
    ).toThrow(PASSWORD_REQUIREMENT_HINT);

    expect(() =>
      registerLocalUser({ name: "User", email: "u3@test.com", password: "NoSpecialChar1" })
    ).toThrow(PASSWORD_REQUIREMENT_HINT);

    expect(() =>
      registerLocalUser({ name: "User", email: "u4@test.com", password: "NoNumbersHere!" })
    ).toThrow(PASSWORD_REQUIREMENT_HINT);

    expect(() =>
      registerLocalUser({ name: "User", email: "u5@test.com", password: "Short1!" })
    ).toThrow(PASSWORD_REQUIREMENT_HINT);
  });

  it("registers a user with a strong password", () => {
    const user = registerLocalUser({
      name: "Pilot Tester",
      email: "pilot@example.com",
      password: "EmergencyResponse2026!",
    });
    expect(user.email).toBe("pilot@example.com");
    expect(user.name).toBe("Pilot Tester");
  });

  it("allows legacy accounts with weak passwords to sign in without breaking", () => {
    // Manually inject a legacy stored user with a weak password (e.g. 8 lowercase chars)
    const legacyUser = {
      id: "local-legacy-1",
      name: "Legacy User",
      email: "legacy@example.com",
      password: "password123",
      role: "user",
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    localStorage.setItem("ecr-local-users", JSON.stringify([legacyUser]));

    const session = signInLocalUser("legacy@example.com", "password123");
    expect(session.id).toBe("local-legacy-1");
    expect(session.email).toBe("legacy@example.com");
  });
});

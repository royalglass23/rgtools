import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => {
  class MockAuthError extends Error {
    type: string;

    constructor(type: string) {
      super(type);
      this.type = type;
    }
  }

  return {
    signIn: vi.fn(),
    MockAuthError,
  };
});

vi.mock("@/lib/auth", () => ({ signIn: authMocks.signIn }));
vi.mock("next-auth", () => ({ AuthError: authMocks.MockAuthError }));

import { loginAction } from "../actions";

function credentials() {
  const formData = new FormData();
  formData.set("username", "staff-user");
  formData.set("password", "test-password");
  return formData;
}

describe("loginAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports invalid credentials without exposing details", async () => {
    authMocks.signIn.mockRejectedValue(
      new authMocks.MockAuthError("CredentialsSignin"),
    );

    await expect(loginAction(undefined, credentials())).resolves.toEqual({
      error: "Invalid username or password",
    });
  });

  it("distinguishes authentication infrastructure failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    authMocks.signIn.mockRejectedValue(
      new authMocks.MockAuthError("CallbackRouteError"),
    );

    await expect(loginAction(undefined, credentials())).resolves.toEqual({
      error: "Sign-in service is temporarily unavailable. Please try again.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Authentication service error",
      expect.any(authMocks.MockAuthError),
    );
  });
});

import { describe, it, expect, vi } from "vitest";
import { refreshGoogleDriveAccessToken, isTokenExpiring } from "@/app/services/googleDriveToken";

const okResponse = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);

const makeFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) =>
  vi.fn(impl) as unknown as typeof fetch;

describe("refreshGoogleDriveAccessToken", () => {
  it("sends grant_type=refresh_token with client id and refresh token", async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      return okResponse({ access_token: "at", expires_in: 3600 });
    });
    const result = await refreshGoogleDriveAccessToken({
      refreshToken: "rt",
      clientId: "cid",
      fetchImpl,
    });
    expect("tokenInfo" in result && result.tokenInfo.accessToken).toBe("at");
    const call = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = new URLSearchParams((call[1] as RequestInit).body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBeNull();
  });

  it("includes client_secret when provided", async () => {
    const fetchImpl = makeFetch(() => okResponse({ access_token: "at" }));
    await refreshGoogleDriveAccessToken({ refreshToken: "rt", clientId: "cid", clientSecret: "secret", fetchImpl });
    const call = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = new URLSearchParams((call[1] as RequestInit).body as string);
    expect(body.get("client_secret")).toBe("secret");
  });

  it("keeps existing refresh token when response does not rotate it", async () => {
    const result = await refreshGoogleDriveAccessToken({
      refreshToken: "rt",
      clientId: "cid",
      fetchImpl: makeFetch(() => okResponse({ access_token: "at", expires_in: 3600 })),
    });
    expect("tokenInfo" in result && result.tokenInfo.refreshToken).toBeUndefined();
  });

  it("reports invalidRefreshToken when Google rejects with invalid_grant", async () => {
    const result = await refreshGoogleDriveAccessToken({
      refreshToken: "rt",
      clientId: "cid",
      fetchImpl: makeFetch(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          text: () => Promise.resolve(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." })),
        } as Response),
      ),
    });
    expect("errorMessage" in result && result.invalidRefreshToken).toBe(true);
  });

  it("returns error message on network failure", async () => {
    const result = await refreshGoogleDriveAccessToken({
      refreshToken: "rt",
      clientId: "cid",
      fetchImpl: makeFetch(() => Promise.reject(new Error("network down"))),
    });
    expect("errorMessage" in result).toBe(true);
  });
});

describe("isTokenExpiring", () => {
  it("treats missing or malformed expiresAt as expiring", () => {
    expect(isTokenExpiring(undefined)).toBe(true);
    expect(isTokenExpiring("not-a-date")).toBe(true);
  });

  it("is false for tokens valid beyond the lead window", () => {
    expect(isTokenExpiring(new Date(Date.now() + 10 * 60_000).toISOString())).toBe(false);
  });

  it("is true for tokens inside the lead window", () => {
    expect(isTokenExpiring(new Date(Date.now() + 10_000).toISOString())).toBe(true);
  });
});

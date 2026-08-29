export interface GoogleDriveTokenRefreshParams {
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
}

export interface GoogleDriveTokenRefreshInfo {
  accessToken: string;
  /** 刷新响应通常不返回 refresh_token；有则轮换，无则调用方应保留旧值 */
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
}

export type GoogleDriveTokenRefreshResult =
  | { tokenInfo: GoogleDriveTokenRefreshInfo }
  | { errorMessage: string; invalidRefreshToken?: boolean };

/**
 * 用 refresh token 静默换取新的 access token（grant_type=refresh_token）。
 * 调用方需要保留原有 refresh token：Google 仅在首次授权/轮换时返回新的 refresh_token。
 */
export const refreshGoogleDriveAccessToken = async (
  params: GoogleDriveTokenRefreshParams,
): Promise<GoogleDriveTokenRefreshResult> => {
  const { refreshToken, clientId, clientSecret, fetchImpl } = params;
  const impl = fetchImpl || fetch;
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    grant_type: "refresh_token",
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  let response: Response;
  try {
    response = await impl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    } as RequestInit);
  } catch (error) {
    console.error("[CloudAuth] googleDrive token refresh network error", error);
    return { errorMessage: "无法连接到 Google 授权服务器，请检查网络后重试。" };
  }

  if (!response.ok) {
    let text = "";
    let jsonError: any = undefined;
    try {
      text = await response.text();
      try {
        jsonError = JSON.parse(text);
      } catch {
      }
    } catch {
    }
    console.error("[CloudAuth] googleDrive token refresh failed", {
      status: response.status,
      body: text,
    });
    const errorDescription: string | undefined =
      typeof jsonError?.error_description === "string"
        ? jsonError.error_description
        : typeof jsonError?.error === "string"
          ? jsonError.error
          : undefined;
    const invalid =
      response.status === 400 &&
      typeof errorDescription === "string" &&
      /invalid_grant|token.*expired|revoked/i.test(errorDescription);
    return {
      errorMessage: errorDescription
        ? `Google 授权刷新失败：${errorDescription}`
        : "未能刷新 Google 访问令牌，请在云同步面板中重新授权。",
      invalidRefreshToken: invalid,
    };
  }

  let json: any;
  try {
    json = await response.json();
  } catch (error) {
    console.error("[CloudAuth] googleDrive token refresh json parse error", error);
    return { errorMessage: "解析 Google 授权刷新返回数据失败，请稍后重试。" };
  }

  const accessToken: string | undefined = json?.access_token;
  if (!accessToken) {
    console.error("[CloudAuth] googleDrive token refresh response missing access_token", json);
    return { errorMessage: "授权刷新返回中缺少访问令牌，请在云同步面板中重新授权。" };
  }

  const refreshTokenNext: string | undefined =
    typeof json?.refresh_token === "string" ? json.refresh_token : undefined;
  const expiresIn: number | undefined =
    typeof json?.expires_in === "number"
      ? json.expires_in
      : typeof json?.expires_in === "string"
        ? Number(json.expires_in)
        : undefined;
  let expiresAt: string | undefined;
  if (Number.isFinite(expiresIn) && expiresIn && expiresIn > 0) {
    expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  }
  const scope: string | undefined = typeof json?.scope === "string" ? json.scope : undefined;

  return {
    tokenInfo: {
      accessToken,
      refreshToken: refreshTokenNext,
      expiresAt,
      scope,
    },
  };
};

/** 判断 access token 是否已经过期或将在 leadMs 内过期 */
export const isTokenExpiring = (expiresAt: string | undefined, leadMs = 60_000): boolean => {
  if (!expiresAt) {
    return true;
  }
  const time = new Date(expiresAt).getTime();
  if (!Number.isFinite(time)) {
    return true;
  }
  return time - Date.now() < leadMs;
};

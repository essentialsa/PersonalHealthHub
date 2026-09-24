import assert from "node:assert";
import {
  planAttachmentCacheEviction, applyAttachmentCacheEviction, mergeAttachmentMeta,
  dataUrlToBytes, bytesToDataUrl, toAttachmentMeta, addAttachment, loadAttachments,
} from "/Users/leo/Documents/PersonalHealthHub/.worktrees/drive-auto-backup/src/app/services/attachment.ts";
import { refreshGoogleDriveAccessToken, isTokenExpiring } from "/Users/leo/Documents/PersonalHealthHub/.worktrees/drive-auto-backup/src/app/services/googleDriveToken.ts";

const mk = (o = {}) => ({ id: "x", fileName: "a.pdf", fileType: "application/pdf", fileSize: 1, data: "x".repeat(10), date: "2026-01-01", createdAt: "2026-01-01T00:00:00.000Z", ...o });

// 缓存清理：只清已同步、最早优先
const a1 = mk({ id: "a1", driveFileId: "d1", createdAt: "2026-01-01T00:00:00.000Z" });
const a2 = mk({ id: "a2", driveFileId: "d2", createdAt: "2026-01-02T00:00:00.000Z" });
const a3 = mk({ id: "a3", createdAt: "2026-01-03T00:00:00.000Z" }); // 未上传
assert.deepEqual(planAttachmentCacheEviction([a1, a2, a3], 25), ["a1"]);
assert.deepEqual(planAttachmentCacheEviction([a1], 100000), []);
assert.equal(applyAttachmentCacheEviction([a1, a2], ["a1"])[0].data, undefined);
assert.equal(applyAttachmentCacheEviction([a1, a2], ["a1"])[1].data, a2.data);

// 元数据合并：云端 driveFileId 优先
const merged = mergeAttachmentMeta(
  [{ id: "1", fileName: "a.pdf", fileType: "application/pdf", fileSize: 1, date: "2026-01-01", createdAt: "2026-01-01T00:00:00.000Z" }],
  [{ id: "1", fileName: "a.pdf", fileType: "application/pdf", fileSize: 1, date: "2026-01-01", createdAt: "2026-01-01T00:00:00.000Z", driveFileId: "drive-1" }],
);
assert.equal(merged[0].driveFileId, "drive-1");

// data URL <-> bytes
const dataUrl = "data:application/pdf;base64," + Buffer.from("hello health hub").toString("base64");
const bytes = dataUrlToBytes(dataUrl);
assert.equal(Buffer.from(bytes).toString(), "hello health hub");
assert.equal(bytesToDataUrl(bytes, "application/pdf"), dataUrl);

// 快照元数据不含 data
assert.equal(toAttachmentMeta(mk({ data: "secret" })).data, undefined);

// token 刷新
const okJson = { access_token: "at", expires_in: 3600 };
let calls = [];
const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => okJson }; };
const r1 = await refreshGoogleDriveAccessToken({ refreshToken: "rt", clientId: "cid", fetchImpl: fakeFetch });
assert.equal(r1.tokenInfo.accessToken, "at");
assert.ok(r1.tokenInfo.expiresAt);
const body = new URLSearchParams(calls[0].init.body);
assert.equal(body.get("grant_type"), "refresh_token");
assert.equal(body.get("refresh_token"), "rt");
assert.equal(body.get("client_id"), "cid");
assert.equal(body.get("client_secret"), null);

const r2 = await refreshGoogleDriveAccessToken({ refreshToken: "rt", clientId: "cid", fetchImpl: async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }) }) });
assert.equal(r2.invalidRefreshToken, true);

const r3 = await refreshGoogleDriveAccessToken({ refreshToken: "rt", clientId: "cid", fetchImpl: async () => { throw new Error("network down"); } });
assert.ok(r3.errorMessage);

// isTokenExpiring
assert.equal(isTokenExpiring(undefined), true);
assert.equal(isTokenExpiring("not-a-date"), true);
assert.equal(isTokenExpiring(new Date(Date.now() + 10 * 60000).toISOString()), false);
assert.equal(isTokenExpiring(new Date(Date.now() + 10000).toISOString()), true);

console.log("ALL SERVICE ASSERTIONS PASSED (14 checks)");

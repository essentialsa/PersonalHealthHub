import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { HealthAttachment } from "@/app/services/attachment";

const IDB_NAME = "health_attachments_db";

// 每个用例动态导入模块，配合 vi.resetModules() 重置模块内的 IDB 可用性缓存
const loadModule = () => import("@/app/services/attachment");

const deleteIdb = (): Promise<void> =>
  new Promise(resolve => {
    const request = indexedDB.deleteDatabase(IDB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

const makeAttachment = (overrides: Partial<HealthAttachment> = {}): HealthAttachment => ({
  id: "att_1",
  fileName: "report.pdf",
  fileType: "application/pdf",
  fileSize: 1024,
  data: "data:application/pdf;base64,QUJD",
  date: "2026-09-30",
  createdAt: "2026-09-30T00:00:00.000Z",
  ...overrides,
});

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  await deleteIdb();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("attachment IndexedDB blob 层", () => {
  it("save/load/delete 单条读写删", async () => {
    const mod = await loadModule();
    await mod.saveAttachmentData("a1", "data:image/png;base64,AAA");
    expect(await mod.loadAttachmentData("a1")).toBe("data:image/png;base64,AAA");
    await mod.deleteAttachmentData("a1");
    expect(await mod.loadAttachmentData("a1")).toBeUndefined();
  });

  it("load 不存在的 id 返回 undefined", async () => {
    const mod = await loadModule();
    expect(await mod.loadAttachmentData("missing")).toBeUndefined();
  });

  it("deleteAttachmentsData 单事务批量删除", async () => {
    const mod = await loadModule();
    await mod.saveAttachmentData("b1", "data:image/png;base64,B1");
    await mod.saveAttachmentData("b2", "data:image/png;base64,B2");
    await mod.saveAttachmentData("b3", "data:image/png;base64,B3");
    await mod.deleteAttachmentsData(["b1", "b3"]);
    expect(await mod.loadAttachmentData("b1")).toBeUndefined();
    expect(await mod.loadAttachmentData("b2")).toBe("data:image/png;base64,B2");
    expect(await mod.loadAttachmentData("b3")).toBeUndefined();
  });

  it("deleteAttachmentsData 空数组为空操作", async () => {
    const mod = await loadModule();
    await expect(mod.deleteAttachmentsData([])).resolves.toBeUndefined();
  });
});

describe("addAttachment 与 IndexedDB 联动", () => {
  it("IDB 可用时 15MB 附件通过，data 不进 localStorage", async () => {
    const mod = await loadModule();
    const data = "data:application/pdf;base64," + "A".repeat(1024);
    const a = makeAttachment({ id: "big15", fileSize: 15 * 1024 * 1024, data });
    expect(await mod.addAttachment(a)).toBe(true);

    const stored = mod.loadAttachments();
    expect(stored).toHaveLength(1);
    expect(stored[0].data).toBeUndefined();
    expect(stored[0].fileSize).toBe(15 * 1024 * 1024);
    expect(localStorage.getItem("health_attachments_v1")).not.toContain("A".repeat(1024));
    expect(await mod.loadAttachmentData("big15")).toBe(data);
  });

  it("IDB 可用时超过 50MB 仍拒绝", async () => {
    const mod = await loadModule();
    const a = makeAttachment({ id: "huge51", fileSize: 51 * 1024 * 1024 });
    expect(await mod.addAttachment(a)).toBe(false);
    expect(mod.loadAttachments()).toHaveLength(0);
    expect(await mod.loadAttachmentData("huge51")).toBeUndefined();
  });

  it("deleteAttachment 联动删除 IDB blob", async () => {
    const mod = await loadModule();
    const a = makeAttachment({ id: "del1", data: "data:image/png;base64,DEL" });
    expect(await mod.addAttachment(a)).toBe(true);
    expect(await mod.loadAttachmentData("del1")).toBe("data:image/png;base64,DEL");
    await mod.deleteAttachment("del1");
    expect(mod.loadAttachments()).toHaveLength(0);
    expect(await mod.loadAttachmentData("del1")).toBeUndefined();
  });

  it("cleanupOrphanedAttachments 联动批量删除 IDB blob", async () => {
    const mod = await loadModule();
    const kept = makeAttachment({ id: "keep1" });
    const orphan = makeAttachment({ id: "orph1", data: "data:image/png;base64,ORPH" });
    expect(await mod.addAttachment(kept)).toBe(true);
    expect(await mod.addAttachment(orphan)).toBe(true);
    localStorage.setItem("health_records_v1", JSON.stringify([{ id: "r1", attachmentId: "keep1" }]));

    expect(await mod.cleanupOrphanedAttachments()).toBe(1);
    expect(mod.loadAttachments().map(a => a.id)).toEqual(["keep1"]);
    expect(await mod.loadAttachmentData("keep1")).toBe(kept.data);
    expect(await mod.loadAttachmentData("orph1")).toBeUndefined();
  });
});

describe("migrateAttachmentBlobsToIdb", () => {
  it("把 localStorage 内联 data 搬到 IDB 且重复执行幂等", async () => {
    const mod = await loadModule();
    mod.saveAttachments([
      makeAttachment({ id: "m1", data: "data:image/png;base64,M1" }),
      makeAttachment({ id: "m2", data: "data:image/png;base64,M2" }),
      makeAttachment({ id: "m3", data: undefined }),
    ]);

    await mod.migrateAttachmentBlobsToIdb();
    const afterFirst = mod.loadAttachments();
    expect(afterFirst.find(a => a.id === "m1")?.data).toBeUndefined();
    expect(afterFirst.find(a => a.id === "m2")?.data).toBeUndefined();
    expect(afterFirst.find(a => a.id === "m3")?.data).toBeUndefined();
    expect(await mod.loadAttachmentData("m1")).toBe("data:image/png;base64,M1");
    expect(await mod.loadAttachmentData("m2")).toBe("data:image/png;base64,M2");
    expect(await mod.loadAttachmentData("m3")).toBeUndefined();

    // 重复执行无副作用
    await mod.migrateAttachmentBlobsToIdb();
    expect(mod.loadAttachments()).toEqual(afterFirst);
    expect(await mod.loadAttachmentData("m1")).toBe("data:image/png;base64,M1");
    expect(await mod.loadAttachmentData("m2")).toBe("data:image/png;base64,M2");
  });

  it("单条失败 console.warn 后继续，其余正常迁移", async () => {
    const mod = await loadModule();
    // 预热可用性缓存，之后对 indexedDB.open 的计数只对应 save 调用
    await mod.saveAttachmentData("warmup", "data:image/png;base64,W");

    mod.saveAttachments([
      makeAttachment({ id: "f1", data: "data:image/png;base64,F1" }),
      makeAttachment({ id: "f2", data: "data:image/png;base64,F2" }),
      makeAttachment({ id: "f3", data: "data:image/png;base64,F3" }),
    ]);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const originalOpen = indexedDB.open.bind(indexedDB);
    let openCalls = 0;
    vi.spyOn(indexedDB, "open").mockImplementation((name: string, version?: number) => {
      openCalls += 1;
      if (openCalls === 2) {
        throw new DOMException("injected open failure");
      }
      return originalOpen(name, version);
    });

    await mod.migrateAttachmentBlobsToIdb();

    expect(warn).toHaveBeenCalledTimes(1);
    const stored = mod.loadAttachments();
    expect(stored.find(a => a.id === "f1")?.data).toBeUndefined();
    expect(stored.find(a => a.id === "f2")?.data).toBe("data:image/png;base64,F2");
    expect(stored.find(a => a.id === "f3")?.data).toBeUndefined();
    expect(await mod.loadAttachmentData("f1")).toBe("data:image/png;base64,F1");
    expect(await mod.loadAttachmentData("f3")).toBe("data:image/png;base64,F3");
  });
});

describe("降级路径（IndexedDB 不可用）", () => {
  it("data 直存 localStorage，超过 10MB 拒绝", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.resetModules();
    const mod = await loadModule();

    const within = makeAttachment({ id: "lg1", fileSize: 9 * 1024 * 1024, data: "data:image/png;base64,LG1" });
    expect(await mod.addAttachment(within)).toBe(true);
    expect(mod.loadAttachments().find(a => a.id === "lg1")?.data).toBe("data:image/png;base64,LG1");

    const tooBig = makeAttachment({ id: "lg2", fileSize: 11 * 1024 * 1024 });
    expect(await mod.addAttachment(tooBig)).toBe(false);
    expect(mod.loadAttachments().find(a => a.id === "lg2")).toBeUndefined();
  });

  it("IDB 不可用时迁移直接返回，localStorage 数据不变", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.resetModules();
    const mod = await loadModule();
    mod.saveAttachments([makeAttachment({ id: "nm1", data: "data:image/png;base64,NM1" })]);
    await mod.migrateAttachmentBlobsToIdb();
    expect(mod.loadAttachments().find(a => a.id === "nm1")?.data).toBe("data:image/png;base64,NM1");
  });

  it("IDB 不可用时 loadAttachmentData 返回 undefined", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.resetModules();
    const mod = await loadModule();
    expect(await mod.loadAttachmentData("anything")).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  ATTACHMENTS_KEY,
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  loadAttachments,
  saveAttachments,
  addAttachment,
  deleteAttachment,
  type HealthAttachment,
} from "@/app/services/attachment";

describe("HealthAttachment constants", () => {
  it("ATTACHMENTS_KEY is a valid localStorage key", () => {
    expect(typeof ATTACHMENTS_KEY).toBe("string");
    expect(ATTACHMENTS_KEY.length).toBeGreaterThan(0);
  });

  it("ALLOWED_TYPES includes common image formats and PDF", () => {
    expect(ALLOWED_TYPES).toContain("image/jpeg");
    expect(ALLOWED_TYPES).toContain("image/png");
    expect(ALLOWED_TYPES).toContain("image/gif");
    expect(ALLOWED_TYPES).toContain("image/webp");
    expect(ALLOWED_TYPES).toContain("application/pdf");
  });

  it("MAX_FILE_SIZE is 10MB", () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  it("MAX_TOTAL_SIZE is 20MB", () => {
    expect(MAX_TOTAL_SIZE).toBe(20 * 1024 * 1024);
  });

  it("MAX_TOTAL_SIZE is twice MAX_FILE_SIZE", () => {
    expect(MAX_TOTAL_SIZE).toBe(MAX_FILE_SIZE * 2);
  });
});

describe("HealthAttachment type shape", () => {
  it("can be constructed with required fields", () => {
    const attachment: HealthAttachment = {
      id: "1234_test",
      fileName: "report.pdf",
      fileType: "application/pdf",
      fileSize: 1024,
      data: "data:application/pdf;base64,AAAA",
      date: "2025-01-15",
      createdAt: "2025-01-15T10:30:00.000Z",
    };
    expect(attachment.id).toBe("1234_test");
    expect(attachment.fileName).toBe("report.pdf");
    expect(attachment.fileType).toBe("application/pdf");
    expect(attachment.fileSize).toBe(1024);
    expect(attachment.data).toContain("data:application/pdf;base64,");
    expect(attachment.date).toBe("2025-01-15");
    expect(attachment.createdAt).toBe("2025-01-15T10:30:00.000Z");
  });

  it("categoryId is optional", () => {
    const withoutCategory: HealthAttachment = {
      id: "1",
      fileName: "img.png",
      fileType: "image/png",
      fileSize: 512,
      data: "data:image/png;base64,AAA",
      date: "2025-01-15",
      createdAt: "2025-01-15T10:30:00.000Z",
    };
    expect(withoutCategory.categoryId).toBeUndefined();

    const withCategory: HealthAttachment = {
      ...withoutCategory,
      categoryId: "cat_blood",
    };
    expect(withCategory.categoryId).toBe("cat_blood");
  });
});

const makeAttachment = (overrides: Partial<HealthAttachment> = {}): HealthAttachment => ({
  id: '123456_abc',
  fileName: 'report.pdf',
  fileType: 'application/pdf',
  fileSize: 1024,
  data: 'data:application/pdf;base64,abc123',
  date: '2026-07-04',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('attachment storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadAttachments returns empty array when no data', () => {
    expect(loadAttachments()).toEqual([]);
  });

  it('saveAttachments and loadAttachments round-trip', () => {
    const a1 = makeAttachment({ id: '1' });
    const a2 = makeAttachment({ id: '2', fileName: 'scan.jpg' });
    saveAttachments([a1, a2]);
    const loaded = loadAttachments();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('1');
    expect(loaded[1].fileName).toBe('scan.jpg');
  });

  it('addAttachment succeeds when under size limits', () => {
    const a = makeAttachment({ fileSize: 1024 });
    expect(addAttachment(a)).toBe(true);
    expect(loadAttachments()).toHaveLength(1);
  });

  it('addAttachment fails when single file exceeds 10MB', () => {
    const a = makeAttachment({ fileSize: 11 * 1024 * 1024 });
    expect(addAttachment(a)).toBe(false);
    expect(loadAttachments()).toHaveLength(0);
  });

  it('addAttachment fails when total size exceeds 20MB', () => {
    const a1 = makeAttachment({ id: '1', fileSize: 9.5 * 1024 * 1024 });
    const a2 = makeAttachment({ id: '2', fileSize: 10.6 * 1024 * 1024 });
    addAttachment(a1);
    expect(addAttachment(a2)).toBe(false);
    expect(loadAttachments()).toHaveLength(1);
  });

  it('deleteAttachment removes attachment and clears referencing records', () => {
    const a = makeAttachment({ id: 'att1' });
    saveAttachments([a]);
    const records = [
      { id: 'r1', date: '2026-07-04', indicatorType: 'bp', value: 120, unit: 'mmHg', attachmentId: 'att1' },
      { id: 'r2', date: '2026-07-04', indicatorType: 'gl', value: 5.2, unit: 'mmol/L' },
    ];
    localStorage.setItem('health_records_v1', JSON.stringify(records));

    deleteAttachment('att1');

    expect(loadAttachments()).toHaveLength(0);
    const updatedRecords = JSON.parse(localStorage.getItem('health_records_v1') || '[]');
    expect(updatedRecords[0].attachmentId).toBeUndefined();
    expect(updatedRecords[1].attachmentId).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import {
  ATTACHMENTS_KEY,
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
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

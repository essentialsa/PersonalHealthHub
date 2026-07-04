import { describe, it, expect } from 'vitest';
import { validateFile } from './attachment';

const makeFile = (type: string, size: number, name = 'test.pdf'): File => {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
};

describe('validateFile', () => {
  it('accepts valid PDF', () => {
    const file = makeFile('application/pdf', 1024);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('accepts valid JPEG', () => {
    const file = makeFile('image/jpeg', 2048);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('accepts valid PNG', () => {
    const file = makeFile('image/png', 2048);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('accepts valid GIF', () => {
    const file = makeFile('image/gif', 2048);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('accepts valid WebP', () => {
    const file = makeFile('image/webp', 2048);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('rejects unsupported type', () => {
    const file = makeFile('text/plain', 1024);
    expect(validateFile(file)).toEqual({
      valid: false,
      error: '不支持的文件类型，请上传图片或 PDF',
    });
  });

  it('rejects file exceeding 10MB', () => {
    const file = makeFile('application/pdf', 11 * 1024 * 1024);
    expect(validateFile(file)).toEqual({
      valid: false,
      error: '文件大小超过限制（最大 10MB）',
    });
  });

  it('accepts file at exactly 10MB', () => {
    const file = makeFile('application/pdf', 10 * 1024 * 1024);
    expect(validateFile(file)).toEqual({ valid: true });
  });
});

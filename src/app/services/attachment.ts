export interface HealthAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  /** 本地缓存的 data URL；已上传云盘的大文件可能被清空（data 为 undefined），内容以云盘为准 */
  data?: string;
  date: string;
  categoryId?: string;
  createdAt: string;
  /** Google Drive 文件 id；存在表示附件内容已上传云盘 */
  driveFileId?: string;
}

export const ATTACHMENTS_KEY = 'health_attachments_v1';
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
/**
 * 本地缓存预算：附件以 Google Drive 为持久层，本地只保留 data URL 缓存用于离线查看。
 * 超出预算时优先清理「已上传云盘」的附件缓存（最早的先清）。
 */
export const ATTACHMENT_CACHE_BUDGET = 4 * 1024 * 1024; // 4MB

export const loadAttachments = (): HealthAttachment[] => {
  try {
    const data = localStorage.getItem(ATTACHMENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveAttachments = (attachments: HealthAttachment[]) => {
  localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(attachments));
};

export const addAttachment = (attachment: HealthAttachment): boolean => {
  const attachments = loadAttachments();

  if (attachment.fileSize > MAX_FILE_SIZE) {
    return false;
  }

  attachments.push(attachment);
  saveAttachments(attachments);
  return true;
};

export const validateFile = (file: File): { valid: boolean; error?: string } => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: '不支持的文件类型，请上传图片或 PDF' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` };
  }
  return { valid: true };
};

/** 附件在本地缓存中占用的字节数（data URL 长度近似） */
export const attachmentCacheSize = (attachment: HealthAttachment): number =>
  attachment.data ? attachment.data.length : 0;

export const totalCacheSize = (attachments: HealthAttachment[]): number =>
  attachments.reduce((sum, a) => sum + attachmentCacheSize(a), 0);

/**
 * 计算为满足缓存预算需要清空 data 的附件 id 列表。
 * 只清理已上传云盘（有 driveFileId）的附件，从最早的开始；未上传云盘的附件永不清理。
 */
export const planAttachmentCacheEviction = (
  attachments: HealthAttachment[],
  budget: number = ATTACHMENT_CACHE_BUDGET,
): string[] => {
  const evictable = attachments
    .filter(a => a.driveFileId && a.data)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  let overflow = totalCacheSize(attachments) - budget;
  const evictIds: string[] = [];
  for (const item of evictable) {
    if (overflow <= 0) break;
    overflow -= attachmentCacheSize(item);
    evictIds.push(item.id);
  }
  return evictIds;
};

/** 应用缓存清理计划，返回新的附件列表（被清理项 data 置 undefined，其余字段不变） */
export const applyAttachmentCacheEviction = (
  attachments: HealthAttachment[],
  evictIds: string[],
): HealthAttachment[] => {
  if (evictIds.length === 0) return attachments;
  const ids = new Set(evictIds);
  return attachments.map(a => (ids.has(a.id) ? { ...a, data: undefined } : a));
};

/** 把 base64 data URL 拆成 mimeType 与纯 base64 部分 */
export const splitDataUrl = (dataUrl: string): { mimeType: string; base64: string } => {
  const match = /^data:([^;,]*(?:;charset=[^;]*)?);base64,(.*)$/s.exec(dataUrl);
  if (match) {
    return { mimeType: match[1] || 'application/octet-stream', base64: match[2] };
  }
  return { mimeType: 'application/octet-stream', base64: dataUrl };
};

export const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const { base64 } = splitDataUrl(dataUrl);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const bytesToDataUrl = (bytes: Uint8Array, mimeType: string): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType || 'application/octet-stream'};base64,${btoa(binary)}`;
};

/** 快照用附件元数据：不含 data 内容，避免备份 JSON 膨胀 */
export type AttachmentMeta = Omit<HealthAttachment, 'data'>;

export const toAttachmentMeta = (attachment: HealthAttachment): AttachmentMeta => {
  const { data: _data, ...meta } = attachment;
  return meta;
};

/**
 * 合并本地与云端的附件元数据：按 id 去重，云端有条目且带 driveFileId 时覆盖本地
 * （云盘是持久层，云端的上传状态更可信）；否则保留本地。
 */
export const mergeAttachmentMeta = (local: AttachmentMeta[], remote: AttachmentMeta[]): AttachmentMeta[] => {
  const map = new Map(local.map(item => [item.id, item]));
  remote.forEach(item => {
    const existing = map.get(item.id);
    if (!existing || item.driveFileId) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
};

// 查找无引用的孤立附件
export const findOrphanedAttachments = (): HealthAttachment[] => {
  const attachments = loadAttachments();
  try {
    const recordsData = localStorage.getItem('health_records_v1');
    const records: { attachmentId?: string }[] = recordsData ? JSON.parse(recordsData) : [];
    const referencedIds = new Set(records.map(r => r.attachmentId).filter(Boolean));
    return attachments.filter(a => !referencedIds.has(a.id));
  } catch {
    return [];
  }
};

// 清理孤立附件
export const cleanupOrphanedAttachments = (): number => {
  const orphaned = findOrphanedAttachments();
  if (orphaned.length === 0) return 0;
  const orphanedIds = new Set(orphaned.map(a => a.id));
  const attachments = loadAttachments();
  const cleaned = attachments.filter(a => !orphanedIds.has(a.id));
  saveAttachments(cleaned);
  return orphaned.length;
};

export const deleteAttachment = (attachmentId: string) => {
  const attachments = loadAttachments();
  const filtered = attachments.filter(a => a.id !== attachmentId);
  saveAttachments(filtered);

  try {
    const recordsData = localStorage.getItem('health_records_v1');
    if (recordsData) {
      const records = JSON.parse(recordsData);
      const updated = records.map((r: { attachmentId?: string }) =>
        r.attachmentId === attachmentId ? { ...r, attachmentId: undefined } : r,
      );
      localStorage.setItem('health_records_v1', JSON.stringify(updated));
    }
  } catch {
    // ignore record update failures
  }
};

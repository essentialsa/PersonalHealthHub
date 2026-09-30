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
/** IndexedDB 可用时的单文件上限（data 存入 IndexedDB，不受 localStorage 配额约束） */
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
/** IndexedDB 不可用（降级为 data 直存 localStorage）时的单文件上限，保持旧行为 */
export const LEGACY_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
/** 健康记录在 localStorage 中的基础键（登录态下实际键带 `__userId` 后缀） */
export const RECORDS_BASE_KEY = 'health_records_v1';

/**
 * 附件存取的键作用域：登录态下 App 层传入按用户后缀的键，
 * 与健康记录的多用户隔离保持一致；未传时回落基础键（未登录场景，向后兼容）。
 */
export interface AttachmentStorageScope {
  attachmentsKey?: string;
  recordsKey?: string;
}

const resolveKeys = (scope?: AttachmentStorageScope) => ({
  attachmentsKey: scope?.attachmentsKey || ATTACHMENTS_KEY,
  recordsKey: scope?.recordsKey || RECORDS_BASE_KEY,
});
/**
 * 本地缓存预算：附件以 Google Drive 为持久层，本地只保留 data URL 缓存用于离线查看。
 * 超出预算时优先清理「已上传云盘」的附件缓存（最早的先清）。
 */
export const ATTACHMENT_CACHE_BUDGET = 4 * 1024 * 1024; // 4MB

export const loadAttachments = (scope?: AttachmentStorageScope): HealthAttachment[] => {
  try {
    const data = localStorage.getItem(resolveKeys(scope).attachmentsKey);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveAttachments = (attachments: HealthAttachment[], scope?: AttachmentStorageScope) => {
  localStorage.setItem(resolveKeys(scope).attachmentsKey, JSON.stringify(attachments));
};

// ---------- IndexedDB blob 存储层 ----------
// 附件 data URL 存 IndexedDB（key 为附件 id），localStorage 只保留元数据，
// 解除 localStorage 配额对附件大小的约束。
const ATTACHMENT_IDB_NAME = 'health_attachments_db';
const ATTACHMENT_IDB_STORE = 'blobs';
const IDB_UNAVAILABLE_ERROR = 'attachment IndexedDB unavailable';

let idbAvailability: Promise<boolean> | null = null;

const openAttachmentIdb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(ATTACHMENT_IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATTACHMENT_IDB_STORE)) {
        db.createObjectStore(ATTACHMENT_IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('failed to open attachment idb'));
    request.onblocked = () => reject(new Error('attachment idb open blocked'));
  });

/**
 * 打开一次并缓存结果；打开失败即进入降级态，
 * 后续所有 IDB 调用直接按不可用处理，不反复尝试报错。
 */
const isAttachmentIdbAvailable = (): Promise<boolean> => {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(false);
  }
  if (!idbAvailability) {
    idbAvailability = openAttachmentIdb()
      .then(db => {
        db.close();
        return true;
      })
      .catch(() => false);
  }
  return idbAvailability;
};

const runAttachmentStoreRequest = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  if (!(await isAttachmentIdbAvailable())) {
    throw new Error(IDB_UNAVAILABLE_ERROR);
  }
  const db = await openAttachmentIdb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(ATTACHMENT_IDB_STORE, mode);
      const request = run(tx.objectStore(ATTACHMENT_IDB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('attachment idb request failed'));
    });
  } finally {
    db.close();
  }
};

/** 保存附件 data URL 到 IndexedDB（调用方需先确认 IDB 可用；不可用时抛错） */
export const saveAttachmentData = async (id: string, data: string): Promise<void> => {
  await runAttachmentStoreRequest('readwrite', store => store.put(data, id));
};

/** 从 IndexedDB 读取附件 data URL；不存在或 IDB 不可用时返回 undefined */
export const loadAttachmentData = async (id: string): Promise<string | undefined> => {
  if (!(await isAttachmentIdbAvailable())) {
    return undefined;
  }
  const result = await runAttachmentStoreRequest<string>('readonly', store => store.get(id));
  return typeof result === 'string' ? result : undefined;
};

/** 删除单个附件 blob（调用方需先确认 IDB 可用；不可用时抛错） */
export const deleteAttachmentData = async (id: string): Promise<void> => {
  await runAttachmentStoreRequest('readwrite', store => store.delete(id));
};

/** 单事务批量删除附件 blob（调用方需先确认 IDB 可用；不可用时抛错） */
export const deleteAttachmentsData = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  if (!(await isAttachmentIdbAvailable())) {
    throw new Error(IDB_UNAVAILABLE_ERROR);
  }
  const db = await openAttachmentIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ATTACHMENT_IDB_STORE, 'readwrite');
      const store = tx.objectStore(ATTACHMENT_IDB_STORE);
      ids.forEach(id => {
        store.delete(id);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('attachment idb batch delete failed'));
      tx.onabort = () => reject(tx.error ?? new Error('attachment idb batch delete aborted'));
    });
  } finally {
    db.close();
  }
};

/**
 * 新增附件：校验大小后先把元数据写入 localStorage（IDB 可用时元数据项不落 data），
 * IDB 可用时再把 data 写入 IndexedDB；IDB 不可用时维持旧行为（data 直存 localStorage，
 * 且上限回落 10MB）。任一写失败返回 false 并尽量回滚已写入的元数据。
 */
export const addAttachment = async (
  attachment: HealthAttachment,
  scope?: AttachmentStorageScope,
): Promise<boolean> => {
  const idbAvailable = await isAttachmentIdbAvailable();
  const sizeLimit = idbAvailable ? MAX_FILE_SIZE : LEGACY_MAX_FILE_SIZE;
  if (attachment.fileSize > sizeLimit) {
    return false;
  }

  const attachments = loadAttachments(scope);
  attachments.push(idbAvailable ? { ...attachment, data: undefined } : attachment);
  try {
    saveAttachments(attachments, scope);
  } catch {
    return false;
  }

  if (idbAvailable && attachment.data) {
    try {
      await saveAttachmentData(attachment.id, attachment.data);
    } catch {
      // 回滚已写入的元数据
      attachments.pop();
      try {
        saveAttachments(attachments, scope);
      } catch {
        // ignore rollback failures
      }
      return false;
    }
  }
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
export const findOrphanedAttachments = (scope?: AttachmentStorageScope): HealthAttachment[] => {
  const keys = resolveKeys(scope);
  const attachments = loadAttachments(scope);
  try {
    const recordsData = localStorage.getItem(keys.recordsKey);
    const records: { attachmentId?: string }[] = recordsData ? JSON.parse(recordsData) : [];
    const referencedIds = new Set(records.map(r => r.attachmentId).filter(Boolean));
    return attachments.filter(a => !referencedIds.has(a.id));
  } catch {
    return [];
  }
};

// 清理孤立附件（联动删除对应 IDB blob）
export const cleanupOrphanedAttachments = async (scope?: AttachmentStorageScope): Promise<number> => {
  const orphaned = findOrphanedAttachments(scope);
  if (orphaned.length === 0) return 0;
  const orphanedIds = new Set(orphaned.map(a => a.id));
  const attachments = loadAttachments(scope);
  const cleaned = attachments.filter(a => !orphanedIds.has(a.id));
  saveAttachments(cleaned, scope);
  if (await isAttachmentIdbAvailable()) {
    try {
      await deleteAttachmentsData(Array.from(orphanedIds));
    } catch {
      // ignore blob delete failures；残留 blob 无引用，后续可再清
    }
  }
  return orphaned.length;
};

export const deleteAttachment = async (attachmentId: string, scope?: AttachmentStorageScope): Promise<void> => {
  const keys = resolveKeys(scope);
  const attachments = loadAttachments(scope);
  const filtered = attachments.filter(a => a.id !== attachmentId);
  saveAttachments(filtered, scope);

  try {
    const recordsData = localStorage.getItem(keys.recordsKey);
    if (recordsData) {
      const records = JSON.parse(recordsData);
      const updated = records.map((r: { attachmentId?: string }) =>
        r.attachmentId === attachmentId ? { ...r, attachmentId: undefined } : r,
      );
      localStorage.setItem(keys.recordsKey, JSON.stringify(updated));
    }
  } catch {
    // ignore record update failures
  }

  if (await isAttachmentIdbAvailable()) {
    try {
      await deleteAttachmentData(attachmentId);
    } catch {
      // ignore blob delete failures；元数据已删，残留 blob 无引用
    }
  }
};

/**
 * 幂等迁移：把 localStorage 元数据中内联的 data 搬到 IndexedDB，
 * 成功后该项 data 置 undefined，最后统一写回列表。
 * 单条失败仅 console.warn 并继续下一条；IDB 不可用时直接返回。重复执行无副作用。
 */
export const migrateAttachmentBlobsToIdb = async (scope?: AttachmentStorageScope): Promise<void> => {
  if (!(await isAttachmentIdbAvailable())) return;
  const attachments = loadAttachments(scope);
  let migrated = false;
  for (const attachment of attachments) {
    if (!attachment.data) continue;
    try {
      await saveAttachmentData(attachment.id, attachment.data);
      attachment.data = undefined;
      migrated = true;
    } catch (error) {
      console.warn(`附件 ${attachment.id} 迁移到 IndexedDB 失败`, error);
    }
  }
  if (migrated) {
    saveAttachments(attachments, scope);
  }
};

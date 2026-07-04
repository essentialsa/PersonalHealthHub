export interface HealthAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  data: string;
  date: string;
  categoryId?: string;
  createdAt: string;
}

export const ATTACHMENTS_KEY = 'health_attachments_v1';
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB

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
  const totalSize = attachments.reduce((sum, a) => sum + a.fileSize, 0);

  if (attachment.fileSize > MAX_FILE_SIZE) {
    return false;
  }

  if (totalSize + attachment.fileSize > MAX_TOTAL_SIZE) {
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

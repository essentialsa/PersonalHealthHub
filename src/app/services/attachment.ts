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

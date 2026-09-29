/**
 * FAQ 타입 정의
 */
export interface FAQ {
  id: number;
  category: string;
  category_display: string;
  question: string;
  answer: string;
}

/**
 * 카테고리별 FAQ 그룹
 */
export interface FAQByCategory {
  [category: string]: FAQ[];
}

/**
 * 문의 폼 데이터 (제출 시 사용)
 */
export interface ContactFormData {
  subject: string;
  message: string;
}

/**
 * 문의 응답
 */
export interface ContactResponse {
  message: string;
  remaining: number;
  limit: number;
}

/**
 * 문의 이력 항목
 */
export interface ContactInquiry {
  id: number;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
  admin_reply: string | null;
  replied_at: string | null;
  has_reply: boolean;
}

/**
 * 문의 가능 상태
 */
export interface ContactStatus {
  can_submit: boolean;
  remaining: number;
  today_count: number;
  limit: number;
}

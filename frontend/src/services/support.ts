import { apiClient } from '@/lib/apiClient';
import type { FAQ, ContactFormData, ContactResponse, ContactInquiry, ContactStatus } from '@/types/support';

/**
 * FAQ 목록 조회
 * 인증 불필요
 */
export async function fetchFAQs(): Promise<FAQ[]> {
  return apiClient<FAQ[]>('/api/support/faq/');
}

/**
 * 문의 제출
 * 인증 필수 (로그인 사용자만)
 */
export async function submitContact(data: ContactFormData): Promise<ContactResponse> {
  return apiClient<ContactResponse>('/api/support/contact/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * 내 문의 이력 조회
 * 인증 필수 (로그인 사용자만)
 */
export async function fetchContactHistory(): Promise<ContactInquiry[]> {
  return apiClient<ContactInquiry[]>('/api/support/contact/history/');
}

/**
 * 문의 가능 상태 조회
 * 인증 필수 (로그인 사용자만)
 */
export async function fetchContactStatus(): Promise<ContactStatus> {
  return apiClient<ContactStatus>('/api/support/contact/status/');
}

export interface User {
  pk: number;
  id?: number;  // 백엔드에서 id로 반환하는 경우도 있음
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  date_joined?: string;
  last_login?: string;
  // Master Account 시스템 필드
  is_social_user?: boolean;
  has_password?: boolean;
  primary_auth_method?: AuthMethod;
  linked_providers?: SocialProvider[];
  linked_providers_count?: number;
}

// 소셜 인증 제공자 타입
export type SocialProvider = 'github' | 'google' | 'naver' | 'kakao';

// 인증 방식 타입
type AuthMethod = 'email' | SocialProvider;

// 연결된 소셜 계정 정보
interface LinkedAccount {
  id: number;
  provider: SocialProvider;
  provider_display: string;
  social_id: string;
  social_email: string | null;
  social_name: string | null;
  linked_at: string;
  linked_by: 'registration' | 'auto_email' | 'manual';
  last_used_at: string | null;
  access_count: number;
  can_unlink: boolean;
}

// 사용 가능한 소셜 제공자 정보
interface AvailableProvider {
  provider: SocialProvider;
  provider_display: string;
  is_linked: boolean;
}

// 연결된 계정 목록 응답
export interface LinkedAccountsResponse {
  linked_accounts: LinkedAccount[];
  available_providers: AvailableProvider[];
  has_password: boolean;
  can_set_password: boolean;
  total_linked: number;
}

// 비밀번호 설정 요청 (소셜 전용 사용자)
export interface SetPasswordRequest {
  new_password: string;
  confirm_password: string;
  verification_token?: string;
}

// 계정 병합 요청
export interface MergeAccountsRequest {
  // 병합 토큰은 HttpOnly 쿠키(merge_token)로 전달되므로 바디에 포함하지 않는다
  target_password?: string;
  confirm_merge: boolean;
}

// 삭제된 노트 정보
interface DeletedNoteInfo {
  id: number;
  title: string;
  created_at: string | null;
  file_size: number;
}

// 계정 병합 결과
export interface MergeAccountsResponse {
  message: string;
  stats: {
    social_accounts_moved: number;
    notes_moved: number;
    folders_moved: number;
    labels_moved: number;
    quota_merged?: boolean;
    storage_overflow?: boolean;
    notes_deleted_for_storage?: number;
    deleted_notes_info?: DeletedNoteInfo[];
  };
}

/**
 * 로그인 응답 타입
 *
 * JWT 토큰은 HttpOnly 쿠키로 자동 설정되므로 응답에 포함되지 않습니다.
 */
export interface LoginResponse {
  detail?: string;
  user?: {
    username: string;
    email: string;
    is_active: boolean;
  };
  // 이메일 인증이 필요한 경우
  requires_verification?: boolean;
  verification_token?: string;
}



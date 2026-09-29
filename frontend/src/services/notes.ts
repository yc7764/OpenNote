import { apiClient } from '@/lib/apiClient';
import type { Note, ProcessingStatus } from '@/types/note';
import type { FilterType } from '@/components/dashboard/FilterTabs';
import type { SortType } from '@/components/dashboard/SortDropdown';

export type NoteListItem = {
  id: number;
  title: string;
  is_recording: boolean;
  duration: number;
  processing_status: ProcessingStatus;
  preview: string;
  created_at: string;
  updated_at: string;
  keywords: string[];
  is_favorite: boolean;
  is_sample: boolean;
};

// ============================================
// 서버사이드 페이지네이션 관련 타입
// ============================================

/** 백엔드 pagination 응답 메타데이터 */
type PaginationMeta = {
  current_page: number;
  total_pages: number;
  total_count: number;
  page_size: number;
  has_next: boolean;
  has_previous: boolean;
};

/** 페이지네이션이 포함된 노트 목록 응답 */
export type PaginatedNotesResponse = {
  notes: NoteListItem[];
  pagination: PaginationMeta;
};

/** fetchNotes에 전달할 쿼리 파라미터 */
export type NoteListParams = {
  page?: number;
  page_size?: number;
  status?: FilterType;
  sort?: SortType;
  search?: string;   // 제목+미리보기 검색
  favorites?: boolean;
};

export type TrashNoteItem = {
  id: number;
  title: string;
  is_recording: boolean;
  duration: number;
  processing_status: string;
  preview: string;
  created_at: string;
  deleted_at: string;
  keywords: string[];
};

/**
 * 노트 목록 조회 (서버사이드 페이지네이션)
 * 쿼리 파라미터를 조합하여 해당 페이지의 노트만 요청
 */
export async function fetchNotes(params: NoteListParams = {}): Promise<PaginatedNotesResponse> {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.set('page', String(params.page));
  if (params.page_size) searchParams.set('page_size', String(params.page_size));
  if (params.status && params.status !== 'all') searchParams.set('status', params.status);
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.search) searchParams.set('search', params.search);
  if (params.favorites) searchParams.set('favorites', 'true');

  const qs = searchParams.toString();
  return apiClient(`/api/notes/${qs ? `?${qs}` : ''}`);
}

export async function deleteNotes(noteIds: number[]): Promise<{ message: string }> {
  return apiClient('/api/notes/delete-multiple/', {
    method: 'DELETE',
    body: JSON.stringify({ note_ids: noteIds }),
  });
}

export async function fetchNoteDetail(noteId: number): Promise<Note> {
  return apiClient(`/api/notes/${noteId}/`);
}

export async function deleteNote(noteId: number) {
  return apiClient(`/api/notes/${noteId}/delete/`, { method: 'DELETE' });
}

export async function createNote(
  title: string,
  audioFile: File,
  description?: string,
  keywords?: string[]
): Promise<Note> {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('audio_file', audioFile);
  if (description) {
    formData.append('description', description);
  }
  if (keywords && keywords.length > 0) {
    formData.append('keywords', keywords.join(','));
  }
  return apiClient('/api/notes/create/', { method: 'POST', body: formData });
}

// ============================================
// 즐겨찾기 관련 API
// ============================================

/**
 * 즐겨찾기 목록 조회 (서버사이드 페이지네이션)
 * fetchNotes에 favorites=true를 추가하여 동일한 페이지네이션 적용
 */
export async function fetchFavorites(params: NoteListParams = {}): Promise<PaginatedNotesResponse> {
  return fetchNotes({ ...params, favorites: true });
}

export async function toggleFavorite(noteId: number): Promise<{ id: number; is_favorite: boolean; message: string }> {
  return apiClient(`/api/notes/${noteId}/favorite/`, { method: 'POST' });
}

// ============================================
// 휴지통 관련 API
// ============================================

export type PaginatedTrashResponse = {
  notes: TrashNoteItem[];
  pagination: PaginationMeta;
};

// 휴지통도 서버사이드 검색/정렬/페이지네이션 (usePaginatedList와 동일 시그니처)
export async function fetchTrash(params: NoteListParams = {}): Promise<PaginatedTrashResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.page_size) searchParams.set('page_size', String(params.page_size));
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.search) searchParams.set('search', params.search);

  const qs = searchParams.toString();
  return apiClient(`/api/notes/trash/${qs ? `?${qs}` : ''}`);
}

export async function restoreNote(noteId: number): Promise<{ message: string; id: number }> {
  return apiClient(`/api/notes/${noteId}/restore/`, { method: 'POST' });
}

export async function permanentDelete(noteId: number): Promise<{ message: string }> {
  return apiClient(`/api/notes/${noteId}/permanent-delete/`, { method: 'DELETE' });
}

export async function emptyTrash(): Promise<{ message: string; count: number }> {
  return apiClient('/api/notes/empty-trash/', { method: 'DELETE' });
}

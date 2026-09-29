/**
 * Note 관련 이벤트 정의
 * Scheduler → WebSocket 간의 이벤트 기반 통신을 위한 이벤트 클래스
 */

import { ErrorCode } from '../common/error-code.enum';

// 이벤트 이름 상수
export const NOTE_EVENTS = {
  SAVED: 'note.saved',
  ERROR: 'note.error',
} as const;

/**
 * Note 데이터가 DB에 저장되었을 때 발생하는 이벤트
 */
export class NoteSavedEvent {
  constructor(public readonly noteId: string) {}
}

export type NoteDataType = 'segment' | 'summary_text' | 'keywords' | 'next_action' | 'main_topic';

/**
 * Note 처리 중 에러가 발생했을 때 발생하는 이벤트
 */
export class NoteErrorEvent {
  constructor(
    public readonly noteId: string,
    public readonly errorCode: ErrorCode,
    public readonly type?: NoteDataType,
  ) {}
}

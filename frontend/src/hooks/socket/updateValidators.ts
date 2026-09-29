import { toast } from 'sonner';
import {
  validateAndSanitize,
  validateAndSanitizeArray,
  ValidationLimits
} from '@/lib/sanitize';
import type { UpdatePayload } from '../useNoteSocket';

// 업데이트 결과 타입
export interface UpdateResult<T = string> {
  sent: boolean;
  truncatedValue?: T;
}

export interface SummaryTextUpdateResult {
  sent: boolean;
  truncatedTitle?: string;
  truncatedContent?: string;
}

// emitUpdate 함수 타입
export type EmitUpdateFn = (data: Omit<UpdatePayload, 'noteId' | 'timestamp' | 'updatedBy' | 'token'>) => void;

/**
 * Main Topic 업데이트 핸들러 생성
 */
export function createUpdateMainTopicHandler(emitUpdate: EmitUpdateFn) {
  return (newTopic: string): UpdateResult => {
    const result = validateAndSanitize(newTopic, ValidationLimits.MAIN_TOPIC_MAX_LENGTH, '주제');
    if (!result.success) {
      toast.error(result.error);
      return { sent: false };
    }
    if (result.truncated) {
      toast.warning(result.truncatedMessage);
      return { sent: false, truncatedValue: result.sanitized };
    }
    emitUpdate({
      type: 'main_topic',
      payload: result.sanitized!,
    });
    return { sent: true };
  };
}

/**
 * Next Action 업데이트 핸들러 생성
 */
export function createUpdateNextActionHandler(emitUpdate: EmitUpdateFn) {
  return (newAction: string): UpdateResult => {
    const result = validateAndSanitize(newAction, ValidationLimits.NEXT_ACTION_MAX_LENGTH, '다음 액션');
    if (!result.success) {
      toast.error(result.error);
      return { sent: false };
    }
    if (result.truncated) {
      toast.warning(result.truncatedMessage);
      return { sent: false, truncatedValue: result.sanitized };
    }
    emitUpdate({
      type: 'next_action',
      payload: result.sanitized!,
    });
    return { sent: true };
  };
}

/**
 * Keywords 업데이트 핸들러 생성
 */
export function createUpdateKeywordsHandler(emitUpdate: EmitUpdateFn) {
  return (newKeywords: string[]): UpdateResult<string[]> => {
    const result = validateAndSanitizeArray(
      newKeywords,
      ValidationLimits.KEYWORDS_MAX_COUNT,
      ValidationLimits.KEYWORD_MAX_LENGTH,
      '키워드'
    );
    if (!result.success) {
      toast.error(result.error);
      return { sent: false };
    }
    if (result.truncated) {
      toast.warning(result.truncatedMessage);
      return { sent: false, truncatedValue: result.sanitized };
    }
    emitUpdate({
      type: 'keywords',
      payload: result.sanitized!,
    });
    return { sent: true };
  };
}

/**
 * Segment 업데이트 핸들러 생성
 */
export function createUpdateSegmentHandler(emitUpdate: EmitUpdateFn) {
  return (segmentId: string, newText: string): UpdateResult => {
    const result = validateAndSanitize(newText, ValidationLimits.SEGMENT_TEXT_MAX_LENGTH, '텍스트');
    if (!result.success) {
      toast.error(result.error);
      return { sent: false };
    }
    if (result.truncated) {
      toast.warning(result.truncatedMessage);
      return { sent: false, truncatedValue: result.sanitized };
    }
    emitUpdate({
      type: 'segment',
      segmentId: segmentId,
      payload: result.sanitized!,
    });
    return { sent: true };
  };
}

/**
 * Summary Text 업데이트 핸들러 생성
 */
export function createUpdateSummaryTextHandler(emitUpdate: EmitUpdateFn) {
  return (sectionId: string, title: string, content: string): SummaryTextUpdateResult => {
    const titleResult = validateAndSanitize(title, ValidationLimits.SUMMARY_TITLE_MAX_LENGTH, '제목');
    if (!titleResult.success) {
      toast.error(titleResult.error);
      return { sent: false };
    }
    const contentResult = validateAndSanitize(content, ValidationLimits.SUMMARY_CONTENT_MAX_LENGTH, '내용');
    if (!contentResult.success) {
      toast.error(contentResult.error);
      return { sent: false };
    }
    if (titleResult.truncated || contentResult.truncated) {
      const messages = [titleResult.truncatedMessage, contentResult.truncatedMessage].filter(Boolean);
      toast.warning(messages.join(', '));
      return {
        sent: false,
        truncatedTitle: titleResult.truncated ? titleResult.sanitized : undefined,
        truncatedContent: contentResult.truncated ? contentResult.sanitized : undefined,
      };
    }
    emitUpdate({
      type: 'summary_text',
      sectionId: sectionId,
      payload: {
        title: titleResult.sanitized!,
        content: contentResult.sanitized!
      },
    });
    return { sent: true };
  };
}

'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import Modal from '@/components/common/Modal';

export interface MergeConfirmModalProps {
  open: boolean;
  sourceSpeakerName: string;
  targetSpeakerName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 화자 병합 확인 모달
 * 병합 전 사용자에게 확인을 요청하는 대화상자
 */
export function MergeConfirmModal({
  open,
  sourceSpeakerName,
  targetSpeakerName,
  onConfirm,
  onCancel,
}: MergeConfirmModalProps) {
  // SSR 대응: document가 없으면 null 반환
  if (typeof document === 'undefined') return null;

  return createPortal(
    <Modal
      open={open}
      title="화자 병합"
      size="sm"
      variant="centered"
      onClose={onCancel}
      closeOnOverlayClick={false}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300
                     bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600
                     rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700
                     focus:outline-none focus:ring-2 focus:ring-neutral-500"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white
                     bg-blue-600 hover:bg-blue-700
                     rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            병합
          </button>
        </>
      }
    >
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        <span className="font-semibold">&apos;{sourceSpeakerName}&apos;</span>의 모든 발화가{' '}
        <span className="font-semibold">&apos;{targetSpeakerName}&apos;</span>(으)로 변경됩니다.
        병합하시겠습니까?
      </p>
    </Modal>,
    document.body
  );
}

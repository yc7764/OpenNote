'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '@/components/common/Modal';

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  /** confirm 버튼 톤. danger는 빨간색 (삭제 등 위험 액션) */
  tone?: 'default' | 'danger';
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    []
  );

  const handleClose = useCallback(
    (result: boolean) => {
      if (!pending) return;
      pending.resolve(result);
      setPending(null);
    },
    [pending]
  );

  const isOpen = pending !== null;
  const tone = pending?.tone ?? 'default';

  const dialog =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <Modal
            open={isOpen}
            title={pending?.title ?? '확인'}
            size="sm"
            variant="centered"
            onClose={() => handleClose(false)}
            closeOnOverlayClick={false}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => handleClose(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300
                           bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600
                           rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700
                           focus:outline-none focus:ring-2 focus:ring-neutral-500"
                >
                  {pending?.cancelText ?? '취소'}
                </button>
                <button
                  type="button"
                  onClick={() => handleClose(true)}
                  className={
                    tone === 'danger'
                      ? 'px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500'
                      : 'px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
                  }
                >
                  {pending?.confirmText ?? '확인'}
                </button>
              </>
            }
          >
            <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-line">
              {pending?.description}
            </p>
          </Modal>,
          document.body
        );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}

import { toast } from 'sonner';

/**
 * 탭이 활성화 상태인지 확인
 * 백그라운드 탭에서는 토스트를 표시하지 않음
 */
function isTabVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export const toastr = {
  success: (message: string) => {
    if (!isTabVisible()) return;

    toast.success(message, {
      position: 'bottom-left',
      duration: 5000,
      className: 'toastr-toast toastr-success',
    });
  },
  warning: (message: string) => {
    if (!isTabVisible()) return;

    toast.warning(message, {
      position: 'bottom-left',
      duration: 5000,
      className: 'toastr-toast toastr-warning',
    });
  },
};

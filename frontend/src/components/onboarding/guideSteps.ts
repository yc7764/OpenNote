/**
 * 사용자 가이드 스텝 데이터 정의
 * 노트 상세 페이지의 기능별 안내 내용을 정의합니다.
 */

export type GuideCategory = 'stt' | 'summary' | 'speaker' | 'audio' | 'navigation';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';
type TippyPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface GuideStep {
  /** 고유 식별자 */
  id: string;
  /** 기능 카테고리 */
  category: GuideCategory;
  /** 제목 */
  title: string;
  /** 설명 텍스트 */
  description: string;
  /** tippy.js 툴팁 배치 방향 */
  placement: TippyPlacement;
  /** 표시 대상 디바이스 */
  devices: DeviceType[];
  /** 정렬 우선순위 (낮을수록 높은 우선순위) */
  priority: number;
  /** 확장용: 페이지 식별자 */
  page?: string;
}

/** 카테고리 메타데이터 */
export const GUIDE_CATEGORIES: Record<GuideCategory, { label: string; icon: string }> = {
  stt: { label: '녹음 내용', icon: 'microphone' },
  summary: { label: '요약', icon: 'document' },
  speaker: { label: '화자', icon: 'users' },
  audio: { label: '오디오', icon: 'play' },
  navigation: { label: '화면 구성', icon: 'layout' },
};

/** 전체 가이드 스텝 목록 */
export const GUIDE_STEPS: GuideStep[] = [
  // === STT 영역 ===
  {
    id: 'stt-edit',
    category: 'stt',
    title: '텍스트 편집',
    description:
      '더블클릭(모바일: 두 번 탭)으로 녹음 텍스트를 수정할 수 있습니다. 수정 후 Enter를 누르거나 다른 곳을 클릭하면 자동 저장됩니다.',
    placement: 'bottom',
    devices: ['mobile', 'tablet', 'desktop'],
    priority: 1,
    page: 'note-detail',
  },
  {
    id: 'stt-speaker-change',
    category: 'stt',
    title: '화자 변경',
    description:
      '각 문장의 화자 이름을 클릭하면 드롭다운에서 다른 화자로 변경할 수 있습니다.',
    placement: 'bottom',
    devices: ['mobile', 'tablet', 'desktop'],
    priority: 2,
    page: 'note-detail',
  },

  // === 요약 영역 ===
  {
    id: 'summary-keywords',
    category: 'summary',
    title: '키워드 편집',
    description:
      '키워드 영역을 더블클릭하면 편집 모드로 전환됩니다. 텍스트 입력 후 Enter 또는 쉼표(,)로 키워드를 추가하고, x 버튼으로 삭제할 수 있습니다. 영역 밖을 클릭하면 저장됩니다.',
    placement: 'bottom',
    devices: ['mobile', 'tablet', 'desktop'],
    priority: 3,
    page: 'note-detail',
  },
  {
    id: 'summary-actions',
    category: 'summary',
    title: '할 일 편집',
    description:
      '할 일 영역을 더블클릭하면 항목별 편집이 가능합니다. Enter로 새 항목을 추가하고, 휴지통 아이콘으로 삭제합니다. [완료] 버튼 또는 영역 밖 클릭으로 저장합니다.',
    placement: 'bottom',
    devices: ['mobile', 'tablet', 'desktop'],
    priority: 4,
    page: 'note-detail',
  },
  {
    id: 'summary-main-topic',
    category: 'summary',
    title: '요약 편집',
    description:
      '요약 텍스트를 더블클릭하면 직접 수정할 수 있습니다. Enter를 누르거나 다른 곳을 클릭하면 자동 저장됩니다.',
    placement: 'bottom',
    devices: ['mobile', 'tablet', 'desktop'],
    priority: 5,
    page: 'note-detail',
  },
  {
    id: 'summary-sections',
    category: 'summary',
    title: '구간별 요약',
    description:
      '구간 제목과 내용을 각각 더블클릭하여 수정할 수 있습니다. Enter를 누르거나 다른 곳을 클릭하면 저장됩니다. 화살표 아이콘으로 구간을 접거나 펼칠 수 있습니다.',
    placement: 'bottom',
    devices: ['mobile', 'tablet', 'desktop'],
    priority: 6,
    page: 'note-detail',
  },

  // === 화자 영역 ===
  {
    id: 'speaker-name-edit',
    category: 'speaker',
    title: '화자 이름 편집',
    description:
      '화자 이름을 클릭하면 바로 편집할 수 있습니다. Enter 또는 다른 곳을 클릭하면 저장됩니다.',
    placement: 'bottom',
    devices: ['mobile', 'tablet', 'desktop'],
    priority: 7,
    page: 'note-detail',
  },
  {
    id: 'speaker-merge',
    category: 'speaker',
    title: '화자 병합',
    description:
      '병합 아이콘(⇄)을 클릭하면 다른 화자와 합칠 수 있습니다. 드롭다운에서 병합 대상을 선택하세요.',
    placement: 'left',
    devices: ['mobile', 'tablet', 'desktop'],
    priority: 8,
    page: 'note-detail',
  },
  {
    id: 'speaker-utterances',
    category: 'speaker',
    title: '발화 목록 확인',
    description:
      '화살표(∨) 아이콘을 클릭하면 해당 화자의 발화 목록이 펼쳐집니다. 발화를 클릭하면 해당 시간으로 이동합니다.',
    placement: 'left',
    devices: ['mobile', 'tablet', 'desktop'],
    priority: 9,
    page: 'note-detail',
  },

  // === 오디오 & 네비게이션 ===
  {
    id: 'audio-timestamp',
    category: 'audio',
    title: '구간 재생',
    description:
      '문장을 클릭하면 해당 위치부터 오디오가 재생됩니다. 현재 재생 중인 구간이 하이라이트됩니다.',
    placement: 'bottom',
    devices: ['mobile', 'tablet', 'desktop'],
    priority: 10,
    page: 'note-detail',
  },
  {
    id: 'tab-nav-desktop',
    category: 'navigation',
    title: '화면 구성',
    description:
      '왼쪽에는 녹음 내용이, 오른쪽에는 요약과 화자 탭이 표시됩니다. 탭을 클릭하여 전환하세요.',
    placement: 'bottom',
    devices: ['tablet', 'desktop'],
    priority: 11,
    page: 'note-detail',
  },
  {
    id: 'tab-nav-mobile',
    category: 'navigation',
    title: '탭 전환',
    description:
      '상단 탭을 터치하거나 좌우로 스와이프하여 녹음 내용, 요약, 화자 화면을 전환할 수 있습니다.',
    placement: 'bottom',
    devices: ['mobile'],
    priority: 11,
    page: 'note-detail',
  },
];

/** localStorage 키 */
export const ONBOARDING_STORAGE_KEY = 'opennote_onboarding';

/** 현재 스키마 버전 */
export const ONBOARDING_VERSION = 1;

/** 디바이스 타입에 맞는 스텝만 필터링 */
export function getStepsForDevice(deviceType: DeviceType): GuideStep[] {
  return GUIDE_STEPS
    .filter((step) => step.devices.includes(deviceType))
    .sort((a, b) => a.priority - b.priority);
}

/** 페이지별 스텝 필터링 */
export function getStepsForPage(page: string, deviceType: DeviceType): GuideStep[] {
  return GUIDE_STEPS
    .filter((step) => step.page === page && step.devices.includes(deviceType))
    .sort((a, b) => a.priority - b.priority);
}

/** 카테고리별 그룹화 */
export function groupStepsByCategory(steps: GuideStep[]): Record<GuideCategory, GuideStep[]> {
  const grouped = {} as Record<GuideCategory, GuideStep[]>;
  for (const step of steps) {
    if (!grouped[step.category]) {
      grouped[step.category] = [];
    }
    grouped[step.category].push(step);
  }
  return grouped;
}

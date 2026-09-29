/**
 * 가이드 투어 스텝 메타데이터
 * 각 스텝이 속한 패널, 데모 애니메이션 타입, 탭 전환 정보를 정의합니다.
 */

type TourPanel = 'stt' | 'summary' | 'speaker' | 'navigation';

export type DemoAnimationType =
  | 'double-click'
  | 'click'
  | 'click-text'
  | 'click-icon'
  | 'click-speaker-edit'
  | 'double-click-actions'
  | 'double-click-main-topic'
  | 'double-click-keywords'
  | 'double-click-sections'
  | 'expand-collapse-utterances'
  | 'tab-nav-mobile'
  | 'tab-nav-desktop';

export interface TourStepMeta {
  /** 스텝이 위치한 패널 */
  panel: TourPanel;
  /** 데모 애니메이션 타입 */
  animationType: DemoAnimationType;
  /** 모바일: 해당 탭으로 전환 */
  mobileTab?: 'stt' | 'summary' | 'speaker';
  /** 데스크톱: 오른쪽 패널 탭 전환 */
  desktopRightTab?: 'summary' | 'speaker';
}

/** 스텝 ID → 투어 메타데이터 매핑 */
export const TOUR_STEP_META: Record<string, TourStepMeta> = {
  'stt-edit': {
    panel: 'stt',
    animationType: 'double-click',
    mobileTab: 'stt',
  },
  'stt-speaker-change': {
    panel: 'stt',
    animationType: 'click',
    mobileTab: 'stt',
  },
  'summary-keywords': {
    panel: 'summary',
    animationType: 'double-click-keywords',
    mobileTab: 'summary',
    desktopRightTab: 'summary',
  },
  'summary-actions': {
    panel: 'summary',
    animationType: 'double-click-actions',
    mobileTab: 'summary',
    desktopRightTab: 'summary',
  },
  'summary-main-topic': {
    panel: 'summary',
    animationType: 'double-click-main-topic',
    mobileTab: 'summary',
    desktopRightTab: 'summary',
  },
  'summary-sections': {
    panel: 'summary',
    animationType: 'double-click-sections',
    mobileTab: 'summary',
    desktopRightTab: 'summary',
  },
  'speaker-name-edit': {
    panel: 'speaker',
    animationType: 'click-speaker-edit',
    mobileTab: 'speaker',
    desktopRightTab: 'speaker',
  },
  'speaker-merge': {
    panel: 'speaker',
    animationType: 'click-icon',
    mobileTab: 'speaker',
    desktopRightTab: 'speaker',
  },
  'speaker-utterances': {
    panel: 'speaker',
    animationType: 'expand-collapse-utterances',
    mobileTab: 'speaker',
    desktopRightTab: 'speaker',
  },
  'audio-timestamp': {
    panel: 'stt',
    animationType: 'click-text',
    mobileTab: 'stt',
  },
  'tab-nav-desktop': {
    panel: 'navigation',
    animationType: 'tab-nav-desktop',
  },
  'tab-nav-mobile': {
    panel: 'navigation',
    animationType: 'tab-nav-mobile',
  },
};

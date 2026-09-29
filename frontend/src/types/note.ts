// 스피커 메타데이터
export interface Speaker {
  name: string;
}

export interface Segment {
  segment_id: number;
  idx: number;
  speaker: string;        // 스피커 ID (예: "sp_0", "sp_1")
  speaker_name?: string;  // 표시 이름 (서버에서 계산, 예: "참석자1", "김철수")
  start: number;
  end: number;
  text: string;
  stt_id: number;
  created_at: string;
  updated_at: string | null;
  updated_by: number | null;
}

interface SummarySection {
  title: string;
  start_time: number;
  end_time: number;
  content: string;
  order: number;
}

export interface Summary {
  keywords?: string[] | null;  // text → string[] 배열로 변경
  main_topic?: string | null;
  next_actions?: string | null;
  sections: SummarySection[];
}

export type ProcessingStatus =
  | 'uploaded'
  | 'pending'
  | 'processing'
  | 'summarizing'
  | 'completed'
  | 'failed'
  | 'expired';

export interface Note {
  id: number;
  title: string;
  segments: Segment[];
  speakers?: Record<string, Speaker>;  // 스피커 메타데이터 (예: {"sp_0": {"name": "참석자1"}, ...})
  is_recording: boolean;
  duration: number;
  processing_status: ProcessingStatus;
  preview: string;
  created_at: string;
  updated_at: string;
  summary: Summary | null;
  audio_file_url: string | null;
  is_favorite: boolean;
  is_sample: boolean;
  user_description?: string | null;
  user_keywords?: string[] | null;
}



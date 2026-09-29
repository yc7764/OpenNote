"use client";
import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { Note as NoteType } from '@/types/note';
import type { LiveOverrides, LockedFields, SetSpeakerPayload, StatusPayload } from './useNoteSocket';

interface UseNoteSpeakersProps {
  note: NoteType | null;
  liveOverrides: LiveOverrides;
  lockedFields: LockedFields;
  seekAndPlayFromElement: (startTime: number) => void;
  emitSetSpeaker: (data: Omit<SetSpeakerPayload, 'noteId' | 'timestamp' | 'updatedBy'>) => void;
  emitSetSegmentSpeaker: (segmentId: string, speakerId: string) => void;
  emitMergeSpeaker: (sourceId: string, targetId: string) => void;
  emitSetSpeakerAlias: (speakerId: string, newName: string) => void;
  emitSpeakerStatus: (speakerId: string, status: 'start' | 'stop') => void;
  emitStatus: (data: Omit<StatusPayload, 'noteId' | 'userId'>) => void;
}

export function useNoteSpeakers({
  note,
  liveOverrides,
  lockedFields,
  seekAndPlayFromElement,
  emitSetSpeaker,
  emitSetSegmentSpeaker,
  emitMergeSpeaker,
  emitSetSpeakerAlias,
  emitSpeakerStatus,
  emitStatus,
}: UseNoteSpeakersProps) {
  const [isAddSpeakerModalOpen, setIsAddSpeakerModalOpen] = useState(false);

  const segmentSpeakerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (note?.segments) {
      note.segments.forEach((seg) => {
        const baseSpeaker = liveOverrides?.segmentSpeakers?.get(String(seg.segment_id)) ?? seg.speaker;
        const speaker = liveOverrides?.mergedSpeakers?.[baseSpeaker] ?? baseSpeaker;
        counts[speaker] = (counts[speaker] || 0) + 1;
      });
    }
    return counts;
  }, [note?.segments, liveOverrides?.segmentSpeakers, liveOverrides?.mergedSpeakers]);

  const currentSpeakers = useMemo(() => {
    const baseSpeakers = liveOverrides?.speakers ?? note?.speakers ?? {};
    const mergedSpeakers = liveOverrides?.mergedSpeakers;

    if (!mergedSpeakers || Object.keys(mergedSpeakers).length === 0) {
      return baseSpeakers;
    }

    const filteredSpeakers: Record<string, { name: string }> = {};
    Object.entries(baseSpeakers).forEach(([speakerId, speaker]) => {
      if (!(speakerId in mergedSpeakers)) {
        filteredSpeakers[speakerId] = speaker;
      }
    });
    return filteredSpeakers;
  }, [note?.speakers, liveOverrides?.speakers, liveOverrides?.mergedSpeakers]);

  const handleSpeakerUpdate = useCallback((speakerId: string, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    emitSetSpeakerAlias(speakerId, trimmedName);
  }, [emitSetSpeakerAlias]);

  const handleSpeakerEditStart = useCallback((speakerId: string): boolean => {
    if (lockedFields.speakers.has(speakerId)) {
      toast.info('다른 사용자가 수정 중입니다.');
      return false;
    }
    emitSpeakerStatus(speakerId, 'start');
    return true;
  }, [lockedFields.speakers, emitSpeakerStatus]);

  const handleSpeakerEditEnd = useCallback((speakerId: string) => {
    emitSpeakerStatus(speakerId, 'stop');
  }, [emitSpeakerStatus]);

  const handleSpeakerMerge = useCallback((sourceIds: string[], targetId: string) => {
    sourceIds.forEach(sourceId => { emitMergeSpeaker(sourceId, targetId); });
  }, [emitMergeSpeaker]);

  const handleSegmentSpeakerChange = useCallback((segmentId: string, speakerId: string) => {
    emitSetSegmentSpeaker(segmentId, speakerId);
  }, [emitSetSegmentSpeaker]);

  const handleSpeakerDropdownOpen = useCallback((segmentId: string) => {
    emitStatus({ type: 'segment', segmentId, status: 'start' });
  }, [emitStatus]);

  const handleSpeakerDropdownClose = useCallback((segmentId: string) => {
    emitStatus({ type: 'segment', segmentId, status: 'stop' });
  }, [emitStatus]);

  const handleUtteranceClick = useCallback((startTime: number, segmentId: string) => {
    seekAndPlayFromElement(startTime);
    const segmentEl = document.querySelector(`[data-segment-id="${segmentId}"]`);
    if (segmentEl) {
      segmentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [seekAndPlayFromElement]);

  const handleAddSpeaker = useCallback(() => {
    setIsAddSpeakerModalOpen(true);
  }, []);

  const getNextSpeakerId = useCallback(() => {
    const allKeys: string[] = [
      ...Object.keys(currentSpeakers),
      ...Object.keys(liveOverrides?.tempSpeakers ?? {}),
      ...Object.keys(liveOverrides?.mergedSpeakers ?? {}),
    ];
    let maxNum = -1;
    allKeys.forEach(key => {
      const match = key.match(/^sp_(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    });
    return `sp_${maxNum + 1}`;
  }, [currentSpeakers, liveOverrides?.tempSpeakers, liveOverrides?.mergedSpeakers]);

  const handleAddSpeakerSubmit = useCallback((name: string) => {
    const speakerId = getNextSpeakerId();
    emitSetSpeaker({ type: 'add', payload: { speakerId, name } });
    setIsAddSpeakerModalOpen(false);
  }, [emitSetSpeaker, getNextSpeakerId]);

  return {
    isAddSpeakerModalOpen,
    setIsAddSpeakerModalOpen,
    segmentSpeakerCounts,
    currentSpeakers,
    handleSpeakerUpdate,
    handleSpeakerEditStart,
    handleSpeakerEditEnd,
    handleSpeakerMerge,
    handleSegmentSpeakerChange,
    handleSpeakerDropdownOpen,
    handleSpeakerDropdownClose,
    handleUtteranceClick,
    handleAddSpeaker,
    handleAddSpeakerSubmit,
  };
}

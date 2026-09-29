"use client";
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Note as NoteType } from '@/types/note';

type PlayerInstance = {
  currentTime: number;
  duration: number;
  play: () => Promise<void>;
};

export function useNoteAudio(note: NoteType | null) {
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);

  const playerRef = useRef<PlayerInstance | null>(null);
  const timeUpdateListenerRef = useRef<(() => void) | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const segmentTimings = useMemo(
    () => note?.segments.map(s => s.start) ?? [],
    [note?.segments]
  );

  const highlightCurrentSegment = useCallback(() => {
    if (!playerRef.current) return;
    const currentTime = playerRef.current.currentTime;
    if (isNaN(currentTime) || segmentTimings.length === 0) return;

    let lo = 0;
    let hi = segmentTimings.length - 1;
    let result = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segmentTimings[mid] <= currentTime) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    setActiveSegmentIndex(result);
  }, [segmentTimings]);

  const seekAndPlayFromElement = useCallback((startTime: number) => {
    if (!isNaN(startTime) && playerRef.current) {
      playerRef.current.currentTime = startTime;
      playerRef.current.play().catch(() => {
        // Autoplay blocked by browser
      });
    }
  }, []);

  const handlePlayerReady = useCallback(
    (player: PlayerInstance, audioElement: HTMLAudioElement) => {
      playerRef.current = player;
      audioElementRef.current = audioElement;

      if (audioElement) {
        if (timeUpdateListenerRef.current) {
          audioElement.removeEventListener('timeupdate', timeUpdateListenerRef.current);
        }
        const handleTimeUpdate = () => { highlightCurrentSegment(); };
        timeUpdateListenerRef.current = handleTimeUpdate;
        audioElement.addEventListener('timeupdate', handleTimeUpdate);
      }
    },
    [highlightCurrentSegment]
  );

  useEffect(() => {
    return () => {
      if (audioElementRef.current && timeUpdateListenerRef.current) {
        audioElementRef.current.removeEventListener('timeupdate', timeUpdateListenerRef.current);
      }
    };
  }, []);

  return { activeSegmentIndex, seekAndPlayFromElement, handlePlayerReady };
}

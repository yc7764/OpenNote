"use client";
import { useEffect, useRef, useState, useCallback } from 'react';

interface PlyrInstance {
  destroy(): void;
}

export function useAudioPlayer() {
  const playerRef = useRef<PlyrInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [initialized, setInitialized] = useState(false);

  // 수동으로 플레이어 초기화하는 함수
  const initPlayer = useCallback(async () => {
    // 이미 초기화됐거나 요소가 없으면 무시
    const playerElement = document.getElementById('player');
    if (playerRef.current || !playerElement) {
      return;
    }

    try {
      const Plyr = await import('plyr');
      const instance = new Plyr.default(playerElement, {
        controls: ['play','progress','current-time','duration','rewind','fast-forward','mute','volume','settings'],
        settings: ['quality','speed','loop'],
        keyboard: { focused: true, global: false },
        seekTime: 1,
        tooltips: { controls: true, seek: true },
        // 로컬 SVG 스프라이트 파일 사용
        loadSprite: true,
        iconUrl: '/plyr.svg',
        // CSP 정책 준수를 위해 외부 CDN(cdn.plyr.io) 의존성 제거
        blankVideo: '',
      });
      playerRef.current = instance;
      audioRef.current = playerElement as HTMLAudioElement;
      setInitialized(true);
    } catch (error) {
      console.error('[Plyr] 오디오 플레이어 초기화 실패', error);
    }
  }, []);

  // cleanup 함수
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // 이미 destroy된 경우 무시
        }
        playerRef.current = null;
        setInitialized(false);
      }
    };
  }, []);

  return { playerRef, audioRef, initialized, initPlayer };
}


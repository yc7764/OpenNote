"use client";
import { useEffect, useRef } from 'react';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { toast } from 'sonner';

type Props = {
  audioUrl: string | null;
  onPlayerReady?: (player: any, audioElement: HTMLAudioElement) => void;
};

export default function AudioPlayer({ audioUrl, onPlayerReady }: Props) {
  const { audioRef, initialized, playerRef, initPlayer } = useAudioPlayer();
  const hasInitialized = useRef(false);

  // audioUrl이 있을 때만 Plyr 초기화
  useEffect(() => {
    if (audioUrl && !hasInitialized.current) {
      // DOM이 렌더링된 후 초기화
      const timer = setTimeout(() => {
        initPlayer();
        hasInitialized.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [audioUrl, initPlayer]);

  // Notify parent component when player is ready
  useEffect(() => {
    if (initialized && playerRef.current && audioRef.current && onPlayerReady) {
      onPlayerReady(playerRef.current, audioRef.current);
    }
  }, [initialized, onPlayerReady, playerRef, audioRef]);

  // 오디오 URL 직접 설정 - 브라우저 네이티브 Range 요청으로 스트리밍
  // Blob 다운로드 방식 제거: 전체 파일 다운로드 대신 즉시 재생 시작
  useEffect(() => {
    if (!audioUrl || !initialized || !audioRef.current) return;

    const audio = audioRef.current;

    // 직접 URL 설정 - 브라우저가 자동으로 Range 요청 전송
    // Same-Origin 요청이므로 Cookie 인증 자동 포함
    audio.src = audioUrl;

    // 에러 핸들링
    const handleError = () => {
      // 네트워크 에러 또는 인증 실패 시
      toast.error('오디오 로드 실패');
    };

    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('error', handleError);
      // 컴포넌트 언마운트 시 연결 정리
      audio.src = '';
    };
  }, [audioUrl, initialized, audioRef]);

  return (
    <div className="plyr-container p-0 m-0 bg-white dark:bg-neutral-800 rounded-none shadow-[0_-4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.3)] z-[1000] border-t border-neutral-200 dark:border-neutral-700 w-full transition-colors duration-200">
      {audioUrl ? (
        <audio
          id="player"
          ref={audioRef as any}
          crossOrigin="use-credentials"
          preload="metadata"
        />
      ) : (
        <div className="w-full py-4 px-5 text-center text-neutral-400 dark:text-neutral-500 text-sm">
          오디오 파일이 없습니다
        </div>
      )}
    </div>
  );
}

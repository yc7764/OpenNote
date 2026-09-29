"use client";
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import AuthGuard from '@/components/layout/AuthGuard';
import AppShell from '@/components/layout/AppShell';
import Loader from '@/components/common/Loader';

// Plyr 의존성을 가진 AudioPlayer를 dynamic import로 분리 (초기 번들 축소)
const AudioPlayer = dynamic(() => import('@/components/audio/AudioPlayer'), {
  ssr: false,
});
import NoteHeader from '@/components/notes/NoteHeader';
import STTResults from '@/components/notes/STTResults';
import NoteSummary from '@/components/notes/NoteSummary';
import NoteDetailLayout from '@/components/notes/NoteDetailLayout';
import SpeakerTab from '@/components/notes/SpeakerTab';
import AddSpeakerModal from '@/components/notes/AddSpeakerModal';
import { fetchNoteDetail, deleteNote } from '@/services/notes';
import useSWR from 'swr';
import { ApiError } from '@/lib/apiClient';
import type { Note as NoteType } from '@/types/note';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useNoteSocket } from '@/hooks/useNoteSocket';
import { useNoteAudio } from '@/hooks/useNoteAudio';
import { useNoteEditing } from '@/hooks/useNoteEditing';
import { useNoteSpeakers } from '@/hooks/useNoteSpeakers';
import { OnboardingProvider } from '@/components/onboarding/OnboardingContext';
import WelcomeModal from '@/components/onboarding/WelcomeModal';
import HelpPanel from '@/components/onboarding/HelpPanel';
import GuidedTour from '@/components/onboarding/GuidedTour';

export default function NoteDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;

  const [note, setNote] = useState<NoteType | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // 편집 상태
  const editingState = useNoteEditing();

  // 오디오 제어
  const { activeSegmentIndex, seekAndPlayFromElement, handlePlayerReady } = useNoteAudio(note);

  // Socket hook
  const {
    liveOverrides,
    lockedFields,
    handleSegmentDoubleClick,
    handleFinishEditing,
    handleSegmentTextChange,
    handleSegmentKeyDown,
    handleMainTopicDoubleClick,
    handleFinishMainTopicEditing,
    handleMainTopicTextChange,
    handleNextActionDoubleClick,
    handleFinishNextActionEditing,
    handleNextActionTextChange,
    handleKeywordsDoubleClick,
    handleFinishKeywordsEditing,
    handleKeywordsTextChange,
    handleSectionDoubleClick,
    handleFinishSectionEditing,
    handleSectionTextChange,
    emitSetSpeaker,
    emitSetSegmentSpeaker,
    emitMergeSpeaker,
    emitSetSpeakerAlias,
    emitSpeakerStatus,
    emitStatus,
  } = useNoteSocket({
    noteId,
    userId: user?.pk,
    note,
    setNote,
    editingState,
  });

  // 화자 관리
  const {
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
  } = useNoteSpeakers({
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
  });

  const formatTime = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // 노트 상세 정보 로드
  const { data: noteData, error: noteError, isLoading: isLoadingNote, mutate: mutateNote } = useSWR(
    noteId ? `/api/notes/${noteId}/` : null,
    () => fetchNoteDetail(Number(noteId))
  );

  useEffect(() => {
    if (noteData) {
      setNote(noteData as NoteType);
    }
  }, [noteData]);

  const confirm = useConfirm();

  // 노트 삭제
  const handleDelete = useCallback(async () => {
    const ok = await confirm({
      title: '노트 삭제',
      description: '정말로 이 노트를 삭제하시겠습니까?',
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await deleteNote(Number(noteId));
      toast.success('노트가 삭제되었습니다.');
      router.push('/dashboard');
    } catch (error) {
      if (error instanceof TypeError) {
        toast.error('네트워크 연결을 확인해주세요.');
      } else {
        toast.error('노트 삭제 중 오류가 발생했습니다.');
      }
    }
  }, [noteId, router, confirm]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // 반응형 처리
  useEffect(() => {
    const checkMobile = () => { setIsMobile(window.innerWidth < 768); };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => { window.removeEventListener('resize', checkMobile); };
  }, []);

  const LoadingSpinner = useMemo(() => (
    <Loader message="노트를 불러오는 중..." />
  ), []);

  if (isLoadingNote) {
    return LoadingSpinner;
  }

  // SWR error를 유형별로 구분해 표시(기존엔 모든 실패를 "노트를 찾을 수 없습니다"로 뭉갬).
  // note가 아직 없거나(로드 완료 후 미존재) 에러가 있으면 상황에 맞는 상태 + 복구 액션을 보여준다.
  if (noteError || !note) {
    const content = (() => {
      if (noteError instanceof ApiError) {
        if (noteError.isForbidden()) {
          return { title: '접근 권한이 없습니다', description: '이 노트를 볼 권한이 없습니다.', canRetry: false };
        }
        if (noteError.isNotFound()) {
          return { title: '노트를 찾을 수 없습니다', description: '삭제되었거나 존재하지 않는 노트입니다.', canRetry: false };
        }
        if (noteError.isServerError()) {
          return { title: '서버 오류', description: '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.', canRetry: true };
        }
      }
      if (noteError) {
        return { title: '불러오지 못했습니다', description: '네트워크 연결을 확인하고 다시 시도해 주세요.', canRetry: true };
      }
      return { title: '노트를 찾을 수 없습니다', description: '삭제되었거나 존재하지 않는 노트입니다.', canRetry: false };
    })();

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{content.title}</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">{content.description}</p>
          <div className="flex flex-col gap-3">
            {content.canRetry && (
              <button
                onClick={() => mutateNote()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                다시 시도
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              대시보드로 이동
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard>
      <OnboardingProvider>
      <AppShell>
        <NoteDetailLayout
          header={
            <>
              {note.is_sample && (
                <div className="mx-4 mt-3 mb-0 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-300 flex-shrink-0">
                  이 노트는 서비스 체험을 위한 샘플 노트입니다. 오디오 파일을 업로드하여 직접 노트를 만들어 보세요!
                </div>
              )}
            <NoteHeader
              title={note.title}
              duration={note.duration}
              status={note.processing_status}
              createdAt={note.created_at}
              updatedAt={note.updated_at}
              noteId={note.id}
              isFavorite={note.is_favorite}
              onBack={handleBack}
              onDelete={handleDelete}
            />
            </>
          }
          sttResults={
            <STTResults
              segments={note.segments || []}
              formatTime={formatTime}
              onSegmentClick={seekAndPlayFromElement}
              activeSegmentIndex={activeSegmentIndex}
              liveOverrides={liveOverrides}
              editingSegmentId={editingState.editingSegmentId}
              editingText={editingState.editingText}
              onSegmentDoubleClick={handleSegmentDoubleClick}
              onSegmentTextChange={handleSegmentTextChange}
              onFinishEditing={handleFinishEditing}
              onSegmentKeyDown={handleSegmentKeyDown}
              lockedSegments={lockedFields.segments}
              speakers={currentSpeakers}
              tempSpeakers={liveOverrides?.tempSpeakers}
              onSegmentSpeakerChange={handleSegmentSpeakerChange}
              onSpeakerDropdownOpen={handleSpeakerDropdownOpen}
              onSpeakerDropdownClose={handleSpeakerDropdownClose}
            />
          }
          summary={
            <NoteSummary
              summary={note.summary}
              formatTime={formatTime}
              liveOverrides={liveOverrides}
              lockedFields={lockedFields}
              isEditingMainTopic={editingState.isEditingMainTopic}
              editingMainTopicText={editingState.editingMainTopicText}
              onMainTopicDoubleClick={handleMainTopicDoubleClick}
              onMainTopicTextChange={handleMainTopicTextChange}
              onFinishMainTopicEditing={handleFinishMainTopicEditing}
              isEditingNextAction={editingState.isEditingNextAction}
              editingNextActionText={editingState.editingNextActionText}
              onNextActionDoubleClick={handleNextActionDoubleClick}
              onNextActionTextChange={handleNextActionTextChange}
              onFinishNextActionEditing={handleFinishNextActionEditing}
              isEditingKeywords={editingState.isEditingKeywords}
              editingKeywordsText={editingState.editingKeywordsText}
              onKeywordsDoubleClick={handleKeywordsDoubleClick}
              onKeywordsTextChange={handleKeywordsTextChange}
              onFinishKeywordsEditing={handleFinishKeywordsEditing}
              editingSection={editingState.editingSection}
              editingSectionText={editingState.editingSectionText}
              onSectionDoubleClick={handleSectionDoubleClick}
              onSectionTextChange={handleSectionTextChange}
              onFinishSectionEditing={handleFinishSectionEditing}
            />
          }
          speakerTab={
            <>
              <AddSpeakerModal
                isOpen={isAddSpeakerModalOpen}
                onClose={() => setIsAddSpeakerModalOpen(false)}
                onSubmit={handleAddSpeakerSubmit}
                disabled={false}
              />
              <SpeakerTab
                speakers={currentSpeakers}
                segments={note.segments || []}
                segmentSpeakerCounts={segmentSpeakerCounts}
                onSpeakerUpdate={handleSpeakerUpdate}
                onSpeakerMerge={handleSpeakerMerge}
                onAddSpeaker={handleAddSpeaker}
                onUtteranceClick={handleUtteranceClick}
                disabled={false}
                liveOverrides={liveOverrides}
                formatTime={formatTime}
                activeSegmentId={activeSegmentIndex >= 0 ? String(note.segments?.[activeSegmentIndex]?.segment_id) : undefined}
                lockedSpeakers={lockedFields.speakers}
                onSpeakerEditStart={handleSpeakerEditStart}
                onSpeakerEditEnd={handleSpeakerEditEnd}
              />
            </>
          }
          audioPlayer={
            <AudioPlayer
              audioUrl={note.audio_file_url}
              onPlayerReady={handlePlayerReady}
            />
          }
          isMobile={isMobile}
        />
        <WelcomeModal />
        <HelpPanel />
        <GuidedTour />
      </AppShell>
      </OnboardingProvider>
    </AuthGuard>
  );
}

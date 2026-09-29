"use client";
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AuthGuard from '@/components/layout/AuthGuard';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/layout/PageHeader';
import { LinkedAccountsSection } from '@/components/profile';
import { fetchProfile, updateProfile, changePassword, deleteAccount as deleteAccountApi, emailChangeRequest, emailChangeStatus } from '@/services/profile';
import { mergeAccounts, setPassword } from '@/services/auth';
import useSWR from 'swr';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/errors';
import type { User } from '@/types/auth';
import { useQuota } from '@/hooks/useQuota';

export default function ProfilePage() {
  const { quota } = useQuota();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // 이메일 변경 모달 상태
  const [showEmailChangeModal, setShowEmailChangeModal] = useState(false);
  const [emailChangePassword, setEmailChangePassword] = useState('');
  const [pendingEmail, setPendingEmail] = useState(''); // 변경하려는 새 이메일 임시 저장

  // 계정 병합 모달 상태
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergePassword, setMergePassword] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeSourceEmail, setMergeSourceEmail] = useState<string | null>(null);

  // 프로필 수정 폼 상태
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: ''
  });

  // 비밀번호 변경 폼 상태
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  // 비밀번호 변경 모달 상태
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // 계정 삭제 모달 상태
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // SWR로 프로필 로드
  const { data: profileData, isLoading: isLoadingProfile, mutate: mutateProfile } = useSWR<User>('/api/auth/profile/', fetchProfile);
  const { data: emailStatus, mutate: mutateEmailStatus } = useSWR('/api/auth/email/change/status/', emailChangeStatus);

  // URL 파라미터에서 merge_required 및 linked 처리
  useEffect(() => {
    const mergeRequired = searchParams.get('merge_required');
    const sourceEmail = searchParams.get('source_email') || searchParams.get('other_email');
    const linked = searchParams.get('linked');
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const provider = searchParams.get('provider');

    // 소셜 계정 연동 성공 알림
    if (linked && success === 'true') {
      toast.success(`${linked.charAt(0).toUpperCase() + linked.slice(1)} 계정이 성공적으로 연결되었습니다.`);
      // URL에서 파라미터 제거
      router.replace('/profile', { scroll: false });
    }

    // 소셜 계정 연동 실패 알림
    if (error) {
      const errorMessages: Record<string, string> = {
        'link_failed': '소셜 계정 연결에 실패했습니다.',
        'unsupported_provider': '지원하지 않는 소셜 서비스입니다.',
        'oauth_error': 'OAuth 인증 중 오류가 발생했습니다.',
        'no_code': '인증 코드를 받지 못했습니다.',
        'invalid_state': '잘못된 요청입니다. 다시 시도해주세요.',
        'not_authenticated': '로그인이 필요합니다.',
        'invalid_token': '인증이 만료되었습니다. 다시 시도해주세요.',
        'user_not_found': '사용자를 찾을 수 없습니다.',
        'token_exchange_failed': '소셜 인증 처리 중 오류가 발생했습니다.',
        'userinfo_failed': '소셜 계정 정보를 가져오는데 실패했습니다.',
        'no_social_id': '소셜 계정 정보가 올바르지 않습니다.',
        'already_linked': '이미 연결된 소셜 계정입니다.',
        'oauth_config_error': '소셜 로그인 설정 오류입니다. 관리자에게 문의하세요.',
        'invalid_request': '잘못된 요청입니다.',
        'token_expired': '연결 요청이 만료되었습니다. 다시 시도해주세요.',
      };
      toast.error(errorMessages[error] || '소셜 계정 연결에 실패했습니다.');
      router.replace('/profile', { scroll: false });
    }

    // 계정 병합 필요
    if (mergeRequired === 'true') {
      // 병합 토큰은 HttpOnly 쿠키로 전달됨 — URL/JS에서 토큰을 다루지 않는다
      setMergeSourceEmail(sourceEmail);
      setShowMergeModal(true);
      // URL에서 파라미터 제거
      router.replace('/profile', { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (profileData) {
      setProfile(profileData);
      setEditForm({
        username: profileData.username,
        email: profileData.email,
        first_name: profileData.first_name || '',
        last_name: profileData.last_name || ''
      });
    }
  }, [profileData]);

  // 계정 병합 처리
  const handleMergeAccounts = async () => {
    try {
      setIsMerging(true);
      // 병합 토큰은 HttpOnly 쿠키(merge_token)로 자동 전송됨 (credentials: 'include')
      const result = await mergeAccounts({
        target_password: mergePassword || undefined,
        confirm_merge: true,
      });

      toast.success(result.message || '계정이 성공적으로 병합되었습니다.');

      if (result.stats) {
        const { notes_moved, folders_moved, labels_moved, storage_overflow, notes_deleted_for_storage, deleted_notes_info } = result.stats;

        // 이동된 데이터 알림
        if (notes_moved > 0 || folders_moved > 0 || labels_moved > 0) {
          toast.info(`${notes_moved}개의 노트, ${folders_moved}개의 폴더, ${labels_moved}개의 라벨이 이전되었습니다.`);
        }

        // 스토리지 초과로 삭제된 노트 경고
        if (storage_overflow && notes_deleted_for_storage && notes_deleted_for_storage > 0) {
          const deletedTitles = deleted_notes_info?.map(n => n.title).slice(0, 3).join(', ') || '';
          const moreCount = (deleted_notes_info?.length || 0) > 3 ? ` 외 ${(deleted_notes_info?.length || 0) - 3}개` : '';

          toast.warning(
            `스토리지 용량 초과로 오래된 노트 ${notes_deleted_for_storage}개가 삭제되었습니다. (${deletedTitles}${moreCount})`,
            { duration: 10000 }  // 10초 동안 표시
          );
        }
      }

      setShowMergeModal(false);
      setMergePassword('');
      setMergeSourceEmail(null);

      // 프로필 및 연결된 계정 정보 새로고침
      await mutateProfile();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, '계정 병합에 실패했습니다.'));
    } finally {
      setIsMerging(false);
    }
  };

  const cancelMerge = () => {
    setShowMergeModal(false);
    setMergePassword('');
    setMergeSourceEmail(null);
    toast.info('계정 병합이 취소되었습니다. 소셜 계정이 연결되지 않았습니다.');
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSavingProfile(true);

      const emailChanged = profile && editForm.email && editForm.email !== profile.email;

      // 이메일 변경이 있는 경우
      if (emailChanged) {
        // 1. 먼저 이메일을 제외한 다른 정보 업데이트
        const hasOtherChanges =
          editForm.username !== profile.username ||
          editForm.first_name !== (profile.first_name || '') ||
          editForm.last_name !== (profile.last_name || '');

        if (hasOtherChanges) {
          try {
            // 이메일을 원래 값으로 되돌려서 다른 정보만 업데이트
            const updateData = {
              username: editForm.username,
              email: profile.email, // 원래 이메일 유지
              first_name: editForm.first_name,
              last_name: editForm.last_name
            };
            const data = await updateProfile(updateData);
            setProfile(data);
            await mutateProfile();
            toast.success('프로필 정보가 업데이트되었습니다.');
          } catch {
            toast.error('프로필 업데이트 중 오류가 발생했습니다.');
            setIsSavingProfile(false);
            return;
          }
        }

        // 2. 변경하려는 이메일을 임시 저장하고 모달 표시
        setPendingEmail(editForm.email);
        setShowEmailChangeModal(true);
        setIsSavingProfile(false);
        return;
      }

      // 이메일 변경이 없는 경우, 일반 프로필 업데이트
      const data = await updateProfile(editForm);
      setProfile(data);
      await mutateProfile();
      setIsEditing(false);
      toast.success('프로필이 성공적으로 업데이트되었습니다.');
    } catch {
      toast.error('프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const submitEmailChange = async () => {
    if (!emailChangePassword.trim()) {
      toast.error('비밀번호를 입력해주세요.');
      return;
    }

    try {
      await emailChangeRequest({ new_email: pendingEmail, current_password: emailChangePassword });
      toast.success('이메일 변경 확인 메일을 전송했습니다. 받은 편지함을 확인하세요.');
      setShowEmailChangeModal(false);
      setEmailChangePassword('');
      setPendingEmail('');
      setIsEditing(false);
      // editForm.email을 원래 값으로 되돌림
      if (profile) {
        setEditForm(prev => ({ ...prev, email: profile.email }));
      }
      await mutateEmailStatus();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, '이메일 변경 요청에 실패했습니다.'));
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    const hasPassword = profile?.has_password;

    // 비밀번호 변경: 모든 필드 필요 / 비밀번호 설정: 새 비밀번호만 필요
    if (hasPassword) {
      if (!passwordForm.current_password.trim() || !passwordForm.new_password.trim() || !passwordForm.confirm_password.trim()) {
        toast.error('모든 필드를 입력해주세요.');
        return;
      }
    } else {
      if (!passwordForm.new_password.trim() || !passwordForm.confirm_password.trim()) {
        toast.error('새 비밀번호를 입력해주세요.');
        return;
      }
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    const password = passwordForm.new_password;
    if (password.length < 8) {
      toast.error('새 비밀번호는 최소 8자 이상이어야 합니다.');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      toast.error('비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.');
      return;
    }

    try {
      setIsChangingPassword(true);
      if (hasPassword) {
        // 비밀번호 변경
        await changePassword({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
          confirm_password: passwordForm.confirm_password
        });
        toast.success('비밀번호가 성공적으로 변경되었습니다.');
      } else {
        // 비밀번호 설정 (소셜 전용 사용자)
        await setPassword({
          new_password: passwordForm.new_password,
          confirm_password: passwordForm.confirm_password
        });
        toast.success('비밀번호가 성공적으로 설정되었습니다. 이제 이메일과 비밀번호로 로그인할 수 있습니다.');
        // 프로필 새로고침하여 has_password 상태 업데이트
        await mutateProfile();
      }
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setShowPasswordModal(false);
    } catch (e: unknown) {
      const fieldErr = (e as { new_password?: string[] })?.new_password?.[0];
      const fallback = hasPassword ? '비밀번호 변경에 실패했습니다.' : '비밀번호 설정에 실패했습니다.';
      toast.error(fieldErr ?? getErrorMessage(e, fallback));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      toast.error('비밀번호를 입력해주세요.');
      return;
    }

    try {
      setIsDeleting(true);
      await deleteAccountApi({ password: deletePassword });
      // 레거시 localStorage 토큰 정리 (현재는 HttpOnly 쿠키 사용)
      // 이전 버전 호환성을 위해 유지하되, 실제 인증은 서버 쿠키에서 처리됨
      try {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      } catch {
        // Private browsing 모드에서 localStorage 접근 실패 무시
      }
      toast.success('계정이 성공적으로 삭제되었습니다.');
      window.location.href = '/';
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, '계정 삭제에 실패했습니다.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const formatJoinedDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return `${year}년 ${month}월 ${day}일`;
  };

  const formatLastLogin = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? '오후' : '오전';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;

    return `${month}월 ${day}일 ${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
  };

  if (isLoadingProfile) {
    return (
      <AuthGuard>
        <AppShell>
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-primary-400 mx-auto mb-4"></div>
              <p className="text-neutral-600 dark:text-neutral-300">프로필을 불러오는 중...</p>
            </div>
          </div>
        </AppShell>
      </AuthGuard>
    );
  }

  if (!profile) {
    return (
      <AuthGuard>
        <AppShell>
          <div className="flex items-center justify-center min-h-screen">
            <p className="text-red-600">프로필 정보를 불러오지 못했습니다.</p>
          </div>
        </AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AppShell>
        <div className="min-h-screen p-4 tablet:p-6 desktop:p-8">
          <div className="max-w-6xl mx-auto">
            {/* 헤더 - 데스크톱에서만 표시 (모바일/태블릿은 MobileHeader 사용) */}
            <div className="hidden desktop:block">
              <PageHeader
                title="내 계정"
                showSearch={false}
                showNotifications={false}
                className="mb-6"
              />
            </div>

            {/* 메인 그리드 - 4:6 비율, items-stretch로 양쪽 높이 맞춤 */}
            <div className="grid grid-cols-1 desktop:grid-cols-10 gap-4 tablet:gap-6 desktop:items-stretch">
              {/* 왼쪽: Profile Information (40%) */}
              <div className="desktop:col-span-4 bg-white dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700 shadow-sm dark:shadow-md dark:shadow-black/30">
                {/* 헤더 */}
                <div className="px-4 tablet:px-6 py-3 tablet:py-3.5 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 tablet:w-4 tablet:h-4 text-neutral-700 dark:text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <h2 className="text-xs tablet:text-sm font-semibold text-neutral-900 dark:text-neutral-100">프로필 정보</h2>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1.5 rounded-md text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      aria-label="프로필 수정"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* 내용 */}
                <div className="p-4 tablet:p-6">
                  {/* 아바타 & 유저명 (왼쪽-오른쪽 레이아웃) */}
                  <div className="flex items-center gap-2.5 tablet:gap-3 mb-4 tablet:mb-6">
                    <div className="w-12 h-12 tablet:w-16 tablet:h-16 rounded-full bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700 dark:from-purple-600 dark:via-purple-700 dark:to-purple-800 flex items-center justify-center text-white font-bold text-lg tablet:text-2xl shadow-lg flex-shrink-0">
                      {profile.username?.charAt(0)?.toUpperCase() || 'T'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">{profile.username}</p>
                      <p className="text-[10px] tablet:text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">프로필 사진은 곧 지원 예정</p>
                    </div>
                  </div>

                  {/* 수정 모드가 아닐 때 정보 표시 */}
                  {!isEditing && (
                    <>
                      {/* USERNAME */}
                      <div className="mb-5">
                        <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">사용자명</label>
                        <p className="text-neutral-900 dark:text-neutral-100 font-medium text-sm">{profile.username}</p>
                      </div>

                      {/* EMAIL ADDRESS */}
                      <div className="mb-5">
                        <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">이메일 주소</label>
                        <div className="flex items-center gap-2">
                          <p className="text-neutral-900 dark:text-neutral-100 font-medium text-sm">{profile.email}</p>
                          <button
                            onClick={async () => {
                              await navigator.clipboard.writeText(profile.email);
                              toast.success('이메일이 복사되었습니다');
                            }}
                            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* NAME & GENDER - 한 줄로 */}
                      <div className="mb-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">이름</label>
                            <p className="text-neutral-900 dark:text-neutral-100 font-medium text-sm">{profile.first_name || profile.username}</p>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">성</label>
                            <p className="text-neutral-900 dark:text-neutral-100 font-medium text-sm">{profile.last_name || '-'}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* 수정 모드일 때 폼 표시 */}
                  {isEditing && (
                    <form onSubmit={handleProfileUpdate} className="mb-6">
                      {/* USERNAME */}
                      <div className="mb-4">
                        <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">사용자명</label>
                        <input
                          type="text"
                          value={editForm.username}
                          onChange={(e) => setEditForm({...editForm, username: e.target.value})}
                          className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>

                      {/* EMAIL */}
                      <div className="mb-4">
                        <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">이메일 주소</label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                          className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>

                      {/* NAME */}
                      <div className="mb-4 grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">이름</label>
                          <input
                            type="text"
                            value={editForm.first_name}
                            onChange={(e) => setEditForm({...editForm, first_name: e.target.value})}
                            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">성</label>
                          <input
                            type="text"
                            value={editForm.last_name}
                            onChange={(e) => setEditForm({...editForm, last_name: e.target.value})}
                            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                      </div>

                      {/* 버튼들 */}
                      <div className="flex gap-2 mt-4 tablet:mt-6">
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="flex-1 px-3 tablet:px-4 py-2 tablet:py-2.5 border-2 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 rounded-md font-semibold text-xs tablet:text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-all"
                        >
                          취소
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingProfile}
                          className="flex-1 px-3 tablet:px-4 py-2 tablet:py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800 text-white rounded-md font-semibold text-xs tablet:text-sm hover:from-purple-700 hover:to-purple-800 dark:hover:from-purple-800 dark:hover:to-purple-900 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSavingProfile ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* JOINED & LAST LOGIN - 한 줄로 (위아래 구분선) */}
                  <div className="border-t border-b border-neutral-200 dark:border-neutral-700 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">
                          <svg className="w-3 h-3 inline mr-1 text-neutral-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          가입일
                        </label>
                        <p className="text-neutral-900 dark:text-neutral-100 font-medium text-sm">
                          {profile.date_joined ? formatJoinedDate(profile.date_joined) : '-'}
                        </p>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">
                          <svg className="w-3 h-3 inline mr-1 text-neutral-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          마지막 로그인
                        </label>
                        <p className="text-neutral-900 dark:text-neutral-100 font-medium text-sm">
                          {profile.last_login ? formatLastLogin(profile.last_login) : '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 사용량 정보 */}
                  {quota && (
                    <div className="pt-4">
                      <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
                        <svg className="w-3 h-3 inline mr-1 text-neutral-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        사용량
                      </label>

                      {/* 플랜 정보 */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">현재 플랜</span>
                        <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                          {quota.plan_display}
                        </span>
                      </div>

                      {/* 일일 노트 생성 */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-neutral-600 dark:text-neutral-400">오늘 노트 생성</span>
                          <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                            {quota.daily.used} / {quota.daily.limit}
                          </span>
                        </div>
                        <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              quota.daily.remaining === 0
                                ? 'bg-red-500'
                                : quota.daily.remaining <= 3
                                  ? 'bg-amber-500'
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min((quota.daily.used / quota.daily.limit) * 100, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* 스토리지 사용량 */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-neutral-600 dark:text-neutral-400">저장 공간</span>
                          <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                            {quota.storage.used_display} / {quota.storage.limit_display}
                          </span>
                        </div>
                        <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              quota.storage.usage_percent >= 95
                                ? 'bg-red-500'
                                : quota.storage.usage_percent >= 80
                                  ? 'bg-amber-500'
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(quota.storage.usage_percent, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* 업그레이드 버튼 */}
                      {quota.plan === 'free' && (
                        <button
                          onClick={() => toast.info('업그레이드 기능은 추후 추가 예정입니다.')}
                          className="w-full mt-4 px-3 py-2 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                        >
                          프로 플랜으로 업그레이드
                        </button>
                      )}
                    </div>
                  )}

                </div>
              </div>

              {/* 오른쪽: Connected Accounts, Change Password & Delete Account (60%) */}
              <div className="desktop:col-span-6 flex flex-col gap-4 tablet:gap-6">
                {/* Connected Accounts - 소셜 계정 연결/관리 (확장) */}
                <div className="flex-1 min-h-0 bg-white dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700 shadow-sm dark:shadow-md dark:shadow-black/30 flex flex-col">
                  {/* 헤더 */}
                  <div className="px-3 tablet:px-4 py-2.5 tablet:py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 tablet:w-4 tablet:h-4 text-neutral-700 dark:text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <h2 className="text-xs tablet:text-sm font-semibold text-neutral-900 dark:text-neutral-100">연결된 계정</h2>
                  </div>

                  {/* 콘텐츠 - flex-1로 남은 공간 채우기 */}
                  <div className="p-3 tablet:p-4 flex-1 flex flex-col">
                    <LinkedAccountsSection className="flex-1" />
                  </div>
                </div>

                {/* 보안 설정 - 컴팩트 (flex-shrink-0으로 고정 크기 유지) */}
                <div className="flex-shrink-0 bg-white dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700 shadow-sm dark:shadow-md dark:shadow-black/30">
                  {/* 헤더 */}
                  <div className="px-3 tablet:px-4 py-2.5 tablet:py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 tablet:w-4 tablet:h-4 text-neutral-700 dark:text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <h2 className="text-xs tablet:text-sm font-semibold text-neutral-900 dark:text-neutral-100">보안 설정</h2>
                  </div>

                  {/* 콘텐츠 - 2열 그리드 */}
                  <div className="p-3 tablet:p-4 grid grid-cols-2 gap-2 tablet:gap-3">
                    {/* 비밀번호 변경/설정 카드 */}
                    <button
                      onClick={() => setShowPasswordModal(true)}
                      className="flex items-center gap-2 tablet:gap-3 p-2 tablet:p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors text-left"
                    >
                      <div className="p-1.5 tablet:p-2 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex-shrink-0">
                        <svg className="w-3.5 h-3.5 tablet:w-4 tablet:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs tablet:text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                          {profile?.has_password ? '비밀번호 변경' : '비밀번호 설정'}
                        </p>
                        <p className="text-[9px] tablet:text-[10px] text-neutral-500 dark:text-neutral-400 truncate hidden tablet:block">
                          {profile?.has_password ? '새 비밀번호로 변경' : '이메일 로그인 활성화'}
                        </p>
                      </div>
                      <svg className="w-3 h-3 tablet:w-4 tablet:h-4 text-neutral-400 dark:text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {/* 계정 삭제 카드 */}
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="flex items-center gap-2 tablet:gap-3 p-2 tablet:p-3 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-left"
                    >
                      <div className="p-1.5 tablet:p-2 rounded-md bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex-shrink-0">
                        <svg className="w-3.5 h-3.5 tablet:w-4 tablet:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs tablet:text-sm font-medium text-red-600 dark:text-red-400 truncate">
                          계정 삭제
                        </p>
                        <p className="text-[9px] tablet:text-[10px] text-red-500 dark:text-red-400/70 truncate hidden tablet:block">
                          모든 데이터 영구 삭제
                        </p>
                      </div>
                      <svg className="w-3 h-3 tablet:w-4 tablet:h-4 text-red-400 dark:text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  {/* 안내 문구 */}
                  <div className="px-3 tablet:px-4 pb-2.5 tablet:pb-3">
                    <p className="text-[9px] tablet:text-[10px] text-neutral-400 dark:text-neutral-500">
                      비밀번호는 8자 이상, 영문/숫자/특수문자 조합 필수
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 이메일 변경 비밀번호 확인 모달 */}
        {showEmailChangeModal && (
          <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-2xl max-w-md w-full border border-neutral-200 dark:border-neutral-700">
              {/* 모달 헤더 */}
              <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">이메일 변경 확인</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  보안을 위해 현재 비밀번호를 입력해주세요.
                </p>
              </div>

              {/* 모달 본문 */}
              <div className="px-6 py-5">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    새 이메일 주소
                  </label>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100 bg-neutral-50 dark:bg-neutral-900 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700">
                    {pendingEmail}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    현재 비밀번호
                  </label>
                  <input
                    type="password"
                    value={emailChangePassword}
                    onChange={(e) => setEmailChangePassword(e.target.value)}
                    placeholder="현재 비밀번호를 입력하세요"
                    className="w-full px-4 py-2.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        submitEmailChange();
                      }
                    }}
                  />
                </div>

                <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 flex items-start gap-2">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    새 이메일로 확인 링크가 전송됩니다. 링크를 클릭하여 변경을 완료해주세요.
                  </p>
                </div>
              </div>

              {/* 모달 푸터 */}
              <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowEmailChangeModal(false);
                    setEmailChangePassword('');
                    setPendingEmail('');
                    setIsSavingProfile(false);
                    // editForm.email을 원래 값으로 되돌림
                    if (profile) {
                      setEditForm(prev => ({ ...prev, email: profile.email }));
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-all"
                >
                  취소
                </button>
                <button
                  onClick={submitEmailChange}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800 rounded-md hover:opacity-90 transition-all shadow-md"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 계정 병합 확인 모달 */}
        {showMergeModal && (
          <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-2xl max-w-md w-full border border-neutral-200 dark:border-neutral-700">
              {/* 모달 헤더 */}
              <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600 dark:text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">계정 병합</h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      이 소셜 계정은 다른 계정에 연결되어 있습니다
                    </p>
                  </div>
                </div>
              </div>

              {/* 모달 본문 */}
              <div className="px-6 py-5">
                <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    연결하려는 소셜 계정이 이미 다른 계정에 연결되어 있습니다.
                    {mergeSourceEmail && (
                      <span className="block mt-1 font-medium">
                        기존 계정: {mergeSourceEmail}
                      </span>
                    )}
                  </p>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-3">
                    계정을 병합하면 다음이 현재 계정으로 이전됩니다:
                  </p>
                  <ul className="text-sm text-neutral-600 dark:text-neutral-400 space-y-1 ml-4">
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      모든 노트
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      모든 폴더
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      모든 라벨
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      소셜 계정 연결
                    </li>
                  </ul>
                </div>

                {profile?.has_password && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      현재 계정 비밀번호
                    </label>
                    <input
                      type="password"
                      value={mergePassword}
                      onChange={(e) => setMergePassword(e.target.value)}
                      placeholder="현재 계정의 비밀번호를 입력하세요"
                      className="w-full px-4 py-2.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleMergeAccounts();
                        }
                      }}
                    />
                  </div>
                )}

                <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 flex items-start gap-2">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    병합 후 기존 계정은 비활성화됩니다. 이 작업은 되돌릴 수 없습니다.
                  </p>
                </div>

                <div className="mt-3 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-3 flex items-start gap-2">
                  <svg className="w-5 h-5 text-neutral-500 dark:text-neutral-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    스토리지 용량 제한을 초과하는 경우, 기존 계정의 오래된 노트부터 자동으로 삭제될 수 있습니다.
                  </p>
                </div>
              </div>

              {/* 모달 푸터 */}
              <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-end gap-3">
                <button
                  onClick={cancelMerge}
                  disabled={isMerging}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-all disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={handleMergeAccounts}
                  disabled={isMerging || (profile?.has_password && !mergePassword)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800 rounded-md hover:opacity-90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isMerging ? '병합 중...' : '계정 병합'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 비밀번호 변경/설정 모달 */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-2xl max-w-md w-full border border-neutral-200 dark:border-neutral-700">
              {/* 모달 헤더 */}
              <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      {profile?.has_password ? '비밀번호 변경' : '비밀번호 설정'}
                    </h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {profile?.has_password ? '새로운 비밀번호를 입력하세요' : '이메일 로그인을 위한 비밀번호를 설정하세요'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 모달 본문 */}
              <form onSubmit={handlePasswordChange}>
                <div className="px-6 py-5 space-y-4">
                  {/* Current Password - 비밀번호가 있는 경우에만 표시 */}
                  {profile?.has_password && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">현재 비밀번호</label>
                      <input
                        type="password"
                        value={passwordForm.current_password}
                        onChange={(e) => setPasswordForm({...passwordForm, current_password: e.target.value})}
                        className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-600 rounded-md text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                        placeholder="현재 비밀번호를 입력하세요"
                        autoFocus
                      />
                    </div>
                  )}

                  {/* New Password */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">새 비밀번호</label>
                    <input
                      type="password"
                      value={passwordForm.new_password}
                      onChange={(e) => setPasswordForm({...passwordForm, new_password: e.target.value})}
                      className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-600 rounded-md text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                      placeholder="새 비밀번호를 입력하세요"
                      autoFocus={!profile?.has_password}
                    />
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">새 비밀번호 확인</label>
                    <input
                      type="password"
                      value={passwordForm.confirm_password}
                      onChange={(e) => setPasswordForm({...passwordForm, confirm_password: e.target.value})}
                      className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-600 rounded-md text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                      placeholder="새 비밀번호를 다시 입력하세요"
                    />
                  </div>

                  {/* 비밀번호 요구사항 안내 */}
                  <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md p-3">
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2 font-medium">비밀번호 요구사항:</p>
                    <ul className="text-xs text-neutral-500 dark:text-neutral-500 space-y-1">
                      <li className="flex items-center gap-1.5">
                        <span className={passwordForm.new_password.length >= 8 ? 'text-green-500' : ''}>•</span>
                        최소 8자 이상
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className={/[a-zA-Z]/.test(passwordForm.new_password) ? 'text-green-500' : ''}>•</span>
                        영문 포함
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className={/[0-9]/.test(passwordForm.new_password) ? 'text-green-500' : ''}>•</span>
                        숫자 포함
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className={/[^a-zA-Z0-9]/.test(passwordForm.new_password) ? 'text-green-500' : ''}>•</span>
                        특수문자 포함
                      </li>
                    </ul>
                  </div>
                </div>

                {/* 모달 푸터 */}
                <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
                    }}
                    disabled={isChangingPassword}
                    className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-all disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800 rounded-md hover:opacity-90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isChangingPassword ? '처리 중...' : (profile?.has_password ? '비밀번호 변경' : '비밀번호 설정')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 계정 삭제 모달 */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-2xl max-w-md w-full border border-red-200 dark:border-red-800">
              {/* 모달 헤더 */}
              <div className="px-6 py-4 border-b border-red-200 dark:border-red-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">계정 삭제</h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      이 작업은 되돌릴 수 없습니다
                    </p>
                  </div>
                </div>
              </div>

              {/* 모달 본문 */}
              <div className="px-6 py-5 space-y-4">
                {/* 경고 메시지 */}
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-600 dark:text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-semibold text-red-800 dark:text-red-300 text-sm mb-1">모든 데이터가 영구적으로 삭제됩니다</p>
                      <ul className="text-xs text-red-700 dark:text-red-400 space-y-1">
                        <li>• 모든 음성 노트 및 텍스트 변환 내용</li>
                        <li>• 폴더, 라벨 및 개인 설정</li>
                        <li>• 연결된 소셜 계정 정보</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* 비밀번호 입력 */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    비밀번호 확인
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-600 rounded-md text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                    placeholder="계정 삭제를 위해 비밀번호를 입력하세요"
                    autoFocus
                  />
                </div>
              </div>

              {/* 모달 푸터 */}
              <div className="px-6 py-4 border-t border-red-200 dark:border-red-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeletePassword('');
                  }}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-all disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || !deletePassword.trim()}
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? '삭제 중...' : '계정 영구 삭제'}
                </button>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}

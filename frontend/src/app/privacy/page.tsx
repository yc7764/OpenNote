'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/common/ThemeToggle';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">돌아가기</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            OpenNote 개인정보처리방침
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            시행일: 2025년 1월 1일
          </p>
        </div>

        {/* Intro */}
        <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed mb-10">
          <p>
            OpenNote(이하 &quot;서비스&quot;)는 개인정보보호법 제30조에 따라 정보주체의 개인정보를 보호하고
            이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이 개인정보 처리방침을 수립·공개합니다.
          </p>
          <p className="bg-indigo-50/50 dark:bg-indigo-900/10 px-4 py-3 -mx-4">
            본 서비스는 <strong className="text-indigo-700 dark:text-indigo-400">비영리 연구 및 공익 목적</strong>으로 운영되며, 개인정보를 상업적으로 이용하지 않습니다.
          </p>
        </div>

        {/* Content */}
        <div className="space-y-10">
          {/* 제1조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제1조 (개인정보의 처리 목적)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>
                서비스는 다음의 목적을 위하여 개인정보를 처리합니다. 처리한 개인정보는 다음의 목적 이외의 용도로는 사용되지 않으며,
                이용 목적이 변경되는 경우에는 개인정보보호법 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.
              </p>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6 mb-3">1. 회원 관리</h3>
              <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                <li>회원 가입 및 탈퇴 처리</li>
                <li>본인 확인 및 인증</li>
                <li>서비스 이용 자격 확인</li>
                <li>부정 이용 방지</li>
              </ul>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6 mb-3">2. 서비스 제공</h3>
              <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                <li>음성 파일 업로드 및 저장</li>
                <li>AI 음성 인식(STT) 처리</li>
                <li>AI 요약 생성</li>
                <li>노트 조회, 수정, 삭제 기능 제공</li>
              </ul>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6 mb-3">3. 서비스 개선 (익명화된 통계만 사용)</h3>
              <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                <li>서비스 품질 개선을 위한 익명화된 사용 통계 수집</li>
                <li>오류 분석 및 서비스 안정성 향상</li>
              </ul>
            </div>
          </section>

          {/* 제2조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제2조 (수집하는 개인정보의 항목 및 수집 방법)
            </h2>
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">1. 수집 항목</h3>

              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">필수 항목</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-800">
                        <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">구분</th>
                        <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">수집 항목</th>
                        <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">수집 목적</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600 dark:text-gray-400">
                      <tr>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">이메일 회원가입</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">이메일, 사용자명, 비밀번호(암호화)</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">계정 생성 및 로그인</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">소셜 로그인</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">소셜 ID, 이메일(제공 시), 이름(제공 시)</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">계정 연동 및 로그인</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">서비스 이용</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">업로드한 음성 파일, 생성된 노트 데이터</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">서비스 제공</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">선택 항목</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-800">
                        <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">구분</th>
                        <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">수집 항목</th>
                        <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">수집 목적</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600 dark:text-gray-400">
                      <tr>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">프로필</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">이름</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">사용자 식별 및 표시</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">노트 메타데이터</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">사용자 설명, 키워드</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">AI 요약 품질 향상</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">자동 수집 항목</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-800">
                        <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">구분</th>
                        <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">수집 항목</th>
                        <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">수집 목적</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600 dark:text-gray-400">
                      <tr>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">접속 정보</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">IP 주소, 접속 일시, 브라우저 정보</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">보안 및 부정 이용 방지</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">쿠키</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">인증 토큰, CSRF 토큰</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">로그인 유지 및 보안</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6 mb-3">2. 수집 방법</h3>
              <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                <li>회원가입 시 사용자 직접 입력</li>
                <li>소셜 로그인 제공자(OAuth)를 통한 수집</li>
                <li>서비스 이용 과정에서 자동 수집</li>
                <li>음성 파일 업로드</li>
              </ul>
            </div>
          </section>

          {/* 제3조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제3조 (소셜 로그인 시 수집 정보)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>소셜 로그인을 선택할 경우, 각 제공자로부터 다음 정보를 수신합니다:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">제공자</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">수집 항목</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">비고</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">GitHub</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">사용자 ID, 이메일, 이름</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">공개 프로필 정보만</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">Google</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">사용자 ID, 이메일, 이름</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">기본 프로필 정보만</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">Naver</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">사용자 ID, 이메일, 이름</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">동의한 정보만</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">Kakao</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">사용자 ID, 이메일(선택), 닉네임</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">동의한 정보만</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                소셜 로그인 시 해당 서비스의 개인정보 처리방침도 함께 적용됩니다.
              </p>
            </div>
          </section>

          {/* 제4조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제4조 (개인정보의 보유 및 이용 기간)
            </h2>
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">1. 일반 원칙</h3>
              <p>개인정보는 수집 목적이 달성되면 지체 없이 파기합니다. 구체적인 보유 기간은 다음과 같습니다:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">구분</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">보유 기간</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">사유</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">계정 정보</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">회원 탈퇴 시까지</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">서비스 제공</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">노트 데이터</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">삭제 요청 시까지</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">서비스 제공</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">음성 파일</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">노트 삭제 시 즉시</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">서비스 제공</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">접속 로그</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">최대 3개월</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">보안 및 부정 이용 방지</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">휴지통 노트</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">30일 후 자동 삭제</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">복구 기회 제공</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6">2. 법령에 따른 보관</h3>
              <p>관계 법령의 규정에 의하여 보존할 필요가 있는 경우, 해당 기간 동안 보관합니다:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">보관 정보</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">근거 법령</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">보관 기간</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">계약 또는 청약철회 기록</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">전자상거래법</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">5년</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">로그인 기록</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">통신비밀보호법</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">3개월</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 제5조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제5조 (개인정보의 제3자 제공)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>
                서비스는 원칙적으로 정보주체의 개인정보를 수집·이용 목적으로 명시한 범위 내에서 처리하며,
                정보주체의 사전 동의 없이는 본래의 목적 범위를 초과하여 처리하거나 제3자에게 제공하지 않습니다.
              </p>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6 mb-3">예외 사항</h3>
              <p>다음의 경우에는 정보주체의 동의 없이 개인정보를 제3자에게 제공할 수 있습니다:</p>
              <ol className="list-decimal list-outside ml-5 space-y-2 text-gray-600 dark:text-gray-400">
                <li>법령에 특별한 규정이 있는 경우</li>
                <li>정보주체 또는 그 법정대리인이 의사표시를 할 수 없는 상태에 있거나 주소불명 등으로 사전 동의를 받을 수 없는 경우로서 명백히 정보주체 또는 제3자의 급박한 생명, 신체, 재산의 이익을 위하여 필요하다고 인정되는 경우</li>
                <li>수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요청이 있는 경우</li>
              </ol>
            </div>
          </section>

          {/* 제6조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제6조 (개인정보 처리의 위탁)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>
                서비스는 현재 개인정보 처리 업무를 외부에 위탁하지 않습니다. 모든 데이터는 운영자가 직접 관리합니다.
              </p>
              <p>
                향후 위탁이 필요한 경우, 개인정보보호법 제26조에 따라 위탁 내용 및 수탁자를 정보주체에게 공지하거나 고지하겠습니다.
              </p>
            </div>
          </section>

          {/* 제7조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제7조 (정보주체의 권리·의무 및 행사 방법)
            </h2>
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>정보주체는 다음과 같은 권리를 행사할 수 있습니다:</p>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">1. 권리 내용</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">권리</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">설명</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">열람권</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">본인의 개인정보 처리 현황을 열람할 수 있습니다</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">정정권</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">부정확한 개인정보의 정정을 요청할 수 있습니다</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">삭제권</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">개인정보의 삭제를 요청할 수 있습니다</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">처리정지권</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">개인정보 처리의 정지를 요청할 수 있습니다</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">동의철회권</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">개인정보 수집·이용에 대한 동의를 철회할 수 있습니다</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6">2. 행사 방법</h3>
              <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                <li><strong>온라인</strong>: 서비스 내 프로필 페이지에서 직접 조회, 수정, 삭제</li>
                <li><strong>회원 탈퇴</strong>: 프로필 페이지 → 계정 탈퇴 메뉴 이용</li>
                <li><strong>이메일</strong>: 운영자 이메일로 요청 (본인 확인 필요)</li>
              </ul>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6">3. 처리 기한</h3>
              <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                <li>정당한 요청에 대해 지체 없이, 늦어도 10일 이내에 처리합니다</li>
                <li>처리가 어려운 경우 그 사유와 이의제기 방법을 알려드립니다</li>
              </ul>
            </div>
          </section>

          {/* 제8조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제8조 (개인정보의 파기)
            </h2>
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">1. 파기 원칙</h3>
              <p>개인정보는 보유 기간이 경과하거나 처리 목적이 달성된 경우 지체 없이 파기합니다.</p>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6">2. 파기 방법</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">구분</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">파기 방법</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">전자적 파일</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">복구 불가능한 방법으로 영구 삭제</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">음성 파일</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">스토리지에서 물리적 삭제</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">종이 문서</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">분쇄기로 분쇄 또는 소각 (해당 시)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6">3. 회원 탈퇴 시 처리</h3>
              <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                <li>계정 정보: 즉시 삭제</li>
                <li>노트 데이터: 즉시 삭제</li>
                <li>음성 파일: 스토리지에서 즉시 삭제</li>
                <li>접속 로그: 법령에 따라 보관 후 삭제</li>
              </ul>
            </div>
          </section>

          {/* 제9조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제9조 (개인정보의 안전성 확보 조치)
            </h2>
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>서비스는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다:</p>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">1. 기술적 조치</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">조치</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">내용</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">비밀번호 암호화</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">안전한 해시 알고리즘으로 단방향 암호화 저장</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">통신 암호화</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">HTTPS(TLS)를 통한 데이터 전송 암호화</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">인증 토큰</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">JWT를 HttpOnly 쿠키로 안전하게 관리</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">CSRF 보호</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">CSRF 토큰을 통한 요청 위조 방지</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">브루트포스 방지</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">로그인 시도 횟수 제한 및 일시 차단</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6">2. 관리적 조치</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">조치</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">내용</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">접근 권한 관리</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">개인정보 처리자의 최소한의 접근 권한 부여</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">접속 기록 보관</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">개인정보 처리 시스템 접속 기록 보관</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">정기 점검</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">보안 취약점 정기 점검 및 조치</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6">3. 물리적 조치</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">조치</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">내용</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">서버 보안</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">서버에 대한 물리적 접근 제한</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">백업 관리</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">정기적인 데이터 백업 및 안전한 보관</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 제10조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제10조 (쿠키 및 자동 수집 장치)
            </h2>
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">1. 사용하는 쿠키</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">쿠키명</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">용도</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">유효기간</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">필수 여부</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">인증 토큰 (access_token)</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">로그인 상태 유지</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">60분</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">필수</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">갱신 토큰 (refresh_token)</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">토큰 자동 갱신</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">1일</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">필수</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">CSRF 토큰</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">요청 위조 방지</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">세션</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">필수</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6">2. 쿠키 설정 방법</h3>
              <p>웹 브라우저의 설정을 통해 쿠키 사용을 거부할 수 있습니다. 단, 필수 쿠키를 거부할 경우 서비스 이용에 제한이 있을 수 있습니다.</p>
              <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                <li><strong>Chrome</strong>: 설정 → 개인정보 및 보안 → 쿠키 및 기타 사이트 데이터</li>
                <li><strong>Firefox</strong>: 설정 → 개인정보 및 보안 → 쿠키 및 사이트 데이터</li>
                <li><strong>Safari</strong>: 환경설정 → 개인정보 보호 → 쿠키 및 웹사이트 데이터</li>
              </ul>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6">3. 분석 도구</h3>
              <p>본 서비스는 현재 외부 분석 도구(Google Analytics 등)를 사용하지 않습니다.</p>
            </div>
          </section>

          {/* 제11조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제11조 (개인정보 보호책임자)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>
                서비스는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
              </p>

              <div className="bg-gray-100/50 dark:bg-gray-800/50 px-4 py-4 -mx-4">
                <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mb-2">개인정보 보호책임자</h3>
                <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                  <li><strong>담당자</strong>: 서비스 운영자</li>
                  <li><strong>이메일</strong>: <a href="mailto:dudcjf7764@naver.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">dudcjf7764@naver.com</a></li>
                </ul>
              </div>

              <p>
                정보주체께서는 서비스 이용 중 발생하는 모든 개인정보 보호 관련 문의, 불만처리, 피해구제 등에 관한 사항을 위 연락처로 문의하실 수 있습니다.
              </p>
            </div>
          </section>

          {/* 제12조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제12조 (권익침해 구제방법)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>
                정보주체는 개인정보침해로 인한 구제를 받기 위하여 개인정보분쟁조정위원회, 한국인터넷진흥원 개인정보침해신고센터 등에 분쟁해결이나 상담 등을 신청할 수 있습니다.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">기관</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">연락처</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">홈페이지</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">개인정보분쟁조정위원회</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">(국번없이) 1833-6972</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <a href="https://www.kopico.go.kr" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">www.kopico.go.kr</a>
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">개인정보침해신고센터</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">(국번없이) 118</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">privacy.kisa.or.kr</a>
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">대검찰청</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">(국번없이) 1301</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <a href="https://www.spo.go.kr" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">www.spo.go.kr</a>
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">경찰청</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">(국번없이) 182</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <a href="https://ecrm.cyber.go.kr" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">ecrm.cyber.go.kr</a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 제13조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제13조 (개인정보 처리방침 변경)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">1. 변경 공지</h3>
              <p>
                이 개인정보 처리방침은 법령, 정책 또는 보안기술의 변경에 따라 내용의 추가, 삭제 및 수정이 있을 시에는
                변경사항의 시행 7일 전부터 서비스 공지사항을 통하여 고지할 것입니다.
              </p>

              <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mt-6">2. 버전 관리</h3>
              <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                <li><strong>현재 버전</strong>: 1.0</li>
                <li><strong>시행일</strong>: 2025년 1월 1일</li>
                <li><strong>최종 수정일</strong>: 2025년 1월 1일</li>
              </ul>
            </div>
          </section>

          {/* 제14조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제14조 (AI 처리에 관한 특별 조항)
            </h2>
            <div className="bg-amber-50/50 dark:bg-amber-900/10 px-4 py-4 -mx-4">
              <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
                <div>
                  <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mb-3">1. 음성 데이터 처리</h3>
                  <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                    <li>업로드된 음성 파일은 AI 음성 인식(STT)을 위해서만 처리됩니다</li>
                    <li>처리 후 원본 음성 파일은 사용자 스토리지에 보관되며, 사용자가 삭제 시 즉시 파기됩니다</li>
                    <li>음성 파일은 제3자에게 제공되거나 외부로 전송되지 않습니다</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-base font-medium text-amber-700 dark:text-amber-400 mb-3">2. AI 모델 학습 미사용</h3>
                  <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                    <li>사용자의 음성 데이터 및 노트 내용은 AI 모델 학습에 사용되지 않습니다</li>
                    <li>본 서비스는 사전에 학습된 오픈소스 모델을 사용합니다</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mb-3">3. 익명화된 통계</h3>
                  <p className="mb-2 text-gray-600 dark:text-gray-400">서비스 품질 개선을 위해 다음과 같은 익명화된 통계만 수집합니다:</p>
                  <ul className="list-disc list-outside ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                    <li>처리 성공/실패 건수</li>
                    <li>평균 처리 시간</li>
                    <li>파일 형식별 처리 현황</li>
                  </ul>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    이 통계에는 개인을 식별할 수 있는 정보가 포함되지 않습니다.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            본 개인정보처리방침에 동의함으로써 정보주체는 위 내용을 충분히 이해하고 개인정보 처리에 동의한 것으로 간주합니다.
          </p>
        </div>

        {/* Additional Links */}
        <div className="flex flex-col items-center gap-3 mt-8 text-sm">
          <div className="flex items-center gap-4">
            <Link href="/terms" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              이용약관
            </Link>
            <span className="text-gray-300 dark:text-gray-600">•</span>
            <Link href="/about" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              About
            </Link>
            <span className="text-gray-300 dark:text-gray-600">•</span>
            <Link href="/" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              로그인
            </Link>
          </div>
          <a href="mailto:dudcjf7764@naver.com" className="text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400">
            dudcjf7764@naver.com
          </a>
        </div>
      </main>
    </div>
  );
}

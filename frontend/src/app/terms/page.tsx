'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/common/ThemeToggle';

export default function TermsPage() {
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
            OpenNote 이용약관
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            시행일: 2026년 1월 1일
          </p>
        </div>

        {/* Content */}
        <div className="space-y-10">
          {/* 제1조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제1조 (목적)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>
                본 약관은 OpenNote(이하 &quot;서비스&quot;)의 이용과 관련하여 서비스 운영자(이하 &quot;운영자&quot;)와
                이용자(이하 &quot;사용자&quot;) 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
              </p>
              <p className="bg-indigo-50/50 dark:bg-indigo-900/10 px-4 py-3 -mx-4">
                본 서비스는 <strong className="text-indigo-700 dark:text-indigo-400">비영리 연구 및 공익 목적</strong>으로 운영되며, 상업적 수익을 추구하지 않습니다.
              </p>
            </div>
          </section>

          {/* 제2조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제2조 (용어의 정의)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>본 약관에서 사용하는 용어의 정의는 다음과 같습니다:</p>
              <ol className="list-decimal list-outside ml-5 space-y-3">
                <li>
                  <strong>서비스</strong>: 운영자가 제공하는 AI 기반 음성 노트 웹 애플리케이션으로,
                  음성 녹음/업로드, 음성 인식(STT), 요약 생성, 노트 관리 기능을 포함합니다.
                </li>
                <li>
                  <strong>사용자</strong>: 본 약관에 동의하고 서비스에 가입하여 이용하는 자를 말합니다.
                </li>
                <li>
                  <strong>노트</strong>: 사용자가 업로드한 음성 파일과 이를 기반으로 생성된 텍스트 및 요약 데이터를 말합니다.
                </li>
                <li>
                  <strong>AI 처리</strong>: 오픈소스 기반 음성 인식 및 자연어 처리 모델을 사용하여
                  음성을 텍스트로 변환하고 요약을 생성하는 과정을 말합니다.
                </li>
              </ol>
            </div>
          </section>

          {/* 제3조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제3조 (서비스 내용)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>운영자가 제공하는 서비스는 다음과 같습니다:</p>
              <ol className="list-decimal list-outside ml-5 space-y-2">
                <li><strong>음성 녹음 및 업로드</strong>: 사용자의 음성 파일을 서버에 업로드하는 기능</li>
                <li><strong>음성 인식 (STT)</strong>: 업로드된 음성 파일을 텍스트로 변환하는 기능</li>
                <li><strong>요약 생성</strong>: 변환된 텍스트를 AI가 분석하여 요약본을 생성하는 기능</li>
                <li><strong>노트 관리</strong>: 생성된 노트의 조회, 수정, 삭제, 즐겨찾기 기능</li>
                <li><strong>회원 관리</strong>: 계정 생성, 로그인, 프로필 관리, 비밀번호 변경 기능</li>
              </ol>
            </div>
          </section>

          {/* 제4조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제4조 (이용 조건)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ol className="list-decimal list-outside ml-5 space-y-3">
                <li><strong>회원 가입</strong>: 서비스를 이용하기 위해서는 회원 가입이 필수입니다.</li>
                <li><strong>가입 방법</strong>: 이메일 회원가입 또는 소셜 로그인(GitHub, Google, Naver, Kakao)을 통해 가입할 수 있습니다.</li>
                <li><strong>이메일 인증</strong>: 서비스 이용을 위해 이메일 인증이 필요할 수 있습니다.</li>
                <li><strong>무료 제공</strong>: 본 서비스는 무료로 제공됩니다.</li>
                <li>
                  <strong>이용 제한</strong>: 서비스의 안정적 운영을 위해 다음과 같은 이용 제한이 적용됩니다:
                  <ul className="list-disc list-outside ml-5 mt-2 space-y-1 text-gray-600 dark:text-gray-400">
                    <li>일일 노트 생성: 20개</li>
                    <li>개인 스토리지: 1GB</li>
                    <li>개별 파일 크기: 1GB 이하</li>
                  </ul>
                </li>
              </ol>
            </div>
          </section>

          {/* 제5조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제5조 (사용자의 의무)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>사용자는 다음 사항을 준수해야 합니다:</p>
              <ol className="list-decimal list-outside ml-5 space-y-2">
                <li><strong>법령 준수</strong>: 대한민국 법령 및 본 약관을 준수해야 합니다.</li>
                <li><strong>정확한 정보 제공</strong>: 가입 시 정확한 정보를 제공하고, 변경 시 즉시 업데이트해야 합니다.</li>
                <li><strong>계정 관리</strong>: 자신의 계정 정보를 안전하게 관리해야 합니다.</li>
                <li><strong>타인 권리 존중</strong>: 타인의 저작권, 초상권, 명예 등을 침해하지 않아야 합니다.</li>
              </ol>

              <div className="bg-red-50/50 dark:bg-red-900/10 px-4 py-4 -mx-4 mt-6">
                <h3 className="text-base font-medium text-red-700 dark:text-red-400 mb-3">금지 행위</h3>
                <p className="mb-3 text-gray-700 dark:text-gray-300">다음 행위는 엄격히 금지됩니다:</p>
                <ul className="list-disc list-outside ml-5 space-y-2 text-gray-600 dark:text-gray-400">
                  <li>타인의 개인정보, 대화, 음성을 당사자 동의 없이 녹음 또는 업로드하는 행위</li>
                  <li>불법 콘텐츠(음란물, 폭력물, 혐오 발언 등)를 포함한 음성 파일 업로드</li>
                  <li>서비스 인프라에 과도한 부하를 주는 자동화된 대량 요청</li>
                  <li>서비스의 보안을 우회하거나 취약점을 악용하는 행위</li>
                  <li>서비스를 통해 얻은 정보를 상업적으로 재판매하는 행위</li>
                  <li>기타 법령에 위반되거나 공공질서 및 미풍양속에 반하는 행위</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 제6조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제6조 (콘텐츠 권리)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ol className="list-decimal list-outside ml-5 space-y-3">
                <li><strong>사용자 콘텐츠 소유권</strong>: 사용자가 업로드한 음성 파일 및 관련 콘텐츠에 대한 저작권은 사용자에게 있습니다.</li>
                <li><strong>제한적 이용 허락</strong>: 사용자는 서비스 운영에 필요한 범위 내에서 콘텐츠를 처리(STT 변환, 요약 생성, 저장)할 수 있는 권한을 운영자에게 부여합니다.</li>
                <li><strong>제3자 제공 금지</strong>: 운영자는 사용자의 동의 없이 콘텐츠를 제3자에게 제공하지 않습니다.</li>
                <li><strong>AI 학습 미사용</strong>: 사용자 콘텐츠는 AI 모델 학습에 사용되지 않습니다. 본 서비스는 사전 학습된 오픈소스 모델을 사용합니다.</li>
              </ol>
            </div>
          </section>

          {/* 제7조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제7조 (AI 처리에 관한 고지)
            </h2>
            <div className="bg-amber-50/50 dark:bg-amber-900/10 px-4 py-4 -mx-4">
              <ol className="list-decimal list-outside ml-5 space-y-3 text-gray-700 dark:text-gray-300 leading-relaxed">
                <li><strong>오픈소스 모델 사용</strong>: 본 서비스는 오픈소스 기반의 음성 인식 및 자연어 처리 모델을 직접 학습하여 활용합니다.</li>
                <li><strong className="text-amber-700 dark:text-amber-400">정확성 미보장</strong>: AI 처리 결과(음성 인식, 요약)는 100% 정확하지 않을 수 있습니다. 중요한 내용은 반드시 원본 음성과 대조하여 확인하시기 바랍니다.</li>
                <li><strong>처리 지연</strong>: 서버 상황에 따라 AI 처리에 시간이 소요될 수 있습니다.</li>
                <li><strong>처리 실패</strong>: 음성 품질, 언어, 파일 형식 등에 따라 처리가 실패할 수 있습니다.</li>
                <li><strong>연구 목적</strong>: AI 처리 품질 향상을 위한 익명화된 통계 데이터가 수집될 수 있으나, 개인을 식별할 수 있는 정보는 수집되지 않습니다.</li>
              </ol>
            </div>
          </section>

          {/* 제8조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제8조 (서비스 변경 및 중단)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ol className="list-decimal list-outside ml-5 space-y-3">
                <li><strong>서비스 변경</strong>: 운영자는 서비스 개선을 위해 서비스 내용을 변경할 수 있으며, 중요한 변경 시 사전에 공지합니다.</li>
                <li>
                  <strong>서비스 중단</strong>: 다음 경우 서비스가 일시적 또는 영구적으로 중단될 수 있습니다:
                  <ul className="list-disc list-outside ml-5 mt-2 space-y-1 text-gray-600 dark:text-gray-400">
                    <li>시스템 점검, 유지보수</li>
                    <li>천재지변, 국가비상사태</li>
                    <li>운영 자원 부족</li>
                    <li>기타 불가피한 사유</li>
                  </ul>
                </li>
                <li><strong>사전 고지</strong>: 예정된 중단의 경우 최소 7일 전 공지합니다. 단, 긴급 상황에서는 사후 고지할 수 있습니다.</li>
                <li><strong>서비스 종료</strong>: 서비스 영구 종료 시 최소 30일 전 공지하며, 사용자가 데이터를 백업할 수 있는 기간을 제공합니다.</li>
              </ol>
            </div>
          </section>

          {/* 제9조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제9조 (면책)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ol className="list-decimal list-outside ml-5 space-y-3">
                <li><strong>무료 서비스</strong>: 본 서비스는 비영리 목적으로 무료 제공되므로, 서비스 이용과 관련하여 발생하는 손해에 대해 운영자의 책임이 제한될 수 있습니다.</li>
                <li><strong>AI 처리 오류</strong>: AI 처리 결과의 오류로 인해 발생하는 손해에 대해 운영자는 책임을 지지 않습니다.</li>
                <li><strong>데이터 손실</strong>: 시스템 장애, 해킹 등으로 인한 데이터 손실에 대해 운영자는 최선을 다해 복구하되, 완전한 복구를 보장하지 않습니다.</li>
                <li><strong>사용자 귀책</strong>: 사용자의 부주의, 약관 위반으로 인한 손해에 대해 운영자는 책임을 지지 않습니다.</li>
                <li><strong>제3자 서비스</strong>: 소셜 로그인 등 제3자 서비스 관련 문제에 대해 운영자는 책임을 지지 않습니다.</li>
              </ol>
            </div>
          </section>

          {/* 제10조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제10조 (이용 제한 및 계약 해지)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ol className="list-decimal list-outside ml-5 space-y-3">
                <li><strong>이용 제한</strong>: 사용자가 본 약관을 위반한 경우, 운영자는 경고, 일시 정지, 영구 정지 등의 조치를 취할 수 있습니다.</li>
                <li><strong>회원 탈퇴</strong>: 사용자는 언제든지 프로필 페이지에서 회원 탈퇴할 수 있습니다.</li>
                <li><strong>탈퇴 시 처리</strong>: 탈퇴 시 개인정보 및 노트 데이터는 즉시 삭제되며, 복구할 수 없습니다. 단, 법령에 따라 보존이 필요한 정보는 예외입니다.</li>
              </ol>
            </div>
          </section>

          {/* 제11조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제11조 (약관의 변경)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ol className="list-decimal list-outside ml-5 space-y-3">
                <li><strong>변경 권한</strong>: 운영자는 필요한 경우 본 약관을 변경할 수 있습니다.</li>
                <li><strong>공지</strong>: 약관 변경 시 시행일 7일 전 서비스 내 공지합니다. 중요한 권리·의무 변경 시 30일 전 공지합니다.</li>
                <li><strong>동의</strong>: 변경된 약관 시행일 이후 서비스를 계속 이용하면 변경에 동의한 것으로 간주합니다. 동의하지 않는 경우 회원 탈퇴할 수 있습니다.</li>
              </ol>
            </div>
          </section>

          {/* 제12조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제12조 (준거법 및 관할)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ol className="list-decimal list-outside ml-5 space-y-3">
                <li><strong>준거법</strong>: 본 약관은 대한민국 법률에 따라 해석됩니다.</li>
                <li><strong>관할</strong>: 서비스 이용과 관련한 분쟁은 민사소송법에 따른 관할 법원에서 해결합니다.</li>
              </ol>
            </div>
          </section>

          {/* 제13조 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              제13조 (기타)
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              <ol className="list-decimal list-outside ml-5 space-y-3">
                <li><strong>분리 조항</strong>: 본 약관의 일부 조항이 무효로 판정되더라도 나머지 조항은 유효합니다.</li>
                <li><strong>권리 불포기</strong>: 운영자가 특정 위반에 대해 조치를 취하지 않았다고 해서 해당 권리를 포기한 것으로 간주되지 않습니다.</li>
                <li><strong>문의</strong>: 본 약관에 관한 문의는 서비스 내 문의 기능 또는 운영자 이메일을 통해 할 수 있습니다.</li>
              </ol>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            본 약관에 동의함으로써 사용자는 위 내용을 충분히 이해하고 수락한 것으로 간주합니다.
          </p>
        </div>

        {/* Additional Links */}
        <div className="flex flex-col items-center gap-3 mt-8 text-sm">
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
              개인정보처리방침
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

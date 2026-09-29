# 보안 정책 (Security Policy)

🇰🇷 한국어 | [🇺🇸 English](#security-policy)

OpenNote는 사용자 데이터와 서비스의 보안을 중요하게 생각합니다.
취약점을 발견하셨다면 공개하기 전에 아래 절차로 **비공개**로 알려주세요.

## 지원 버전 (Supported Versions)

| 버전            | 보안 지원 |
| --------------- | :-------: |
| `main` (최신)   |    ✅     |
| 그 외 / 이전    |    ❌     |

활발히 개발 중인 프로젝트로, 보안 패치는 `main` 브랜치에만 적용됩니다.

## 취약점 신고 (Reporting a Vulnerability)

> ⚠️ **공개 Issue나 Pull Request로 취약점을 알리지 마세요.**
> 수정 전에 세부 내용이 노출되는 것을 막기 위함입니다.

아래 중 한 가지 방법으로 비공개 신고해 주세요.

1. **GitHub 비공개 신고 (권장)**
   저장소 상단 **Security → Report a vulnerability** 에서 비공개 Security Advisory로 제출합니다.
   *(저장소 설정에서 Private vulnerability reporting 이 활성화되어 있어야 합니다.)*

2. **이메일**
   `dudcjf7764@naver.com` 으로 전송합니다.

### 신고에 포함하면 좋은 내용

- 취약점 설명과 예상 영향(impact)
- 재현 절차 또는 PoC(proof of concept)
- 영향받는 버전·커밋, 관련 파일 경로
- (선택) 제안하는 완화책 또는 수정 방안

### 처리 절차 (What to Expect)

- **접수 확인**: 영업일 기준 **3일 이내** 회신
- **평가·수정**: 심각도에 따라 우선순위를 정해 패치 진행
- **공개(disclosure)**: 수정 배포 후 조율된 공개(coordinated disclosure)를 원칙으로 하며,
  원하시면 신고자를 기여자로 표기합니다

책임감 있게 신고해 주시는 모든 분께 감사드립니다.

---

# Security Policy

[🇰🇷 한국어](#보안-정책-security-policy) | 🇺🇸 English

OpenNote takes the security of user data and the service seriously.
If you discover a vulnerability, please report it **privately** using the process
below before disclosing it publicly.

## Supported Versions

| Version           | Security Support |
| ----------------- | :--------------: |
| `main` (latest)   |        ✅        |
| Others / older    |        ❌        |

This is an actively developed project; security patches are applied only to the
`main` branch.

## Reporting a Vulnerability

> ⚠️ **Do not report vulnerabilities via public Issues or Pull Requests.**
> This prevents details from being exposed before a fix is available.

Please report privately through one of the following:

1. **GitHub private report (preferred)**
   Submit a private Security Advisory via **Security → Report a vulnerability** at
   the top of the repository.
   *(Private vulnerability reporting must be enabled in the repository settings.)*

2. **Email**
   Send to `dudcjf7764@naver.com`.

### What to include

- A description of the vulnerability and its expected impact
- Steps to reproduce or a proof of concept (PoC)
- Affected version/commit and relevant file paths
- (Optional) Suggested mitigation or fix

### What to Expect

- **Acknowledgement**: within **3 business days**
- **Assessment & fix**: prioritized and patched according to severity
- **Disclosure**: coordinated disclosure after a fix is released; we're happy to
  credit you as a reporter if you wish

Thank you to everyone who reports responsibly.

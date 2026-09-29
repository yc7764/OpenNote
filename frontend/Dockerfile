# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# =============================================================================
# Runtime Environment Injection 방식 사용
# =============================================================================
# NEXT_PUBLIC_* 환경변수는 빌드 시점이 아닌 컨테이너 시작 시점에 주입됩니다.
# 빌드 시에는 플레이스홀더 값을 사용하고, 런타임에 실제 값으로 대체됩니다.
# 이를 통해 동일한 이미지로 dev/staging/prod 환경에 배포할 수 있습니다.
#
# 환경변수는 컨테이너 시작 시 scripts/env.sh에 의해
# public/__ENV.js 파일로 생성되어 클라이언트에서 접근 가능해집니다.
# =============================================================================

ENV NEXT_PUBLIC_API_URL=__RUNTIME_PLACEHOLDER__
ENV NEXT_PUBLIC_WS_URL=__RUNTIME_PLACEHOLDER__
ENV NEXT_PUBLIC_FRONTEND_URL=__RUNTIME_PLACEHOLDER__
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=__RUNTIME_PLACEHOLDER__
ENV NEXT_PUBLIC_GITHUB_CLIENT_ID=__RUNTIME_PLACEHOLDER__
ENV NEXT_PUBLIC_GITHUB_CONNECT_CLIENT_ID=__RUNTIME_PLACEHOLDER__
ENV NEXT_PUBLIC_NAVER_CLIENT_ID=__RUNTIME_PLACEHOLDER__
ENV NEXT_PUBLIC_KAKAO_CLIENT_ID=__RUNTIME_PLACEHOLDER__
ENV NEXT_PUBLIC_STT_EDIT_MODULE_URL=__RUNTIME_PLACEHOLDER__
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Runtime environment injection script 복사
COPY --from=builder /app/scripts/env.sh ./scripts/env.sh
RUN chmod +x ./scripts/env.sh

# Create cache directory with proper permissions
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

# Give nextjs user write permission to public directory for runtime env injection
RUN chown -R nextjs:nodejs ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 컨테이너 시작 시 env.sh가 실행되어 __ENV.js를 생성한 후 서버 시작
CMD ["./scripts/env.sh"]

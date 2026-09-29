# ================================
# Build Stage
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# 패키지 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm ci

# 소스 코드 복사 및 빌드
COPY . .
RUN npm run build

# 프로덕션 의존성만 다시 설치 (--only=production의 현행 문법)
RUN npm ci --omit=dev && npm cache clean --force

# ================================
# Production Stage
# ================================
FROM node:20-alpine AS production

# bash, vim 설치 (Alpine 기반)
RUN apk add --no-cache bash vim

# 보안: 비-root 사용자 생성
RUN addgroup -g 1001 nodejs && \
    adduser -u 1001 -G nodejs -D nestjs

WORKDIR /app

# 빌드 결과물과 프로덕션 의존성만 복사
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./

# 로그 및 환경 파일용 디렉토리 생성
RUN mkdir -p /app/logs /app/config && chown -R nestjs:nodejs /app/logs /app/config

# 비-root 사용자로 전환
USER nestjs

# 포트 노출
EXPOSE 21123

# 앱 실행
CMD ["node", "dist/main"]
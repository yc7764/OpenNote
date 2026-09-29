import { utilities as nestWinstonModuleUtilities, WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// ============================================================================
// 로그 보관 정책 상수
// ============================================================================
const LOG_MAX_SIZE_DEFAULT = '100m'; // app, error, security 로그
const LOG_MAX_SIZE_EXCEPTION = '50m'; // exception, rejection 로그 (덜 빈번)
const LOG_RETENTION_DAYS_SHORT = 7; // app 로그
const LOG_RETENTION_DAYS_LONG = 30; // error, security, exception, rejection 로그

// 로그 디렉토리: ./logs
// Docker 환경: ./logs → /var/log/sttedit (볼륨 마운트, docker-compose.yml 참조)
const logDir = path.join(process.cwd(), 'logs');

// 'logs' 디렉토리가 없으면 생성 (recursive 옵션으로 중첩 디렉토리도 생성)
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const auditDir = path.join(logDir, 'audit');
// 'logs/audit' 디렉토리가 없으면 생성
if (!fs.existsSync(auditDir)) {
  fs.mkdirSync(auditDir, { recursive: true });
}

// ============================================================================
// 앱 시작 시 audit 파일 복구
// Docker 이미지 재빌드로 audit가 초기화되면 winston-daily-rotate-file이
// 기존 로그 파일을 인식하지 못해 retention 정책이 적용되지 않음.
// 실제 로그 파일을 스캔하여 audit에 누락된 파일을 등록하면,
// winston-daily-rotate-file이 maxFiles 초과분을 자동 삭제함.
// ============================================================================
interface AuditEntry {
  date: number;
  name: string;
  hash: string;
}

interface AuditFileSchema {
  keep: { days: boolean; amount: number };
  auditLog: string;
  files: AuditEntry[];
  hashType: string;
}

const AUDIT_CONFIGS = [
  { baseName: 'app.log', auditFile: path.join(auditDir, 'app-audit.json'), retention: LOG_RETENTION_DAYS_SHORT },
  { baseName: 'error.log', auditFile: path.join(auditDir, 'error-audit.json'), retention: LOG_RETENTION_DAYS_LONG },
  { baseName: 'security.log', auditFile: path.join(auditDir, 'security-audit.json'), retention: LOG_RETENTION_DAYS_LONG },
  { baseName: 'content-sync.log', auditFile: path.join(auditDir, 'content-sync-audit.json'), retention: LOG_RETENTION_DAYS_LONG },
  { baseName: 'exception.log', auditFile: path.join(auditDir, 'exception-audit.json'), retention: LOG_RETENTION_DAYS_LONG },
  { baseName: 'rejection.log', auditFile: path.join(auditDir, 'rejection-audit.json'), retention: LOG_RETENTION_DAYS_LONG },
];

function syncAuditFiles(): void {
  try {
    const logFiles = fs.readdirSync(logDir);
    const today = new Date().toISOString().slice(0, 10);

    for (const { baseName, auditFile, retention } of AUDIT_CONFIGS) {
      let audit: AuditFileSchema;

      if (fs.existsSync(auditFile)) {
        audit = JSON.parse(fs.readFileSync(auditFile, 'utf-8'));
      } else {
        audit = {
          keep: { days: false, amount: retention },
          auditLog: auditFile,
          files: [],
          hashType: 'sha256',
        };
      }

      // 디스크의 로그 파일 목록 수집 (날짜별, .gz와 원본을 하나로 묶음)
      const escapedBase = baseName.replace(/\./g, '\\.');
      const pattern = new RegExp(`^${escapedBase}\\.(\\d{4}-\\d{2}-\\d{2})(\\.gz)?$`);
      const diskFiles = new Map<string, string[]>(); // dateStr → [파일명들]

      for (const file of logFiles) {
        const match = file.match(pattern);
        if (!match) continue;
        const dateStr = match[1];
        if (!diskFiles.has(dateStr)) diskFiles.set(dateStr, []);
        diskFiles.get(dateStr)!.push(file);
      }

      // retention 초과 파일을 직접 삭제
      // winston-daily-rotate-file의 logRemoved 리스너가 getStream() 반환 전에는
      // 아직 등록되지 않아 .gz 파일 삭제를 처리하지 못하므로, 여기서 직접 삭제함
      const allDates = [...diskFiles.keys()].sort();
      const keepCount = retention; // maxFiles 값과 동일
      let deleted = 0;

      if (allDates.length > keepCount) {
        // 오늘 날짜는 보존 대상에 포함
        const datesToDelete = allDates.slice(0, allDates.length - keepCount)
          .filter((d) => d !== today);

        for (const dateStr of datesToDelete) {
          const files = diskFiles.get(dateStr)!;
          for (const file of files) {
            try {
              fs.unlinkSync(path.join(logDir, file));
              deleted++;
            } catch (e: any) {
              if (e.code !== 'ENOENT') {
                console.error(`[LogAuditSync] Failed to delete ${file}:`, e.message);
              }
            }
          }
          diskFiles.delete(dateStr);
        }
      }

      // audit 파일을 현재 디스크 상태에 맞게 재구성 (오늘 제외)
      const newFiles: AuditEntry[] = [];
      for (const [dateStr] of diskFiles) {
        if (dateStr === today) continue;
        // .gz가 있으면 원본 이름으로, 없으면 파일명 그대로 (audit에는 항상 .gz 없는 이름)
        const originalName = `${baseName}.${dateStr}`;
        const entryDate = new Date(dateStr).getTime();
        if (isNaN(entryDate)) continue;

        const auditDirPrefix =
          audit.files.length > 0 ? path.dirname(audit.files[0].name) : logDir;
        const entryName = auditDirPrefix + '/' + originalName;
        newFiles.push({
          date: entryDate,
          name: entryName,
          hash: crypto.createHash(audit.hashType || 'sha256')
            .update(entryName + 'LOG_FILE' + entryDate).digest('hex'),
        });
      }

      newFiles.sort((a, b) => a.date - b.date);
      audit.files = newFiles;
      fs.writeFileSync(auditFile, JSON.stringify(audit, null, 4), 'utf-8');

      if (deleted > 0) {
        console.log(`[LogAuditSync] ${baseName}: deleted ${deleted} expired file(s)`);
      }
      if (newFiles.length > 0) {
        console.log(`[LogAuditSync] ${baseName}: synced audit with ${newFiles.length} file(s)`);
      }
    }
  } catch (error) {
    console.error('[LogAuditSync] Failed to sync audit files:', error);
  }
}

// winston logger 생성 전에 audit 동기화 실행해야 함
// winston-daily-rotate-file transport 생성 시 audit를 읽어 retention 정책을 적용하므로
syncAuditFiles();


// ============================================================================
// JSON Format (Loki/Promtail 호환)
// Django의 SafeJsonFormatter와 동일한 필드 구조
// ============================================================================
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    // NestJS context를 name 필드로 매핑 (Django 패턴과 일치)
    if (info.context) {
      info.name = info.context;
    }
    return info;
  })(),
  winston.format.json(),
);

// ============================================================================
// 파일 Transport 옵션
// ============================================================================

// 전체 로그 (INFO 이상) - app.log
const appLogOptions = {
  level: 'info',
  datePattern: 'YYYY-MM-DD',
  dirname: logDir,
  filename: 'app.log',
  auditFile: path.join(auditDir, 'app-audit.json'),
  zippedArchive: true,
  maxFiles: LOG_RETENTION_DAYS_SHORT, // 7일간 보관 (Django와 동일)
  maxSize: LOG_MAX_SIZE_DEFAULT, // 로그 파일당 최대 크기 (디스크 풀 방지)
  format: jsonFormat,
};

// 에러 로그 (ERROR 이상) - error.log
const errorLogOptions = {
  level: 'error',
  datePattern: 'YYYY-MM-DD',
  dirname: logDir,
  filename: 'error.log',
  auditFile: path.join(auditDir, 'error-audit.json'),
  zippedArchive: true,
  maxFiles: LOG_RETENTION_DAYS_LONG, // 30일간 보관 (Django와 동일)
  maxSize: LOG_MAX_SIZE_DEFAULT, // 로그 파일당 최대 크기
  format: jsonFormat,
};

// 보안 로그 - security.log (별도 transport로 사용)
// SecurityLoggerService에서 직접 사용
export const securityLogOptions = {
  level: 'info',
  datePattern: 'YYYY-MM-DD',
  dirname: logDir,
  filename: 'security.log',
  auditFile: path.join(auditDir, 'security-audit.json'),
  zippedArchive: true,
  maxFiles: LOG_RETENTION_DAYS_LONG, // 30일간 보관
  maxSize: LOG_MAX_SIZE_DEFAULT, // 로그 파일당 최대 크기
  format: jsonFormat,
};

// Content Sync 스케줄러 로그 - content-sync.log
const contentSyncLogOptions = {
  level: 'info',
  datePattern: 'YYYY-MM-DD',
  dirname: logDir,
  filename: 'content-sync.log',
  auditFile: path.join(auditDir, 'content-sync-audit.json'),
  zippedArchive: true,
  maxFiles: LOG_RETENTION_DAYS_LONG, // 30일간 보관
  maxSize: LOG_MAX_SIZE_EXCEPTION, // 스케줄러 로그는 덜 빈번하므로 50MB
  format: jsonFormat,
};

// 예외 로그 - exception.log (미처리 예외 전용)
const exceptionLogOptions = {
  level: 'error',
  datePattern: 'YYYY-MM-DD',
  dirname: logDir,
  filename: 'exception.log',
  auditFile: path.join(auditDir, 'exception-audit.json'),
  zippedArchive: true,
  maxFiles: LOG_RETENTION_DAYS_LONG, // 30일간 보관
  maxSize: LOG_MAX_SIZE_EXCEPTION, // 예외 로그는 덜 빈번하므로 50MB로 제한
  format: jsonFormat,
};

// Promise rejection 로그 - rejection.log
const rejectionLogOptions = {
  level: 'error',
  datePattern: 'YYYY-MM-DD',
  dirname: logDir,
  filename: 'rejection.log',
  auditFile: path.join(auditDir, 'rejection-audit.json'),
  zippedArchive: true,
  maxFiles: LOG_RETENTION_DAYS_LONG, // 30일간 보관
  maxSize: LOG_MAX_SIZE_EXCEPTION, // Rejection 로그도 덜 빈번하므로 50MB로 제한
  format: jsonFormat,
};

// ============================================================================
// Console Format (개발 환경용 - NestJS 스타일)
// ============================================================================
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.ms(),
  nestWinstonModuleUtilities.format.nestLike('sttEdit', {
    colors: true,
    prettyPrint: true,
  }),
);

// ============================================================================
// Winston Logger 인스턴스
// ============================================================================
export const winstonLogger = WinstonModule.createLogger({
  transports: [
    // Console (개발: silly, 프로덕션: info)
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'silly',
      format: consoleFormat,
    }),
    // 전체 로그 파일 (JSON)
    new winstonDaily(appLogOptions),
    // 에러 로그 파일 (JSON)
    new winstonDaily(errorLogOptions),
  ],
  // 미처리 예외 핸들러 (uncaughtException)
  exceptionHandlers: [
    new winstonDaily(exceptionLogOptions),
    ...(process.env.NODE_ENV !== 'production'
      ? [
          new winston.transports.Console({
            format: consoleFormat,
          }),
        ]
      : []),
  ],
  // 미처리 Promise rejection 핸들러 (unhandledRejection)
  rejectionHandlers: [
    new winstonDaily(rejectionLogOptions),
    ...(process.env.NODE_ENV !== 'production'
      ? [
          new winston.transports.Console({
            format: consoleFormat,
          }),
        ]
      : []),
  ],
  // 예외 발생 시 프로세스 종료 (PM2/Docker가 자동 재시작)
  // false로 설정 시 비정상 상태로 계속 실행되어 리소스 누수 및 데이터 손상 위험
  exitOnError: true,
});

// ============================================================================
// Security Logger (보안 이벤트 전용)
// ============================================================================
export const securityLogger = winston.createLogger({
  transports: [
    new winstonDaily(securityLogOptions),
    // 프로덕션이 아닌 경우 콘솔에도 출력
    ...(process.env.NODE_ENV !== 'production'
      ? [
          new winston.transports.Console({
            level: 'info',
            format: consoleFormat,
          }),
        ]
      : []),
  ],
});

// ============================================================================
// Content Sync Logger (스케줄러 전용)
// ============================================================================
export const contentSyncLogger = winston.createLogger({
  transports: [
    new winstonDaily(contentSyncLogOptions),
    ...(process.env.NODE_ENV !== 'production'
      ? [
          new winston.transports.Console({
            level: 'info',
            format: consoleFormat,
          }),
        ]
      : []),
  ],
});

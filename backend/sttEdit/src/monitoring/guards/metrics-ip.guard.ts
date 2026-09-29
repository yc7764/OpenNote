import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

/**
 * Metrics 엔드포인트 IP 화이트리스트 Guard
 *
 * /metrics 엔드포인트에 대한 접근을 허용된 IP 주소로 제한합니다.
 * Prometheus scraper 또는 내부 모니터링 시스템만 접근 가능하도록 합니다.
 *
 * 환경 변수:
 * - METRICS_ALLOWED_IPS: 쉼표로 구분된 허용 IP 목록 (기본값: 127.0.0.1,::1)
 * - METRICS_ENABLED: 메트릭 엔드포인트 활성화 여부 (기본값: true)
 *
 * 지원 형식:
 * - IPv4: 192.168.1.100
 * - IPv6: ::1, ::ffff:127.0.0.1
 * - CIDR: 192.168.1.0/24, 10.0.0.0/8
 *
 * 참고:
 * - 항상 socket.remoteAddress를 사용하여 직접 연결된 클라이언트 IP만 신뢰
 * - 프록시 헤더(X-Forwarded-For 등)는 처리하지 않음 (헤더 스푸핑 방지)
 */
@Injectable()
export class MetricsIpGuard implements CanActivate {
  private readonly logger = new Logger(MetricsIpGuard.name);
  private readonly allowedIps: string[];
  private readonly allowedCidrs: { ip: number; mask: number }[];
  private readonly metricsEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    // 환경 변수에서 허용 IP 목록 로드
    const allowedIpsEnv = this.configService.get<string>(
      'METRICS_ALLOWED_IPS',
      '127.0.0.1,::1,::ffff:127.0.0.1',
    );

    this.metricsEnabled = this.configService.get<boolean>(
      'METRICS_ENABLED',
      true,
    );

    // IP와 CIDR 분리
    const entries = allowedIpsEnv.split(',').map((ip) => ip.trim());
    this.allowedIps = [];
    this.allowedCidrs = [];

    for (const entry of entries) {
      if (entry.includes('/')) {
        // CIDR 표기법
        const parsed = this.parseCidr(entry);
        if (parsed) {
          this.allowedCidrs.push(parsed);
        }
      } else {
        this.allowedIps.push(entry);
      }
    }

    this.logger.log(
      `Metrics IP Guard initialized - Allowed IPs: ${this.allowedIps.join(', ')}` +
        (this.allowedCidrs.length > 0
          ? `, CIDRs: ${entries.filter((e) => e.includes('/')).join(', ')}`
          : ''),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    // 메트릭이 비활성화된 경우 모든 요청 거부
    if (!this.metricsEnabled) {
      throw new ForbiddenException('Metrics endpoint is disabled');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.getClientIp(request);

    if (!clientIp) {
      this.logger.warn('Could not determine client IP address');
      throw new ForbiddenException('Access denied');
    }

    const isAllowed = this.isIpAllowed(clientIp);

    if (!isAllowed) {
      this.logger.warn(`Metrics access denied for IP: ${clientIp}`);
      throw new ForbiddenException('Access denied');
    }

    return true;
  }

  /**
   * 클라이언트 IP 주소 추출 (직접 연결만 지원)
   *
   * 보안 고려사항:
   * - socket.remoteAddress만 사용하여 직접 연결된 클라이언트 IP만 신뢰
   * - 프록시 헤더(X-Forwarded-For, X-Real-IP)는 처리하지 않음
   * - 헤더 스푸핑 공격 원천 차단
   *
   * 아키텍처:
   * - Prometheus가 백엔드 서비스에 직접 접근 (Nginx 우회)
   * - 프록시 환경이 아니므로 헤더 처리 불필요
   */
  private getClientIp(request: Request): string | undefined {
    return request.socket?.remoteAddress;
  }

  /**
   * IP 주소가 허용 목록에 있는지 확인
   */
  private isIpAllowed(clientIp: string): boolean {
    // IPv4-mapped IPv6 주소 정규화 (::ffff:127.0.0.1 -> 127.0.0.1)
    const normalizedIp = this.normalizeIp(clientIp);

    // 정확한 IP 매칭
    if (this.allowedIps.includes(clientIp)) {
      return true;
    }

    // 정규화된 IP 매칭
    if (normalizedIp !== clientIp && this.allowedIps.includes(normalizedIp)) {
      return true;
    }

    // CIDR 매칭
    for (const cidr of this.allowedCidrs) {
      if (this.isIpInCidr(normalizedIp, cidr)) {
        return true;
      }
    }

    return false;
  }

  /**
   * IP 주소 정규화 (IPv4-mapped IPv6 -> IPv4)
   */
  private normalizeIp(ip: string): string {
    // ::ffff:127.0.0.1 형식을 127.0.0.1로 변환
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  }

  /**
   * CIDR 표기법 파싱
   */
  private parseCidr(cidr: string): { ip: number; mask: number } | null {
    const [ipStr, maskStr] = cidr.split('/');
    const mask = parseInt(maskStr, 10);

    if (isNaN(mask) || mask < 0 || mask > 32) {
      this.logger.warn(`Invalid CIDR mask: ${cidr}`);
      return null;
    }

    const ip = this.ipToNumber(ipStr);
    if (ip === null) {
      this.logger.warn(`Invalid CIDR IP: ${cidr}`);
      return null;
    }

    return { ip, mask };
  }

  /**
   * IPv4 주소를 숫자로 변환
   */
  private ipToNumber(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) {
      return null;
    }

    let result = 0;
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255) {
        return null;
      }
      result = (result << 8) + num;
    }

    return result >>> 0; // unsigned 32-bit
  }

  /**
   * IP가 CIDR 범위에 속하는지 확인
   */
  private isIpInCidr(
    ip: string,
    cidr: { ip: number; mask: number },
  ): boolean {
    const ipNum = this.ipToNumber(ip);
    if (ipNum === null) {
      return false;
    }

    const maskBits = ~((1 << (32 - cidr.mask)) - 1) >>> 0;
    return (ipNum & maskBits) === (cidr.ip & maskBits);
  }
}

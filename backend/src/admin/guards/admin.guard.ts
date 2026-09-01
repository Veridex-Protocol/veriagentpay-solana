import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AdminService } from '../admin.service';
import * as jwt from 'jsonwebtoken';
import { ADMIN_JWT_SECRET } from '../../config/secrets';

/**
 * Admin authentication.
 *
 * A verified `admin_token` is the only accepted credential. The previous
 * implementation fell back, when no token was present, to trusting an
 * `x-admin-email` or `x-wallet-address` header and checking it against the
 * whitelist — which made *knowing an admin's email address* sufficient for full
 * administrative access, with no environment gate on the branch.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-009
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly adminService: AdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    const adminCookie = request.cookies ? request.cookies['admin_token'] : null;

    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : adminCookie;

    if (!token) {
      throw new UnauthorizedException('Access Denied: Admin authentication token required');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, ADMIN_JWT_SECRET, { issuer: 'veriagent-admin-auth' });
    } catch {
      throw new UnauthorizedException('Access Denied: Invalid or expired admin token');
    }

    if (decoded?.role !== 'admin') {
      throw new ForbiddenException('Access Denied: Invalid role claims');
    }

    const identifier = decoded.email || decoded.sub;
    if (typeof identifier !== 'string' || !identifier) {
      throw new UnauthorizedException('Access Denied: Admin token missing subject');
    }

    if (!(await this.adminService.isWhitelisted('email', identifier))) {
      throw new UnauthorizedException('Access Denied: Account not present in Admin Whitelist');
    }

    request.admin = { identifier, role: decoded.role };
    return true;
  }
}

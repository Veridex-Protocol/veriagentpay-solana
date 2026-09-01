import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
import { ADMIN_JWT_SECRET } from '../../config/secrets';

/**
 * Admin role enforcement.
 *
 * Two rules, both previously violated:
 *
 * 1. **The role comes from the database, never from the token.** The old code
 *    read `decoded.adminRole` — a claim in the caller-supplied JWT — when no
 *    `Admin` row existed.
 * 2. **No implicit privilege.** The old code defaulted a missing role to
 *    `AdminRole.SUPER_ADMIN`, which then short-circuits every role gate. An
 *    unprovisioned account therefore received maximum privilege rather than
 *    none. An account with no `Admin` row is now refused outright.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-009
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    const adminCookie = request.cookies ? request.cookies['admin_token'] : null;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : adminCookie;

    if (!token) {
      throw new UnauthorizedException('Admin authentication token required');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, ADMIN_JWT_SECRET, { issuer: 'veriagent-admin-auth' });
    } catch {
      throw new UnauthorizedException('Invalid or expired admin token');
    }

    if (decoded?.role !== 'admin') {
      throw new ForbiddenException('Access Denied: Admin authorization required');
    }

    const identifier = decoded.email || decoded.sub;
    if (typeof identifier !== 'string' || !identifier) {
      // Previously `email.toLowerCase()` on an absent claim threw a TypeError,
      // surfacing as a 500 rather than a 401.
      throw new UnauthorizedException('Admin token missing subject');
    }

    const normalized = identifier.toLowerCase();
    const admin = await this.prisma.admin.findFirst({
      where: {
        OR: [{ email: normalized }, { identifiers: { some: { value: normalized } } }],
      },
    });

    // No provisioned record → no privileges. Fail closed.
    if (!admin) {
      throw new ForbiddenException('Access Denied: Admin account not provisioned');
    }

    request.admin = { id: admin.id, email: admin.email, role: admin.role };

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // SUPER_ADMIN has unrestricted permission across all role gates — but only
    // when the database says so.
    if (admin.role === AdminRole.SUPER_ADMIN) {
      return true;
    }

    if (!requiredRoles.includes(admin.role)) {
      throw new ForbiddenException(`Access Denied: Requires one of roles: [${requiredRoles.join(', ')}]`);
    }

    return true;
  }
}

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { toUserMessage } from '../user-error.util';

/**
 * Converts any unhandled error into a clean HTTP response.
 *
 * Without this, an unexpected throw — a non-finite `amount` reaching
 * `ethers.parseUnits`, a malformed payload deep in a library surfaced to the
 * caller as a 500 carrying a stack trace, which discloses file paths, package
 * versions and internal structure.
 *
 * The stack is logged server-side and never sent to the client.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-017
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 5xx is our bug and gets a stack; 4xx is the caller's and gets a line.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
      );
    }

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Some payment paths deliberately attach a small, user-actionable code to
    // the exception (for example a missing on-chain session grant). Preserve
    // only these safe codes so the client can launch the correct passkey flow
    // instead of reducing every refusal to an opaque generic error.
    const exceptionCode =
      (typeof body === 'object' && body !== null ? (body as any).code : undefined) ??
      (exception as any)?.code;
    const safeCode = ['SESSION_KEY_REQUIRED', 'SESSION_EXPIRED', 'SESSION_BYPASSED_BIOMETRICS_REQUIRED']
      .includes(exceptionCode)
      ? exceptionCode
      : undefined;

    const rawMessage = typeof body === 'string' ? body : (body as any).message ?? body;
    const message = Array.isArray(rawMessage)
      ? rawMessage.map((item) => toUserMessage({ message: String(item) }, 'The request could not be completed.'))
      : toUserMessage(
          { message: typeof rawMessage === 'string' ? rawMessage : String(rawMessage) },
          status >= HttpStatus.INTERNAL_SERVER_ERROR
            ? 'Something went wrong on our side. Please try again.'
            : 'The request could not be completed.',
        );

    response.status(status).json({
      statusCode: status,
      message,
      ...(safeCode ? { code: safeCode, requirePasskey: (exception as any)?.requirePasskey === true } : {}),
      timestamp: new Date().toISOString(),
    });
  }
}

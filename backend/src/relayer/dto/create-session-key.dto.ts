import { IsNumber, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';

/**
 * Body of `POST /api/session-keys`.
 *
 * A class, not an interface: interfaces are erased at compile time, so the
 * global `ValidationPipe` sees no metadata and lets the body through unchecked
 * — including undeclared properties and unbounded numbers on an endpoint that
 * sets spending authority.
 *
 * @see docs/security-remediation-plan.md — BE-H-05, BE-H-10
 */
export class CreateSessionKeyDto {
  /** Session lifetime. Bounded at 30 days, matching the registry's own cap. */
  @IsNumber()
  @Min(1)
  @Max(30 * 24 * 60)
  durationMinutes!: number;

  /** Per-payment ceiling in USD. */
  @IsNumber()
  @Min(0.01)
  @Max(1_000_000)
  maxValue!: number;

  /**
   * Daily ceiling in USD. Defaults to {@link maxValue} when omitted.
   *
   * Separate from the per-payment figure. Both were previously set from
   * `maxValue`, which silently reduced a user's daily allowance to the value of
   * one payment.
   */
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1_000_000)
  dailyLimitUSD?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;
}

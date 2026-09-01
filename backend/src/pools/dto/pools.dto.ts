import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Bodies for the group-pool endpoints.
 *
 * Classes, not interfaces. Interfaces are erased at compile time, so the global
 * `ValidationPipe` had no metadata to act on and every one of these endpoints
 * accepted an unbounded, unchecked body — no ceiling on `amount`, no limit on
 * `members[]`, no bound on `interestRate` or loan duration, on endpoints that
 * move money.
 *
 * Bounds are deliberately generous; the point is that one exists, so a typo or
 * a hostile client cannot request a hundred-year loan or a million-member pool.
 *
 * @see docs/security-remaining-issues.md — BE-H-05
 */

/** Upper bound on pool size, matching what the contract can iterate affordably. */
const MAX_POOL_MEMBERS = 100;

export class CreatePoolDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  token?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_POOL_MEMBERS)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  members?: string[];

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(10_000_000)
  targetAmount?: number;

  /** Annual percentage. Bounded so a mistyped value cannot produce absurd interest. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  inviteMessage?: string;
}

export class RequestLoanDto {
  @IsNumber()
  @IsPositive()
  @Max(10_000_000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  purpose?: string;

  /** Capped at two years. The contract enforces no maximum of its own (SC-M-03). */
  @IsInt()
  @Min(1)
  @Max(730)
  durationDays!: number;
}

/** Deposit, withdraw, and repay all take a single bounded amount. */
export class AmountDto {
  @IsNumber()
  @IsPositive()
  @Max(10_000_000)
  amount!: number;
}

export class VoteDto {
  @IsBoolean()
  approve!: boolean;
}

export class ExtensionDto {
  @IsInt()
  @Min(1)
  @Max(365)
  additionalDays!: number;
}

export class AddMembersDto {
  @IsArray()
  @ArrayMaxSize(MAX_POOL_MEMBERS)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  members!: string[];
}

/** Bounded pagination for list endpoints. */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

import {
  IsString,
  IsNumber,
  IsPositive,
  Max,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

/**
 * Body of `POST /api/relay/transfer`.
 *
 * A class, not an interface: TypeScript interfaces are erased at compile time,
 * so the global `ValidationPipe` has no metadata to work with and passes the
 * body through untouched. Only a decorated class actually engages `whitelist` /
 * `forbidNonWhitelisted`, which is what rejects undeclared properties.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-017
 */
export class TransferDto {
  /** Solana base58 address or an `@handle`. */
  @IsString()
  @MaxLength(128)
  to!: string;

  @IsString()
  @Matches(/^(USDC|SOL)$/i, { message: 'token must be USDC or SOL on Solana' })
  token!: string;

  /**
   * Bounded so a non-finite or absurd value cannot reach
   * `ethers.parseUnits`, where it throws deep in the library and surfaces as an
   * unhandled 500 rather than a 400.
   */
  @IsNumber({ maxDecimalPlaces: 9 })
  @IsPositive()
  @Max(1_000_000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

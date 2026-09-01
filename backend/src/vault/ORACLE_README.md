# zkTLS Oracle Worker - Documentation

## Overview

The `ZkTlsOracleWorker` is a critical backend service responsible for fetching real-time APY (Annual Percentage Yield) data from external DeFi protocols and submitting cryptographically verified attestations to the on-chain `VeridexOracle` smart contract.

## Architecture

### Data Flow
```
External APIs → Oracle Worker → Composite APY Calculation → On-Chain Attestation
   (Ethena)         (Circuit Breaker)     (Weighted Average)      (BOTChain)
   (Aave)           (Retry Logic)
   (Sky/Maker)      (Caching)
```

### Integrated Protocols

1. **Ethena (sUSDe Staking)** - 50% weight
   - Endpoint: `https://ethena.fi/api/yields/protocol-and-staking-yield`
   - Auth: Optional Bearer token via `ETHENA_API_KEY`
   - Fallback APY: 10.5%

2. **Aave V3 (USDC Supply)** - 20% weight
   - Primary: `https://aave-api-v2.aave.com/data/liquidity/v3`
   - Fallback: `https://aave-api-v2.aave.com/data/markets-data`
   - Auth: Public API (no key required)
   - Fallback APY: 6.2%

3. **Sky/Maker (DSR)** - 30% weight
   - Currently static (8.0%)
   - TODO: Implement Maker DSR API integration

## Resilience Features

### 1. Circuit Breaker Pattern

The circuit breaker prevents cascading failures by temporarily halting requests to failing APIs:

- **Threshold**: 3 consecutive failures
- **Cooldown Period**: 5 minutes
- **Behavior**: Uses cached APY during cooldown, then attempts to close circuit

**States:**
- `CLOSED` (normal): All requests pass through
- `OPEN` (failed): Requests blocked, cached value used
- `HALF_OPEN` (cooling): After timeout, single test request allowed

### 2. Exponential Backoff Retry

Failed requests are automatically retried with increasing delays:

- **Max Retries**: 2 attempts
- **Base Delay**: 1 second
- **Backoff Formula**: `delay = baseDelay * 2^attempt`
- **Total Max Time**: ~3 seconds per API call

### 3. Stale Data Handling

Cached APY values are used when APIs fail:

- **Max Cache Age**: 24 hours
- **Fresh Data Preferred**: Always attempts fresh fetch first
- **Fallback Chain**: Fresh API → Cached (if < 24h) → Hardcoded Default

### 4. Independent Protocol Failures

Each protocol operates independently:
- If Ethena fails, Aave and Sky still contribute to composite APY
- Oracle continues to function with partial data
- Composite APY calculation uses last known good values

## Configuration

### Environment Variables

```bash
# Required - Blockchain Configuration
BOTCHAIN_RPC_URL="https://rpc.bohr.life/"
PROVER_PRIVATE_KEY="0x..." # Private key with oracle update permissions
VERIDEX_ORACLE_ADDRESS="0x..." # On-chain oracle contract
AGENT_VAULT_ADDRESS="0x..." # Vault contract to update

# Optional - API Authentication
ETHENA_API_KEY="" # Ethena API key for higher rate limits
```

### Timing Configuration

```typescript
// Scheduled Attestation (full update)
@Cron(CronExpression.EVERY_12_HOURS) // 00:00, 12:00 daily

// Fluctuation Check (conditional update)
@Cron('0 */10 * * * *') // Every 10 minutes
```

### Tunable Constants

Located in `zktls-oracle.worker.ts`:

```typescript
CIRCUIT_BREAKER_THRESHOLD = 3      // Failures before opening
CIRCUIT_BREAKER_COOLDOWN_MS = 300000 // 5 minutes
MAX_CACHE_AGE_MS = 86400000        // 24 hours
REQUEST_TIMEOUT_MS = 8000          // 8 seconds
MAX_RETRIES = 2                    // Retry attempts
RETRY_DELAY_MS = 1000              // Base delay
```

## API Endpoints

### Health Check

**GET** `/api/oracle/status`

Returns the current status of the oracle worker and all integrated protocols.

**Response:**
```json
{
  "status": "healthy",
  "compositeApy": 8.75,
  "lastAttestation": "2026-07-28T06:00:00.000Z",
  "protocols": [
    {
      "name": "ethena",
      "apy": 10.5,
      "lastSuccessfulFetch": "2026-07-28T05:55:00.000Z",
      "consecutiveFailures": 0,
      "circuitBreakerOpen": false,
      "cacheAgeMinutes": 5
    },
    {
      "name": "aave",
      "apy": 6.2,
      "lastSuccessfulFetch": "2026-07-28T05:30:00.000Z",
      "consecutiveFailures": 2,
      "circuitBreakerOpen": false,
      "lastError": "HTTP 429 - Rate limit exceeded",
      "cacheAgeMinutes": 30
    },
    {
      "name": "sky",
      "apy": 8.0,
      "lastSuccessfulFetch": "2026-07-28T05:55:00.000Z",
      "consecutiveFailures": 0,
      "circuitBreakerOpen": false,
      "cacheAgeMinutes": 5
    }
  ]
}
```

**Status Values:**
- `healthy`: At least one protocol has fresh data (< 24h old) and no open circuits
- `degraded`: All protocols have stale data or open circuit breakers

## Monitoring & Alerts

### Log Levels

The oracle worker uses structured logging:

```typescript
✅ LOG: Successful operations
⚠️  WARN: API failures, using cached data
🔴 ERROR: Circuit breaker opened, critical failures
🔍 DEBUG: Detailed execution flow (development only)
```

### Key Log Messages

**Success:**
```
✅ ethena APY fetched: 10.50%
✅ Attestation successfully committed. Tx Hash: 0x123...
```

**Failures:**
```
⚠️  ethena API fetch failed (attempt 1/3): HTTP 403 - Forbidden
🔴 Circuit breaker OPENED for ethena after 3 consecutive failures. Cooldown: 300000ms
⚠️  ethena cached APY is stale (25h old). Using fallback default.
```

**Fluctuation Detection:**
```
APY fluctuation detected (75 bps). Triggering out-of-band update.
APY within stable range (8.50%). No out-of-band update needed.
```

### Metrics to Monitor

1. **API Success Rate**: Track `consecutiveFailures` per protocol
2. **Circuit Breaker State**: Alert when `circuitBreakerOpen = true`
3. **Cache Age**: Warn when `cacheAgeMinutes > 1440` (24 hours)
4. **Attestation Frequency**: Monitor `lastAttestation` timestamp
5. **APY Volatility**: Track `compositeApy` fluctuations

### Recommended Alerts

```yaml
# Alert: Circuit Breaker Opened
condition: protocols[*].circuitBreakerOpen == true
severity: HIGH
action: Investigate API endpoint and credentials

# Alert: Stale Data
condition: protocols[*].cacheAgeMinutes > 1440
severity: MEDIUM
action: Check network connectivity and API status

# Alert: No Recent Attestations
condition: now() - lastAttestation > 13 hours
severity: HIGH
action: Check oracle worker logs and prover wallet balance
```

## Troubleshooting

### Common Issues

#### 1. Ethena 403 Forbidden

**Cause**: API key missing or invalid

**Solution:**
```bash
# Add to .env
ETHENA_API_KEY="your-api-key-here"

# Obtain key from https://ethena.fi/developers
```

#### 2. Aave Generic Error / Timeout

**Cause**: Rate limiting or endpoint changes

**Solution:**
- Check Aave API status: https://docs.aave.com/developers/
- Worker automatically tries multiple endpoints
- Increase `REQUEST_TIMEOUT_MS` if network is slow
- Wait for circuit breaker cooldown to reset

#### 3. Circuit Breaker Stuck Open

**Cause**: Persistent API failures

**Solution:**
```bash
# Check oracle status
curl http://localhost:3001/api/oracle/status

# Wait for cooldown (5 minutes)
# Circuit will automatically attempt to close

# If still failing, check logs for root cause
```

#### 4. On-Chain Transaction Failures

**Cause**: Insufficient gas, nonce issues, or permissions

**Solution:**
```bash
# Check prover wallet balance
# Ensure PROVER_PRIVATE_KEY has oracle update permissions
# Verify VERIDEX_ORACLE_ADDRESS is correct
```

### Debug Mode

Enable verbose logging in development:

```typescript
// In zktls-oracle.worker.ts
this.logger.debug(`Detailed debug message`);
```

Logs will show:
- Retry attempts with delays
- Full API response bodies (truncated)
- Circuit breaker state transitions
- Cached value usage decisions

## Testing

### Manual Testing

Test individual protocol fetches:

```bash
# Test Ethena API (with optional auth)
curl -H "Authorization: Bearer YOUR_KEY" \
  https://ethena.fi/api/yields/protocol-and-staking-yield

# Test Aave API
curl https://aave-api-v2.aave.com/data/liquidity/v3

# Check oracle status
curl http://localhost:3001/api/oracle/status
```

### Unit Testing

```typescript
// Example test structure
describe('ZkTlsOracleWorker', () => {
  it('should handle Ethena API failure gracefully', async () => {
    // Mock axios to return 403
    // Verify circuit breaker opens after threshold
    // Verify cached value is used
  });

  it('should calculate correct composite APY', () => {
    // Test weighted average: 50% Ethena, 30% Sky, 20% Aave
    // ethena=10, sky=8, aave=6 → (10*0.5)+(8*0.3)+(6*0.2) = 8.6
  });

  it('should trigger update on 50bps fluctuation', () => {
    // Test that onlyIfFluctuates logic works correctly
  });
});
```

## Production Deployment

### Pre-Deployment Checklist

- [ ] `PROVER_PRIVATE_KEY` funded with gas tokens
- [ ] `VERIDEX_ORACLE_ADDRESS` deployed and verified
- [ ] `AGENT_VAULT_ADDRESS` configured correctly
- [ ] `ETHENA_API_KEY` set (optional but recommended)
- [ ] Health check endpoint accessible
- [ ] Monitoring alerts configured
- [ ] Backup prover key stored securely

### Performance Considerations

- **Memory**: Minimal (~10MB), only caches APY values in-memory
- **CPU**: Low, cron jobs run every 10 minutes (fluctuation) or 12 hours (full)
- **Network**: ~3 API calls per execution (< 5KB total data)
- **Blockchain**: 1 transaction per attestation (~200K gas)

### Scaling

The worker is designed for single-instance deployment:
- No distributed coordination required
- Stateless (except in-memory cache)
- Idempotent attestations (duplicate TXs are safe)

For high-availability, run multiple instances with different prover keys and use a shared Redis cache for APY values.

## Security

### API Key Management

```bash
# Never commit API keys
echo "ETHENA_API_KEY=your-key" >> .env
git add .env # ❌ NEVER DO THIS

# Use environment-specific secrets
# Production: AWS Secrets Manager, Vault, etc.
```

### Private Key Security

```bash
# Prover key should have minimal permissions
# Only oracle update role, no fund transfer abilities
# Rotate keys periodically
```

### Rate Limiting

The worker respects API rate limits:
- Exponential backoff on failures
- Circuit breaker prevents spam
- Configurable timeout prevents hanging requests

## Changelog

### v1.1.0 (Current)
- ✅ Added circuit breaker pattern
- ✅ Implemented exponential backoff retry
- ✅ Added stale data handling (24h cache)
- ✅ Improved error logging with detailed messages
- ✅ Created health check endpoint
- ✅ Support for Ethena API authentication
- ✅ Multiple Aave endpoint fallbacks

### v1.0.0 (Original)
- Basic APY fetching from Ethena, Aave, Sky
- Simple error handling with hardcoded fallbacks
- 12-hour scheduled attestations

## Support

For issues or questions:
- Check logs: `tail -f backend/logs/nest.log`
- Oracle status: `GET /api/oracle/status`
- GitHub Issues: [link-to-repo]
- Internal docs: [link-to-confluence]

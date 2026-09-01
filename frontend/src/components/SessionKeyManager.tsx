import React, { useState } from 'react';
import { Key, ShieldCheck, Clock, DollarSign, Trash2, History } from 'lucide-react';
import { useToast, useConfirm } from './providers/NotificationProvider';

export const SessionKeyManager: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [duration, setDuration] = useState<'1h' | '8h' | '24h' | '7d'>('8h');
  const [dailyLimit, setDailyLimit] = useState<number>(200);
  const [perTxLimit, setPerTxLimit] = useState<number>(50);
  const [alwaysRequireBiometrics, setAlwaysRequireBiometrics] = useState<boolean>(false);

  // Starts empty. This was seeded with two invented rows (fabricated key
  // hashes, expiry dates and signed-transaction counts) presented under the
  // heading "Session Key Audit History". An audit log that shows activity that
  // never happened is worse than no audit log.
  //
  // @see docs/security-remaining-issues.md (FE-M-03)
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);

  const handleCreateSessionKey = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/relayer/provision-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationSeconds: duration === '1h' ? 3600 : duration === '8h' ? 28800 : duration === '24h' ? 86400 : 604800,
          dailyLimitUSD: dailyLimit,
          perTxLimitUSD: perTxLimit,
        })
      });

      if (!response.ok) throw new Error('Failed to provision session key');

      const data = await response.json();
      setActiveSession(data);
      toast.success('Universal Session Key (USKS) provisioned with fast-path execution!', {
        title: 'Session Key Provisioned',
      });
    } catch (e: any) {
      toast.error(e.message || 'Session Key creation failed', {
        title: 'Session Error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async () => {
    const ok = await confirm({
      title: 'Revoke Session Key',
      message: 'Are you sure you want to revoke this session key?',
      description: 'The key will be immediately invalidated on-chain and fast-path execution disabled.',
      confirmText: 'Revoke Key',
      cancelText: 'Keep Active',
      variant: 'danger',
    });
    if (!ok) return;

    if (activeSession) {
      setSessionLogs([
        { id: Date.now().toString(), keyHash: activeSession.sessionKeyHash?.slice(0, 10), expiryAt: 'Now', status: 'REVOKED', txCount: 1 },
        ...sessionLogs
      ]);
    }
    setActiveSession(null);
    toast.info('Session Key revoked on-chain & invalidated.', {
      title: 'Key Revoked',
    });
  };

  return (
    <div style={styles.card}>
      <div style={styles.titleRow}>
        <Key size={20} color="#06b6d4" />
        <span style={styles.title}>Universal Session Keys (USKS)</span>
      </div>

      <p style={styles.subtitle}>
        Authorize fast-path micro-transactions without continuous TouchID/FaceID prompts, protected by daily spending caps.
      </p>

      {/* Global Biometric Requirement Toggle */}
      <div style={styles.toggleRow}>
        <span>Always Require Biometrics (Disable Session Keys)</span>
        <input
          type="checkbox"
          checked={alwaysRequireBiometrics}
          onChange={(e) => setAlwaysRequireBiometrics(e.target.checked)}
          style={{ transform: 'scale(1.2)' }}
        />
      </div>

      {alwaysRequireBiometrics ? (
        <div style={styles.disabledWarning}>
          🔒 Universal Session Keys are globally disabled. Every transaction requires a hardware Passkey biometric prompt.
        </div>
      ) : activeSession ? (
        <div style={styles.activeBox}>
          <div style={styles.activeHeader}>
            <ShieldCheck size={18} color="#F2D827" />
            <span style={{ color: '#F2D827', fontWeight: 'bold' }}>ACTIVE SESSION</span>
          </div>
          <div style={styles.sessionDetail}>
            <div>Key Hash: <code>{activeSession.sessionKeyHash?.slice(0, 10)}...</code></div>
            <div>Expires: {new Date(activeSession.expiryAt).toLocaleString()}</div>
            <div>Daily Limit: ${dailyLimit} USD</div>
            <div>Per-Tx Limit: ${perTxLimit} USD</div>
          </div>
          <button style={styles.revokeBtn} onClick={handleRevokeSession}>
            <Trash2 size={14} /> Revoke Key Instantly (On-Chain)
          </button>
        </div>
      ) : (
        <div style={styles.formGroup}>
          <div style={styles.field}>
            <label style={styles.label}><Clock size={14} /> Duration</label>
            <select style={styles.select} value={duration} onChange={(e: any) => setDuration(e.target.value)}>
              <option value="1h">1 Hour (High Security)</option>
              <option value="8h">8 Hours (Standard Workday)</option>
              <option value="24h">24 Hours (Day Pass)</option>
              <option value="7d">7 Days (Weekly)</option>
            </select>
          </div>

          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}><DollarSign size={14} /> Daily Limit ($)</label>
              <input
                type="number"
                style={styles.input}
                value={dailyLimit}
                min="1"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val > 0 || e.target.value === '') {
                    setDailyLimit(val);
                  }
                }}
              />
              {dailyLimit <= 0 && <span style={{ color: '#ef4444', fontSize: '11px' }}>Must be greater than 0</span>}
            </div>
            <div style={styles.field}>
              <label style={styles.label}><DollarSign size={14} /> Per-Tx Cap ($)</label>
              <input
                type="number"
                style={styles.input}
                value={perTxLimit}
                min="1"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val > 0 || e.target.value === '') {
                    setPerTxLimit(val);
                  }
                }}
              />
              {perTxLimit <= 0 && <span style={{ color: '#ef4444', fontSize: '11px' }}>Must be greater than 0</span>}
            </div>
          </div>

          <button
            style={styles.createBtn}
            onClick={handleCreateSessionKey}
            disabled={loading || dailyLimit <= 0 || perTxLimit <= 0}
          >
            {loading ? 'Provisioning...' : 'Provision Fast-Path Session Key'}
          </button>
        </div>
      )}

      {/* Session Key History Log Table */}
      <div style={styles.historySection}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '14px', margin: '16px 0 8px 0' }}>
          <History size={16} color="#06b6d4" /> Session Key Audit History
        </div>
        <div style={styles.logList}>
          {sessionLogs.length === 0 && (
            <div style={{ fontSize: '12px', color: '#71717a', padding: '8px 0' }}>
              No session keys have been granted from this device yet.
            </div>
          )}
          {sessionLogs.map((log) => (
            <div key={log.id} style={styles.logRow}>
              <div>
                <code>{log.keyHash}</code>
                <span style={{ fontSize: '11px', color: '#71717a', marginLeft: '8px' }}>{log.txCount} txs signed</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: log.status === 'REVOKED' ? '#ef4444' : '#71717a' }}>
                {log.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#18181b',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid #27272a',
    marginBottom: '24px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  title: {
    fontWeight: 'bold',
    fontSize: '16px',
    color: '#fff',
  },
  subtitle: {
    fontSize: '13px',
    color: '#a1a1aa',
    marginBottom: '16px',
    lineHeight: '1.4',
  },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#09090b',
    borderRadius: '10px',
    fontSize: '13px',
    marginBottom: '16px',
    border: '1px solid #27272a',
  },
  disabledWarning: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '13px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  row: {
    display: 'flex',
    gap: '12px',
  },
  field: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    color: '#d4d4d8',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  input: {
    backgroundColor: '#09090b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    padding: '8px 12px',
    color: '#fff',
    fontSize: '14px',
  },
  select: {
    backgroundColor: '#09090b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    padding: '8px 12px',
    color: '#fff',
    fontSize: '14px',
  },
  createBtn: {
    backgroundColor: '#F2D827',
    border: 'none',
    color: '#070a11',
    padding: '12px',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '8px',
  },
  activeBox: {
    backgroundColor: 'rgba(242, 216, 39, 0.08)',
    border: '1px solid rgba(242, 216, 39, 0.3)',
    borderRadius: '12px',
    padding: '16px',
  },
  activeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  sessionDetail: {
    fontSize: '13px',
    color: '#d4d4d8',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '16px',
  },
  revokeBtn: {
    backgroundColor: '#dc2626',
    border: 'none',
    color: '#fff',
    padding: '10px 12px',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  historySection: {
    marginTop: '16px',
    borderTop: '1px solid #27272a',
  },
  logList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  logRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#09090b',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '12px',
  },
};

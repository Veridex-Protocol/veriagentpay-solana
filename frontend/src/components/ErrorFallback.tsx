import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorFallbackProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  title = 'Something went wrong',
  message = 'An unexpected network error occurred while loading data.',
  onRetry,
}) => {
  return (
    <div style={styles.container}>
      <div style={styles.iconBox}>
        <AlertTriangle size={32} color="#ef4444" />
      </div>
      <h3 style={styles.title}>{title}</h3>
      <p style={styles.message}>{message}</p>
      {onRetry && (
        <button style={styles.retryBtn} onClick={onRetry}>
          <RefreshCw size={16} /> Retry Operation
        </button>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '32px 20px',
    backgroundColor: '#18181b',
    borderRadius: '16px',
    border: '1px solid #27272a',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    margin: '20px 0',
  },
  iconBox: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '8px',
  },
  message: {
    fontSize: '14px',
    color: '#a1a1aa',
    maxWidth: '400px',
    marginBottom: '20px',
  },
  retryBtn: {
    backgroundColor: '#27272a',
    border: '1px solid #3f3f46',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: '8px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
};

import React from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No items found',
  description = 'There are no active records available at this moment.',
  actionText,
  onAction,
}) => {
  return (
    <div style={styles.container}>
      <div style={styles.iconBox}>
        <Inbox size={32} color="#71717a" />
      </div>
      <h3 style={styles.title}>{title}</h3>
      <p style={styles.description}>{description}</p>
      {actionText && onAction && (
        <button style={styles.actionBtn} onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '40px 20px',
    backgroundColor: '#18181b',
    borderRadius: '16px',
    border: '1px border-dashed #27272a',
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
    backgroundColor: '#27272a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '6px',
  },
  description: {
    fontSize: '13px',
    color: '#71717a',
    maxWidth: '360px',
    marginBottom: '16px',
  },
  actionBtn: {
    backgroundColor: '#06b6d4',
    border: 'none',
    color: '#09090b',
    padding: '8px 16px',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};

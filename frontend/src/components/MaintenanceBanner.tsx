// Fix: P1-8 Relayer Maintenance Banner Component
'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export function MaintenanceBanner() {
  const [isUnhealthy, setIsUnhealthy] = useState(false);

  useEffect(() => {
    const checkRelayerStatus = async () => {
      try {
        const res = await fetch(`/api/status/relayer`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setIsUnhealthy(data.healthy === false || data.isLow === true);
        }
      } catch (err) {
        // Silent ignore on error
      }
    };

    checkRelayerStatus();
    const interval = setInterval(checkRelayerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!isUnhealthy) return null;

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-center text-amber-300 text-xs font-semibold flex items-center justify-center space-x-2">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
      <span>
        ⚠️ <strong>System Maintenance:</strong> Gas sponsorship relayer is under heavy load. On-chain claims may be temporarily queued.
      </span>
    </div>
  );
}

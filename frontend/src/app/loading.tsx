import React from 'react';
import { VeriAgentLoadingScreen } from '../components/ui/VeriAgentLoader';

export default function Loading() {
  return (
    <VeriAgentLoadingScreen
      title="VeriAgent Pay"
      subtitle="Loading secure agent environment..."
    />
  );
}

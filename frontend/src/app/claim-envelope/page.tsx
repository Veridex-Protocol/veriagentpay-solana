'use client';

import React, { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { VeriAgentLoader } from '../../components/ui/VeriAgentLoader';

function ClaimEnvelopeRedirectContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = searchParams.get('code') || searchParams.get('c');
    const envelopeId = searchParams.get('id') || searchParams.get('envelopeId');

    if (code) {
      router.replace(`/c/${code}`);
    } else if (envelopeId) {
      router.replace(`/envelopes/${envelopeId}`);
    } else {
      router.replace('/');
    }
  }, [searchParams, router]);

  return (
    <VeriAgentLoader
      variant="fullscreen"
      size="md"
      text="Red Envelope"
      subtext="Connecting to smart reward contract..."
      showProgress={true}
    />
  );
}

export default function ClaimEnvelopeRedirectPage() {
  return (
    <Suspense
      fallback={
        <VeriAgentLoader
          variant="fullscreen"
          size="md"
          text="Red Envelope"
          subtext="Resolving claim link..."
          showProgress={true}
        />
      }
    >
      <ClaimEnvelopeRedirectContent />
    </Suspense>
  );
}

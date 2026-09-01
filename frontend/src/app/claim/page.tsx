'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function ClaimRedirectContent() {
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
      router.replace('/pay');
    }
  }, [searchParams, router]);

  return (
    <main className="va-auth-shell p-6"><p className="text-xs font-mono text-[var(--va-app-muted)]">Redirecting to payout link...</p></main>
  );
}

export default function ClaimRedirectPage() {
  return (
    <Suspense fallback={<main className="va-auth-shell p-6"><p className="text-xs font-mono text-[var(--va-app-muted)]">Loading...</p></main>}>
      <ClaimRedirectContent />
    </Suspense>
  );
}

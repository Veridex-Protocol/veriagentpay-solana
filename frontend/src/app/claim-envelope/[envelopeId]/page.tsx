'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { EnvelopeClaimFlow } from '../../../components/envelopes/EnvelopeClaimFlow';

export default function ClaimEnvelopeDynamicPage() {
  const params = useParams<{ envelopeId: string }>();
  return <EnvelopeClaimFlow envelopeId={params?.envelopeId ?? ''} />;
}

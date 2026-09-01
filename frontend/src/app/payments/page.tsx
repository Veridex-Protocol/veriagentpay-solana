import { redirect } from 'next/navigation';

/** Backward-compatible route for links created before history moved to Send. */
export default function PaymentsRedirectPage() {
  redirect('/send#sent-payments');
}

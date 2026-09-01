import NextAuth, { NextAuthOptions } from 'next-auth';

/**
 * NextAuth is retained only so `useSession`/`signOut` callers keep a valid
 * endpoint; it has no providers.
 *
 * Google sign-in was the sole provider and is retired. Its `jwt` callback
 * forwarded the Google `id_token` to `POST /api/auth/google`, which minted a
 * backend access token from an *unverified* `jwt.decode()`, so a hand-written
 * token was enough to become any user. That backend route is gone. Login is
 * passkey-only, via the challenge/verify pair in `lib/api.ts`.
 *
 * With no providers, sessions are always null and every `session &&` guard in
 * the UI degrades to hidden.
 */
const authOptions: NextAuthOptions = {
  providers: [],
  // No literal fallback: a shipped default secret is a known signing key, which
  // would let anyone forge a session cookie the moment providers return.
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

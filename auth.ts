// @/auth.ts
// Auth.js (next-auth v5) configuration. Login is strictly ADDITIVE: the whole
// product works as an anonymous GUEST (signed httpOnly cookie, one free world —
// see @/lib/identity + @/lib/ledger). Sign-in only attaches a returning
// visitor's credits to a stable Google account.
//
// DEGRADES GRACEFULLY: when AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are absent the
// config ships with NO providers, so the app still builds and runs guest-only.
// Nothing here throws at import — a missing AUTH_SECRET falls back to a dev
// value (like ONEIRO_SECRET does) so auth() never crashes the request.
//
// Session strategy is "jwt" (NO database adapter): sessions live entirely in a
// signed cookie, so there is no DB to provision and the guest ledger stays the
// single source of truth for credits.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/** True only when real Google OAuth credentials are present. */
export const authConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

/**
 * Secret for signing the session JWT. Required by Auth.js; the dev fallback
 * (mirroring ONEIRO_SECRET's) only keeps local/guest builds from throwing and
 * gives no real security. In production AUTH_SECRET MUST be set.
 */
function authSecret(): string {
  return process.env.AUTH_SECRET || "oneiro-dev-insecure-auth-secret-change-me";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: authSecret(),
  session: { strategy: "jwt" },
  // No providers when unconfigured: Auth.js still mounts, auth() returns null,
  // and the UI presents sign-in as "connect later" rather than 500ing.
  providers: authConfigured
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
        }),
      ]
    : [],
  callbacks: {
    // Expose a stable account id on the session (JWT `sub`) so downstream
    // identity resolution can prefer it over the anon cookie.
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    // First (and every) sign-in: fold the anon cookie's credits into the
    // account so a guest who later signs in keeps their free/purchased worlds.
    // Best-effort and self-contained — a failure here must never block login.
    async signIn({ user }) {
      if (!user?.email) return;
      try {
        const { cookies } = await import("next/headers");
        const { linkAccount } = await import("@/lib/identity");
        await linkAccount(await cookies(), user.email);
      } catch (err) {
        console.error("[auth] signIn credit-link failed (non-fatal):", err);
      }
    },
  },
});

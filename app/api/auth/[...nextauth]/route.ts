// @/app/api/auth/[...nextauth]/route.ts
// The Auth.js catch-all endpoint (sign-in, callback, csrf, session, sign-out).
// It just re-exports the handlers from @/auth. When auth is unconfigured the
// handlers still mount (no providers) and respond without throwing, so the
// guest app is never affected.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;

import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

const convexUrl = process.env.CONVEX_SERVER_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;

export default convexAuthNextjsMiddleware(undefined, {
  ...(convexUrl === undefined ? {} : { convexUrl }),
  cookieConfig: {
    maxAge: 60 * 60 * 24 * 30,
  },
});

// Only the staff surface needs auth cookies; the landing page and public
// sites stay middleware-free (and cacheable).
export const config = {
  matcher: ["/app/:path*", "/api/auth/:path*"],
};

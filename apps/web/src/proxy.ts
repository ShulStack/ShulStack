import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

const convexUrl = process.env.CONVEX_SERVER_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;

export default convexAuthNextjsMiddleware(undefined, {
  ...(convexUrl === undefined ? {} : { convexUrl }),
  cookieConfig: {
    maxAge: 60 * 60 * 24 * 30,
  },
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

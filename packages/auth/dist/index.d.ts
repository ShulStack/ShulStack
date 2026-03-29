import * as better_auth from 'better-auth';

declare const STAFF_ROLES: readonly ["owner", "executive-director", "finance", "editor", "volunteer"];
declare const auth: better_auth.Auth<{
    baseURL: string;
    database: (options: better_auth.BetterAuthOptions) => better_auth.DBAdapter<better_auth.BetterAuthOptions>;
    emailAndPassword: {
        enabled: true;
    };
    secret: string;
    trustedOrigins: string[];
}>;

export { STAFF_ROLES, auth };

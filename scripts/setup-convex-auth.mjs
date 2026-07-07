// One-time setup for Convex Auth on the current dev deployment: generates an
// RS256 keypair and stores JWT_PRIVATE_KEY, JWKS, and SITE_URL as Convex
// deployment environment variables.
import { spawnSync } from "node:child_process";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

setConvexEnv("JWT_PRIVATE_KEY", privateKey);
setConvexEnv("JWKS", jwks);
setConvexEnv("SITE_URL", process.env.SITE_URL ?? "http://localhost:3000");
console.log("Convex Auth environment variables are set.");

function setConvexEnv(name, value) {
  const result = spawnSync("pnpm", ["convex", "env", "set", "--", name, value], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

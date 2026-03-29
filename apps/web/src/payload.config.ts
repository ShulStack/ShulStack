import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { cmsCollections, cmsGlobals } from "@shulstack/cms";
import { buildConfig } from "payload";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://shulstack:shulstack@127.0.0.1:5432/shulstack";
const payloadSecret =
  process.env.PAYLOAD_SECRET ?? "dev-payload-secret-change-me-before-production";
const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3000";

export default buildConfig({
  secret: payloadSecret,
  editor: lexicalEditor(),
  admin: {
    importMap: {
      baseDir: dirname,
    },
    meta: {
      titleSuffix: "- ShulStack",
    },
    user: "cms-users",
  },
  collections: cmsCollections,
  globals: cmsGlobals,
  db: postgresAdapter({
    pool: {
      connectionString: databaseUrl,
    },
  }),
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  cors: [appOrigin],
  csrf: [appOrigin],
});

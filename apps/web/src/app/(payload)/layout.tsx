import type { ServerFunctionClient } from "payload";

import "@payloadcms/next/css";
import type { ReactNode } from "react";

import "./custom.scss";

type PayloadLayoutProps = {
  children: ReactNode;
};

const serverFunction: ServerFunctionClient = async function serverFunction(args) {
  "use server";

  const { handleServerFunctions } = await import("@payloadcms/next/layouts");
  const config = await import("@payload-config");
  const { importMap } = await import("./admin/importMap.js");

  return handleServerFunctions({
    ...args,
    config: config.default,
    importMap,
  });
};

const PayloadLayout = async ({ children }: PayloadLayoutProps) => {
  const { RootLayout } = await import("@payloadcms/next/layouts");
  const config = await import("@payload-config");
  const { importMap } = await import("./admin/importMap.js");

  return (
    <RootLayout
      config={config.default}
      htmlProps={{ suppressHydrationWarning: true }}
      importMap={importMap}
      serverFunction={serverFunction}
    >
      {children}
    </RootLayout>
  );
};

export default PayloadLayout;

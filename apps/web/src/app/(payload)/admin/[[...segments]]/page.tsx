import config from "@payload-config";
import { generatePageMetadata, RootPage } from "@payloadcms/next/views";
import type { Metadata } from "next";

import { importMap } from "../importMap";

type PageParams = {
  segments?: string[];
};

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  params?: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
};

export const generateMetadata = ({ params, searchParams }: PageProps): Promise<Metadata> => {
  const paramsPromise = Promise.resolve(params).then((resolved) => ({
    ...(resolved ?? {}),
    segments: resolved?.segments ?? [],
  }));
  const searchParamsPromise = Promise.resolve(searchParams).then((resolved) =>
    Object.fromEntries(
      Object.entries(resolved ?? {}).filter((entry): entry is [string, string | string[]] => {
        return entry[1] !== undefined;
      }),
    ),
  );

  return generatePageMetadata({
    config,
    params: paramsPromise,
    searchParams: searchParamsPromise,
  });
};

const Page = ({ params, searchParams }: PageProps) => {
  const paramsPromise = Promise.resolve(params).then((resolved) => ({
    ...(resolved ?? {}),
    segments: resolved?.segments ?? [],
  }));
  const searchParamsPromise = Promise.resolve(searchParams).then((resolved) =>
    Object.fromEntries(
      Object.entries(resolved ?? {}).filter((entry): entry is [string, string | string[]] => {
        return entry[1] !== undefined;
      }),
    ),
  );

  return RootPage({
    config,
    importMap,
    params: paramsPromise,
    searchParams: searchParamsPromise,
  });
};

export default Page;

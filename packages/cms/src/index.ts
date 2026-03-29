import { cmsUsers } from "./collections/cms-users";
import { media } from "./collections/media";
import { pages } from "./collections/pages";
import { siteSettings } from "./globals/site-settings";

export const cmsCollections = [cmsUsers, media, pages];
export const cmsGlobals = [siteSettings];

export { pageLayoutBlocks } from "./blocks/page-layout";

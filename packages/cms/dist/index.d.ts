import * as payload from 'payload';
import { Block } from 'payload';

declare const pageLayoutBlocks: Block[];

declare const cmsCollections: payload.CollectionConfig[];
declare const cmsGlobals: payload.GlobalConfig[];

export { cmsCollections, cmsGlobals, pageLayoutBlocks };

export const SHARED_FEED_ORIGIN='https://sanks-parlay-feed.pages.dev';
export function feedOrigin(document=globalThis.document){
 return document?.querySelector('meta[name="sanks-parlay-feed"]')?.content===SHARED_FEED_ORIGIN?SHARED_FEED_ORIGIN:'';
}

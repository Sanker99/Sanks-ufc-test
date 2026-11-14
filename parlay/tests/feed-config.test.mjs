import {test} from 'node:test';
import assert from 'node:assert/strict';
import {feedOrigin,SHARED_FEED_ORIGIN} from '../feed-config.mjs';
test('browser feed configuration accepts only the dedicated anonymous gateway',()=>{
 assert.equal(feedOrigin(), '');
 assert.equal(feedOrigin({querySelector:()=>({content:SHARED_FEED_ORIGIN})}),SHARED_FEED_ORIGIN);
 assert.equal(feedOrigin({querySelector:()=>({content:'https://unrelated.invalid'})}),'');
});

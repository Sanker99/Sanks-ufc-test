import {gameResponse} from '../../../parlay/live-source.mjs';
export const onRequestGet=context=>gameResponse(context.request);

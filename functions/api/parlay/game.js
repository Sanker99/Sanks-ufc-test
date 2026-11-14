import {feedRequest} from '../../../parlay/demand-gateway.mjs';
export const onRequestGet=context=>feedRequest(context,'/game');

export const onRequestOptions=context=>feedRequest(context,"/game");

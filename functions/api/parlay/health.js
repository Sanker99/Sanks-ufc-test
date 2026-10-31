import {feedRequest} from '../../../parlay/demand-gateway.mjs';
export const onRequestGet=context=>feedRequest(context,'/health');

import {feedRequest} from '../../../parlay/demand-gateway.mjs';
export const onRequestPost=context=>feedRequest(context,'/register');

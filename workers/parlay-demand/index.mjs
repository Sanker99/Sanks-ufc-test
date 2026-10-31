export {DemandCoordinator} from './coordinator.mjs';
export default {
 async fetch(request,env){
  const id=env.DEMAND.idFromName('nfl-free-budget-v1');
  return env.DEMAND.get(id).fetch(request);
 }
};

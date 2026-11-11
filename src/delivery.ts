/** Delivery state is persisted before an external call. A crash or ambiguous error requires operator review. */
export type DeliveryState = {key:string; status:'sending'|'accepted'|'unknown'|'failed'; attempts:number; updatedAt:number; error?:string};
export interface Store { get(key:string):Promise<DeliveryState|null>; put(state:DeliveryState):Promise<void> }
export interface Sender { send(message:string):Promise<void> }
export class KnownNotSent extends Error {}
export class Delivery {
 private active=new Set<string>();
 private store:Store; private sender:Sender; private clock:()=>number;
 constructor(store:Store, sender:Sender, clock:()=>number=Date.now) {this.store=store;this.sender=sender;this.clock=clock;}
 async send(key:string,message:string,manual=false):Promise<DeliveryState> {
  if(this.active.has(key)) throw new Error('Report already being sent');
  this.active.add(key);
  try {
   const prior=await this.store.get(key);
   if(prior && !manual && prior.status!=='failed') return prior;
   const state:DeliveryState={key,status:'sending',attempts:(prior?.attempts||0)+1,updatedAt:this.clock()};
   await this.store.put(state);
   try {await this.sender.send(message); state.status='accepted';}
   catch(e) {state.status=e instanceof KnownNotSent?'failed':'unknown'; state.error=e instanceof Error?e.message:'Unknown error';}
   state.updatedAt=this.clock(); await this.store.put(state);return state;
  } finally {this.active.delete(key);}
 }
}

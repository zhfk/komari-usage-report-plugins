import type {DeliveryState, Store} from './delivery.ts';

/** A filesystem adapter is supplied by the runtime, and must provide atomic rename. */
export interface FileSystem {
  existsSync(path:string):boolean;
  readFileSync(path:string, encoding:'utf8'):string;
  writeFileSync(path:string, data:string, encoding:'utf8'):void;
  renameSync(oldPath:string, newPath:string):void;
}
/** Single-process storage. Never replaces a corrupt state file with empty data. */
export class FileStore implements Store {
  private fs:FileSystem;
  private path:string;
  constructor(fs:FileSystem,path:string) {this.fs=fs;this.path=path;}
  private read():Record<string,DeliveryState> {
    if (!this.fs.existsSync(this.path)) return Object.create(null);
    const parsed:unknown=JSON.parse(this.fs.readFileSync(this.path,'utf8'));
    if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error('Invalid delivery state');
    const records=parsed as Record<string,unknown>;
    const out:Record<string,DeliveryState>=Object.create(null);
    for(const [key,raw] of Object.entries(records)) {
      if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('Invalid delivery record');
      const v=raw as DeliveryState;
      if(v.key!==key || !['sending','accepted','unknown','failed'].includes(v.status) || !Number.isInteger(v.attempts) || v.attempts<1 || !Number.isFinite(v.updatedAt)) throw new Error('Invalid delivery record');
      out[key]=v;
    }
    return out;
  }
  async get(key:string):Promise<DeliveryState|null> {return this.read()[key] ?? null;}
  async put(state:DeliveryState):Promise<void> {
    const records=this.read(); records[state.key]=state;
    const temp=this.path+'.tmp';
    this.fs.writeFileSync(temp,JSON.stringify(records),'utf8');
    this.fs.renameSync(temp,this.path);
  }
}

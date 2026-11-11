import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
export type BusinessTool={name:string;label:string;description:string;parameters:Record<string,unknown>};
export type HarnessRun={maxToolCalls?:number;prompt:string;system:string;model:string;baseUrl:string;apiKey:string;signal:AbortSignal;tools:BusinessTool[];onTool:(name:string,args:Record<string,unknown>)=>Promise<unknown>;onProgress?:(label:string)=>void;onDelta?:(text:string)=>Promise<void>};
export type HarnessRunner=(run:HarnessRun)=>Promise<{text:string;toolCalls:number}>;
export async function loadHarnessRunner():Promise<HarnessRunner|null>{
 const modulePath=process.env.FUNDAPP_HARNESS_MODULE;if(!modulePath)return null;
 if(!isAbsolute(modulePath))throw Error('Invalid server harness module');
 const runner=await import(pathToFileURL(modulePath).href);if(typeof runner.runBusinessHarness!=='function')throw Error('Invalid server harness runtime');return runner.runBusinessHarness;
}

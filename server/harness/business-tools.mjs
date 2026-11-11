import {readFileSync} from 'node:fs';
import {defineTool} from '@deepseek-ai/dsh-tools';
export const name='fundapp-business-tools';
export const inject=['tools','systemPrompt'];
export function apply(ctx){
 ctx.systemPrompt.section({name:'fundapp:business-instructions',order:0,text:readFileSync(process.env.FUNDAPP_SYSTEM_PROMPT_PATH,'utf8'),interpolate:false});
 let queue=Promise.resolve(),failure;
 const send=body=>fetch(process.env.FUNDAPP_TOOL_BRIDGE,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.FUNDAPP_TOOL_TOKEN},body:JSON.stringify(body)}).then(r=>{if(!r.ok)throw Error('stream_stopped');});
 ctx.on('agent/assistant-stream',({frame})=>{if(frame.type==='chunk'&&frame.chunk.type==='text-delta')queue=queue.then(()=>send({event:'text',text:frame.chunk.text})).catch(e=>{failure=e;});});
 ctx.on('agent/turn-stopping',async()=>{await queue;if(failure)throw failure;});
 const definitions=JSON.parse(process.env.FUNDAPP_TOOL_DEFINITIONS??'[]');
 for(const definition of definitions)ctx.tools.register(defineTool({...definition,output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},async execute(args,exec){
  const response=await fetch(process.env.FUNDAPP_TOOL_BRIDGE,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.FUNDAPP_TOOL_TOKEN},body:JSON.stringify({name:definition.name,args}),signal:exec.signal});
  if(!response.ok){const failure=await response.json().catch(()=>null);throw Error(typeof failure?.message==='string'?failure.message:'业务步骤未成功，请核对当前条件后重试，不能宣称已办理。');}return JSON.stringify(await response.json());
 }}));
}

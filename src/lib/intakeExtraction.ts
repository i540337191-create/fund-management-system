export async function waitForIntakeExtraction<T>(extract:()=>Promise<T>,active:()=>boolean,wait:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<T|undefined>{
 for(let attempt=0;attempt<40&&active();attempt++){
  try{return await extract();}catch(error){if((error as {code?:string}).code!=='extraction_pending'||attempt===39)throw error;}
  await wait(1500);
 }
}

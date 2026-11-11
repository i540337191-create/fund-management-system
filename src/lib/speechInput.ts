type Recognition={lang:string;interimResults:boolean;onresult:((event:any)=>void)|null;onerror:((event:any)=>void)|null;onend:(()=>void)|null;start:()=>void;abort:()=>void};
export function startSpeechInput(RecognitionClass:(new()=>Recognition)|undefined,options:{current:()=>boolean;append:(text:string)=>void;notice:(text:string)=>void;listening:(active:boolean)=>void}){
 if(!RecognitionClass){options.notice('当前浏览器不支持语音输入，可输入文字或上传录音整理。');return null;}
 const recognition=new RecognitionClass();let ended=false,received=false,failed=false;
 const active=()=>!ended&&options.current();
 recognition.lang='zh-CN';recognition.interimResults=false;
 recognition.onresult=event=>{if(!active())return;const text=Array.from(event.results??[]).map((row:any)=>row[0]?.transcript??'').join('').trim();if(text){received=true;options.append(text);options.notice('语音已填入，请核对后发送。');}};
 recognition.onerror=event=>{if(!active())return;failed=true;options.notice(event.error==='not-allowed'||event.error==='service-not-allowed'?'未获麦克风权限，可在浏览器中允许后重试，或输入文字、上传录音。':event.error==='network'?'语音服务暂不可用，可重试或上传录音整理。':'未能识别语音，可重试、输入文字或上传录音。');};
 recognition.onend=()=>{if(active()){options.listening(false);if(!received&&!failed)options.notice('未识别到语音，请重试或输入文字。');}ended=true;};
 try{options.listening(true);recognition.start();options.notice('正在聆听，再次点击麦克风可停止。');}catch{ended=true;options.listening(false);options.notice('语音输入未能启动，请检查浏览器权限后重试。');return null;}
 return {stop(){if(ended)return;ended=true;recognition.abort();options.listening(false);}};
}

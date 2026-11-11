import {forwardRef,useId,useImperativeHandle,useRef,useState,type InputHTMLAttributes} from 'react';
import {Upload} from 'lucide-react';
import './file-upload-button.css';

type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'type'> & {showSelection?:boolean;selectedNames?:string[]};
export const FileUploadButton=forwardRef<HTMLInputElement,Props>(function FileUploadButton({showSelection=true,selectedNames,autoFocus,onChange,onInvalid,...props},ref){
 const input=useRef<HTMLInputElement>(null),button=useRef<HTMLButtonElement>(null),contextId=useId();
 const [names,setNames]=useState<string[]>([]),[invalid,setInvalid]=useState(false);
 useImperativeHandle(ref,()=>input.current!);
 const selection=selectedNames??names,context=props['aria-label'];
 const description=[props['aria-describedby'],context?contextId:undefined,invalid?contextId+'-error':undefined].filter(Boolean).join(' ')||undefined;
 return <span className="file-upload-control">
   <button ref={button} type="button" data-ui="secondary" className="file-upload-button" autoFocus={autoFocus} disabled={props.disabled} aria-invalid={invalid||undefined} aria-describedby={description} onClick={()=>input.current?.click()}><Upload size={16} aria-hidden="true"/>上传文件</button>
   <input {...props} ref={input} type="file" tabIndex={-1} className={`file-upload-native ${props.className??''}`} onInvalid={event=>{event.preventDefault();setInvalid(true);button.current?.focus();onInvalid?.(event);}} onChange={event=>{setNames(Array.from(event.currentTarget.files??[]).map(file=>file.name));setInvalid(false);onChange?.(event);}}/>
   {context?<span id={contextId} className="file-upload-context">{context}</span>:null}
   {showSelection?<span className="file-upload-selection" title={selection.join('、')} role="status">{selection.length>1?`已选择 ${selection.length} 个文件`:selection[0]??'未选择文件'}</span>:null}
   {invalid?<span id={contextId+'-error'} className="file-upload-error" role="alert">请选择文件。</span>:null}
 </span>;
});

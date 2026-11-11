/** Numeric page remains a stable extraction index; only PDF has physical pages. */
export function materialLocationUnit(title:string){
 if(/\.pdf$/i.test(title))return '页';
 if(/\.xlsx?$/i.test(title))return '工作表';
 if(/\.pptx?$/i.test(title))return '幻灯片';
 if(/\.(wav|mp3|m4a|ogg|webm|flac)$/i.test(title))return '段';
 if(/\.(png|jpe?g)$/i.test(title))return '图';
 return '正文片段';
}
export function materialCitationLocation(ref:{title:string;page:number;excerpt?:string;location?:string}){
 if(ref.location)return ref.location;
 const unit=materialLocationUnit(ref.title);
 if(unit==='页')return '第'+ref.page+'页';
 if(unit==='段'){const time=ref.excerpt?.match(/^录音\s+(\d{2,}:\d{2}–\d{2,}:\d{2})/)?.[1];return time?'录音 '+time:'录音片段 '+ref.page;}
 return unit+' '+ref.page;
}
export const materialLocationInstruction='引用定位使用location，不将内部page索引自行称为物理页码。PDF可称第几页；Word/纯文本无可靠分页只能称正文片段或引用原文中的章节；Excel称工作表、PPT称幻灯片、录音用时间或片段。不得推算或编造原件物理页码。';

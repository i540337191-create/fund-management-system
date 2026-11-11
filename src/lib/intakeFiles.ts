import type {Project} from '../data/projects';
export function inferFileProject(name:string,projects:Pick<Project,'id'|'name'|'shortName'>[],selected=''){
 if(selected&&projects.some(p=>p.id===selected))return selected;
 const hits=projects.filter(p=>[p.name,p.shortName].some(s=>s&&s.length>=2&&name.includes(s)));
 return hits.length===1?hits[0].id:projects.length===1?projects[0].id:'';
}
export function inferFileType(name:string,categories:string[]){
 const candidate=/会议|纪要|访谈|\.(wav|mp3|m4a|ogg|webm|flac)$/i.test(name)?categories.find(c=>/会议/.test(c)):/财务|报表|审计/.test(name)?categories.find(c=>/财务/.test(c)):/协议|合同/.test(name)?categories.find(c=>/协议/.test(c)):undefined;
 return candidate??categories[0]??'项目资料';
}

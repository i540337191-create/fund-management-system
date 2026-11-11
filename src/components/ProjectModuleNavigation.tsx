import {projectModules,projectModuleFor} from '../lib/projectModules';
import '../iterationB/projectModules.css';
export function ProjectModuleNavigation({view,onOpen}:{view:string;onOpen:(view:string)=>void}){
 const active=projectModuleFor(view);
 return <nav className="project-module-nav" aria-label="项目业务模块">{projectModules.map(module=><button type="button" key={module.name} aria-current={active.name===module.name?'page':undefined} onClick={()=>onOpen(module.views[0])}>{module.name}</button>)}</nav>;
}

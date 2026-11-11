import {FolderOpen,ChevronRight} from 'lucide-react';
import {MaterialFileIcon} from './MaterialFileIcon';
import {groupMaterialTree,type MaterialTreeFile} from '../lib/materialTree';
export function MaterialDirectoryTree({rows,projects,selectedKey,onSelect}:{rows:MaterialTreeFile[];projects:{name:string;shortName:string;fund:string}[];selectedKey?:string;onSelect:(key:string)=>void}) {
  const file=(item:MaterialTreeFile)=><li key={item.recordKey}><button type="button" className="material-tree-file" aria-pressed={selectedKey===item.recordKey} onClick={()=>onSelect(item.recordKey)}><MaterialFileIcon name={item.name}/><span>{item.name}</span><ChevronRight size={14}/></button></li>;
  return <div className="material-tree" aria-label="按基金和项目浏览资料"><ul>{groupMaterialTree(rows,projects).map(fund=><li key={fund.name}><details open><summary><FolderOpen size={18}/><span>{fund.name}</span></summary><ul>{fund.groups.map(group=>group.name?<li key={group.name}><details open><summary><FolderOpen size={16}/><span>{group.name}</span><small>{group.files.length} 份</small></summary><ul>{group.files.map(file)}</ul></details></li>:group.files.map(file))}</ul></details></li>)}</ul></div>;
}

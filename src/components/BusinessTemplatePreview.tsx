import {templatePreviewSchema} from '../lib/businessTemplates';
import {LpTemplateFields} from './LpTemplateFields';
import type {LpProfile} from '../lib/lpProfile';
import {useState} from 'react';
import {CustomFieldInputs} from './CustomFieldInputs';
import type {CustomValues} from '../lib/customFields';
import type {WorkspaceRecord} from '../lib/agentWorkspaceClient';

export function BusinessTemplatePreview({template,onConfigure}:{template:WorkspaceRecord;onConfigure?:(id:string)=>void}){
 const [values,setValues]=useState<CustomValues>({});
 const [profile,setProfile]=useState<LpProfile>({kind:'natural',fields:{},extraFields:{}});
 if(template.objectType==='lp')return <LpTemplateFields preview templates={[template]} profile={profile} isNew onChange={setProfile} onConfigure={onConfigure}/>;
 const schema=templatePreviewSchema({version:template.version,fields:template.fields});
 return <CustomFieldInputs preview schema={schema} values={values} onChange={setValues} onConfigure={onConfigure} heading="模板字段"/>;
}

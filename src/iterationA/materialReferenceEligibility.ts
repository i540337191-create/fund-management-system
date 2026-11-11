import {isEngineeringRecord} from '../lib/dataOrigin.ts';
type Reference={id:string;currentVersionId?:string;dataPurpose?:string;currentVersionPurpose?:string;sourceBasis?:{dataPurpose?:string}[]};
export function materialReferenceEligibility(material:Reference,allowed:Reference|undefined,checked:boolean){
 if(isEngineeringRecord(material))return {allowed:false,reason:'测试资料，不用于AI业务判断'};
 if(!checked)return {allowed:false,reason:'AI引用资格尚未核验，请重试读取'};
 if(!allowed)return {allowed:false,reason:'当前资料不符合AI引用条件，可查看原件核对'};
 if(material.currentVersionId!==allowed.currentVersionId)return {allowed:false,reason:'资料版本已变化，请重新读取后引用'};
 return {allowed:true,reason:''};
}

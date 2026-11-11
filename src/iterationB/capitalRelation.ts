export function capitalScopeFund(project:{fundId?:string;fund:string}|undefined,fund:{id:string;name:string}|undefined){
 if(project&&fund&&project.fundId!==fund.id)return {fundId:'',fund:''};
 return {fundId:fund?.id??project?.fundId??'',fund:fund?.name??project?.fund??''};
}
export function capitalRelationNeedsConfirmation(project:{fundId?:string}|undefined,fundId:string|undefined){return Boolean(project&&fundId&&project.fundId!==fundId);}

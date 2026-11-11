export const icebergProjectStages=['初筛','立项','尽调','投决','投后'] as const;
export const icebergFundStages=['募集期','投资期','投后管理','退出期'] as const;
export function fundStageFromSearch(search:string){
 const stage=new URLSearchParams(search).get('stage')??'';
 return icebergFundStages.some(value=>value===stage)?stage:'全部阶段';
}
export function lifecycleNodes(stage:string,stages:readonly string[]){
 const index=stages.indexOf(stage);
 return stages.map((_,i)=>index<0?'unknown' as const:i<index?'complete' as const:i===index?'current' as const:'pending' as const);
}
export function icebergProjectStage(masterStage:string,actualStage:string){
 if(['读取中','读取失败','权限受限'].includes(actualStage))return actualStage;
 const actual:Record<string,string>={'立项会':'立项','总办会':'投决','投委会':'投决','交易交割':'投决','尽调办理':'尽调','投后管理':'投后','退出办理':'投后','退出已归档':'投后','历史退出待核验':'投后'};
 return actual[actualStage]??({'投后管理':'投后','退出':'投后','已退出':'投后'}[masterStage]??masterStage);
}

export const projectModules=[
 {name:'项目概览',views:['项目概览']},
 {name:'尽调与决策',views:['尽调分析','决策支持','三会审批']},
 {name:'投资与协议',views:['投资信息']},
 {name:'投后管理',views:['投后经营','走访记录','期间档案']},
 {name:'风险与履约',views:['风险监控','履约预警']},
 {name:'项目文档',views:['资料目录','资料文件','报告记录','会议纪要']},
 {name:'任务待办',views:['任务待办']},
 {name:'资金事项',views:['资金事项']},
] as const;
export function projectView(value:string|null){
 if(value==='协议条款')return '投资信息';
 const module=projectModules.find(m=>m.name===value);
 if(module)return module.views[0];
 return projectModules.some(m=>(m.views as readonly string[]).includes(value??''))?value!:'项目概览';
}
export function projectModuleFor(view:string){return projectModules.find(m=>(m.views as readonly string[]).includes(projectView(view)))!;}
export const projectViewLabels:Record<string,string>={'投资信息':'交易与协议','决策支持':'决策建议','资料文件':'原件管理','资料目录':'分类目录','报告记录':'项目报告'};
export const projectViewGuide:Record<string,{purpose:string;output:string}>={
 '项目概览':{purpose:'先看当前进展和待办，再进入对应环节处理。',output:'项目摘要、资料情况与下一步办理入口'},
 '尽调分析':{purpose:'建立检查事项，核对原件，处理发现项并送审。',output:'尽调清单、底稿、发现项和尽调报告'},
 '决策支持':{purpose:'基于项目资料形成投决分析，核对后提交审批。',output:'可编辑的投决分析报告及审核记录'},
 '三会审批':{purpose:'按立项会、总办会、投委会办理，处理签署与退回。',output:'审批结论、留存材料版本与补件任务'},
 '投资信息':{purpose:'选择交易批次，办理投资要素、协议、交割及退出结算。',output:'投资档案、协议版本、交割和资金凭证'},
 '投后经营':{purpose:'按已交割批次和期间录入经营数据，提交责任人审核。',output:'期间经营记录、来源原件和审阅结论'},
 '走访记录':{purpose:'记录实际走访、沟通与经营分析，分派后续行动。',output:'走访记录、附件与跟进任务'},
 '期间档案':{purpose:'把实际原件归入日、月、季、半年或年度档案。',output:'按期间分类的原件档案与归档记录'},
 '风险监控':{purpose:'登记已发现风险，明确级别、影响及处理结果。',output:'风险台账、处理记录和跟进任务'},
 '履约预警':{purpose:'依据签署协议登记义务和触发日期，核对到期事项。',output:'履约条件、提醒任务与履约凭证'},
 '资料文件':{purpose:'上传、预览原件，管理版本和本项目关联。',output:'项目原件、识别结果与版本记录'},
 '资料目录':{purpose:'按类别查阅关联资料，核对建议归档位置。',output:'分类目录与归档路径；上传请用“原件管理”'},
 '报告记录':{purpose:'查看或编制报告，保留审核、归档及来源记录。',output:'投后报告、通用报告及可下载归档文件'},
 '会议纪要':{purpose:'整理本项目会议内容，确认纪要并跟进行动项。',output:'会议纪要、关联原件与跟进任务'},
 '任务待办':{purpose:'查看负责人、截止日和来源，进入具体事项办理。',output:'任务处理状态与办理记录'},
 '资金事项':{purpose:'核对项目管理费等资金事项的应收、实收和凭据。',output:'资金事项记录与收款处理结果'},
};

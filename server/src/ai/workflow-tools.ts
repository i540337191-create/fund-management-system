import {lpProfileFields} from '../ledger/lp-profile.ts';
import {engineeringSource,hiddenSource} from '../ledger/source-policy.ts';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {object,string,fail} from '../ledger/workflow.ts';
import {canReadLp} from '../ledger/lp-privacy.ts';
import type {SessionUser} from '../auth/session.ts';
import {fieldNames,type AssistantProposal,type loadAssistantActionContext} from '../http/assistant-actions.ts';
import {randomUUID} from 'node:crypto';
import {lifecycleActionFields} from '../ledger/fund-lifecycle.ts';
type Pack=Awaited<ReturnType<typeof loadAssistantActionContext>>;
type Operation={label:string;fields:string[];required:string[];path?:string;method?:'POST'|'PATCH'|'PUT';revision?:false|{collection:string;idField:string;field?:string;bodyField?:string};requestId?:false;bodyAction?:string};
type Module={label:string;scope:'project'|'fund'|'material'|'workspace';suffix:string;tab:string;key?:string;subject?:boolean;root?:string;rows?:string;deleted?:boolean;recordKind?:string;allowedRoles?:SessionUser['role'][];readMethod?:'POST';queryFields?:string[];actions?:Record<string,Operation>};
const action=(label:string,fields:string[],required=fields)=>({label,fields,required});
const recordAction=(label:string,fields:string[],path:string,collection:string,idField:string,field='revision',bodyField='expectedRevision'):Operation=>({...action(label,fields),path,revision:{collection,idField,field,bodyField}});
const decisions=(module:string,operation:string)=>['fund_lifecycle','fundraising'].includes(module)||module==='diligence'&&operation==='review_item'?['approve','return']:['approve','return','reject'];
const returnActions:Record<string,Operation>={};
for(const [kind,label] of [['basis','收益口径'],['sample','独立收益算例'],['review','现金流完整性核查']])for(const [verb,verbLabel] of [['create','新建'],['revise','修订'],['submit','提交审核'],['decide','提交本人审核']]){
 const fields=verb==='create'||verb==='revise'?['dealId','fundId','evidence',kind==='basis'?'terms':kind==='sample'?'sample':'review',...(verb==='revise'?['recordId','version','contentHash','revisionReason']:[])]:['recordId','version','contentHash',...(verb==='submit'?['reviewerId','dueDate']:['decision','opinion','authorizationEvidence'])];
 returnActions[verb+'_'+kind]=action(verbLabel+label,fields,verb==='revise'?fields.filter(k=>!['dealId','fundId','revisionReason'].includes(k)):fields);
}
const lifecycleLabels:Record<string,string>={deleteCase:'删除误建运营事项',restoreCase:'恢复运营事项',saveClause:'登记基金条款',reviseClause:'修订基金条款',resolveClause:'登记条款处理结果',deleteClause:'移入条款最近删除',restoreClause:'恢复基金条款',createCase:'新建基金运营事项',requirement:'登记运营材料要求',attach:'关联运营依据原件',waive:'登记材料豁免理由',report:'保存运营报告正文',submitReview:'提交运营事项审核',review:'提交本人运营事项审核',submission:'登记已完成的外部报送及回执',feedback:'登记反馈及处理期限',respond:'登记反馈回复依据',reopen:'重新发起运营变更',reconcile:'登记清算核对依据',distribution:'登记清算分配方案',cancelDistribution:'撤销未支付分配方案',payDistribution:'关联已发生分配的银行凭证',archive:'归档已报送运营事项',rule:'登记已有审批依据的费用规则',charge:'登记费用分期',cancelCharge:'撤销费用分期',account:'登记基金资金账户',receipt:'登记已有银行回单',voidReceipt:'作废银行回单登记',allocate:'分配到账核销',unallocate:'撤销到账核销',capital:'登记可投资额度快照'};
// Only bounded preparation/recording operations are offered; original APIs still own permissions and transitions.
export const workflowModules:Record<string,Module>={
 project_workflow:{label:'项目负责人和风险处理',scope:'project',suffix:'',tab:'项目概览',actions:{
  assign_owner:{...action('指定项目流程负责人',['ownerId']),path:'/owner',method:'PUT',revision:false,requestId:false},
  handle_risk:{...action('登记风险处理结果',['title','target','type','level','source','time','summary','projectId','result'],['title','projectId','result']),path:'/api/risks/handle',revision:false,requestId:false},
 }},
 approvals:{label:'项目审批',scope:'project',suffix:'approvals',tab:'三会审批',actions:{submit:action('发起项目审批',['meetingType','reviewerIds','materialIds','dueDate','note'],['meetingType','reviewerIds','materialIds','dueDate']),decide:{...action('提交本人项目审批决定',['roundId','decision','opinion']),path:'/{roundId}/decisions',revision:{collection:'rounds',idField:'roundId'}}}},
 diligence:{label:'尽职调查',scope:'project',suffix:'diligence',tab:'尽调分析',key:'diligence',actions:{
  add_item:action('新增尽调事项',['title','category','ownerId','dueDate','requirements']),
  update_item:action('更新尽调事项',['itemId','title','category','ownerId','dueDate','requirements']),
  add_finding:action('登记尽调发现',['description','severity','ownerId','dueDate','itemIds','materialIds','blocksReport']),
  save_report:action('保存尽调报告草稿',['sections'],[]),
  submit_item:action('提交尽调材料',['itemId','summary','evidence']),
  submit_report:action('提交尽调报告审核',['reportId','dueDate']),
  resolve_finding:action('登记尽调问题解决',['findingId','note']),
  reopen_finding:action('重新跟进尽调问题',['findingId','note']),
  complete_supplement:action('完成尽调补件',['taskId','note']),
 initialize:{...action('建立尽调档案',['reviewerIds','note'],['reviewerIds']),path:'',revision:false},
 reopen_item:action('重新提交尽调事项',['itemId','note']),
 review_item:action('提交本人尽调事项审核',['itemId','decision','opinion']),
 review_report:action('提交本人尽调报告审核',['reportId','decision','opinion']),
 }},
 deals:{label:'投资协议',scope:'project',suffix:'deals',tab:'协议条款',actions:{
  save_terms:action('保存投资条款草稿',['terms','reason']),
  submit_terms:action('提交投资条款审核',['termsId']),
  generate_agreement:action('生成协议草稿',['title','template']),
  archive_signed:action('登记已签协议原件',['agreementId','original','evidence','note']),
  confirm_condition:action('登记交割条件依据',['conditionId','evidence','note']),
 initialize:{...action('建立投资交易批次',['title','reviewerIds']),path:'',revision:false},
 review_terms:action('提交本人投资条款审核',['termsId','decision','opinion']),
 review_agreement:action('提交本人协议审核意见',['agreementId','opinion']),
 close:action('确认投资交割归档',['evidence','note','responsibility']),
 }},
 post_investment:{label:'投后管理',scope:'project',suffix:'post-investment',tab:'投后经营',key:'postInvestment',actions:{
  save_financial:action('保存投后财务记录',['dealId','recordId','reason','financial'],['dealId','reason','financial']),
  save_visit:action('保存投后回访记录',['dealId','recordId','reason','visit'],['dealId','reason','visit']),
  save_clause:action('保存投后条款记录',['dealId','recordId','reason','clause'],['dealId','reason','clause']),
  save_report:action('保存周期投后报告',['dealId','recordId','reason','report'],['dealId','reason','report']),
  save_exit:action('保存退出准备草稿',['dealId','recordId','reason','exit'],['dealId','reason','exit']),
  submit_financial:action('提交投后财务审核',['dealId','recordId']),
  submit_report:action('提交投后报告审核',['dealId','recordId']),
  submit_exit:action('提交退出准备审核',['dealId','recordId']),
  archive:action('归档投后材料',['dealId','period','category','note','materials']),
 review_financial:action('提交本人投后财务审核',['dealId','recordId','decision','opinion']),
 review_report:action('提交本人投后报告审核',['dealId','recordId','decision','opinion','acceptMissing']),
 archive_report:action('归档已审核投后报告',['dealId','recordId']),
 review_exit:action('提交本人退出准备审核',['dealId','recordId','decision','opinion']),
 archive_exit:action('归档已审核退出准备',['dealId','recordId']),
 resolve_clause:action('登记条款履约处理结果',['dealId','recordId','status','reason','evidence']),
 reconcile:action('核对投后履约状态',['dealId']),
 }},
 investment_cashflows:{label:'投资现金流',scope:'project',suffix:'investment-cashflows',tab:'资金事项',actions:{post:action('登记已有投资现金流凭证',['dealId','fundId','kind','currency','amount','date','bankAccount','bankReference','note','evidence']),reverse:action('冲销投资现金流登记',['cashflowId','reason','evidence'])}},
 investment_ledger:{label:'双向投资账本',scope:'project',suffix:'investment-ledger',tab:'投资信息'},
 manual_risks:{label:'项目人工风险登记与处理',scope:'project',suffix:'manual-risks',tab:'风险监控',actions:{create:action('新增人工风险',['title','type','level','source','time','summary']),update:action('编辑人工风险',['id','expectedVersion','title','type','level','source','time','summary']),resolve:action('登记风险处理结果',['id','expectedVersion','note']),delete:action('风险移入最近删除',['id','expectedVersion','note']),restore:action('恢复已删除风险',['id','expectedVersion','note'])}},
 returns:{label:'收益口径、算例与现金流核查',scope:'project',suffix:'returns',tab:'投资信息',actions:returnActions},
 exit_settlements:{label:'退出交割与回款',scope:'project',suffix:'exit-settlements',tab:'投资信息',actions:{execute:action('登记已发生的退出交割',['planId','planVersion','date','note','allocations','signedAgreement','evidence']),receive:action('登记已有银行回款凭证',['executionId','fundId','date','amount','principal','income','currency','bankAccount','bankReference','note','evidence'],['executionId','fundId','date','amount','principal','income','bankAccount','bankReference','note','evidence']),cancel_execution:action('撤销退出交割登记',['executionId','reason','evidence']),reverse_payment:action('冲销退出回款登记',['paymentId','reason','evidence'])}},
 asset_history:{label:'历史资产与追索',scope:'project',suffix:'asset-history',tab:'投资信息',actions:{create_claim:action('建立历史资产追索事项',['title','description','reason','evidence']),revise_claim:action('更新历史资产追索事项',['claimId','title','description','status','reason','evidence']),archive_exit:action('确认退出完成归档',['reason','completionReview','evidence'])}},
 fund_lifecycle:{label:'募集、备案、披露与清算',scope:'fund',suffix:'lifecycle',tab:'基金运营',actions:Object.fromEntries(Object.entries(lifecycleActionFields).map(([key,fields])=>[key,action(lifecycleLabels[key],fields,fields.filter(f=>f!=='accrualYears'))]))},
 investors:{label:'投资者登记台账',scope:'fund',suffix:'investors',tab:'募集档案',actions:{create:action('新建投资者档案',['name','type','contactName','contactPhone','contactEmail','profile'],['name','type'])}},
 lp_ledger:{label:'投资者档案与认缴实缴',scope:'fund',suffix:'investors/{subjectId}',tab:'募集档案',subject:true,key:'investor',actions:{
  signature:{...action('登记已完成的募集签署',[]),path:'/api/fund-investors/{subjectId}/confirm-signature'},
  update:{...action('修改投资者档案',['name','type','contactName','contactPhone','contactEmail','profile'],[]),path:'',method:'PATCH'},
  commitment:{...action('登记投资者认缴依据',['amount','currency','unit','effectiveDate','changeReason','proof']),path:'/commitments'},
  receipt:{...action('登记投资者已有实缴凭证',['amount','currency','unit','bankDate','reference','note','proof'],['amount','currency','unit','bankDate','reference','proof']),path:'/receipts'},
  correction:{...action('更正投资者实缴登记',['receiptId','amount','currency','unit','bankDate','reference','note','reason','proof'],['receiptId','amount','currency','unit','bankDate','reference','reason','proof']),path:'/receipts/{receiptId}/corrections'},
 }},
 fundraising:{label:'投资者募集与缴款计划',scope:'fund',suffix:'investors/{subjectId}/fundraising',tab:'募集档案',subject:true,actions:{
  export_checklist:{...action('生成投资者资料清单文书',['templateId','format','variables']),path:'/templates/{templateId}/{format}',revision:false,requestId:false},
  requirement:action('新增投资者材料要求',['name','required','ownerId','dueDate']),
  import:action('导入投资者材料清单',['templateId','ownerId','dueDate','templateVersion','materialIds','excludedMaterialIds'],['templateId','ownerId','dueDate']),
  cancelRequirement:action('撤销投资者材料要求',['itemId','note']),
  submit:action('提交投资者材料原件',['itemId','proof']),
  review:action('提交本人投资者材料审核',['decision','note']),
  plan:action('登记投资者缴款计划',['name','amount','ownerId','dueDate']),
  cancelPlan:action('撤销投资者缴款计划',['itemId','note']),
  allocate:action('分配投资者实缴核销',['planId','receiptId','amount']),
 }},
 document_templates:{label:'业务文书模板',scope:'fund',suffix:'document-templates',deleted:true,rows:'templates',tab:'文档模板',actions:{save:action('保存业务文书模板',['name','sections','variables','templateId','expectedTemplateVersion'],['name','sections','variables']),delete:{...action('删除业务文书模板',['templateId','expectedTemplateVersion']),path:'/{templateId}/delete'},restore:{...action('恢复业务文书模板',['templateId','expectedTemplateVersion']),path:'/{templateId}/restore'},generate:{...action('生成业务文书',['templateId','format','templateVersion','investorId','planId','accountId','values'],['templateId','format','templateVersion']),path:'/{templateId}/generate/{format}',revision:false,requestId:false}}},
 meetings:{label:'会议纪要编辑与归档',scope:'project',suffix:'',root:'/api/meetings',rows:'meetings',deleted:true,tab:'会议纪要',actions:{
  schedule:{...recordAction('修改会议时间安排',['meetingId','scheduleStatus','startsAt','endsAt'],'/{meetingId}/schedule','meetings','meetingId'),required:['meetingId','scheduleStatus'],method:'PATCH',requestId:false},
  update:{...recordAction('修改会议纪要',['meetingId','projectId','title','date','attendees','summary','conclusions','todoItems','riskItems','taskDueDate'],'/{meetingId}','meetings','meetingId'),method:'PATCH'},
  confirm:{...recordAction('确认会议纪要并同步任务',['meetingId'],'/{meetingId}/confirm','meetings','meetingId'),requestId:false},
  delete:recordAction('删除会议纪要',['meetingId'],'/{meetingId}/delete','meetings','meetingId'),
  restore:recordAction('恢复会议纪要',['meetingId'],'/{meetingId}/restore','meetings','meetingId'),
 }},
 reports:{label:'项目报告正文、审核与导出',scope:'project',suffix:'',root:'/api/reports',rows:'reports',tab:'报告记录',actions:{
  content:{...recordAction('编辑报告正文',['reportId','sections'],'/{reportId}/content','reports','reportId','updatedAt','expectedUpdatedAt'),method:'PATCH',requestId:false},
  approve:{...recordAction('提交本人报告审核确认',['reportId'],'/{reportId}/approve','reports','reportId','updatedAt','expectedUpdatedAt'),requestId:false},
  export:{...recordAction('导出已审核报告',['reportId','format'],'/{reportId}/export','reports','reportId'),revision:false,requestId:false},
 }},
 tasks:{label:'任务进度与完成',scope:'project',suffix:'',root:'/api/tasks',rows:'tasks',tab:'任务待办',actions:{update:{...recordAction('更新任务状态',['taskId','status','completionNote'],'/{taskId}','tasks','taskId'),method:'PATCH'}}},
 ai_intake:{label:'AI收件核对与归档',scope:'workspace',suffix:'',root:'/api/ai-intake-items',rows:'items',tab:'',actions:{
  create:{...action('从真实原件识别收件',['materialId','inputType']),path:'/from-material',revision:false,requestId:false},
  update:{...action('修改AI收件归属建议',['itemId','suggestedFund','suggestedFundId','suggestedProject','suggestedPath'],['itemId','suggestedFund','suggestedProject','suggestedPath']),path:'/{itemId}/suggestion',method:'PATCH',revision:false,requestId:false},
  reject:{...action('退回AI收件',['itemId','reviewNote']),path:'/{itemId}/reject',revision:false,requestId:false},
  archive:{...action('确认AI收件归档',['itemId']),path:'/{itemId}/archive',revision:false,requestId:false},
 }},
 capital:{label:'资金事项登记与核对',scope:'fund',suffix:'',root:'/api/capital-records',rows:'capitalRecords',tab:'费用流水',actions:{
  create:{...action('新增资金事项',['company','fund','fundId','projectId','received','date','rule','receivable','dueDate','status'],['company','fund','fundId','received','date','rule','receivable','dueDate','status']),path:'',revision:false,requestId:false},
  update:{...recordAction('修改资金事项',['capitalId','company','fund','fundId','projectId','received','date','rule','receivable','dueDate','status'],'/{capitalId}','capitalRecords','capitalId','updatedAt','expectedUpdatedAt'),required:['capitalId','company','fund','fundId','received','date','rule','receivable','dueDate','status'],method:'PATCH',requestId:false},
  confirm:{...recordAction('确认资金事项已有到账登记',['capitalId'],'/{capitalId}/confirm','capitalRecords','capitalId'),revision:false,requestId:false},
 }},
};
for(const [kind,label] of [['company','企业'],['project','项目'],['fund','基金']])workflowModules['schema_'+kind]={label:label+'自定义字段规则',scope:'workspace',suffix:'',root:'/api/custom-field-schemas/'+kind,key:'schema',tab:'',allowedRoles:['admin'],actions:{save:{...action('保存'+label+'自定义字段规则',['fields']),path:'',method:'PUT'}}};
workflowModules.material_versions={label:'资料原件版本',scope:'material',suffix:'versions',tab:''};
workflowModules.fund_deals={label:'基金投资协议批次',scope:'fund',suffix:'deals',tab:'投资信息'};
workflowModules.fund_investment_ledger={label:'基金双向投资账本',scope:'fund',suffix:'investment-ledger',tab:'投资信息'};
workflowModules.report_template_import={label:'从当前原件版本导入报告模板草稿',scope:'material',suffix:'',root:'/api/report-template-imports/prepare',tab:'',allowedRoles:['admin'],readMethod:'POST',queryFields:['versionId'],actions:{confirm:{...action('导入原件报告模板草稿',['title','stage','source','sections','variables'],['title','source','sections','variables']),path:'/api/report-template-imports/confirm'}}};
workflowModules.fund_receipt_suggestions={label:'从基金回单原件提取待核对建议',scope:'fund',suffix:'lifecycle/receipt-suggestions',tab:'账户资金',allowedRoles:['admin','finance'],readMethod:'POST',queryFields:['materialId','versionId']};
workflowModules.material_completeness={label:'当前资料版本的AI资料问题建议',scope:'material',suffix:'',root:'/api/ai/material-completeness/findings',tab:'',actions:{check:{...action('核对当前资料原件内容',['materialIds','refresh'],['materialIds']),path:'/api/ai/material-completeness',revision:false,requestId:false}}};
workflowModules.fund_completeness={label:'当前基金的AI档案补充建议',scope:'fund',suffix:'',root:'/api/ai/fund-completeness/findings',tab:'概览',actions:{check:{...action('核对当前基金档案',['fundIds','includeDemo']),path:'/api/ai/fund-completeness',revision:false,requestId:false}}};
workflowModules.business_intake={label:'业务录入草稿与原件核对',scope:'workspace',suffix:'',root:'/api/business-intake/drafts',rows:'drafts',tab:'',allowedRoles:['admin','investment_manager'],actions:{
 create:{...action('建立业务录入草稿',['objectType','stage','objectId','fundId','profileKind'],['objectType']),path:'',revision:false},
 update:{...recordAction('保存业务录入草稿',['draftId','fields','stage'],'/{draftId}','drafts','draftId','version','expectedVersion'),required:['draftId','fields'],method:'PATCH'},
 check_sources:recordAction('检查草稿已上传原件',['draftId'],'/{draftId}/check-sources','drafts','draftId','version','expectedVersion'),
 extract:recordAction('从草稿已上传原件识别字段',['draftId'],'/{draftId}/extract','drafts','draftId','version','expectedVersion'),
 bind:recordAction('将草稿原件关联到明确业务对象',['draftId','objectId'],'/{draftId}/bind','drafts','draftId','version','expectedVersion'),
}};
workflowModules.audit={label:'当前权限范围的操作留痕',scope:'workspace',suffix:'',root:'/api/audit-events',rows:'auditEvents',tab:'',allowedRoles:['admin','investment_manager','legal']};
for(const [kind,label] of [['company','企业'],['project','项目'],['fund','基金']])workflowModules['field_export_'+kind]={label:label+'自定义字段与当前授权记录导出数据',scope:'workspace',suffix:'',root:'/api/custom-field-export/'+kind,tab:''};
for(const [scope,kind,idField,label] of [['fund','funds','fundId','基金'],['project','projects','projectId','项目'],['material','materials','materialId','资料']] as const)workflowModules[scope+'_access']={label:label+'可见范围',scope,suffix:'',root:'/api/object-access',tab:'',allowedRoles:['admin'],actions:{save:{...action('调整'+label+'可见范围',[idField,'visibility','memberIds']),path:'/'+kind+'/{'+idField+'}',method:'PUT',requestId:false}}};
workflowModules.admin_accounts={label:'账号信息与访问管理（不含凭据）',scope:'workspace',suffix:'',root:'/api/admin/users',rows:'users',tab:'',allowedRoles:['admin'],actions:{
 update:{...recordAction('修改账号姓名、角色或启用状态',['userId','name','role','enabled'],'/{userId}/actions','users','userId'),required:['userId'],bodyAction:'update'},
 revoke_sessions:{...recordAction('撤销账号现有登录会话',['userId'],'/{userId}/actions','users','userId'),bodyAction:'revoke_sessions'},
}};
workflowModules.fund_reports={...workflowModules.reports,label:'基金报告正文、审核与导出',scope:'fund',tab:'投后报告'};
for(const [kind,label] of [['company','企业'],['project','项目'],['fund','基金'],['material','资料'],['report','报告'],['capital','资金事项'],['intake','AI收件'],['investor','投资者草稿']])workflowModules['records_'+kind]={label:label+'删除与恢复',scope:'workspace',suffix:'',root:'/api/record-management/'+kind,recordKind:kind,tab:'项目概览',actions:Object.fromEntries(['delete','restore'].map(operation=>[operation,recordAction((operation==='delete'?'删除':'恢复')+label,['recordId'],'/{recordId}/'+operation,'versions','recordId','$value','expectedVersion')]))};
const labels:Record<string,string>={...fieldNames,userId:'账号',role:'账号角色',enabled:'启用状态',fields:'字段规则',label:'字段名称',requiredStages:'必填阶段',visibility:'可见范围',memberIds:'可查看成员',options:'选项',order:'顺序',scheduleStatus:'会议安排状态',startsAt:'开始时间',endsAt:'结束时间',draftId:'业务录入草稿',objectId:'关联业务对象',objectType:'业务对象类型',profileKind:'投资者档案类型',company:'企业',fund:'基金',received:'已收金额',receivable:'应收金额',rule:'计费规则',format:'导出格式',templateVersion:'模板版本',templateId:'文书模板',expectedTemplateVersion:'当前模板版本',variables:'清单变量',values:'自定义内容',fundName:'基金名称',investorName:'投资者名称',rate:'费率',accrualYears:'一次计提年数',dayBasis:'计息基数',rounding:'舍入规则',basis:'计费依据',approvedBy:'审批依据责任人',validFrom:'生效起日',validTo:'生效止日',assets:'资产',liabilities:'负债',costs:'费用',channel:'报送渠道',required:'是否必需',direction:'收支方向',counterparty:'交易对手',purpose:'用途',revenue:'营业收入',netProfit:'净利润',netAssets:'净资产',valuation:'估值',employees:'员工人数',asOfDate:'核对截止日',knownAt:'记录知悉时间',missingReasons:'缺项说明',sourceHash:'来源核对标识',coverage:'现金流完整性核查',currencyConfirmations:'币种核对',terminalValue:'期末价值',termsId:'条款版本',explanation:'口径说明',analysis:'分析正文',followUps:'后续事项',expectedDate:'预计日期',exitType:'退出方式',consideration:'合同对价',pricingBasis:'定价依据',strategy:'执行安排',documents:'依据文件',allocations:'基金分配',portion:'份额比例',duties:'责任事项',schedules:'任务计划',firstDueDate:'首次到期日',frequency:'频率',decision:'本人决定',opinion:'审核意见',roundId:'审批轮次',reviewerIds:'审核责任人',responsibility:'交割责任分工',completionReview:'退出完成核验',paymentId:'回款记录',executionId:'交割登记',cashflowId:'现金流记录',caseId:'运营事项',receiptId:'银行回单',accountId:'资金账户',ruleId:'费用规则',chargeId:'费用分期',planId:'缴款或退出计划',recordId:'业务记录',meetingId:'会议纪要',capitalId:'资金事项',reviewNote:'退回原因',bankAccount:'银行账户',bankReference:'银行流水号',proof:'原件依据',copy:'报送副本',receipt:'报送回执',reference:'凭证编号',number:'账户号码',balance:'核对余额',committed:'待支付承诺',reserve:'预留金额',threshold:'预警阈值',principal:'本金',income:'收益',effectiveDate:'生效日期',changeReason:'变更原因',bankDate:'银行日期',currency:'币种',unit:'金额单位',contactName:'联系人',contactPhone:'联系电话',contactEmail:'联系邮箱',completionNote:'完成说明',acceptMissing:'确认保留已列明缺项',action:'办理事项',title:'标题',category:'类别',ownerId:'负责人',dueDate:'截止日期',requirements:'材料要求',itemId:'尽调事项',description:'问题描述',severity:'严重程度',itemIds:'关联事项',materialIds:'依据资料',blocksReport:'是否阻断报告',sections:'报告正文',workPerformed:'工作说明',findings:'发现',recommendation:'建议',summary:'摘要',evidence:'依据原件',reportId:'报告',findingId:'问题',note:'说明',taskId:'任务',terms:'投资条款',reason:'变更原因',template:'模板',agreementId:'协议',original:'已签原件',conditionId:'交割条件',dealId:'投资批次',financial:'财务记录',visit:'回访记录',clause:'条款记录',report:'报告内容',exit:'退出准备',period:'期间',materials:'归档材料',text:'正文',name:'名称',versionId:'依据版本',materialId:'依据资料',date:'日期',amount:'金额',status:'状态',type:'类别',owner:'负责人',startDate:'开始日期',endDate:'结束日期'};
export function workflowCatalog(actor?:SessionUser){return Object.entries(workflowModules).filter(([,m])=>!actor||!m.allowedRoles||m.allowedRoles.includes(actor.role)).map(([module,m])=>({module,label:m.label,scope:m.scope,...(['diligence','post_investment','reports','fund_reports'].includes(module)?{reportContract:module==='diligence'?'尽调报告独立保存在diligence，保存、提交、审核均在本模块；通用reports查询为空不代表没有尽调报告。':module==='post_investment'?'投后报告独立保存在post_investment，不使用通用reports。':'通用报告中心的独立报告；不包含尽调或投后模块报告。'}:{}),...(m.subject?{subjectRequired:'subjectId必须为本基金投资者ID'}:{}),operations:Object.entries(m.actions??{}).map(([operation,a])=>({operation,label:a.label,fields:a.fields,required:a.required,guide:a.fields.includes('decision')?'decision只允许'+decisions(module,operation).join('/')+'；approve=本人明确同意，return=退回补充，reject=否决。不能使用approved、通过等展示词，不能替本人决定。':module==='fundraising'&&operation==='import'?'先读取templates并逐项询问用户核定条件材料；不得代用户核定。materialIds为用户明确适用项，excludedMaterialIds为用户明确不适用项，未知不填；内置清单用材料原名，自定义模板用材料id并传templateVersion。原件清单sha和材料名须保持，不改写历史要求。':module==='investment_ledger'?'只读派生账本，须修改对应来源业务。':module==='fund_lifecycle'&&operation==='createCase'?'kind为registration(备案)、disclosure(披露)、liquidation(清算)；披露period格式YYYY-Q1至Q4、YYYY-H1/H2或YYYY-Y。未知先追问。':operation==='add_item'||operation==='update_item'?'requirements必须为非空数组，每项{id:本事项内唯一短标签,title:用户要求的材料名称}；负责人和截止日须明确。':operation==='save_report'&&module==='diligence'?'sections为对象{summary:摘要,workPerformed:工作说明,findings:发现,recommendation:建议}，四项为字符串，缺失数据明确待核实；也可省略sections，让业务接口按当前尽调记录生成系统摘要。':'沿用对应业务模块字段，已有记录可据其结构填写；没有依据的金额、日期、结论不可补造。'})),boundary:'只准备待本人确认卡，不代替责任人作出决定。审批、撤销、资金和归档逐项确认，原接口再次校验本人权限、流程状态、版本和真实原件。银行交易与外部报送本身仍在系统之外完成，只登记已有依据。'}));}
// The same report operation is scoped by an already-authorized object, never by a guessed name.
export function resolveWorkflowModule(pack:Pack,module:string,targetId:string){
 return module==='reports'&&pack.funds.some(f=>f.id===targetId)&&!pack.projects.some(p=>p.id===targetId)?'fund_reports':module;
}
export function workflowQueryFields(module:string){return module==='returns'?['dealId','fundId','asOfDate','knownAt']:Object.hasOwn(workflowModules,module)?workflowModules[module].queryFields??[]:[];}
export function workflowTarget(pack:Pack,module:string,targetId:string,subjectId?:string){
 const m=Object.hasOwn(workflowModules,module)?workflowModules[module]:undefined;if(!m)fail('invalid_workflow_module');
 const target=m.scope==='workspace'?(targetId==='workspace'?{id:'workspace',name:'当前账号授权范围'}:undefined):(m.scope==='project'?pack.projects:m.scope==='material'?pack.materials:pack.funds).find(x=>x.id===targetId);if(!target)fail('action_object_unavailable',409);
 if(m.subject&&!pack.investors.some(i=>i.id===subjectId&&i.fundId===target.id))fail('action_object_unavailable',409);
 return {m,target,base:m.root??('/api/'+(m.scope==='project'?'projects':m.scope==='material'?'materials':'funds')+'/'+encodeURIComponent(target.id)+'/'+m.suffix.replace('{subjectId}',encodeURIComponent(subjectId??''))).replace(/\/$/,''),href:m.scope==='material'?'/materials?materialId='+encodeURIComponent(target.id):module.startsWith('schema_')||module==='admin_accounts'?'/settings':m.root?m.recordKind?({company:'/projects',project:'/projects',fund:'/funds',material:'/materials',report:'/reports',capital:'/capital',intake:'/ai-inbox',investor:'/funds'} as Record<string,string>)[m.recordKind]:module==='capital'?'/capital':module==='ai_intake'?'/ai-inbox':m.root.replace('/api',''):'/'+(m.scope==='project'?'projects':'funds')+'/'+encodeURIComponent(target.id)+'?tab='+encodeURIComponent(m.tab)};
}
export async function readWorkflow(server:FastifyInstance,r:FastifyRequest,pack:Pack,args:Record<string,unknown>,includeDemo:boolean,a:SessionUser){
 const b=object(args,['module','targetId','subjectId','query']),targetId=string(b.targetId),module=resolveWorkflowModule(pack,string(b.module),targetId),subjectId=b.subjectId===undefined?undefined:string(b.subjectId),{m,base,href}=workflowTarget(pack,module,targetId,subjectId);
 if(m.allowedRoles&&!m.allowedRoles.includes(a.role))fail('forbidden',403);
 const query=b.query===undefined?undefined:object(b.query,workflowQueryFields(module));
 if(m.readMethod==='POST')for(const field of m.queryFields??[])string(query?.[field]);
 if(['investors','fund_lifecycle','lp_ledger','fundraising'].includes(module)&&!canReadLp(a))fail('forbidden',403);
 const suffix=['approvals','diligence','deals','document_templates','fund_lifecycle','returns'].includes(module)||m.deleted?'':'?includeDemo='+includeDemo;
 const response=await server.inject({method:m.readMethod??'GET',url:base+(m.readMethod?'':query?'?'+new URLSearchParams(Object.entries(query).map(([k,v])=>[k,string(v)])):suffix),...(m.readMethod?{payload:{...query,...(m.scope==='material'?{materialId:targetId}:{})}}:{}),headers:r.headers.cookie?{cookie:r.headers.cookie}:{}});const notInitialized=response.statusCode===404&&module==='diligence'&&response.json().error==='diligence_not_found';if(response.statusCode!==200&&!notInitialized)fail('workflow_read_unavailable',response.statusCode);
 const filter=(v:any):any=>Array.isArray(v)?v.filter(x=>!x||typeof x!=='object'||!engineeringSource(x)&&(includeDemo||!hiddenSource(x))).map(filter):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,x&&typeof x==='object'&&!Array.isArray(x)&&(engineeringSource(x as any)||!includeDemo&&hiddenSource(x as any))?null:filter(x)])):v;
 const data=filter(notInitialized?{diligence:null}:response.json());
 if(module==='material_completeness'||module==='fund_completeness')data.findings=data.findings.filter((f:any)=>f[module==='material_completeness'?'materialId':'fundId']===targetId);
 if(module==='report_template_import'){const workspace=await server.inject({url:'/api/agent-workspace',headers:r.headers.cookie?{cookie:r.headers.cookie}:{}});if(workspace.statusCode!==200)fail('workflow_read_unavailable',workspace.statusCode);data.revision=workspace.json().revision;}
 if(module.endsWith('_access')){const kind=m.scope==='project'?'projects':m.scope==='material'?'materials':'funds',rule=data.data[kind]?.[targetId],revision=rule?.revision??(m.scope==='material'?data.data.materialRevisions?.[targetId]:m.scope==='project'?data.data.projectRevisions?.[targetId]:undefined)??0;const selected=data[kind]?.find((v:any)=>v.id===targetId);return {module,targetId,label:m.label,href:'/settings',data:{record:selected,rule:rule??{visibility:m.scope==='fund'?'public':'inherit',memberIds:[]},revision,users:data.users,scopeContract:'只更改所选对象的可见范围；成员按当前可用账号ID逐个确认。inherit遵循原对象继承规则，调整可能影响成员看到的关联业务及资料。'},operations:workflowCatalog(a).find(x=>x.module===module)!.operations};}
 if(module==='admin_accounts')data.users=data.users.filter((u:any)=>u.id!=='user-admin').map((u:any)=>({id:u.id,name:u.name,email:u.email,role:u.role,enabled:u.enabled,revision:u.revision??1}));
 if(module.startsWith('schema_'))data.scopeContract='组织范围按对象类型生效；requiredStages只限制阶段必填，不将字段或模板限定到单基金/项目。必须保留全部现有字段和选项；停用而非删除。单基金文书用document_templates；单对象字段规则当前不支持，不得扩大范围。';
 if(module==='document_templates')data.scopeContract='仅限targetId指定基金的文书正文和变量；不是组织字段Schema或LP材料清单规则。修改须templateId和expectedTemplateVersion；生成须指定准确templateVersion。';
 if(module==='returns'){const deals=await server.inject({url:'/api/projects/'+encodeURIComponent(targetId)+'/deals',headers:r.headers.cookie?{cookie:r.headers.cookie}:{}});if(deals.statusCode!==200)fail('workflow_read_unavailable',deals.statusCode);data.deals=deals.json().deals.filter((d:any)=>data.scopes.some((s:any)=>s.dealId===d.id)).map((d:any)=>({id:d.id,title:d.title}));}
 if(m.recordKind){const names=new Map(pack.names);for(const record of data.records)names.set(record.id,record.title);if(['capital','intake'].includes(m.recordKind)){const source=await server.inject({url:m.recordKind==='capital'?'/api/capital-records?includeDemo='+includeDemo:'/api/ai-intake-items',headers:r.headers.cookie?{cookie:r.headers.cookie}:{}});if(source.statusCode!==200)fail('workflow_read_unavailable',source.statusCode);for(const v of source.json()[m.recordKind==='capital'?'capitalRecords':'items'])names.set(v.id,v.title??v.company??'资金事项');}data.availableRecords=Object.keys(data.versions).filter(id=>names.has(id)).map(id=>({id,name:names.get(id),deleted:data.records.some((v:any)=>v.id===id)}));data.versions=Object.fromEntries(data.availableRecords.map((v:any)=>[v.id,data.versions[v.id]]));}
 if(m.deleted&&m.rows){const deleted=await server.inject({url:base+'?deleted=true',headers:r.headers.cookie?{cookie:r.headers.cookie}:{}});if(deleted.statusCode!==200)fail('workflow_read_unavailable',deleted.statusCode);data[m.rows].push(...filter(deleted.json()[m.rows]));}
 if(m.rows&&m.scope!=='workspace'&&module!=='document_templates')data[m.rows]=data[m.rows].filter((v:any)=>v[m.scope==='project'?'projectId':'fundId']===targetId);
 if(module==='document_templates'){const options=await server.inject({url:base+'/generation-options',headers:r.headers.cookie?{cookie:r.headers.cookie}:{}});if(options.statusCode===200)data.generationOptions=options.json();}
 if(module==='investors'||module==='lp_ledger')data.profileContract={shape:'{kind:natural|institution|product, fields:{原表字段ID:字符串}, extraFields:{模板ID:字段ID:标量}, templateRefs:[{id,version}]}',originalFields:lpProfileFields,note:'只填原件有依据的内容。模板额外字段与版本请read_agent_workspace核对；认缴/实缴/签署不能从档案字段自动登记。'};
 if(module==='fundraising'){const templates=await server.inject({url:'/api/fundraising/templates',headers:r.headers.cookie?{cookie:r.headers.cookie}:{}});if(templates.statusCode===200)data.templates=templates.json().templates;}
 return {module,targetId,...(subjectId?{subjectId}:{}),...(query?{query}:{}),label:m.label,data,href,operations:workflowCatalog().find(x=>x.module===module)!.operations};
}
export function rememberWorkflowNames(value:unknown,names:Map<string,string>){
 if(Array.isArray(value)){for(const v of value)rememberWorkflowNames(v,names);return;}
 if(!value||typeof value!=='object')return;const v=value as Record<string,unknown>;
 if(typeof v.fieldId==='string'&&typeof v.title==='string')names.set(v.fieldId,v.title);
 if(typeof v.id==='string')names.set(v.id,String(v.name??v.title??v.description??v.period??'所选业务记录').slice(0,120));
 if(!v.readIssue&&typeof v.name==='string'){if(typeof v.materialId==='string')names.set(v.materialId,v.name);if(typeof v.versionId==='string')names.set(v.versionId,v.name+' · 原件版本');}
 for(const child of Object.values(v))rememberWorkflowNames(child,names);
}
export function workflowRequestFingerprint(input:Record<string,unknown>){
 const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 return JSON.stringify(canonical(input));
}
export function workflowProposal(args:Record<string,unknown>,read:Awaited<ReturnType<typeof readWorkflow>>,pack:Pack,a:SessionUser,rid:string):AssistantProposal{
 const b=object(args,['module','targetId','subjectId','query','dealId','operation','body']),module=resolveWorkflowModule(pack,string(b.module),string(b.targetId)),operation=string(b.operation),{m,target,base}=workflowTarget(pack,module,string(b.targetId),b.subjectId===undefined?undefined:string(b.subjectId));
 if(read.module!==module||read.targetId!==b.targetId||read.subjectId!==b.subjectId)fail('workflow_read_required',409);
 if(workflowRequestFingerprint({query:read.query})!==workflowRequestFingerprint({query:b.query}))fail('workflow_read_required',409);
 if(!['admin','investment_manager','post_investment','legal','finance'].includes(a.role)&&!['material_completeness','fund_completeness'].includes(module))fail('forbidden',403);
 if(m.allowedRoles&&!m.allowedRoles.includes(a.role))fail('forbidden',403);
 const descriptor=Object.hasOwn(m.actions??{},operation)?m.actions![operation]:undefined;if(!descriptor)fail('action_not_supported',403);
 const input=object(b.body,descriptor.fields);if(m.scope==='project'&&input.projectId!==undefined&&input.projectId!==target.id||m.scope==='fund'&&input.fundId!==undefined&&input.fundId!==target.id||m.scope==='material'&&input.materialId!==undefined&&input.materialId!==target.id)fail('action_object_unavailable',409);for(const key of descriptor.required)if(input[key]===undefined||input[key]===null||input[key]==='')fail('action_missing_fields');
 if(descriptor.fields.includes('decision')&&!decisions(module,operation).includes(String(input.decision)))fail('invalid_decision');
 let revision=(module.startsWith('schema_')?read.data.schema?.schemaRevision:read.data[m.key??'']?.revision)??read.data.revision,path=base+'/actions';let prior:Record<string,any>={};
 if((module.startsWith('schema_')||module==='admin_accounts')&&a.role!=='admin')fail('forbidden',403);
 if(module.startsWith('schema_'))prior=read.data.schema??{};
 if(module==='admin_accounts'&&operation==='update'&&!['name','role','enabled'].some(key=>input[key]!==undefined))fail('action_missing_fields');
 if(module==='report_template_import'){const source=object(input.source,['materialId','versionId']);if(source.materialId!==target.id||source.versionId!==read.query?.versionId)fail('action_object_unavailable',409);}
 if(['material_completeness','fund_completeness'].includes(module)){const ids=input[module==='material_completeness'?'materialIds':'fundIds'];if(!Array.isArray(ids)||ids.length!==1||ids[0]!==target.id)fail('action_object_unavailable',409);}
 if(module==='business_intake'&&(operation==='create'||operation==='bind')){const draft=operation==='bind'?read.data.drafts?.find((d:any)=>d.id===input.draftId):input;if(!draft)fail('action_object_unavailable',409);if(!['company','project','fund','lp'].includes(String(draft.objectType)))fail('invalid_object_type');if(input.objectId!==undefined){const candidates=draft.objectType==='company'?pack.companies:draft.objectType==='project'?pack.projects:draft.objectType==='fund'?pack.funds:pack.investors;if(!candidates.some((v:any)=>v.id===input.objectId&&(draft.objectType!=='lp'||v.fundId===(draft as any).fundId)))fail('action_object_unavailable',409);}if(input.fundId!==undefined&&!pack.funds.some(f=>f.id===input.fundId))fail('action_object_unavailable',409);}
 if(module==='diligence'&&operation==='update_item')prior=read.data.diligence?.items?.find((x:any)=>x.id===input.itemId)??{};
 if(module==='post_investment'&&input.recordId){const key=({save_financial:'financials',save_visit:'visits',save_clause:'clauses',save_report:'reports',save_exit:'exitPreparations'} as Record<string,string>)[operation];prior=[...(read.data.postInvestment?.[key]??[])].reverse().find((x:any)=>x.id===input.recordId)??{};}
 if(module==='deals'&&operation!=='initialize'){const deal=read.data.deals?.find((d:any)=>d.id===b.dealId);if(!deal)fail('action_object_unavailable',409);revision=deal.revision;if(operation==='save_terms')prior=deal.terms?.at(-1)??{};path=base+'/'+encodeURIComponent(deal.id)+'/actions';}
 if(descriptor.revision&&typeof descriptor.revision==='object'){const rule=descriptor.revision;if(rule.field==='$value'){revision=read.data[rule.collection]?.[String(input[rule.idField])];if(typeof revision!=='string')fail('action_object_unavailable',409);}else{prior=read.data[rule.collection]?.find((v:any)=>v.id===input[rule.idField]);if(!prior)fail('action_object_unavailable',409);revision=prior[rule.field??'revision']??(['tasks','meetings'].includes(rule.collection)?1:undefined);}}
 if(m.rows)for(const match of (descriptor.path??'').matchAll(/\{(\w+)\}/g))if(match[1]!=='format'&&!read.data[m.rows]?.some((v:any)=>v.id===input[match[1]]))fail('action_object_unavailable',409);
 if(descriptor.path!==undefined)path=(descriptor.path.startsWith('/api/')?'':base)+descriptor.path.replace(/\{(\w+)\}/g,(_,field)=>encodeURIComponent(string(field==='subjectId'?b.subjectId:input[field])));
 const revisionField=typeof descriptor.revision==='object'?descriptor.revision.bodyField??'expectedRevision':'expectedRevision';

 if(module!=='manual_risks'&&descriptor.revision!==false&&!(module==='approvals'&&operation==='submit')&&module!=='investors'&&!((revisionField==='expectedUpdatedAt'||revisionField==='expectedVersion'&&m.recordKind)?typeof revision==='string'&&revision.length>0:Number.isSafeInteger(revision)))fail('workflow_not_initialized',409);
 if(descriptor.path===undefined&&['approvals','investors','document_templates'].includes(module))path=base;
 if(module==='diligence'&&['add_item','update_item'].includes(operation)){if(!Array.isArray(input.requirements)||!input.requirements.length||input.requirements.length>100)fail('invalid_requirements');const ids=new Set<string>();for(const v of input.requirements){const q=object(v,['id','title']),id=string(q.id,true,100);string(q.title,true,500);if(ids.has(id))fail('invalid_requirements');ids.add(id);}}
 const id=randomUUID(),body:Record<string,unknown>={...input,action:operation,requestId:id,expectedRevision:revision};
 if(module==='manual_risks'){delete body.expectedRevision;if(operation==='create')body.id='risk-'+id;}
 if((module==='approvals'&&operation==='submit'||module==='diligence'&&operation==='initialize')&&body.note===undefined)body.note='';
 if(['generate','export_checklist'].includes(operation)&&!['pdf','docx'].includes(String(input.format)))fail('invalid_report_format');
 if(module==='capital'&&operation==='create')body.id='capital-'+id;

 if(revisionField!=='expectedRevision'){delete body.expectedRevision;body[revisionField]=revision;}
 if(['approvals','investors','document_templates'].includes(module)||descriptor.path!==undefined)delete body.action;
 if(descriptor.bodyAction)body.action=descriptor.bodyAction;
 if(module==='fundraising'&&descriptor.path===undefined)body.action=operation;
 if(module==='investors'||module==='approvals'&&operation==='submit'||descriptor.revision===false)delete body[revisionField];
 if(descriptor.path!==undefined)for(const match of descriptor.path.matchAll(/\{(\w+)\}/g))delete body[match[1]];
 if(descriptor.requestId===false)delete body.requestId;
 let size=0;const human=(v:unknown,depth=0):string=>{if(++size>1500||depth>12)fail('invalid_action_payload');if(v===null||v===undefined||v==='')return '未填写';if(typeof v==='boolean')return v?'是':'否';if(Array.isArray(v))return v.map(x=>human(x,depth+1)).join('；')||'无';if(typeof v==='object')return Object.entries(v).filter(([k])=>k!=='id').map(([k,x])=>{if(/Ids?$/.test(k)&&[x].flat().some(x=>typeof x==='string'&&x&&!pack.names.has(x)))fail('action_object_unavailable',409);return (labels[k]??'内容')+'：'+human(x,depth+1);}).join('\n');if(typeof v!=='string'&&typeof v!=='number')fail('invalid_action_payload');const text=String(v);if(text.length>16000)fail('invalid_action_payload');if(pack.names.has(text))return pack.names.get(text)!;return ({text:'文本',number:'数字',date:'日期',boolean:'是或否',singleChoice:'单选',members:'指定成员',public:'公开',inherit:'继承原范围',unknown:'时间待定',scheduled:'已安排',in_progress:'进行中',ended:'已结束',cancelled:'已取消',approve:'同意',return:'退回补充',reject:'否决',low:'低',medium:'中',high:'高',draft:'草稿',pending:'待审核',approved:'已审核',rejected:'已退回'} as Record<string,string>)[text]??text;};
 const details=[{label:m.scope==='project'?'项目':m.scope==='fund'?'基金':m.scope==='material'?'资料':'范围',before:'未填写',after:target.name},...(m.subject?[{label:'投资者',before:'未填写',after:pack.names.get(String(b.subjectId))??'所选投资者'}]:[]),...Object.entries(input).map(([k,v])=>({label:labels[k]??'内容',before:Object.keys(prior).length?human(k==='ownerId'?prior.owner?.id??prior.ownerId:k==='terms'?Object.fromEntries(Object.keys(v as object).map(key=>[key,prior[key]])):['financial','visit','clause','report','exit'].includes(k)?Object.fromEntries(Object.keys(v as object).map(key=>[key,prior[key]])):prior[k]):'未填写',after:human({[k]:v}).replace(/^[^：]+：/,'')})),{label:'办理边界',before:'未填写',after:'本卡仅执行所列登记或提交，不替代审核、银行交易或外部报送；保存时仍会校验原件、版本及流程前置条件。'}];
 return {id,requestId:id,promptRequestId:rid,kind:'workflow_action',resultHref:module==='fund_lifecycle'&&operation.endsWith('Clause')?'/funds/'+encodeURIComponent(target.id)+'?tab='+encodeURIComponent('条款监控'):read.href,title:descriptor.label,path,method:descriptor.method??'POST',body,details,state:'pending',createdAt:new Date().toISOString()};
}

export function workflowForModel(read:Awaited<ReturnType<typeof readWorkflow>>){
 let truncated=false,nodes=0;const trim=(v:any,depth=0):any=>{if(++nodes>1800||depth>14){truncated=true;return null;}if(typeof v==='string'&&v.length>4000){truncated=true;return v.slice(0,4000)+'（正文截取）';}if(Array.isArray(v)){if(v.length>40)truncated=true;return v.slice(0,40).map(x=>trim(x,depth+1));}if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,trim(x,depth+1)]));return v;};
 const data=trim(read.data),withinLimit=JSON.stringify(data).length<65000;return {...read,data:withinLimit?data:null,coverage:withinLimit?(truncated?'部分记录或正文已截取，不能视为完整业务资料。':'当前接口返回的授权记录。'):'当前记录较多，未发送正文；请前往业务记录核对具体事项，不可据此拟造动作。'};
}

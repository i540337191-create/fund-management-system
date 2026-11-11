export const reportCatalogue = [
 {type:'行业研究报告',group:'投前与投资决策',stage:'投前研究',timing:'开展行业研究、形成研究结论时',materials:'行业资料、市场研究、政策动态'},
 {type:'项目初筛报告',group:'投前与投资决策',stage:'项目筛选',timing:'项目初步资料齐备后',materials:'项目基本资料、商业计划、初步评估资料'},
 {type:'尽调报告',group:'投前与投资决策',stage:'尽职调查',timing:'尽调资料核验后',materials:'尽调资料、财务资料、访谈记录'},
 {type:'基金季度报告',group:'投后与基金运营',stage:'基金运营',timing:'季度结束后，按基金约定准备',materials:'投资进展、企业经营、财务数据、风险事项'},
 {type:'基金半年度报告',group:'投后与基金运营',stage:'基金运营',timing:'半年度结束后，按基金约定准备',materials:'半年度运营数据、投资组合进展、重大事项'},
 {type:'基金年度报告',group:'投后与基金运营',stage:'基金运营',timing:'年度结束后，按基金约定准备',materials:'全年运营数据、投资组合表现、年度总结'},
 {type:'企业监控报告',group:'投后与基金运营',stage:'投后管理',timing:'按约定周期或发生重大事项时',materials:'企业经营数据、关键指标、风险事项'},
 {type:'会议纪要报告',group:'会议协作',stage:'会议协作',timing:'会议结束后，纪要确认后',materials:'会议议程、会议记录、决议事项'},
];
export const reportFlow = ['选择类型','关联基金 / 项目','模板与资料','责任人确认','AI 草稿','人工审核','导出归档'];
export function parseReportDraft(text:string,expectedTitles?:string[]){
 let value:{sections?:unknown};
 const fenced=text.match(/```json\s*([\s\S]*?)```/i);
 if(fenced||text.trim().startsWith('{'))value=JSON.parse(fenced?fenced[1]:text.trim());
 else {
  const headings=[...text.matchAll(/^#{1,3}[ \t]+(.+?)[ \t]*$/gm)].filter(m=>!expectedTitles||expectedTitles.includes(m[1].replace(/^\*\*|\*\*$/g,'')));
  if(expectedTitles&&(!expectedTitles.length||headings.length!==expectedTitles.length||headings.some((m,i)=>m[1].replace(/^\*\*|\*\*$/g,'')!==expectedTitles[i])))throw Error('AI 未按所选模板返回完整章节，请重新生成；当前选择已保留。');
  value={sections:headings.map((m,i)=>({title:m[1].replace(/^\*\*|\*\*$/g,''),text:text.slice(m.index!+m[0].length,headings[i+1]?.index??text.length).trim()}))};
 }
 if(!value||!Array.isArray(value.sections)||!value.sections.length||value.sections.length>98||value.sections.some((s:any)=>!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>500||typeof s.text!=='string'||!s.text.trim()||s.text.length>100000))throw Error('AI 未返回完整的报告章节，请重新生成；当前选择已保留。');
 const sections=value.sections.map((s:{title:string;text:string})=>({title:s.title,text:s.text}));
 if(expectedTitles&&(sections.length!==expectedTitles.length||sections.some((s,i)=>s.title!==expectedTitles[i])))throw Error('AI 返回章节与所选模板不一致，请重新生成。');
 return sections;
}

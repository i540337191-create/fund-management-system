// Configurable example checklists; included sources are synthetic demo templates, not legal standards.
const signedTemplates=[
  {
    "id": "custodied",
    "name": "托管资料清单",
    "source": "demo/custodied-checklist.docx",
    "sha256": "8e941c84f3d3febf57d57a77a8444ab5ae84f92b8c6e4891f0ab6ee33c16c580",
    "titles": [
      "合伙协议",
      "风险揭示书",
      "资者基本信息表",
      "合格投资者承诺函",
      "风险调查问卷",
      "风险匹配告知书及投资者确认函",
      "税收居民身份声明文件",
      "投资者回访确认书",
      "定期回访调查表"
    ]
  },
  {
    "id": "uncustodied",
    "name": "无托管资料清单",
    "source": "demo/uncustodied-checklist.docx",
    "sha256": "9c9d65f256d401ddffc70f66bfededcf38722d16ece750c0ca0c6c7e20c5fbd3",
    "titles": [
      "合伙协议",
      "风险揭示书",
      "资者基本信息表",
      "合格投资者承诺函",
      "风险调查问卷",
      "风险匹配告知书及投资者确认函",
      "税收居民身份声明文件",
      "投资者回访确认书",
      "定期回访调查表",
      "无托管协议",
      "无托管确认函",
      "财产安全保障与纠纷解决机制制度"
    ]
  }
] as const;

export type TemplateMaterial={name:string;category:'signed'|'base';applicableTo:readonly string[];required:boolean;instructions:string;copies?:number;condition?:string};
const baseMaterials:TemplateMaterial[]=[
 {name:'居民身份证复印件',category:'base',applicableTo:['natural'],required:true,instructions:'按原件核对居民身份证复印件'},
 {name:'本人打款回单',category:'base',applicableTo:['natural'],required:true,instructions:'核对实际打款人与投资者身份'},
 {name:'预留银行账户（存折/卡）复印件',category:'base',applicableTo:['natural'],required:true,instructions:'提供本人预留银行账户复印件'},
 {name:'合格投资者证明（资产或收入）',category:'base',applicableTo:['natural'],required:true,instructions:'按源文件收集金融资产或最近三年年均收入证明，由人工核验适用标准'},
 {name:'自然人录音或录像',category:'base',applicableTo:['natural'],required:false,condition:'普通投资者适用，人工核对分类后设为必需',instructions:'普通投资者配合募集人员完成录音或录像'},
 {name:'营业资质复印件',category:'base',applicableTo:['institution'],required:true,instructions:'纸质复印件加盖公章'},
 {name:'法定代表人身份证复印件',category:'base',applicableTo:['institution'],required:true,instructions:'正反面复印在同一张纸上并加盖公章'},
 {name:'三年一期审计报告或财务报表',category:'base',applicableTo:['institution'],required:true,instructions:'纸质加盖公章，资产条件由人工核验'},
 {name:'公司章程',category:'base',applicableTo:['institution'],required:true,instructions:'纸质公司章程加盖公章'},
 {name:'实缴打款回单',category:'base',applicableTo:['institution'],required:true,instructions:'纸质打款回单，备注：投资款'},
 {name:'法定代表人双录',category:'base',applicableTo:['institution'],required:true,instructions:'需与法定代表人双录；不能双录时核对授权委托书并记录适用安排'},
 {name:'授权委托书',category:'base',applicableTo:['institution'],required:false,condition:'法定代表人不能双录时适用',instructions:'法定代表人不能双录时需出具授权委托书'}
];
export const fundraisingTemplates=signedTemplates.map(t=>({...t,materials:[...t.titles.map((name):TemplateMaterial=>({name,category:'signed',applicableTo:['natural','institution','product'],required:true,copies:name==='合伙协议'?4:['风险揭示书','风险匹配告知书及投资者确认函','无托管协议'].includes(name)?2:1,instructions:name==='合伙协议'?'各投资人、管理人各留存1份': ['风险揭示书','风险匹配告知书及投资者确认函','无托管协议'].includes(name)?'原件管理人、投资者各留存1份':'原件管理人留存；按对应表格签字、签章'})),...baseMaterials]}));

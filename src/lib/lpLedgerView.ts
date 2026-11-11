import {canManageFunds} from './fundMasterTypes.ts';
export const canEditLpMaster=canManageFunds;
export const canRecordLpReceipt=(role?:string)=>role==='admin'||role==='finance';
// Display exact registered yuan strings; absence is not a confirmed zero.
export function formatLpMoney(value:string|null|undefined){
 if(value==null)return '待登记';
 if(!/^\d+\.\d{2}$/.test(value))return '金额待核对';
 const [whole,fraction]=value.split('.');
 return `${new Intl.NumberFormat('zh-CN').format(BigInt(whole))}.${fraction}`;
}
export function lpFailure(error:unknown){
 const {status,code}=(error??{}) as {status?:number;code?:string};
 if(code==='client_session_changed'||code==='session_context_changed'||status===401)return '登录身份已变化，请重新打开台账后核对保存结果。';
 if(code==='lp_intake_not_ready')return 'LP尚未提交，请先在原件识别区核对草稿保存结果，再保存登记。';
 if(code==='lp_template_version_conflict')return '公司LP模板已更新，请关闭后重新打开档案，按最新模板核对填写。';
 if(code==='lp_custom_fields_required')return '请填写公司LP模板中的必填字段，并选择原表档案类别。';
 if(code==='invalid_lp_custom_value'||code==='unknown_lp_custom_field')return '公司LP模板字段不匹配，请核对字段类型、日期和选项。';
 if(code==='lp_profile_type_mismatch')return '档案类别与投资者类型不一致，请核对自然人、机构或产品分类。';
 if(code==='invalid_lp_profile')return '原表档案字段不正确，请核对类别和填写内容。';
 if(code==='commitment_below_payment_plans')return '认缴额度不能低于当前有效缴款计划总额，请先核对并调整计划。';
 if(status===403)return '当前账号没有本项操作权限。';
 if(code==='material_version_unavailable')return '材料原件版本已失效或暂不可用，请核对当前LP资料并补交原件。';
 if(code==='material_not_linked')return '材料尚未关联当前LP，请核对本LP资料关联后重试。';
 if(status===409)return '记录已被更新或本次请求发生冲突。填写内容已保留，请先核对最新版本。';
 if(status===413)return '文件超过25 MiB，请选择较小的凭证。';
 if(status===415)return '文件内容或格式不支持，请选择有效原件。';
 if(code?.includes('evidence')||code?.includes('material'))return '凭证暂不可用，请核对本LP的资料关联、原件版本和读取权限。';
 if(status===400)return '未保存，请核对必填项、金额（人民币元，最多两位小数）和实际发生日期。';
 return '暂未确认保存结果。填写内容已保留，请原样重试本次请求，避免重复登记。';
}

export function lpReadFailure(error:unknown){
 const {status}=(error??{}) as {status?:number};
 if(status===401)return '登录已失效，请重新登录后读取台账。';
 if(status===403)return '当前账号没有读取此项记录的权限。';
 return '台账暂未读取成功，请重试。已有内容为上次成功读取的记录。';
}

export function suspectedLpReceipt(rows: {active?:boolean;amount:string;bankDate?:string;reference?:string}[], amount:string, day:string, reference:string){
 const normalized=/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(amount)?amount.split('.')[0]+'.'+(amount.split('.')[1]??'').padEnd(2,'0'):null;
 return rows.some(r=>r.active!==false&&((normalized!==null&&r.amount===normalized&&r.bankDate===day)||(reference.trim()!==''&&r.reference===reference.trim())));
}

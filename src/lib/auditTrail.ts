import { slugifyBusinessText } from "./textSlug.ts";

export type AuditModule =
  | "工作台"
  | "基金账本"
  | "项目账本"
  | "AI 收件箱"
  | "资料库"
  | "会议纪要"
  | "风险监控"
  | "任务中心"
  | "报告中心"
  | "资金事项"
  | "系统设置";

export type AuditTargetType = "基金" | "项目" | "资料" | "资金" | "报告" | "会议" | "风险" | "系统";

export type AuditEvent = {
  id: string;
  module: AuditModule;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  targetName: string;
  actor: string;
  time: string;
  detail: string;
  source?: string;
  dataOrigin?: string;dataPurpose?:string;
};

export type AuditJsonExportPackage = {
  fileName: string;
  mimeType: "application/json;charset=utf-8";
  content: string;
  summary: string;
};

export function createAuditEvent(input: Omit<AuditEvent, "id">): AuditEvent {
  return {
    ...input,
    id: `audit-${slugifyBusinessText(input.targetId)}-${slugifyBusinessText(input.action)}-${slugifyBusinessText(input.time)}`,
  };
}

export function prependUniqueAuditEvent(events: AuditEvent[], event: AuditEvent) {
  return events.some((item) => item.id === event.id) ? events : [event, ...events];
}

export function filterAuditEvents(
  events: AuditEvent[],
  filters: {
    module?: AuditModule;
    targetId?: string;
    targetType?: AuditTargetType;
  },
) {
  return events.filter((event) => {
    const moduleMatches = !filters.module || event.module === filters.module;
    const targetMatches = !filters.targetId || event.targetId === filters.targetId;
    const targetTypeMatches = !filters.targetType || event.targetType === filters.targetType;
    return moduleMatches && targetMatches && targetTypeMatches;
  });
}

export function formatAuditEvent(event: AuditEvent) {
  return `${event.time} ${event.actor}在${event.module}${event.action}：${event.targetName}`;
}

export function createAuditJsonExportPackage(
  events: AuditEvent[],
  {
    actor,
    exportedAt,
  }: {
    actor: string;
    exportedAt: string;
  },
): AuditJsonExportPackage {
  const fileName = `fund-management-audit-${slugifyBusinessText(exportedAt)}.json`;
  const content = JSON.stringify(
    {
      exportedAt,
      actor,
      total: events.length,
      events,
    },
    null,
    2,
  );

  return {
    fileName,
    mimeType: "application/json;charset=utf-8",
    content,
    summary: `${events.length} 条审计事件已生成 JSON 导出包：${fileName}`,
  };
}

export function auditActionLabel(action:string):string {
 const labels:Record<string,string>={createCase:'新建运营事项',requirement:'配置材料清单',attach:'关联依据原件',waive:'登记材料不适用',report:'保存事项正文',submitReview:'提交人工审核',review:'记录审核意见',feedback:'登记补件反馈',respond:'提交补件回复',submission:'登记报送与回执',reopen:'登记变更理由',reconcile:'核对清算数据',distribution:'登记清算分配',cancelDistribution:'撤回未支付分配',payDistribution:'关联实际付款',archive:'完成事项归档',rule:'登记费用规则',charge:'登记应收分期',cancelCharge:'取消应收分期',account:'登记资金账户',receipt:'登记银行回单',voidReceipt:'作废错误回单',allocate:'分配到账核销',unallocate:'撤回到账核销',capital:'核对可投资额度',document_template_save:'保存文档模板版本','LP master':'维护投资者档案','LP commitment':'登记认缴版本','LP receipt':'登记分笔实缴','LP correction':'更正实缴记录'};
 if(labels[action])return labels[action];if(action.startsWith('募集流程 '))return '募集办理 · '+({requirement:'材料要求',import:'采用资料清单',cancelRequirement:'取消材料要求',submit:'提交材料',review:'材料审核',plan:'缴款计划',cancelPlan:'取消缴款计划',allocate:'到账分配'}[action.slice(5)]??'更新办理记录');return /^[a-zA-Z_]+$/.test(action)?'更新业务记录':action;
}

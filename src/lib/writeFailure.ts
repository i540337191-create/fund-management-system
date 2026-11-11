export type WriteFailure = { message: string; href: string; action: string };

export function writeFailure(operation: string, target: string, href: string, error: unknown): WriteFailure {
  const status = (error as { status?: number } | null)?.status;
  const code=(error as {code?:string}|null)?.code;
  const reason = code==='ai_intake_scope_change_required'?'归属与原件不一致，请先在资料库的“版本 / 关联”中调整原件归属，再回到收件箱归档。':code==='ai_intake_state_changed'?'收件状态已变化，请刷新核对；已归档记录不能再次退回或覆盖。':status === 403 ? '当前账号没有这项操作的权限，请联系管理员核对授权。'
    : status === 400 ? '填写内容未通过校验，请返回该事项检查。'
    : status === 404 ? '原记录未找到，请返回核对记录及当前数据筛选。'
    : status === 409 ? '记录状态或版本已变化，请核对最新记录后再操作。'
    : status === 401 ? '登录已失效，请重新登录后核对结果。'
    : '未能确认服务器处理结果，请先核对记录，避免重复提交。';
  return { message: `上次“${operation}”${target ? `（${target}）` : ''}未确认完成。${reason}`, href, action: '前往该事项核对' };
}

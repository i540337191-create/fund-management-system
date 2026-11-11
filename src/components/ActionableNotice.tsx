import type { ReactNode } from 'react';
import { navigate } from './Layout';

export function ActionableNotice({ children, href, action, onRefresh, onDismiss, busy = false }: {
  children: ReactNode; href: string; action: string; onRefresh?: () => void; onDismiss?: () => void; busy?: boolean;
}) {
  return <div role="alert" className="actionable-notice">
    <div className="actionable-notice-message">{children}</div>
    <div className="actionable-notice-actions">
      <a data-ui="navigation" href={href} onClick={event => { if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate(href);} }}>{action} →</a>
      {onRefresh ? <button data-ui="secondary" disabled={busy} onClick={onRefresh}>{busy ? '正在核对…' : '重新读取数据'}</button> : null}
      {onDismiss ? <button data-ui="secondary" aria-label="关闭此条操作提示" onClick={onDismiss}>关闭提示</button> : null}
    </div>
  </div>;
}

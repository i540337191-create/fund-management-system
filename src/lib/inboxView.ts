import type { AiIntakeItem } from '../data/funds';

export function intakeQueue(items: AiIntakeItem[], status: '全部' | AiIntakeItem['status']) {
  return items.filter(item => status === '全部' || item.status === status)
    .sort((a, b) => Number(b.status === '待确认') - Number(a.status === '待确认'));
}

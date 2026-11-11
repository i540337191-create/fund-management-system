export type PaymentStatus = "未收" | "部分收" | "已收" | "逾期";

export type CapitalItem = {
  id?: string;
  fundId?: string;
  projectId?: string | null;
  company: string;
  fund: string;
  received: string;
  date: string;
  rule: string;
  receivable: string;
  dueDate: string;
  status: PaymentStatus;
  source?: string;
  confirmationStatus?: string;
  updatedAt?: string;
  dataOrigin?: string;dataPurpose?:string;
};

export const capitalItems: CapitalItem[] = [
  {
    company: "演示智能设备有限公司",
    fund: "示例成长一期基金",
    received: "3000 万元",
    date: "2026-04-27",
    rule: "年化 2%，按日计费",
    receivable: "407,671 元",
    dueDate: "2026-05-06",
    status: "未收",
  },
  {
    company: "演示先进材料有限公司",
    fund: "示例成长一期基金",
    received: "2500 万元",
    date: "2026-03-18",
    rule: "年化 1.8%，按季计费",
    receivable: "296,712 元",
    dueDate: "2026-05-08",
    status: "部分收",
  },
  {
    company: "演示供应链有限公司",
    fund: "示例创新基金",
    received: "3600 万元",
    date: "2026-02-12",
    rule: "年化 2.2%，按日计费",
    receivable: "516,493 元",
    dueDate: "2026-05-11",
    status: "未收",
  },
  {
    company: "演示医疗科技有限公司",
    fund: "示例制造基金",
    received: "1200 万元",
    date: "2026-01-20",
    rule: "固定比例 1.5%",
    receivable: "55,124 元",
    dueDate: "2026-04-24",
    status: "逾期",
  },
];

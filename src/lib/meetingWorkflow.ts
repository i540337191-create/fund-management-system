import type { MeetingRecord } from "../data/meetings";
import type { Project } from "../data/projects";
import type { MaterialRecord } from "./materialFilters";
import { createAuditEvent, type AuditEvent } from "./auditTrail.ts";
import { slugifyBusinessText } from "./textSlug.ts";
import type { ProjectTask } from "./workbenchLogic";

export type MeetingConfirmationResult = {
  updatedMeeting: MeetingRecord;
  material: MaterialRecord;
  tasks: ProjectTask[];
  auditEvents: AuditEvent[];
};

export function createMeetingConfirmationResult({
  meeting,
  projects,
  actor,
  confirmedAt,
  dueDate,
}: {
  meeting: MeetingRecord;
  projects: Project[];
  actor: string;
  confirmedAt: string;
  dueDate: string;
}): MeetingConfirmationResult {
  const project = projects.find((item) => item.name === meeting.project || item.shortName === meeting.project) ?? null;
  const targetId = project?.id ?? slugifyBusinessText(meeting.project);
  const targetName = project?.name ?? meeting.project;
  const taskOwner = project?.manager ?? actor;
  const taskStage = project?.stage ?? "投后";
  const archivedDate = confirmedAt.slice(0, 10);
  const citationCount = String(
    meeting.conclusions.length + meeting.todoItems.length + meeting.riskItems.length,
  );

  const tasks: ProjectTask[] = project
    ? meeting.todoItems.map((item) => ({
        id: `meeting-${project.id}-${slugifyBusinessText(item)}`,
        name: `跟进${item}`,
        type: "会议待办",
        stage: taskStage,
        owner: taskOwner,
        dueDate,
        status: "未开始",
        priority: meeting.risks > 0 ? "高" : "中",
        relation: `会议纪要 / ${meeting.title}`,
        note: `由${meeting.title}确认归档后生成。会议风险点：${meeting.riskItems.join("、") || "无"}`,
      }))
    : [];

  return {
    updatedMeeting: {
      ...meeting,
      status: "已归档",
    },
    material: [
      `${meeting.title}.docx`,
      "会议资料",
      actor,
      archivedDate,
      "会议纪要 / 已确认",
      "已摘要",
      citationCount,
      meeting.project,
    ],
    tasks,
    auditEvents: [
      createAuditEvent({
        module: "会议纪要",
        action: "确认会议纪要",
        targetType: project ? "项目" : "基金",
        targetId,
        targetName: meeting.title,
        actor,
        time: confirmedAt,
        detail: "会议纪要已归档到资料库，并绑定对应项目或基金。",
        source: "会议纪要",
      }),
      createAuditEvent({
        module: "任务中心",
        action: "生成会议待办",
        targetType: project ? "项目" : "基金",
        targetId,
        targetName,
        actor,
        time: confirmedAt,
        detail: `由会议纪要生成 ${tasks.length} 条待办。`,
        source: meeting.title,
      }),
    ],
  };
}

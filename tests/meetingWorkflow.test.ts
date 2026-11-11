import assert from "node:assert/strict";
import test from "node:test";
import { meetings } from "../src/data/meetings.ts";
import { projects } from "../src/data/projects.ts";
import { createMeetingConfirmationResult } from "../src/lib/meetingWorkflow.ts";

test("confirming a project meeting creates material, tasks, and audit events", () => {
  const meeting = meetings.find((item) => item.title === "演示智能设备投后月度沟通会");
  assert.ok(meeting);

  const result = createMeetingConfirmationResult({
    meeting,
    projects,
    actor: "演示投资经理",
    confirmedAt: "2026-06-10 19:00",
    dueDate: "2026-06-12",
  });

  assert.equal(result.updatedMeeting.status, "已归档");
  assert.deepEqual(result.material, [
    "演示智能设备投后月度沟通会.docx",
    "会议资料",
    "演示投资经理",
    "2026-06-10",
    "会议纪要 / 已确认",
    "已摘要",
    "8",
    "演示智能设备有限公司",
  ]);
  assert.deepEqual(
    result.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      owner: task.owner,
      dueDate: task.dueDate,
      relation: task.relation,
    })),
    [
      {
        id: "meeting-demo-robotics-shou-ji-er-ji-du-jing-ying-shu-ju",
        name: "跟进收集二季度经营数据",
        owner: "演示投资经理",
        dueDate: "2026-06-12",
        relation: "会议纪要 / 演示智能设备投后月度沟通会",
      },
      {
        id: "meeting-demo-robotics-bu-qi-bu-tie-shen-bao-zi-liao",
        name: "跟进补齐补贴申报资料",
        owner: "演示投资经理",
        dueDate: "2026-06-12",
        relation: "会议纪要 / 演示智能设备投后月度沟通会",
      },
      {
        id: "meeting-demo-robotics-fa-wu-que-ren-zhuan-li-bian-geng-wen-jian",
        name: "跟进法务确认专利变更文件",
        owner: "演示投资经理",
        dueDate: "2026-06-12",
        relation: "会议纪要 / 演示智能设备投后月度沟通会",
      },
    ],
  );
  assert.deepEqual(result.auditEvents.map((event) => event.module), ["会议纪要", "任务中心"]);
});

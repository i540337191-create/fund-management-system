import { createHash, randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeBlob } from '../http/material-upload.ts';
import { generateDocument, documentMime, type BusinessDocument } from './document-output.ts';
import type { Meeting } from './store.ts';
import type { MaterialVersion } from './material-upload.ts';

export function meetingDocument(meeting: Meeting, derivative = false): BusinessDocument {
  return {title: meeting.title, subtitle: derivative ? '根据系统留存会议记录生成的副本；非上传原件，未补建历史文件版本。' : '根据确认时的会议记录生成的归档文件；非外部上传原件。', sections: [
    {title:'会议信息',text:`项目：${meeting.project}\n日期：${meeting.date}\n参会人：${meeting.attendees}\n记录编号：${meeting.id}`},
    {title:'会议摘要',text:meeting.summary},
    {title:'会议结论',text:meeting.conclusions.join('\n')},
    {title:'会议待办',text:meeting.todoItems.join('\n')},
    {title:'风险事项',text:meeting.riskItems.join('\n')},
    ...(meeting.taskDueDate ? [{title:'待办截止日期',text:meeting.taskDueDate}] : []),
  ]};
}

// Keep staged bytes if COMMIT may have succeeded; retries then return the committed version.
export async function meetingFileTransaction<T>(root: string | undefined, action: (stage: (meeting: Meeting, actor: {id:string;name:string}) => Promise<MaterialVersion>) => Promise<T>, memory = false): Promise<T> {
  const paths: string[] = [];
  try {
    return await action(async (meeting, actor) => {
      const bytes = await generateDocument(meetingDocument(meeting), 'docx');
      const id = randomUUID(), sha256 = createHash('sha256').update(bytes).digest('hex');
      paths.push(await writeBlob(root ?? process.env.MATERIAL_STORAGE_ROOT ?? resolve(import.meta.dirname, '../../..', 'private-material-storage'), id, bytes));
      return {id, blobId:id, materialId:`material-meeting-${meeting.id}`, version:1, name:`${meeting.title}.docx`, sizeBytes:bytes.length, sha256, mimeType:documentMime.docx, uploadedBy:actor.name, uploadedById:actor.id, createdAt:new Date().toISOString(), requestId:randomUUID(), fingerprint:`meeting-generated:${meeting.id}:${sha256}`, auditEventId:''};
    });
  } catch (error) {
    if (memory || (error as {safeToDeleteBlob?:boolean})?.safeToDeleteBlob) await Promise.all(paths.map(path => unlink(path).catch(() => {})));
    throw error;
  }
}

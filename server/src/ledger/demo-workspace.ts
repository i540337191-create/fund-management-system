import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { currentReportWeek } from '../agent/report-week.ts';

function expectSuccess(response: LightMyRequestResponse) {
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`Demo initialization failed: ${response.statusCode} ${response.body.slice(0, 200)}`);
}

/** Exercise normal upload and weekly-report validation with newly written fictional documents. */
export async function seedDemoWorkspace(server: FastifyInstance) {
  const documents = [
    { name: 'Demo-Portfolio-Update.md', type: '投后报告', projectId: 'demo-project-1', text: '# Demo portfolio update\n\nSYNTHETIC DATA — not a real company report.\n\nDemo Smart Devices is a fictional portfolio company. This document demonstrates quarterly reporting and follow-up work.\n\n## Next actions\n- Collect the quarterly operating report.\n- Review the investment agreement attachments.\n- Confirm the next portfolio review.\n' },
    { name: 'Demo-Investment-Memo.md', type: '投资资料', projectId: 'demo-project-2', text: '# Demo investment memo\n\nAll entities, figures and decisions are fictional. This is not investment advice.\n\n## Project\nDemo Clean Energy is used to demonstrate a diligence workflow.\n\n## Review checklist\n- Financial evidence\n- Customer concentration\n- Ownership documents\n- Investment committee review\n\nNo real investment has been approved.\n' },
    { name: 'Demo-Investor-Checklist.md', type: '募集文件', fundId: 'demo-fund-3', text: '# Demo investor checklist\n\nSynthetic example only. Not a jurisdiction-specific legal checklist.\n\n- Confirm investor identity and authority.\n- Review the applicable fund documents.\n- Record commitment and payment evidence.\n- Assign a reviewer and retain the review trail.\n\nConfigure requirements with qualified professionals before real use.\n' },
  ];
  for (const doc of documents) {
    const query = new URLSearchParams({ requestId: randomUUID(), name: doc.name, type: doc.type, ...(doc.projectId ? { projectId: doc.projectId } : { fundId: doc.fundId! }) });
    expectSuccess(await server.inject({ method: 'POST', url: `/api/materials/upload?${query}`, headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from(doc.text) }));
  }
  const workspace = await server.inject({ method: 'GET', url: '/api/agent-workspace' });
  expectSuccess(workspace);
  expectSuccess(await server.inject({ method: 'POST', url: '/api/agent-workspace/actions', payload: { requestId: randomUUID(), expectedRevision: workspace.json().revision, action: 'save_weekly', data: { title: 'Weekly portfolio review (demo)', week: currentReportWeek(), thisWeek: 'Reviewed the fictional portfolio updates.\nPrepared the sample investment memo.\nFlagged missing documents for follow-up.', nextWeek: 'Complete diligence document review.\nConfirm the next investor update.\nReview pending portfolio actions.', status: 'draft', taskIds: [] } } }));
}

import assert from 'node:assert/strict';
export async function verifyTaskSourceLocation(tab,{projectId,taskId,clauseId}){
 const base='http://127.0.0.1:15219';
 assert.equal(new URL(await tab.url()).origin,base,'only the isolated in-memory visual fixture');
 const href=id=>`${base}/projects/${encodeURIComponent(projectId)}?tab=${encodeURIComponent('任务待办')}&taskId=${encodeURIComponent(id)}`;
 const rowState=()=>tab.playwright.evaluate(id=>{const row=document.getElementById('workflow-task-'+id);return {found:Boolean(row),selected:row?.getAttribute('data-source-selected'),focused:document.activeElement===row};},taskId);
 await tab.goto(href(taskId));await tab.playwright.getByRole('button',{name:'再次定位',exact:true}).waitFor({state:'visible',timeoutMs:10000});
 var state=await rowState();assert.equal(state.found,true);assert.equal(state.selected,'true');assert.equal(state.focused,true);
 await tab.playwright.getByRole('combobox',{name:'任务状态',exact:true}).selectOption('已完成');
 assert.equal(await tab.playwright.getByRole('button',{name:'显示并定位该任务',exact:true}).isVisible(),true);
 await tab.playwright.getByRole('button',{name:'显示并定位该任务',exact:true}).click();await tab.playwright.domSnapshot();
 state=await rowState();assert.equal(state.found,true);assert.equal(state.selected,'true');assert.equal(state.focused,true);
 await tab.playwright.locator('#workflow-task-'+taskId).getByRole('link',{name:'前往投后处理',exact:true}).click();
 await tab.playwright.getByText('当前任务关联来源 V2，已定位对应批次并展开历史。',{exact:true}).waitFor({state:'visible',timeoutMs:10000});
 assert.equal(await tab.playwright.evaluate(()=>document.activeElement?.id),'post-'+clauseId);
 await tab.playwright.getByRole('button',{name:'期间档案',exact:true}).click();
 assert.equal(await tab.playwright.getByText('当前任务关联来源 V2，已定位对应批次并展开历史。',{exact:true}).count(),0);
 await tab.goto(href('isolated-task-not-present'));
 await tab.playwright.getByText('目标任务不在当前账号可见任务范围内，请核对链接、来源范围或记录状态。',{exact:true}).waitFor({state:'visible',timeoutMs:10000});
 assert.equal(await tab.playwright.locator('tr[data-source-selected="true"]').count(),0);
 assert.ok(await tab.playwright.getByRole('region',{name:'项目任务列表，可滚动查看全部任务',exact:true}).locator('tbody tr').count()>0,'an invalid link never hides existing tasks');
 return {result:'passed',scope:'in-memory browser only',checks:['row and focus','filtered target recovery','exact source return','no cross-tab source claim','unknown link preserves task list']};
}

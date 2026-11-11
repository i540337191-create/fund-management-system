import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../src/components/Layout.tsx", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../src/components/ui.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const materialLayoutSource=readFileSync(new URL("../src/iterationA/approved-c.css",import.meta.url),"utf8");
const capitalSource=readFileSync(new URL("../src/iterationB/CapitalPortfolioView.tsx",import.meta.url),"utf8");
const capitalLayoutSource=readFileSync(new URL("../src/iterationB/capitalFocus.css",import.meta.url),"utf8");
const dataOriginSource=readFileSync(new URL("../src/lib/dataOrigin.ts",import.meta.url),"utf8");
const materialAssistantSource = readFileSync(new URL("../src/lib/materialAssistant.ts", import.meta.url), "utf8");
const materialPreviewLinksSource = readFileSync(new URL("../src/lib/materialPreviewLinks.ts", import.meta.url), "utf8");

test("settings keeps account, custom fields and audit actions without exposing deployment details", () => {
  const settings=appSource.slice(appSource.indexOf('function SettingsPage('));
  assert.match(settings,/AccountSettingsPanel/);assert.match(settings,/CustomFieldSettings/);assert.match(settings,/onAuditExport/);assert.match(settings,/fetchAiServiceStatus/);
  assert.doesNotMatch(settings,/正式发布就绪度|Base URL|maskedApiKey|providerName|\.model|QWEN_API_KEY|Nginx|RBAC/);
});

test("materials page keeps responsive file rows, directory selection and contextual details", () => {
  const materials=appSource.slice(appSource.indexOf('function MaterialsPage('),appSource.indexOf('function MaterialEvidenceActions('));
  assert.match(materials,/material-c-body/);assert.match(materials,/material-register-content/);assert.match(materials,/material-detail-trigger/);
  assert.match(materials,/headers=\{\['文件','关联对象','状态 \/ 正文','选择'\]\}/);
  assert.match(materials,/<MaterialDirectoryTree[^>]*onSelect=\{setSelectedMaterialKey\}/);
  assert.match(materials,/<MaterialDetailPane/);
  assert.doesNotMatch(materials,/min-w-\[1520px\]/);
  assert.match(materialLayoutSource,/\.material-c-body\{grid-template-columns:minmax\(0,1\.85fr\) minmax\(330px,1fr\)/);
  assert.match(materialLayoutSource,/@media\(max-width:1100px\)\{[^}]*\.material-c-body\{grid-template-columns:minmax\(0,1fr\)/);
});

test("shared data table follows responsive table guidance for narrow viewports", () => {
  assert.match(uiSource, /responsive-table/);
  assert.match(uiSource, /data-label/);
  assert.match(cssSource, /\.responsive-table/);
  assert.match(cssSource, /@media \(max-width: 767px\)/);
  assert.match(cssSource, /content: attr\(data-display-label\)/);
});

test("materials page exposes evidence review links for AI citations", () => {
  assert.match(appSource, /sourceMaterialKnowledgeEntries/);
  assert.match(materialPreviewLinksSource, /createMaterialEvidenceLinks/);
  assert.match(appSource, /原文 \/ 识别/);
  assert.match(appSource, /MaterialEvidenceActions/);
  assert.match(appSource, /MaterialReviewActions/);
  assert.match(appSource, /MaterialReviewModal/);
  assert.match(appSource, /归属入库/);
  assert.match(appSource, /确认入库/);
  assert.match(appSource, /shortMaterialEvidenceLabel/);
  assert.match(appSource, /relationScopeOptions/);
  assert.match(appSource, /materialApiRecords/);
  assert.match(appSource, /DataOriginBadge/);
  assert.match(dataOriginSource, /PDF识别物料/);
  assert.match(dataOriginSource, /真实原始物料/);
  assert.match(dataOriginSource, /模拟业务数据/);
});

test("materials page opens preview assets in a new tab and keeps archive review in the app", () => {
  assert.match(appSource, /openMaterialPreview/);
  assert.match(appSource, /aria-label=\{`查看资料详情：\$\{context\.row\.name\}`\}/);
  assert.match(appSource, /归属入库/);
  assert.match(appSource, /识别文本/);
  assert.match(appSource, /原文 \/ 识别/);
  assert.match(materialPreviewLinksSource, /下载原始文件/);
  assert.match(materialPreviewLinksSource, /recognizedHtmlPath/);
  assert.match(materialPreviewLinksSource, /pageImages/);
  assert.match(materialPreviewLinksSource, /recognized_html/);
  assert.match(materialPreviewLinksSource, /original_page_images/);
  assert.match(appSource, /createMaterialPrimaryPreviewLink/);
  assert.match(appSource, /primaryPreviewLink/);
  assert.match(materialPreviewLinksSource, /metadata_preview/);
  assert.match(materialPreviewLinksSource, /查看资料卡片/);
  assert.match(materialPreviewLinksSource, /\/materials\/preview/);
  assert.match(materialPreviewLinksSource, /sourceHref/);
  assert.match(materialPreviewLinksSource, /downloadHref/);
  assert.match(appSource, /MaterialControlledPreviewPage/);
  assert.match(appSource, /path === "\/materials\/preview"/);
  assert.doesNotMatch(appSource, /预览资源路径/);
  assert.doesNotMatch(appSource, /原始文件路径/);
  assert.match(appSource, /xl:grid-cols-\[88px_minmax\(0,1fr\)_minmax\(0,1fr\)_88px\]/);
  assert.match(appSource, /createPreviewDownloadLabel/);
  assert.match(appSource, /下载当前页图/);
  assert.match(appSource, /MaterialCompareToolbar/);
  assert.match(appSource, /MaterialComparePane/);
  assert.match(appSource, /MaterialCompareMetaBar/);
  assert.match(appSource, /MaterialPreviewThumbnailRail/);
  assert.match(appSource, /MaterialRecognizedThumbnailRail/);
  assert.match(appSource, /createMaterialRecognizedHtmlThumbnails/);
  assert.match(appSource, /识别页/);
  assert.match(appSource, /originalThumbnailRailRef/);
  assert.match(appSource, /recognizedThumbnailRailRef/);
  assert.match(appSource, /scrollMaterialPreviewRailPageIntoView/);
  assert.match(appSource, /scrollThumbnailRailsToPage/);
  assert.match(appSource, /syncThumbnailRailsToRatio/);
  assert.match(appSource, /onRailScroll/);
  assert.match(appSource, /data-preview-rail="original"/);
  assert.match(appSource, /data-preview-rail="recognized"/);
  assert.match(appSource, /data-page=\{page\}/);
  assert.match(appSource, /hasPageThumbnails \? \(\s*<MaterialRecognizedThumbnailRail[\s\S]*onPageSelect=\{\(page\) => goToPageNumber\(page, true\)\}/);
  assert.match(appSource, /shouldIgnoreMaterialPreviewPageKeydown/);
  assert.match(appSource, /event\.key === "ArrowUp"/);
  assert.match(appSource, /event\.key === "ArrowDown"/);
  assert.match(appSource, /更多预览工具/);
  assert.match(appSource, /资料信息/);
  assert.match(appSource, /hasRecognizedPreview/);
  assert.match(appSource, /原文预览/);
  assert.match(appSource, /hasRecognizedPreview \? \(\s*<>\s*<MaterialComparePane[\s\S]*title="右识别"/);
  assert.match(appSource, /同步滚动/);
  assert.match(appSource, /左原文/);
  assert.match(appSource, /右识别/);
  assert.match(appSource, /命中高亮/);
  assert.match(appSource, /highlightTerms/);
  assert.match(appSource, /scrollRecognizedHighlightIntoView/);
  assert.match(appSource, /createPageImageHref/);
  assert.match(appSource, /syncScroll/);
  assert.match(appSource, /setZoomPercent/);
  assert.match(appSource, /originalRotationsByPage/);
  assert.match(appSource, /recognizedRotationsByPage/);
  assert.match(appSource, /rotateOriginalPage/);
  assert.match(appSource, /rotateRecognizedPage/);
  assert.match(appSource, /MaterialPaneHeaderButton/);
  assert.match(appSource, /titleActions/);
  assert.match(appSource, /normalizeMaterialPreviewRotation/);
  assert.match(appSource, /rotateMaterialPreviewPageSize/);
  assert.match(appSource, /createRotatedMaterialPreviewStageStyle/);
  assert.match(appSource, /createRotatedMaterialPreviewFrameStyle/);
  assert.match(appSource, /原文旋转/);
  assert.match(appSource, /识别旋转/);
  assert.doesNotMatch(appSource, /横向页对齐/);
  assert.doesNotMatch(appSource, /alignLandscapePage/);
  assert.doesNotMatch(appSource, /jumpPreviewToRatio/);
  assert.doesNotMatch(appSource, /onJumpTop/);
  assert.match(appSource, /computeMaterialPreviewPageDisplaySize/);
  assert.match(appSource, /material-preview-page-stage/);
  assert.match(appSource, /pageDisplaySize/);
  assert.match(appSource, /setPaneScrollToRatios/);
  assert.match(appSource, /readPaneScrollRatios/);
  assert.match(appSource, /startSyncedPreviewPan/);
  assert.match(appSource, /material-preview-sync-pane/);
  assert.match(appSource, /readMaterialPreviewHtmlPageKind/);
  assert.match(appSource, /preserveRecognizedPageBox/);
  assert.match(appSource, /recognizedPageKind === "text"/);
  assert.match(appSource, /layoutCacheState/);
  assert.match(appSource, /generateMaterialPreviewLayoutCache/);
  assert.match(appSource, /generateMaterialPreviewLayoutCacheBatch/);
  assert.match(appSource, /createMaterialPreviewLayoutCacheHref/);
  assert.match(appSource, /重新生成本页高保真排版/);
  assert.match(appSource, /重新生成全文高保真排版/);
  assert.match(appSource, /重排本页/);
  assert.match(appSource, /重排全文/);
  assert.match(appSource, /版式缓存已应用/);
  assert.match(appSource, /版式缓存已保留/);
  assert.match(appSource, /重新生成失败/);
  assert.match(appSource, /readMaterialPreviewHtmlPageSize/);
  assert.match(appSource, /computeRecognizedHtmlDisplaySize/);
  assert.match(appSource, /recognizedHtmlContentSize/);
  assert.match(appSource, /measureMaterialPreviewRenderedPageSize/);
  assert.match(appSource, /allowHeightOverflowForCompleteness/);
  assert.match(appSource, /recognizedOcrMode/);
  assert.match(appSource, /MaterialPreviewOcrMode/);
  assert.match(appSource, /正文预览模式/);
  assert.match(appSource, /正文阅读版/);
  assert.match(appSource, /原始识别结果/);
  assert.match(appSource, /表格高保真/);
  assert.match(appSource, /updateRecognizedOcrMode/);
  assert.match(appSource, /MaterialPreviewOcrModeSelect/);
  assert.match(appSource, /MaterialPreviewMenuButton/);
  assert.match(appSource, /material-recognized-html-preview--faithful/);
  assert.match(appSource, /\.page:has\(table\)/);
  assert.match(appSource, /white-space: nowrap !important/);
  assert.match(appSource, /word-break: keep-all !important/);
  assert.match(appSource, /阅读版/);
  assert.match(appSource, /原始识别结果/);
  assert.match(appSource, /filterMaterialPreviewHtmlToPage/);
  assert.match(appSource, /currentPage=\{currentPage\}/);
  assert.match(appSource, /pageBox=\{pageDisplaySize\}/);
  assert.match(appSource, /h-screen overflow-hidden/);
  assert.match(appSource, /dangerouslySetInnerHTML/);
  assert.match(appSource, /expandMaterialPreviewSrcdocIframes/);
  assert.match(appSource, /iframe\[srcdoc\]/);
  assert.match(appSource, /scopeMaterialPreviewCss/);
  assert.match(appSource, /MATERIAL_PREVIEW_PAGE_SCOPE_PREFIX/);
  assert.match(appSource, /material-preview-page-scope-/);
  assert.match(appSource, /createScopedMaterialPreviewStyleTags\(iframeDoc, pageScopeSelector\)/);
  assert.match(appSource, /MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE/);
  assert.match(appSource, /createMaterialPreviewIntegrityStyleTag/);
  assert.match(appSource, /createMaterialPreviewDocumentIntegrityStyleTag/);
  assert.match(appSource, /\.ocr-document-page/);
  assert.match(appSource, /pageClone\.style\.overflow = "visible"/);
  assert.match(appSource, /pageClone\.style\.height = "auto"/);
  assert.match(appSource, /pageClone\.style\.minHeight = "0"/);
  assert.match(appSource, /pageClone\.style\.background = "#ffffff"/);
  assert.match(appSource, /material-preview-recognized-page-stage mx-auto overflow-visible rounded bg-white/);
  assert.match(appSource, /background: #ffffff !important/);
  assert.match(appSource, /align-items: flex-start !important/);
  assert.match(appSource, /justify-content: flex-start !important/);
  assert.match(appSource, /\$\{scopeSelector\} \*/);
  assert.match(cssSource, /\.material-preview-highlight/);
  assert.match(appSource, /target="_blank"/);
  assert.doesNotMatch(appSource, /受控预览/);
  assert.doesNotMatch(appSource, /material-preview-recognized-page-stage mx-auto overflow-hidden/);
  assert.doesNotMatch(appSource, /material-preview-recognized-page-stage mx-auto overflow-visible rounded bg-\[#fffdf8\]/);
  assert.doesNotMatch(appSource, /<iframe/);
  assert.doesNotMatch(appSource, /缺少预览/);
  assert.match(materialPreviewLinksSource, /previewFilePath/);
  assert.match(materialPreviewLinksSource, /preview_document/);
  assert.match(materialPreviewLinksSource, /查看预览文档/);
  assert.match(appSource, /暂无识别文本/);
  assert.match(appSource, /保存归属/);
  assert.match(appSource, /确认入库/);
  assert.doesNotMatch(appSource, /disabled=\{!relationConfirmed \|\| archived\}/);
});

test("delivery removes simulation switches while retaining all original records",()=>{
 assert.doesNotMatch(layoutSource,/aria-label="隐藏模拟与工程测试记录"/);
 assert.match(appSource,/const hideSeedDemoData\s*=\s*false/);
 assert.match(layoutSource,/<SidebarConversationHistory[^>]*hide=\{false\}/);
});

test("AI employee uses live streaming, citation-aware answers and server-owned context",()=>{
 const assistant=readFileSync(new URL('../src/components/AiEmployeePage.tsx',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server/src/http/assistant.ts',import.meta.url),'utf8');
 assert.match(appSource,/<AiEmployeePage/);assert.match(assistant,/streamAssistantTurn/);assert.match(assistant,/<AssistantMarkdown/);assert.match(assistant,/assistant-citations/);assert.match(server,/searchCurrentMaterialTextChunks/);assert.match(server,/allowedMaterialIds/);assert.match(server,/canReadMaterial/);assert.match(server,/providerText/);assert.doesNotMatch(assistant,/conversationSeeds|useVoiceInputExample/);assert.match(assistant,/assistantClient.get\(id\)/);assert.match(assistant,/clearInterval\(timer\)/);
});

test("capital page keeps scoped ledgers in its responsive portfolio workspace", () => {
  const capital=appSource.slice(appSource.indexOf('function CapitalPage('));
  assert.match(capital,/<CapitalPortfolio detailWorkspace=\{<CapitalDetailWorkspace/);
  for(const panel of ['InvestmentLedgerPanel','InvestmentCashflowLedgerPanel','ExitSettlementLedgerPanel'])assert.match(capital,new RegExp('<'+panel));
  assert.match(capitalSource,/capital-focus-workspace/);
  assert.match(capitalSource,/portfolio-table-scroll/);
  assert.match(capitalLayoutSource,/\.capital-focus-workspace\{display:grid;grid-template-columns:306px minmax\(0,1fr\)/);
  assert.match(capitalLayoutSource,/@media\(max-width:1000px\)\{\.capital-focus-workspace\{grid-template-columns:1fr/);
  assert.doesNotMatch(capital,/min-w-\[1040px\]/);
  assert.doesNotMatch(appSource,/function CalculationCard\(/);
});

test("critical icon-only controls expose accessible labels", () => {
  const fileDialogs = readFileSync(new URL("../src/components/MaterialFileDialogs.tsx", import.meta.url), "utf8");
  assert.ok(fileDialogs.includes('aria-label={`关闭${title}`}'));
  assert.ok(appSource.includes("<WorkflowDialog title={isEditing?'编辑资金事项':'创建资金事项'}"));
  assert.ok(fileDialogs.includes('<FileDialog title="上传资料"'));
  const combinedSource = `${appSource}\n${layoutSource}`;
  const notificationSource=readFileSync(new URL('../src/components/NotificationCenter.tsx',import.meta.url),'utf8');
  assert.match(layoutSource,/<NotificationCenter\s*\/>/);
  assert.ok(notificationSource.includes('aria-label={state?`通知，${unread.length}条未读`'));
  assert.ok(notificationSource.includes('通知，正在读取未读状态'));
  assert.ok(notificationSource.includes('通知，未读状态尚未读取'));

  for (const label of [
    "关闭新建项目抽屉",
    "关闭新建任务弹窗",
  ]) {
    assert.match(combinedSource, new RegExp(`aria-label="${label}"`));
  }
});

test("route content remains keyed so navigation resets route-local state", () => {
  assert.match(layoutSource, /key=\{currentPath \|\| "\/"\}/);
});

test("primary navigation keeps business routes and uses new conversation as the single assistant entry", () => {
  assert.match(layoutSource, /const navSections = \[/);
  assert.match(layoutSource, /aria-label="主导航"/);
  assert.match(layoutSource, /aria-current=\{active \? "page" : undefined\}/);

  assert.match(layoutSource,/title:\s*"业务导航"/);
  const expected=[['工作台','/dashboard'],['基金管理','/funds'],['项目账本','/projects'],['资金与费用','/capital'],['资料库','/materials'],['任务中心','/tasks'],['风险监控','/monitoring'],['会议纪要','/meetings'],['报告中心','/reports'],['系统设置','/settings']];
  const actual=Array.from(layoutSource.matchAll(/label:\s*"([^"]+)",\s*path:\s*"(\/[^"]+)"/g),m=>[m[1],m[2]]);
  assert.deepEqual(actual,expected);
  assert.match(layoutSource,/aria-label=\{`AI收件箱，/);
  assert.match(layoutSource,/navigate\('\/ai-inbox'\)/);

  assert.doesNotMatch(layoutSource, /label: "AI 数字员工", path:/);
  assert.match(layoutSource,/const startNewConversation=/);
  assert.match(layoutSource,/sidebar-new-conversation/);
  assert.doesNotMatch(layoutSource, /label: "项目企业"/);
  assert.doesNotMatch(layoutSource, /label: "资金事项"/);
});

test("page titles follow the adjusted menu language", () => {
  assert.match(readFileSync(new URL("../src/components/DashboardWorkspace.tsx", import.meta.url), "utf8"), /<h1>工作台<\/h1>/);
  assert.match(appSource, /title="项目账本"/);
  assert.match(capitalSource, /title="资金与费用"/);
});

test("navigation routes stay covered by the app router including detail flows", () => {
  const navPaths = Array.from(layoutSource.matchAll(/path:\s*"(\/[^"]+)"/g)).map((match) => match[1]);

  assert.equal(navPaths.length,10,'navigation extraction must include all current business routes');
  assert.ok(navPaths.includes('/meetings'));
  for (const routePath of navPaths) {
    if (routePath === "/dashboard") continue;
    assert.match(appSource, new RegExp(`path === "${routePath.replace("/", "\\/")}"`));
  }

  assert.match(appSource, /if \(path\.startsWith\("\/funds\/"\)\)/);
  assert.match(appSource, /if \(path\.startsWith\("\/projects\/"\)\)/);
  assert.match(appSource, /if \(path === "\/reports\/create"\)/);
  assert.match(layoutSource, /currentPath === "\/" \|\| currentPath === "\/dashboard"/);
  assert.match(layoutSource, /currentPath\.startsWith\(path\)/);
});

import { createMaterialKnowledgeEntries, summarizeMaterialKnowledge, type SourceMaterialSourceEntry } from '../../src/lib/materialKnowledge.ts';
import type { MaterialTextChunk } from '../../src/lib/materialRag.ts';

// Synthetic parser fixtures. OCR status below exercises parsers; no OCR service or customer document was used.
export const fixtureSources: SourceMaterialSourceEntry[] = [
  ['demo-doc-office', 'Demo-Fund-Agreement.docx', 'docx', '募集文件'],
  ['demo-doc-risk', '演示风险匹配告知书.pdf', 'pdf', '投资者适当性资料'],
  ['demo-doc-report', 'Demo-Quarterly-Report.pdf', 'pdf', '信息披露资料'],
].map(([id, file_name, extension, category]) => ({
  id, file_name, extension, category, relative_path: `originals/${file_name}`, size_bytes: 100, sha256: '0'.repeat(64), business_area: '演示', archive_path: category === '投资者适当性资料' ? '基金档案 / 募集 / 投资者适当性' : '基金档案 / 募集 / 协议签署', project_or_fund: '示例成长一期基金', uploader: '演示投资经理', archived_at: '2026-01-01', source: '虚构演示测试', material_status: '已摘要', use_case: '测试', summary: '虚构测试资料', material_record: [file_name, category, '演示投资经理', '2026-01-01', '虚构演示测试', '已摘要', '0', '示例成长一期基金', extension === 'pdf' ? 'source_pdf_ocr' : 'source_file'],
  ...(extension === 'docx' ? { preview_path: `previews/${id}.pdf`, preview_page_image_dir: `previews/pages/${id}`, preview_page_image_pages: 1 } : { pdf: { pages: 2, text_extractable: true, ocr_status: 'succeeded' as const, ocr_job_id: 'synthetic-fixture', ocr_error: null, ocr_result_dir: `text/${id}`, recognized_text_path: `text/${id}.md`, local_text_path: null, recognized_html_path: `text/${id}.html`, page_image_manifest_path: `previews/pages/${id}/manifest.json`, page_image_dir: `previews/pages/${id}` } }),
}));
export const fixtureEntries = createMaterialKnowledgeEntries(fixtureSources, 'docs/demo-fixtures');
export const fixtureSummary = summarizeMaterialKnowledge(fixtureEntries);
export const fixtureChunks: MaterialTextChunk[] = fixtureEntries.filter(e => e.extension === 'pdf').map((entry, i) => ({
  id: `${entry.id}-p1`, materialId: entry.id, fileName: entry.fileName, category: entry.category, projectOrFund: entry.projectOrFund, archivePath: entry.archivePath, page: 1, chunkIndex: 1, text: i === 0 ? '虚构测试：风险匹配告知书。专业投资者与普通投资者分类应当由人工核验。风险调查问卷和投资者确认函均为演示内容。' : '虚构测试：季度运营报告包括经营进展、财务指标和项目风险。全部金额与业务信息仅供测试。', recognizedTextPath: entry.recognizedTextPath!, recognizedTextHref: `/docs/demo-fixtures/text/${entry.id}.md`, recognizedHtmlPath: entry.recognizedHtmlPath!, recognizedHtmlHref: `/docs/demo-fixtures/text/${entry.id}.html`, originalPath: entry.originalPath, originalDocumentHref: `/docs/demo-fixtures/originals/${entry.fileName}#page=1`, originalPageImageHref: `/docs/demo-fixtures/previews/pages/${entry.id}/page-001.png`,
}));

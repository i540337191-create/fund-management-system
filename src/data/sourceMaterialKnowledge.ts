import sourceIndexJson from "../../docs/source-materials/2026-06-10-fund-ops-templates/source-index.json" with { type: "json" };
import {
  createMaterialKnowledgeEntries,
  summarizeMaterialKnowledge,
  type SourceMaterialSourceIndex,
} from "../lib/materialKnowledge.ts";

const sourceIndex = sourceIndexJson as SourceMaterialSourceIndex;

export const sourceMaterialKnowledgeEntries = createMaterialKnowledgeEntries(sourceIndex.materials);

export const sourceMaterialKnowledgeSummary = summarizeMaterialKnowledge(sourceMaterialKnowledgeEntries);

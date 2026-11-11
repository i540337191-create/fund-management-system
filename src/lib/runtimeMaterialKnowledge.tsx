import {fetchInSession} from './sessionBoundary';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createMaterialKnowledgeEntries, summarizeMaterialKnowledge, type SourceMaterialSourceEntry } from "./materialKnowledge";

const emptyEntries = createMaterialKnowledgeEntries([]);
const MaterialKnowledgeContext = createContext({ entries: emptyEntries, summary: summarizeMaterialKnowledge(emptyEntries) });

export function MaterialKnowledgeProvider({ children, versionedSourceIds,sourceRevision="" }: { children: ReactNode; versionedSourceIds: string[];sourceRevision?:string }) {
  const [source, setSource] = useState<SourceMaterialSourceEntry[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetchInSession(fetch,"/api/materials/source-index", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("material_knowledge_unavailable");
        return response.json() as Promise<{ materials: SourceMaterialSourceEntry[] }>;
      })
      .then((result) => { if (!controller.signal.aborted) setSource(result.materials); })
      .catch(() => { if (!controller.signal.aborted) setSource([]); });
    return () => controller.abort();
  }, [sourceRevision]);
  const value = useMemo(() => {
    const versioned = new Set(versionedSourceIds);
    const entries = createMaterialKnowledgeEntries(source.filter((entry) => !versioned.has(entry.id)));
    return { entries, summary: summarizeMaterialKnowledge(entries) };
  }, [source, versionedSourceIds]);
  return <MaterialKnowledgeContext.Provider value={value}>{children}</MaterialKnowledgeContext.Provider>;
}

export function useMaterialKnowledge() {
  return useContext(MaterialKnowledgeContext);
}

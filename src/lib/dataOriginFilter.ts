import { isEngineeringRecord, normalizeDataOrigin } from "./dataOrigin.ts";
import { inferMaterialDataOrigin, type MaterialRecord } from "./materialFilters.ts";

export type DataOriginRecord = {
  id?: string;
  dataOrigin?: string | null;
  dataPurpose?:string|null;
  currentVersionPurpose?:string|null;
  sourceBasis?:{id?:string;dataOrigin?:string;dataPurpose?:string|null;recordType?:string;projectId?:string}[];
};

export function isSeedDemoRecord(record: DataOriginRecord | null | undefined) {
  return Boolean(record?.id?.startsWith('simulated-')) || normalizeDataOrigin(record?.dataOrigin) === "seed_demo"||Boolean(record&&isEngineeringRecord(record));
}

export function filterSeedDemoRecords<T extends DataOriginRecord>(records: T[], hideSeedDemoData: boolean): T[] {
  if (!hideSeedDemoData) return records;
  return records.filter((record) => !isSeedDemoRecord(record));
}

export function countSeedDemoRecords<T extends DataOriginRecord>(records: T[]): number {
  return records.filter(isSeedDemoRecord).length;
}

export function filterMaterialRecordsBySeedDemo(records: MaterialRecord[], hideSeedDemoData: boolean): MaterialRecord[] {
  if (!hideSeedDemoData) return records;
  return records.filter((record) => !isSeedDemoRecord({dataOrigin:record[8]??inferMaterialDataOrigin(record[4]),dataPurpose:record[9]}));
}

export function filterProjectTaskRecordsBySeedDemo<T extends DataOriginRecord>(
  tasksByProjectId: Record<string, T[]>,
  visibleProjectIds: string[],
  hideSeedDemoData: boolean,
): Record<string, T[]> {
  if (!hideSeedDemoData) return tasksByProjectId;

  void visibleProjectIds;
  return Object.fromEntries(
    Object.entries(tasksByProjectId)
      .map(([projectId, tasks]) => [projectId, tasks.filter((task) => !isSeedDemoRecord(task))])
      .filter(([, tasks]) => tasks.length > 0),
  );
}

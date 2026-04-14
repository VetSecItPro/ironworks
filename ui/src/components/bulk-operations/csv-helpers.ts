export interface CsvColumn {
  header: string;
  index: number;
  sample: string[];
}

export interface ColumnMapping {
  title: number | null;
  description: number | null;
  status: number | null;
  priority: number | null;
  assignee: number | null;
  labels: number | null;
  project: number | null;
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function detectDuplicates(rows: string[][], titleIndex: number | null): Set<number> {
  const dupes = new Set<number>();
  if (titleIndex === null) return dupes;
  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    const title = row[titleIndex]?.toLowerCase().trim() ?? "";
    if (title && seen.has(title)) {
      dupes.add(i);
      dupes.add(seen.get(title)!);
    } else if (title) {
      seen.set(title, i);
    }
  });
  return dupes;
}

export const EMPTY_MAPPING: ColumnMapping = {
  title: null,
  description: null,
  status: null,
  priority: null,
  assignee: null,
  labels: null,
  project: null,
};

export const FIELD_KEYS: Array<{ key: keyof ColumnMapping; label: string }> = [
  { key: "title", label: "Title (required)" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "labels", label: "Labels" },
  { key: "project", label: "Project" },
];

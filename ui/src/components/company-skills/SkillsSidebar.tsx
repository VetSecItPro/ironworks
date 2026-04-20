import type { CompanySkillCreateRequest, CompanySkillListItem } from "@ironworksai/shared";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "../PageSkeleton";
import { NewSkillForm } from "./NewSkillForm";
import { SkillList } from "./SkillList";

export function SkillsSidebar({
  skillFilter,
  onSkillFilterChange,
  source,
  onSourceChange,
  onAddSource,
  importPending,
  scanStatusMessage,
  createOpen,
  onCreateSkill,
  createPending,
  onCancelCreate,
  skillsLoading,
  skillsError,
  skills,
  selectedSkillId,
  selectedPath,
  expandedSkillId,
  expandedDirs,
  onToggleSkill,
  onToggleDir,
  onSelectSkill,
  onSelectPath,
}: {
  skillFilter: string;
  onSkillFilterChange: (value: string) => void;
  source: string;
  onSourceChange: (value: string) => void;
  onAddSource: () => void;
  importPending: boolean;
  scanStatusMessage: string | null;
  createOpen: boolean;
  onCreateSkill: (payload: CompanySkillCreateRequest) => void;
  createPending: boolean;
  onCancelCreate: () => void;
  skillsLoading: boolean;
  skillsError: Error | null;
  skills: CompanySkillListItem[];
  selectedSkillId: string | null;
  selectedPath: string;
  expandedSkillId: string | null;
  expandedDirs: Record<string, Set<string>>;
  onToggleSkill: (skillId: string) => void;
  onToggleDir: (skillId: string, path: string) => void;
  onSelectSkill: (skillId: string) => void;
  onSelectPath: (skillId: string, path: string) => void;
}) {
  return (
    <aside className="border-r border-border">
      <div className="border-b border-border px-4 py-3">
        <div className="mt-3 flex items-center gap-2 border-b border-border pb-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={skillFilter}
            onChange={(event) => onSkillFilterChange(event.target.value)}
            placeholder="Filter skills"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="mt-3 flex items-center gap-2 border-b border-border pb-2">
          <input
            value={source}
            onChange={(event) => onSourceChange(event.target.value)}
            placeholder="Paste path, GitHub URL, or skills.sh command"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button size="sm" variant="ghost" onClick={onAddSource} disabled={importPending}>
            {importPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
        </div>
        {scanStatusMessage && <p className="mt-3 text-xs text-muted-foreground">{scanStatusMessage}</p>}
      </div>

      {createOpen && <NewSkillForm onCreate={onCreateSkill} isPending={createPending} onCancel={onCancelCreate} />}

      {skillsLoading ? (
        <PageSkeleton variant="list" />
      ) : skillsError ? (
        <div className="px-4 py-6 text-sm text-destructive">{skillsError.message}</div>
      ) : (
        <SkillList
          skills={skills}
          selectedSkillId={selectedSkillId}
          skillFilter={skillFilter}
          expandedSkillId={expandedSkillId}
          expandedDirs={expandedDirs}
          selectedPaths={selectedSkillId ? { [selectedSkillId]: selectedPath } : {}}
          onToggleSkill={onToggleSkill}
          onToggleDir={onToggleDir}
          onSelectSkill={onSelectSkill}
          onSelectPath={onSelectPath}
        />
      )}
    </aside>
  );
}

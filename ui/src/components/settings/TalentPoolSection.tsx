import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "../agent-config-primitives";
import {
  AGENT_ROLES,
  AGENT_ROLE_LABELS,
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
} from "@ironworksai/shared";
import { roleTemplatesApi, type RoleTemplate } from "../../api/roleTemplates";
import { queryKeys } from "../../lib/queryKeys";
import { useToast } from "../../context/ToastContext";

export function TalentPoolSection({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formRole, setFormRole] = useState<string>("engineer");
  const [formDepartment, setFormDepartment] = useState<string>("engineering");
  const [formEmploymentType, setFormEmploymentType] =
    useState<string>("full_time");
  const [formDescription, setFormDescription] = useState("");

  const templatesQuery = useQuery({
    queryKey: queryKeys.roleTemplates.list(companyId),
    queryFn: () => roleTemplatesApi.list(companyId),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      roleTemplatesApi.create(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.roleTemplates.list(companyId),
      });
      pushToast({ title: "Template created", tone: "success" });
      resetForm();
    },
    onError: (err: Error) => {
      pushToast({
        title: "Failed to create template",
        body: err.message,
        tone: "error",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Record<string, unknown>;
    }) => roleTemplatesApi.update(companyId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.roleTemplates.list(companyId),
      });
      pushToast({ title: "Template updated", tone: "success" });
      resetForm();
    },
    onError: (err: Error) => {
      pushToast({
        title: "Failed to update template",
        body: err.message,
        tone: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => roleTemplatesApi.remove(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.roleTemplates.list(companyId),
      });
      pushToast({ title: "Template deleted", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({
        title: "Failed to delete template",
        body: err.message,
        tone: "error",
      });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormTitle("");
    setFormRole("engineer");
    setFormDepartment("engineering");
    setFormEmploymentType("full_time");
    setFormDescription("");
  }

  function startEdit(t: RoleTemplate) {
    setEditingId(t.id);
    setFormTitle(t.title);
    setFormRole(t.role);
    setFormDepartment(t.department ?? "engineering");
    setFormEmploymentType(t.employmentType);
    setFormDescription(t.capabilities ?? "");
    setShowForm(true);
  }

  function handleSave() {
    const data: Record<string, unknown> = {
      title: formTitle.trim(),
      role: formRole,
      department: formDepartment,
      employmentType: formEmploymentType,
      capabilities: formDescription.trim() || null,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const templates = templatesQuery.data ?? [];
  const isSystemTemplate = (t: RoleTemplate) => t.isSystem ?? false;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          Talent Pool
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Template
        </Button>
      </div>

      {showForm && (
        <div className="rounded-md border border-border px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {editingId ? "Edit Template" : "New Template"}
            </span>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={resetForm}
              aria-label="Close form"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            <Field label="Title">
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Senior Engineer"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Role">
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                >
                  {AGENT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {(AGENT_ROLE_LABELS as Record<string, string>)[r] ?? r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Department">
                <select
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {(DEPARTMENT_LABELS as Record<string, string>)[d] ?? d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type">
                <select
                  value={formEmploymentType}
                  onChange={(e) => setFormEmploymentType(e.target.value)}
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                >
                  {EMPLOYMENT_TYPES.map((et) => (
                    <option key={et} value={et}>
                      {(EMPLOYMENT_TYPE_LABELS as Record<string, string>)[
                        et
                      ] ?? et}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description">
              <input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!formTitle.trim() || isSaving}
            >
              {isSaving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {templates.length === 0 && !showForm && (
        <div className="rounded-md border border-border px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            No role templates yet. Create one to speed up hiring.
          </p>
        </div>
      )}

      {templates.length > 0 && (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-md border border-border px-4 py-3 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t.title}</span>
                  {isSystemTemplate(t) && (
                    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                      System
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    {(AGENT_ROLE_LABELS as Record<string, string>)[t.role] ??
                      t.role}
                  </span>
                  {t.department && (
                    <>
                      <span className="text-border">|</span>
                      <span className="text-xs text-muted-foreground">
                        {(DEPARTMENT_LABELS as Record<string, string>)[
                          t.department
                        ] ?? t.department}
                      </span>
                    </>
                  )}
                  <span className="text-border">|</span>
                  <span className="text-xs text-muted-foreground">
                    {(EMPLOYMENT_TYPE_LABELS as Record<string, string>)[
                      t.employmentType
                    ] ?? t.employmentType}
                  </span>
                </div>
                {t.capabilities && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {t.capabilities}
                  </p>
                )}
              </div>
              {!isSystemTemplate(t) && (
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => startEdit(t)}
                    title="Edit template"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm(`Delete template "${t.title}"?`)) {
                        deleteMutation.mutate(t.id);
                      }
                    }}
                    title="Delete template"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

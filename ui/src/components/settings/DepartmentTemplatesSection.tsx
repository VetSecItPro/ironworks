import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { agentsApi } from "../../api/agents";
import { useToast } from "../../context/ToastContext";

interface DeptTemplate {
  key: string;
  name: string;
  description: string;
  roles: Array<{ title: string; role: string; icon: string }>;
}

const DEPT_TEMPLATES: DeptTemplate[] = [
  {
    key: "engineering",
    name: "Engineering",
    description: "Core technical team: a CTO to lead, plus a senior engineer and DevOps agent.",
    roles: [
      { title: "CTO", role: "cto", icon: "cpu" },
      { title: "Senior Engineer", role: "engineer", icon: "code" },
      { title: "DevOps Engineer", role: "devops", icon: "server" },
    ],
  },
  {
    key: "marketing",
    name: "Marketing",
    description: "Brand and growth team: a CMO plus a content and analyst agent.",
    roles: [
      { title: "CMO", role: "cmo", icon: "megaphone" },
      { title: "Content Marketer", role: "specialist", icon: "pen-line" },
      { title: "Marketing Analyst", role: "analyst", icon: "target" },
    ],
  },
  {
    key: "finance",
    name: "Finance",
    description: "Financial operations: a CFO and a finance analyst to track spend and reporting.",
    roles: [
      { title: "CFO", role: "cfo", icon: "dollar-sign" },
      { title: "Finance Analyst", role: "analyst", icon: "scale" },
    ],
  },
  {
    key: "legal",
    name: "Legal",
    description: "Compliance and legal: a compliance director and legal counsel.",
    roles: [
      { title: "Compliance Director", role: "director", icon: "gavel" },
      { title: "Legal Counsel", role: "specialist", icon: "scale" },
    ],
  },
  {
    key: "support",
    name: "Support",
    description: "Customer-facing support: a support manager and two specialist agents.",
    roles: [
      { title: "Support Manager", role: "manager", icon: "users" },
      { title: "Support Specialist", role: "specialist", icon: "message-square" },
    ],
  },
];

export function DepartmentTemplatesSection({ companyId }: { companyId: string }) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [deployingKey, setDeployingKey] = useState<string | null>(null);

  const hireMutation = useMutation({
    mutationFn: async (template: DeptTemplate) => {
      const results: unknown[] = [];
      for (const r of template.roles) {
        const result = await agentsApi.hire(companyId, {
          name: r.title,
          role: r.role,
          icon: r.icon,
          employmentType: "full_time",
          department: template.key,
        });
        results.push(result);
      }
      return results;
    },
    onSuccess: (_, template) => {
      setDeployingKey(null);
      pushToast({
        title: `${template.name} department created`,
        body: `${template.roles.length} agents hired`,
        tone: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["agents", companyId] });
    },
    onError: (err: Error, template) => {
      setDeployingKey(null);
      pushToast({
        title: `Failed to create ${template.name} department`,
        body: err.message,
        tone: "error",
      });
    },
  });

  return (
    <div className="space-y-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5" />
        Department Templates
      </div>
      <p className="text-sm text-muted-foreground">
        Quickly create a pre-configured set of agents for a department. Each template hires the suggested roles via the
        standard hiring workflow.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DEPT_TEMPLATES.map((template) => (
          <div key={template.key} className="rounded-md border border-border px-4 py-3 space-y-2">
            <div>
              <p className="text-sm font-medium">{template.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {template.roles.map((r) => (
                <span
                  key={r.role + r.title}
                  className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
                >
                  {r.title}
                </span>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={hireMutation.isPending && deployingKey === template.key}
              onClick={() => {
                setDeployingKey(template.key);
                hireMutation.mutate(template);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {hireMutation.isPending && deployingKey === template.key ? "Creating..." : "Create Department"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

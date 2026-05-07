import type { CompanySecret } from "@ironworksai/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { relativeTime } from "@/lib/utils";

interface SecretsTableProps {
  secrets: CompanySecret[];
  onRotate: (secret: CompanySecret) => void;
  onDelete: (secret: CompanySecret) => void;
}

/**
 * Renders the secrets vault as a table with per-row Rotate / Delete actions.
 * Displays metadata only — plaintext values are never shown (the API does not
 * return them after creation, by design).
 */
export function SecretsTable({ secrets, onRotate, onDelete }: SecretsTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="secrets-table">
            <thead className="border-b border-border bg-muted/30">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Last rotated</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {secrets.map((secret) => (
                <tr key={secret.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 align-middle">
                    <div className="font-mono text-xs">{secret.name}</div>
                    {secret.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{secret.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-muted-foreground">{secret.provider}</td>
                  <td className="px-4 py-3 align-middle text-xs text-muted-foreground">v{secret.latestVersion}</td>
                  <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                    {relativeTime(secret.updatedAt)}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                    {relativeTime(secret.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-middle text-right">
                    <div className="inline-flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => onRotate(secret)}>
                        Rotate
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => onDelete(secret)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

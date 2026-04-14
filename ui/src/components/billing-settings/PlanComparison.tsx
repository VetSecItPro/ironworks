export function PlanComparison() {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Plan Comparison</h2>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Feature</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs text-muted-foreground">Starter ($79)</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs text-muted-foreground">Growth ($199)</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs text-muted-foreground">Business ($599)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              { feature: "AI Agents", starter: "Unlimited", growth: "Unlimited", business: "Unlimited" },
              { feature: "Projects", starter: "5", growth: "25", business: "Unlimited" },
              { feature: "Storage", starter: "5 GB", growth: "15 GB", business: "50 GB" },
              { feature: "Companies", starter: "1", growth: "2", business: "5" },
              { feature: "Playbook runs/mo", starter: "50", growth: "Unlimited", business: "Unlimited" },
              { feature: "KB Pages", starter: "50", growth: "Unlimited", business: "Unlimited" },
              { feature: "Messaging", starter: "Email + Telegram", growth: "All 4 platforms", business: "All platforms" },
              { feature: "Support", starter: "Email", growth: "Email", business: "Email" },
            ].map((row) => (
              <tr key={row.feature} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5 font-medium">{row.feature}</td>
                <td className="px-4 py-2.5 text-center text-muted-foreground">{row.starter}</td>
                <td className="px-4 py-2.5 text-center text-muted-foreground">{row.growth}</td>
                <td className="px-4 py-2.5 text-center text-muted-foreground">{row.business}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

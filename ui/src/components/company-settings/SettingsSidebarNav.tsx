interface SettingsSection {
  id: string;
  label: string;
}

interface SettingsSidebarNavProps {
  sections: SettingsSection[];
  activeSection: string;
}

export function SettingsSidebarNav({ sections, activeSection }: SettingsSidebarNavProps) {
  return (
    <nav className="hidden lg:block w-44 shrink-0 sticky top-4 self-start space-y-0.5 pt-10">
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={(e) => {
            e.preventDefault();
            document
              .getElementById(s.id)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className={`block px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeSection === s.id
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          }`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}

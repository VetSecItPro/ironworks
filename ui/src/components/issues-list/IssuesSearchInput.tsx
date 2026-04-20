import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { ISSUE_SEARCH_COMMIT_DELAY_MS } from "./types";

interface IssuesSearchInputProps {
  initialValue: string;
  onValueCommitted: (value: string) => void;
}

export function IssuesSearchInput({ initialValue, onValueCommitted }: IssuesSearchInputProps) {
  const [value, setValue] = useState(initialValue);
  const onValueCommittedRef = useRef(onValueCommitted);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);
  useEffect(() => {
    onValueCommittedRef.current = onValueCommitted;
  }, [onValueCommitted]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onValueCommittedRef.current(value);
    }, ISSUE_SEARCH_COMMIT_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [value]);

  return (
    <div className="relative w-48 sm:w-64 md:w-80">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search missions..."
        className="pl-7 text-xs sm:text-sm"
        aria-label="Search missions"
      />
    </div>
  );
}

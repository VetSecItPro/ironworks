import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hammer } from "lucide-react";

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const WELCOME_SEEN_KEY = "ironworks:welcome-screen-seen";

export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Animated Welcome Screen
// ---------------------------------------------------------------------------

interface WelcomeScreenProps {
  onComplete: () => void;
}

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting">("entering");

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase("visible"), 100);
    return () => clearTimeout(enterTimer);
  }, []);

  useEffect(() => {
    if (phase === "visible") {
      const autoTimer = setTimeout(() => {
        setPhase("exiting");
      }, 4000);
      return () => clearTimeout(autoTimer);
    }
    if (phase === "exiting") {
      const exitTimer = setTimeout(() => {
        markWelcomeSeen();
        onComplete();
      }, 500);
      return () => clearTimeout(exitTimer);
    }
  }, [phase, onComplete]);

  function handleSkip() {
    setPhase("exiting");
  }

  return (
    <div
      className={`fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${
        phase === "entering" ? "opacity-0" : phase === "exiting" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Animated hammer icon */}
      <div
        className={`transition-all duration-700 ease-out ${
          phase === "visible"
            ? "scale-100 opacity-100 translate-y-0"
            : "scale-75 opacity-0 translate-y-4"
        }`}
      >
        <div className="relative">
          <div className="absolute inset-0 blur-3xl bg-primary/20 rounded-full animate-pulse" />
          <Hammer className="h-24 w-24 text-primary relative z-10 drop-shadow-lg" />
        </div>
      </div>

      {/* Title */}
      <h1
        className={`mt-8 text-4xl font-bold tracking-tight transition-all duration-700 delay-300 ${
          phase === "visible"
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4"
        }`}
      >
        IronWorks
      </h1>

      {/* Tagline */}
      <p
        className={`mt-3 text-lg text-muted-foreground transition-all duration-700 delay-500 ${
          phase === "visible"
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4"
        }`}
      >
        Forge your AI workforce
      </p>

      {/* Subtitle */}
      <p
        className={`mt-1 text-sm text-muted-foreground/70 transition-all duration-700 delay-700 ${
          phase === "visible"
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4"
        }`}
      >
        Manage, orchestrate, and scale autonomous agents
      </p>

      {/* Skip button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSkip}
        className={`mt-8 text-xs text-muted-foreground transition-all duration-500 delay-1000 ${
          phase === "visible" ? "opacity-60" : "opacity-0"
        }`}
      >
        Skip
      </Button>
    </div>
  );
}

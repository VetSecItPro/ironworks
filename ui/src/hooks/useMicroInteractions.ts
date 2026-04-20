import { useCallback, useEffect, useRef, useState } from "react";

/* ── AnimatedNumber: tracks previous value and returns animation class ── */

export function useAnimatedNumber(value: number): { displayValue: number; animClass: string } {
  const prevRef = useRef(value);
  const [animClass, setAnimClass] = useState("");

  useEffect(() => {
    if (prevRef.current !== value) {
      setAnimClass(value > prevRef.current ? "number-roll-up" : "number-roll-down");
      prevRef.current = value;
      const timer = setTimeout(() => setAnimClass(""), 300);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return { displayValue: value, animClass };
}

/* ── Staggered list entry: returns style per index ── */

export function useStaggeredEntry(_itemCount: number, delayPerItem = 30) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger on mount
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return useCallback(
    (index: number) => (visible ? { animationDelay: `${index * delayPerItem}ms` } : { opacity: 0 }),
    [visible, delayPerItem],
  );
}

/* ── Status change confetti: returns trigger function and portal element ── */

export function useConfetti() {
  const containerRef = useRef<HTMLElement | null>(null);

  const trigger = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const _parent = element.offsetParent ?? document.body;

    const colors = ["#22c55e", "#3b82f6", "#f59e0b"];
    for (let i = 0; i < 3; i++) {
      const particle = document.createElement("div");
      particle.className = "confetti-particle";
      particle.style.backgroundColor = colors[i];
      particle.style.left = `${rect.left + rect.width / 2 - 2}px`;
      particle.style.top = `${rect.top + rect.height / 2 - 2}px`;
      particle.style.position = "fixed";
      particle.style.zIndex = "9999";
      const angle = (i * 120 + Math.random() * 40 - 20) * (Math.PI / 180);
      const distance = 16 + Math.random() * 12;
      particle.style.setProperty("--confetti-x", `${Math.cos(angle) * distance}px`);
      particle.style.setProperty("--confetti-y", `${Math.sin(angle) * distance}px`);
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 700);
    }
  }, []);

  return { containerRef, trigger };
}

/* ── Scroll-triggered fade-in via IntersectionObserver ── */

export function useScrollFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, className: isVisible ? "scroll-fade-in" : "opacity-0" };
}

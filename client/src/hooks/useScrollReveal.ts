import { useEffect, useRef } from "react";

export function useScrollReveal() {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !("IntersectionObserver" in window)) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const elements = container.querySelectorAll<HTMLElement>(
      "[data-scroll-reveal]"
    );
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) reveal(entry.target as HTMLElement);
        }
      },
      { rootMargin: "0px 0px -24px 0px", threshold: 0 }
    );

    function reveal(element: HTMLElement) {
      element.dataset.scrollReveal = "visible";
      observer.unobserve(element);
    }

    // Keep content already on screen visible, including restored scroll positions.
    elements.forEach(element => {
      if (element.getBoundingClientRect().top < window.innerHeight) {
        reveal(element);
      } else {
        element.dataset.scrollReveal = "pending";
        observer.observe(element);
      }
    });

    function revealFocusedContent(event: FocusEvent) {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>("[data-scroll-reveal]");
      if (element && container?.contains(element)) reveal(element);
    }

    function handleMotionChange() {
      if (!reducedMotion.matches) return;
      elements.forEach(reveal);
      observer.disconnect();
    }

    container.addEventListener("focusin", revealFocusedContent);
    reducedMotion.addEventListener("change", handleMotionChange);
    return () => {
      observer.disconnect();
      container.removeEventListener("focusin", revealFocusedContent);
      reducedMotion.removeEventListener("change", handleMotionChange);
      elements.forEach(element => {
        element.dataset.scrollReveal = "";
      });
    };
  }, []);

  return containerRef;
}

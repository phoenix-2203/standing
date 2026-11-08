"use client";

import { useEffect } from "react";

/**
 * Fades `.reveal` elements up as they scroll into view. Does nothing under prefers-reduced-motion, and the content is
 * visible without JavaScript: the hidden starting state only applies once this has marked the page.
 */
export function Reveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const els = [...document.querySelectorAll<HTMLElement>(".reveal")].filter((el) => el.getBoundingClientRect().top > window.innerHeight);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const el of els) {
      el.classList.add("reveal-pending");
      io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return null;
}

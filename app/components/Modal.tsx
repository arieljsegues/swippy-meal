"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Bottom sheet on mobile, centered dialog on larger screens. */
export default function Modal({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        {children}
      </section>
    </div>
  );
}

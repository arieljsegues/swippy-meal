"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LogoutButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // Cerrar al tocar fuera o pulsar Escape
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(`No se pudo cerrar sesión: ${error.message}`);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push("/");
    window.location.reload();
  }

  return (
    <div ref={containerRef} className="relative">
      <button 
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Menú de usuario"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none text-black transition hover:bg-white/20 active:scale-95"
      >
        ⋮
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-black/10 bg-white p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={loading}
            className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
          >
            {loading ? "Cerrando sesión..." : "Cerrar sesión"}
          </button>

          {message && (
            <p role="status" className="px-3 pb-2 pt-1 text-xs text-red-600">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
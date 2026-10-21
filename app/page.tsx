
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AuthPanel from "./components/AuthPanel";
import SwipeDishes from "./components/SwipeDishes";
import WeeklyMenu from "./components/WeeklyMenu";
import AddDish from "./components/AddDish";
import LogoutButton from "./components/LogoutButton";

type Section = "swipe" | "menu" | "add";

export default function Home() {
  const [section, setSection] = useState<Section>("swipe");
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    let mounted = true;
    let authEventReceived = false;

    const timeout = window.setTimeout(() => {
      if (mounted) {
        setSessionError(true);
        setCheckingSession(false);
      }
    }, 10000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      authEventReceived = true;
      window.clearTimeout(timeout);
      setSessionError(false);
      setLoggedIn(!!session);
      setCheckingSession(false);
    });

    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!mounted || authEventReceived) return;

        window.clearTimeout(timeout);

        if (error) {
          console.error("Error comprobando sesión:", error);
          setSessionError(true);
          setLoggedIn(false);
        } else {
          setSessionError(false);
          setLoggedIn(!!data.session);
        }

        setCheckingSession(false);
      } catch (error) {
        if (!mounted || authEventReceived) return;

        console.error("Error comprobando sesión:", error);
        window.clearTimeout(timeout);
        setSessionError(true);
        setLoggedIn(false);
        setCheckingSession(false);
      }
    }

    void checkSession();

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf9f6]">
        <p className="text-sm text-gray-600">
          Comprobando sesión...
        </p>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#faf9f6] p-6">
        <p className="max-w-md text-center text-gray-700">
          No se ha podido comprobar la sesión. Comprueba tu conexión e inténtalo de nuevo.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-[#293d30] px-5 py-3 text-sm font-medium text-white hover:bg-[#3a5140]"
        >
          Reintentar
        </button>
      </main>
    );
  }

  if (!loggedIn) {
    return <AuthPanel />;
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] pb-24">
      <header className="flex justify-end border-b border-black/5 bg-white/80 p-3">
        <LogoutButton />
      </header>

      {section === "swipe" && <SwipeDishes />}
      {section === "menu" && <WeeklyMenu />}
      {section === "add" && <AddDish />}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl justify-around gap-2">
          <button
            type="button"
            aria-current={section === "swipe" ? "page" : undefined}
            onClick={() => setSection("swipe")}
            className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
              section === "swipe"
                ? "bg-pink-100 text-pink-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Elegir
          </button>

          <button
            type="button"
            aria-current={section === "menu" ? "page" : undefined}
            onClick={() => setSection("menu")}
            className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
              section === "menu"
                ? "bg-blue-100 text-blue-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Menú semanal
          </button>

          <button
            type="button"
            aria-current={section === "add" ? "page" : undefined}
            onClick={() => setSection("add")}
            className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
              section === "add"
                ? "bg-green-100 text-green-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Platos
          </button>
        </div>
      </nav>
    </main>
  );
}

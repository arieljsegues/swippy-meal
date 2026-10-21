
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
    let resolved = false;

    const timeout = window.setTimeout(() => {
      if (mounted && !resolved) {
        setSessionError(true);
        setCheckingSession(false);
      }
    }, 10000);

    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!mounted || resolved) return;

        resolved = true;
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
        console.error("Error comprobando sesión:", error);

        if (mounted && !resolved) {
          resolved = true;
          window.clearTimeout(timeout);
          setSessionError(true);
          setLoggedIn(false);
          setCheckingSession(false);
        }
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted || resolved) return;

      resolved = true;
      window.clearTimeout(timeout);
      setSessionError(false);
      setLoggedIn(!!session);
      setCheckingSession(false);
    });

    void checkSession();

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-600">Comprobando sesión...</p>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6">
        <p className="text-center text-gray-700">
          No se ha podido comprobar la sesión. Comprueba tu conexión e inténtalo de nuevo.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-black px-5 py-3 text-sm font-medium text-white"
        >
          Reintentar
        </button>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <AuthPanel />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <header className="flex justify-end p-3">
        <LogoutButton />
      </header>

      {section === "swipe" && <SwipeDishes />}
      {section === "menu" && <WeeklyMenu />}
      {section === "add" && <AddDish />}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-white p-3">
        <div className="mx-auto flex max-w-2xl justify-around gap-2">
          <button
            type="button"
            onClick={() => setSection("swipe")}
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              section === "swipe"
                ? "bg-pink-100 text-pink-700"
                : "text-gray-600"
            }`}
          >
            Elegir
          </button>

          <button
            type="button"
            onClick={() => setSection("menu")}
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              section === "menu"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600"
            }`}
          >
            Menú semanal
          </button>

          <button
            type="button"
            onClick={() => setSection("add")}
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              section === "add"
                ? "bg-green-100 text-green-700"
                : "text-gray-600"
            }`}
          >
            Platos
          </button>
        </div>
      </nav>
    </main>
  );
}

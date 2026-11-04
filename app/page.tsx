"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AuthPanel from "./components/AuthPanel";
import SwipeDishes from "./components/SwipeDishes";
import WeeklyMenu from "./components/WeeklyMenu";
import AddDish from "./components/AddDish";
import LogoutButton from "./components/LogoutButton";
import Nav, { type Section } from "./components/Nav";

export default function Home() {
  const [section, setSection] = useState<Section>("menu");
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#faf9f6]">
      <header className="relative z-20 flex shrink-0 items-center justify-end rounded-b-2xl bg-beige-600 px-3 py-1 shadow-sm">
        <LogoutButton />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {section === "menu" && <WeeklyMenu />}
        {section === "swipe" && <SwipeDishes />}
        {section === "add" && <AddDish />}
      </main>

      <Nav section={section} setSection={setSection} />
    </div>
  );
}
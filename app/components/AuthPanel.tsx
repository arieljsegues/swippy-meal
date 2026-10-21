
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setMessage(
            error.message === "Invalid login credentials"
              ? "Correo o contraseña incorrectos."
              : error.message
          );
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setMessage(error.message);
        } else if (!data.session) {
          setMessage("Revisa tu correo para confirmar tu cuenta.");
        } else {
          setMessage("Cuenta creada correctamente.");
        }
      }
    } catch {
      setMessage("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f7f5] px-5 py-4 text-[#252720]">
      <section className="w-full max-w-[360px]">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#293b2e] text-xl text-white">
            ✳
          </div>

          <p className="text-sm font-semibold tracking-tight">
            swippy meal
          </p>
        </header>

        <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight">
            {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            {mode === "login"
              ? "Accede a tu cuenta."
              : "Empieza a organizar tus comidas."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600">
                Correo electrónico
              </span>
              <input
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#526b52] focus:ring-2 focus:ring-[#526b52]/10"
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600">
                Contraseña
              </span>
              <input
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#526b52] focus:ring-2 focus:ring-[#526b52]/10"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading || !email.trim() || password.length < 6}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-[#293b2e] px-4 text-sm font-medium text-white transition hover:bg-[#3b5040] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Cargando..."
                : mode === "login"
                  ? "Entrar"
                  : "Crear cuenta"}
            </button>
          </form>

          {message && (
            <p
              role="status"
              aria-live="polite"
              className="mt-4 rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-600"
            >
              {message}
            </p>
          )}

          <div className="mt-5 border-t border-gray-100 pt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setMessage("");
              }}
              className="text-xs font-medium text-[#405b43] hover:underline"
            >
              {mode === "login"
                ? "Crear una cuenta"
                : "Ya tengo una cuenta"}
            </button>
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-gray-400">
          Tu menú, más sencillo.
        </p>
      </section>
    </main>
  );
}

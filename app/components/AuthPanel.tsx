
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
              ? "El correo o la contraseña no son correctos."
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
          setMessage(
            "Cuenta creada. Revisa tu correo para confirmar el registro antes de iniciar sesión."
          );
        }
      }
    } catch {
      setMessage("No se ha podido conectar. Comprueba tu conexión e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#faf9f6] px-5 py-10 text-[#24251f]">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-lime-200/40 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-black/[0.06] bg-white shadow-[0_24px_90px_-35px_rgba(38,38,25,0.25)] md:grid-cols-2">
        <section className="flex flex-col justify-between bg-[#24382d] p-8 text-white sm:p-12 md:min-h-[620px]">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#d8f078] text-xl text-[#24382d]">
                <span aria-hidden="true">✳</span>
              </div>
              <span className="text-lg font-semibold tracking-tight">
                swippy meal
              </span>
            </div>

            <div className="mt-16 max-w-sm md:mt-24">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d8f078]">
                Menos dudas. Más sabor.
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">
                ¿Qué comemos
                <span className="block text-[#d8f078]">hoy?</span>
              </h1>
              <p className="mt-6 max-w-xs text-sm leading-7 text-white/70 sm:text-base">
                Descubre platos, elegid vuestros favoritos y organizad vuestro
                menú semanal en un solo lugar.
              </p>
            </div>
          </div>

          <div className="mt-14 border-t border-white/15 pt-5">
            <p className="text-sm text-white/60">
              Hecho para disfrutar más de cada comida.
            </p>
          </div>
        </section>

        <section className="flex flex-col justify-center p-7 sm:p-12 md:p-14">
          <div className="mb-8">
            <p className="text-sm font-medium text-[#78836c]">
              Tu cocina empieza aquí
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {mode === "login" ? "Qué bueno verte." : "Crea tu cuenta."}
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              {mode === "login"
                ? "Entra y sigue organizando tus comidas."
                : "Regístrate para empezar a organizar tus menús."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">
                Correo electrónico
              </span>
              <input
                className="w-full rounded-xl border border-gray-200 bg-[#fcfcfb] px-4 py-3.5 text-base outline-none transition placeholder:text-gray-400 focus:border-[#657b56] focus:ring-4 focus:ring-[#657b56]/10"
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">
                Contraseña
              </span>
              <input
                className="w-full rounded-xl border border-gray-200 bg-[#fcfcfb] px-4 py-3.5 text-base outline-none transition placeholder:text-gray-400 focus:border-[#657b56] focus:ring-4 focus:ring-[#657b56]/10"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#293d30] px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3a5140] focus:outline-none focus:ring-4 focus:ring-[#657b56]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Un momento..."
                : mode === "login"
                  ? "Iniciar sesión"
                  : "Crear cuenta"}
              {!loading && <span aria-hidden="true">→</span>}
            </button>
          </form>

          {message && (
            <p
              role="status"
              aria-live="polite"
              className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700"
            >
              {message}
            </p>
          )}

          <div className="mt-7 border-t border-gray-100 pt-6 text-center">
            <p className="text-sm text-gray-500">
              {mode === "login"
                ? "¿Todavía no tienes cuenta?"
                : "¿Ya tienes una cuenta?"}
            </p>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setMessage("");
              }}
              className="mt-2 text-sm font-semibold text-[#496348] underline decoration-[#496348]/30 underline-offset-4 transition hover:text-[#24382d]"
            >
              {mode === "login"
                ? "Regístrate gratis"
                : "Volver al inicio de sesión"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

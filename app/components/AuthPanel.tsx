
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  async function refreshUser() {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        setUserId(null);
        setMessage("No hay una sesión activa. Inicia sesión.");
        return;
      }

      setUserId(data.user.id);
      setMessage("Sesión comprobada correctamente.");
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage(`Error al crear la cuenta: ${error.message}`);
      } else if (!data.session) {
        setMessage(
          "Revisa tu correo para confirmar la cuenta y después inicia sesión."
        );
      } else {
        setUserId(data.user?.id ?? null);
        setMessage("Cuenta creada correctamente.");
      }
    } catch {
      setMessage("No se pudo crear la cuenta. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function signIn() {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (error) {
        setMessage(`Error al iniciar sesión: ${error.message}`);
      } else {
        setUserId(data.user.id);
        setMessage("Sesión iniciada correctamente.");
      }
    } catch {
      setMessage("No se pudo iniciar sesión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function createHousehold() {
    setLoading(true);
    setMessage("");

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        setUserId(null);
        setMessage("Tu sesión ha caducado. Inicia sesión de nuevo.");
        return;
      }

      const { error } = await supabase
        .from("households")
        .insert({
          name: "Nuestro menú",
          created_by: userData.user.id,
        });

      if (error) {
        console.error(
          "Error de Supabase:",
          JSON.stringify(error, null, 2)
        );
        setMessage(
          `Error ${error.code}: ${error.message}`
        );
        return;
      }

      setMessage("Espacio creado correctamente.");
    } catch (error) {
      console.error("Error inesperado:", error);
      setMessage("Se ha producido un error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);

    try {
      const { error } = await supabase.auth.signOut();

      setUserId(null);
      setMessage(
        error ? `Error al cerrar sesión: ${error.message}` : "Sesión cerrada."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Swippy Meal</h1>

      <p>Accede a tu cuenta para preparar vuestro menú.</p>

      <label className="block">
        Correo electrónico
        <input
          className="mt-1 w-full rounded border p-2"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label className="block">
        Contraseña
        <input
          className="mt-1 w-full rounded border p-2"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>

      <button
        className="w-full rounded bg-black p-3 text-white disabled:opacity-50"
        disabled={loading || !email || password.length < 6}
        onClick={signIn}
      >
        Iniciar sesión
      </button>

      <button
        className="w-full rounded border p-3 disabled:opacity-50"
        disabled={loading || !email || password.length < 6}
        onClick={signUp}
      >
        Crear cuenta
      </button>

      {userId && (
        <section className="space-y-2 rounded border p-3">
          <p className="break-all text-sm">
            Usuario: {userId}
          </p>

          <button
            className="w-full rounded border p-2 disabled:opacity-50"
            disabled={loading}
            onClick={createHousehold}
          >
            Crear nuestro espacio compartido
          </button>

          <button
            className="w-full rounded border p-2 disabled:opacity-50"
            disabled={loading}
            onClick={refreshUser}
          >
            Comprobar sesión
          </button>

          <button
            className="w-full rounded border p-2 disabled:opacity-50"
            disabled={loading}
            onClick={signOut}
          >
            Cerrar sesión
          </button>
        </section>
      )}

      {message && (
        <p role="status" className="break-words text-sm">
          {message}
        </p>
      )}
    </main>
  );
}

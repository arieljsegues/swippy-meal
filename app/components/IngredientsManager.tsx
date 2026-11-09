"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  CATEGORIES,
  HOUSEHOLD_ID,
  categoryOf,
  errorMessage,
  normalizeName,
  type Ingredient,
} from "@/lib/shopping";
import Modal from "./Modal";

type Row = Ingredient & { uses: number };

const byName = (a: Row, b: Row) => a.name.localeCompare(b.name, "es");

export default function IngredientsManager({ onBack }: { onBack?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("ingredients")
        .select("id, name, category, is_staple, in_stock, dish_ingredients(count)")
        .eq("household_id", HOUSEHOLD_ID)
        .order("name");

      if (!active) return;

      if (error) {
        setToast(`No se pudieron cargar los ingredientes: ${errorMessage(error)}`);
      } else {
        setRows(
          (data ?? []).map((raw) => {
            const row = raw as unknown as Ingredient & {
              dish_ingredients: { count: number }[] | null;
            };
            return {
              id: row.id,
              name: row.name,
              category: row.category,
              is_staple: row.is_staple,
              in_stock: row.in_stock,
              uses: row.dish_ingredients?.[0]?.count ?? 0,
            };
          })
        );
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const c = categoryOf(row.category);
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const groups = useMemo(() => {
    const query = normalizeName(search);
    const visible = rows.filter(
      (r) =>
        normalizeName(r.name).includes(query) &&
        (filter === "all" || categoryOf(r.category) === filter)
    );

    return CATEGORIES.map((category) => ({
      category,
      list: visible.filter((r) => categoryOf(r.category) === category),
    })).filter((g) => g.list.length > 0);
  }, [rows, search, filter]);

  function handleSaved(saved: Row) {
    setRows((cur) => [...cur.filter((r) => r.id !== saved.id), saved].sort(byName));
    setEditing(null);
  }

  function handleDeleted(id: string) {
    setRows((cur) => cur.filter((r) => r.id !== id));
    setEditing(null);
  }

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
      active
        ? "bg-[#293d30] text-white"
        : "border border-stone-200 bg-white text-stone-600"
    }`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 bg-[#fafaf9] p-3 pb-24 text-[#292524] sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">Ingredientes</h1>
          <p className="text-xs text-stone-500">{rows.length} en total</p>
        </div>
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-medium text-[#293d30] underline underline-offset-2"
            >
              Volver a la compra
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="rounded-xl bg-[#293d30] px-3 py-2 text-xs font-semibold text-white"
          >
            Nuevo
          </button>
        </div>
      </header>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar ingrediente..."
        className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#293d30]"
      />

      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <button type="button" onClick={() => setFilter("all")} className={chip(filter === "all")}>
          Todos ({rows.length})
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={chip(filter === c)}
          >
            {c} ({counts.get(c) ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-stone-200 bg-white" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
          {rows.length === 0
            ? "Todavía no hay ingredientes. Se crean al añadirlos a un plato, o con el botón Nuevo."
            : "No hay ingredientes que coincidan."}
        </p>
      ) : (
        groups.map(({ category, list }) => (
          <section key={category}>
            <h2 className="mb-1.5 px-1 text-sm font-semibold text-stone-700">{category}</h2>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {list.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 text-left hover:bg-stone-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-stone-900">
                        {row.name}
                        {row.is_staple && (
                          <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-normal text-stone-500">
                            Básico
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-xs ${row.uses === 0 ? "text-amber-700" : "text-stone-400"}`}
                    >
                      {row.uses === 0
                        ? "Sin usar"
                        : `En ${row.uses} plato${row.uses === 1 ? "" : "s"}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {editing && (
        <IngredientEditor
          key={editing === "new" ? "new" : editing.id}
          ingredient={editing === "new" ? null : editing}
          rows={rows}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-4 z-[110] flex justify-center px-3">
          <div className="flex w-full max-w-md items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700 shadow-lg">
            <p className="flex-1">{toast}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Cerrar aviso"
              className="text-lg leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Editor                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

function IngredientEditor({
  ingredient,
  rows,
  onClose,
  onSaved,
  onDeleted,
}: {
  ingredient: Row | null;
  rows: Row[];
  onClose: () => void;
  onSaved: (row: Row) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(ingredient?.name ?? "");
  const [category, setCategory] = useState<string>(
    ingredient ? categoryOf(ingredient.category) : CATEGORIES[0]
  );
  const [staple, setStaple] = useState(ingredient?.is_staple ?? false);
  const [inStock, setInStock] = useState(
    ingredient ? (ingredient.is_staple ? ingredient.in_stock : true) : true
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const clean = name.trim().replace(/\s+/g, " ");

    if (!clean) {
      setError("Escribe un nombre.");
      return;
    }

    const duplicate = rows.some(
      (r) => r.id !== ingredient?.id && normalizeName(r.name) === normalizeName(clean)
    );
    if (duplicate) {
      setError("Ya existe un ingrediente con ese nombre.");
      return;
    }

    const values = {
      name: clean,
      category,
      is_staple: staple,
      in_stock: staple && inStock,
    };

    setSaving(true);
    setError(null);

    const query = ingredient
      ? supabase.from("ingredients").update(values).eq("id", ingredient.id)
      : supabase.from("ingredients").insert({ household_id: HOUSEHOLD_ID, ...values });

    const { data, error: saveError } = await query
      .select("id, name, category, is_staple, in_stock")
      .single();

    setSaving(false);

    if (saveError) {
      setError(
        saveError.code === "23505"
          ? "Ya existe un ingrediente con ese nombre."
          : `No se pudo guardar: ${errorMessage(saveError)}`
      );
      return;
    }

    onSaved({ ...(data as Ingredient), uses: ingredient?.uses ?? 0 });
  }

  async function remove() {
    if (!ingredient) return;

    setSaving(true);
    const { error: deleteError } = await supabase
      .from("ingredients")
      .delete()
      .eq("id", ingredient.id);
    setSaving(false);

    if (deleteError) {
      setError(`No se pudo borrar: ${errorMessage(deleteError)}`);
      return;
    }

    onDeleted(ingredient.id);
  }

  return (
    <Modal onClose={onClose} labelledBy="ingredient-editor-title">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h2 id="ingredient-editor-title" className="text-lg font-semibold text-stone-900">
          {ingredient ? "Editar ingrediente" : "Nuevo ingrediente"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
        <div>
          <label htmlFor="ingredient-name-edit" className="text-sm font-medium text-stone-700">
            Nombre
          </label>
          <input
            id="ingredient-name-edit"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus={!ingredient}
            maxLength={60}
            className="mt-1.5 w-full rounded-xl border border-stone-200 px-3 py-3 text-sm outline-none focus:border-[#293d30]"
          />
        </div>

        <div>
          <label htmlFor="ingredient-category-edit" className="text-sm font-medium text-stone-700">
            Categoría
          </label>
          <select
            id="ingredient-category-edit"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#293d30]"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 rounded-xl bg-stone-50 p-3">
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={staple}
              onChange={(event) => setStaple(event.target.checked)}
              className="h-4 w-4"
            />
            Es un básico: normalmente ya lo tengo en casa
          </label>
          {staple && (
            <label className="flex items-center gap-2 pl-6 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={inStock}
                onChange={(event) => setInStock(event.target.checked)}
                className="h-4 w-4"
              />
              Ahora mismo lo tengo
            </label>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="w-full rounded-xl bg-[#293d30] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Guardando..." : ingredient ? "Guardar cambios" : "Crear ingrediente"}
        </button>

        {ingredient &&
          (confirmDelete ? (
            <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">
                {ingredient.uses > 0
                  ? `Se quitará de ${ingredient.uses} plato${ingredient.uses === 1 ? "" : "s"} y de las listas de compra.`
                  : "Este ingrediente no se usa en ningún plato."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-lg border border-stone-200 bg-white py-2.5 text-sm font-medium text-stone-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Borrar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full rounded-xl py-3 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Borrar ingrediente
            </button>
          ))}
      </div>
    </Modal>
  );
}

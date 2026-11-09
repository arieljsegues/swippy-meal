"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  HOUSEHOLD_ID,
  UNITS,
  errorMessage,
  normalizeName,
  type Ingredient,
  type NewIngredientInput,
} from "@/lib/shopping";
import IngredientForm from "./IngredientForm";
import Modal from "./Modal";

type DishIngredient = {
  id: string;
  ingredient_id: string;
  quantity: number | null;
  unit: string | null;
};

type DishRow = {
  id: string;
  name: string;
  dish_ingredients: DishIngredient[];
};

export default function DishIngredients({ onBack }: { onBack?: () => void }) {
  const [dishes, setDishes] = useState<DishRow[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((text: string) => setToast(text), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* ── Load ────────────────────────────────────────────────────────────── */

  useEffect(() => {
    let active = true;

    (async () => {
      const [dishesRes, ingredientsRes] = await Promise.all([
        supabase
          .from("dishes")
          .select("id, name, dish_ingredients(id, ingredient_id, quantity, unit)")
          .eq("household_id", HOUSEHOLD_ID)
          .order("name"),
        supabase
          .from("ingredients")
          .select("id, name, category, is_staple, in_stock")
          .eq("household_id", HOUSEHOLD_ID)
          .order("name"),
      ]);

      if (!active) return;

      if (dishesRes.error || ingredientsRes.error) {
        notify(
          `No se pudieron cargar los datos: ${errorMessage(
            dishesRes.error ?? ingredientsRes.error
          )}`
        );
      } else {
        setDishes(
          (dishesRes.data ?? []).map((raw) => {
            const row = raw as unknown as DishRow;
            return {
              ...row,
              dish_ingredients: (row.dish_ingredients ?? []).map((di) => ({
                ...di,
                quantity: di.quantity === null ? null : Number(di.quantity),
              })),
            };
          })
        );
        setIngredients((ingredientsRes.data ?? []) as Ingredient[]);
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [notify]);

  /* ── Derived ─────────────────────────────────────────────────────────── */

  const ingredientsById = useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients]
  );

  const missingCount = dishes.filter((d) => d.dish_ingredients.length === 0).length;

  const visible = useMemo(() => {
    const query = normalizeName(search);
    return dishes.filter(
      (d) =>
        normalizeName(d.name).includes(query) &&
        (!onlyMissing || d.dish_ingredients.length === 0)
    );
  }, [dishes, search, onlyMissing]);

  const openDish = openId ? dishes.find((d) => d.id === openId) : undefined;

  /* ── Mutations ───────────────────────────────────────────────────────── */

  function updateDish(dishId: string, fn: (rows: DishIngredient[]) => DishIngredient[]) {
    setDishes((cur) =>
      cur.map((d) =>
        d.id === dishId ? { ...d, dish_ingredients: fn(d.dish_ingredients) } : d
      )
    );
  }

  async function addIngredient(dish: DishRow, input: NewIngredientInput) {
    try {
      const clean = input.name.trim().replace(/\s+/g, " ");
      let ingredient = ingredients.find(
        (i) => normalizeName(i.name) === normalizeName(clean)
      );

      if (
        ingredient &&
        dish.dish_ingredients.some((r) => r.ingredient_id === ingredient!.id)
      ) {
        notify("Ese ingrediente ya está en este plato.");
        return false;
      }

      if (!ingredient) {
        const { data, error } = await supabase
          .from("ingredients")
          .insert({
            household_id: HOUSEHOLD_ID,
            name: clean,
            category: input.category,
            is_staple: input.staple,
            in_stock: input.staple,
          })
          .select("id, name, category, is_staple, in_stock")
          .single();

        if (error) throw error;
        ingredient = data as Ingredient;
        const created = ingredient;
        setIngredients((cur) =>
          [...cur, created].sort((a, b) => a.name.localeCompare(b.name, "es"))
        );
      }

      const { data, error } = await supabase
        .from("dish_ingredients")
        .insert({
          dish_id: dish.id,
          ingredient_id: ingredient.id,
          quantity: input.quantity,
          unit: input.quantity === null ? null : input.unit,
        })
        .select("id, ingredient_id, quantity, unit")
        .single();

      if (error) throw error;

      const row = data as DishIngredient;
      updateDish(dish.id, (rows) => [
        ...rows,
        { ...row, quantity: row.quantity === null ? null : Number(row.quantity) },
      ]);
      return true;
    } catch (error) {
      notify(`No se pudo añadir: ${errorMessage(error)}`);
      return false;
    }
  }

  async function patchRow(
    dishId: string,
    rowId: string,
    patch: Partial<Pick<DishIngredient, "quantity" | "unit">>
  ) {
    updateDish(dishId, (rows) =>
      rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r))
    );

    const { error } = await supabase
      .from("dish_ingredients")
      .update(patch)
      .eq("id", rowId);

    if (error) notify(`No se pudo guardar: ${errorMessage(error)}`);
  }

  async function removeRow(dishId: string, row: DishIngredient) {
    updateDish(dishId, (rows) => rows.filter((r) => r.id !== row.id));

    const { error } = await supabase
      .from("dish_ingredients")
      .delete()
      .eq("id", row.id);

    if (error) {
      updateDish(dishId, (rows) => [...rows, row]);
      notify(`No se pudo quitar: ${errorMessage(error)}`);
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 bg-[#fafaf9] p-3 pb-24 text-[#292524] sm:p-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold text-stone-900">Platos e ingredientes</h1>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-medium text-[#293d30] underline underline-offset-2"
          >
            Volver a la compra
          </button>
        )}
      </header>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar plato..."
        className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#293d30]"
      />

      <div className="flex gap-2 text-xs font-medium">
        <button
          type="button"
          aria-pressed={!onlyMissing}
          onClick={() => setOnlyMissing(false)}
          className={`rounded-full px-3 py-1.5 ${!onlyMissing ? "bg-[#293d30] text-white" : "bg-white text-stone-600 border border-stone-200"}`}
        >
          Todos ({dishes.length})
        </button>
        <button
          type="button"
          aria-pressed={onlyMissing}
          onClick={() => setOnlyMissing(true)}
          className={`rounded-full px-3 py-1.5 ${onlyMissing ? "bg-[#293d30] text-white" : "bg-white text-stone-600 border border-stone-200"}`}
        >
          Sin ingredientes ({missingCount})
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-stone-200 bg-white" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
          {onlyMissing ? "Todos los platos tienen ingredientes." : "No hay platos que coincidan."}
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {visible.map((dish) => {
            const count = dish.dish_ingredients.length;
            return (
              <li key={dish.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(dish.id)}
                  className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 text-left hover:bg-stone-50"
                >
                  <span className="text-sm font-medium text-stone-900">{dish.name}</span>
                  <span
                    className={`shrink-0 text-xs ${count === 0 ? "font-medium text-amber-700" : "text-stone-400"}`}
                  >
                    {count === 0
                      ? "Sin ingredientes"
                      : `${count} ingrediente${count === 1 ? "" : "s"}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openDish && (
        <Modal onClose={() => setOpenId(null)} labelledBy="dish-editor-title">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="dish-editor-title" className="break-words text-lg font-semibold text-stone-900">
                {openDish.name}
              </h2>
              <p className="mt-0.5 text-sm text-stone-500">
                Cantidades para 2 personas
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100"
            >
              Listo
            </button>
          </div>

          <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
            {openDish.dish_ingredients.length === 0 ? (
              <p className="rounded-xl bg-stone-50 p-4 text-center text-sm text-stone-500">
                Añade el primer ingrediente de este plato.
              </p>
            ) : (
              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {openDish.dish_ingredients.map((row) => {
                  const ingredient = ingredientsById.get(row.ingredient_id);
                  return (
                    <li key={row.id} className="flex items-center gap-2 p-2">
                      <div className="min-w-0 flex-1 px-1">
                        <p className="truncate text-sm font-medium text-stone-800">
                          {ingredient?.name ?? "Ingrediente"}
                        </p>
                        {ingredient?.is_staple && (
                          <p className="text-[11px] text-stone-400">Básico</p>
                        )}
                      </div>

                      <input
                        key={`${row.id}-${row.quantity}`}
                        type="text"
                        inputMode="decimal"
                        defaultValue={row.quantity ?? ""}
                        placeholder="—"
                        aria-label="Cantidad"
                        onBlur={(event) => {
                          const raw = event.target.value.trim().replace(",", ".");
                          const next = raw === "" ? null : Number(raw);
                          if (next !== null && Number.isNaN(next)) return;
                          if (next === row.quantity) return;
                          void patchRow(openDish.id, row.id, {
                            quantity: next,
                            unit: next === null ? null : row.unit ?? "ud",
                          });
                        }}
                        className="w-16 rounded-lg border border-stone-200 px-2 py-2 text-center text-sm outline-none focus:border-[#293d30]"
                      />

                      <select
                        value={row.unit ?? "ud"}
                        aria-label="Unidad"
                        onChange={(event) =>
                          void patchRow(openDish.id, row.id, { unit: event.target.value })
                        }
                        className="rounded-lg border border-stone-200 bg-white px-1 py-2 text-sm outline-none focus:border-[#293d30]"
                      >
                        {UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => void removeRow(openDish.id, row)}
                        aria-label={`Quitar ${ingredient?.name ?? "ingrediente"}`}
                        className="h-9 w-9 shrink-0 text-lg text-stone-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <IngredientForm
              ingredients={ingredients}
              label="Añadir ingrediente"
              submitLabel="Añadir al plato"
              onSubmit={(input) => addIngredient(openDish, input)}
            />
          </div>
        </Modal>
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
/* Add ingredient form                                                        */

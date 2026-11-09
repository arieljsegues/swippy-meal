"use client";

import { useState } from "react";
import Modal from "./Modal";
import IngredientForm from "./IngredientForm";
import {
  formatQuantity,
  type Ingredient,
  type NewIngredientInput,
  type Override,
  type RecipeRow,
} from "@/lib/shopping";

type WeekDish = { id: string; name: string };

/**
 * Lets you tweak a dish's ingredients for the current week only
 * (e.g. mozzarella instead of burrata) without touching the recipe.
 */
export default function WeekDishEditor({
  initialDishId,
  dishes,
  recipe,
  overrides,
  ingredients,
  allIngredients,
  onClose,
  onUpsert,
  onDelete,
  resolveIngredient,
  notify,
}: {
  initialDishId: string | null;
  dishes: WeekDish[];
  recipe: RecipeRow[];
  overrides: Override[];
  ingredients: Record<string, Ingredient>;
  allIngredients: Ingredient[];
  onClose: () => void;
  onUpsert: (override: Override) => void;
  onDelete: (dishId: string, ingredientId: string) => void;
  resolveIngredient: (input: NewIngredientInput) => Promise<Ingredient | null>;
  notify: (text: string) => void;
}) {
  const [dishId, setDishId] = useState<string | null>(initialDishId);
  const [swapping, setSwapping] = useState<string | null>(null);

  const dish = dishes.find((d) => d.id === dishId);
  const nameOf = (id: string) => ingredients[id]?.name ?? "Ingrediente";
  const qtyLabel = (quantity: number | null, unit: string | null) =>
    quantity === null ? "" : formatQuantity(quantity, unit ?? "ud");

  const changesFor = (id: string) =>
    overrides.filter((o) => o.dish_id === id).length;

  /* ── Dish list ───────────────────────────────────────────────────────── */

  if (!dish) {
    return (
      <Modal onClose={onClose} labelledBy="week-editor-title">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <h2 id="week-editor-title" className="text-lg font-semibold text-stone-900">
              Ajustar platos de la semana
            </h2>
            <p className="mt-0.5 text-sm text-stone-500">
              Elige un plato para cambiar sus ingredientes solo esta semana.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100"
          >
            Cerrar
          </button>
        </div>

        <ul className="mt-4 min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
          {dishes.map((d) => {
            const changes = changesFor(d.id);
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setDishId(d.id)}
                  className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left hover:bg-stone-50"
                >
                  <span className="text-sm font-medium text-stone-800">{d.name}</span>
                  {changes > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {changes} {changes === 1 ? "cambio" : "cambios"}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    );
  }

  /* ── One dish ────────────────────────────────────────────────────────── */

  const base = recipe.filter((r) => r.dish_id === dish.id);
  const dishOverrides = overrides.filter((o) => o.dish_id === dish.id);
  const removed = new Set(
    dishOverrides.filter((o) => o.action === "remove").map((o) => o.ingredient_id)
  );
  const added = dishOverrides.filter((o) => o.action === "add");

  function removeForWeek(row: RecipeRow) {
    onUpsert({
      dish_id: dish!.id,
      ingredient_id: row.ingredient_id,
      action: "remove",
      quantity: null,
      unit: null,
    });
  }

  async function addToDish(
    input: NewIngredientInput,
    replacing?: RecipeRow
  ): Promise<boolean> {
    const ingredient = await resolveIngredient(input);
    if (!ingredient) return false;

    const inBase = base.some((r) => r.ingredient_id === ingredient.id);
    const alreadyAdded = added.some((o) => o.ingredient_id === ingredient.id);

    if (alreadyAdded || (inBase && !removed.has(ingredient.id))) {
      notify("Ese ingrediente ya está en este plato.");
      return false;
    }

    if (inBase) {
      // It was removed for this week: bringing it back just undoes that.
      onDelete(dish!.id, ingredient.id);
    } else {
      onUpsert({
        dish_id: dish!.id,
        ingredient_id: ingredient.id,
        action: "add",
        quantity: input.quantity,
        unit: input.quantity === null ? null : input.unit,
      });
    }

    if (replacing) removeForWeek(replacing);
    setSwapping(null);
    return true;
  }

  const smallButton =
    "rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50";

  return (
    <Modal onClose={onClose} labelledBy="week-editor-title">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {dishes.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setDishId(null);
                setSwapping(null);
              }}
              className="mb-1 text-xs font-medium text-[#293d30] underline underline-offset-2"
            >
              Todos los platos
            </button>
          )}
          <h2
            id="week-editor-title"
            className="break-words text-lg font-semibold text-stone-900"
          >
            {dish.name}
          </h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Los cambios solo afectan a esta semana. La receta no se modifica.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100"
        >
          Listo
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
          {base.map((row) => {
            const isRemoved = removed.has(row.ingredient_id);
            const qty = qtyLabel(row.quantity, row.unit);

            return (
              <li key={row.ingredient_id} className="p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${
                        isRemoved ? "text-stone-400 line-through" : "text-stone-800"
                      }`}
                    >
                      {nameOf(row.ingredient_id)}
                    </p>
                    {qty && <p className="text-xs text-stone-400">{qty}</p>}
                  </div>

                  {isRemoved ? (
                    <button
                      type="button"
                      onClick={() => onDelete(dish.id, row.ingredient_id)}
                      className={smallButton}
                    >
                      Restaurar
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setSwapping((cur) =>
                            cur === row.ingredient_id ? null : row.ingredient_id
                          )
                        }
                        aria-expanded={swapping === row.ingredient_id}
                        className={smallButton}
                      >
                        Cambiar
                      </button>
                      <button
                        type="button"
                        onClick={() => removeForWeek(row)}
                        className={smallButton}
                      >
                        Quitar
                      </button>
                    </>
                  )}
                </div>

                {swapping === row.ingredient_id && !isRemoved && (
                  <div className="mt-3">
                    <IngredientForm
                      ingredients={allIngredients}
                      label={`Cambiar «${nameOf(row.ingredient_id)}» por`}
                      submitLabel="Cambiar esta semana"
                      initialQuantity={row.quantity}
                      initialUnit={row.unit ?? "ud"}
                      autoFocus
                      onSubmit={(input) => addToDish(input, row)}
                    />
                  </div>
                )}
              </li>
            );
          })}

          {added.map((o) => (
            <li key={o.ingredient_id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-800">
                  {nameOf(o.ingredient_id)}
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-normal text-amber-800">
                    Solo esta semana
                  </span>
                </p>
                {o.quantity !== null && (
                  <p className="text-xs text-stone-400">{qtyLabel(o.quantity, o.unit)}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(dish.id, o.ingredient_id)}
                className={smallButton}
              >
                Quitar
              </button>
            </li>
          ))}

          {base.length === 0 && added.length === 0 && (
            <li className="p-4 text-center text-sm text-stone-500">
              Este plato no tiene ingredientes todavía.
            </li>
          )}
        </ul>

        <IngredientForm
          ingredients={allIngredients}
          label="Añadir ingrediente solo esta semana"
          submitLabel="Añadir esta semana"
          onSubmit={(input) => addToDish(input)}
        />
      </div>
    </Modal>
  );
}

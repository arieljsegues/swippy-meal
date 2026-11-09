"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import {
  CATEGORIES,
  UNITS,
  normalizeName,
  type Ingredient,
  type NewIngredientInput,
} from "@/lib/shopping";

/**
 * Name (with autocomplete from known ingredients), optional quantity + unit.
 * If the name is new, it also asks for category and whether it's a staple.
 */
export default function IngredientForm({
  ingredients,
  label,
  submitLabel,
  initialQuantity = null,
  initialUnit = "g",
  autoFocus = false,
  onSubmit,
}: {
  ingredients: Ingredient[];
  label: string;
  submitLabel: string;
  initialQuantity?: number | null;
  initialUnit?: string;
  autoFocus?: boolean;
  onSubmit: (input: NewIngredientInput) => Promise<boolean>;
}) {
  const uid = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(
    initialQuantity === null ? "" : String(initialQuantity)
  );
  const [unit, setUnit] = useState<string>(initialUnit);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [staple, setStaple] = useState(false);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const isNew =
    trimmed.length > 0 &&
    !ingredients.some((i) => normalizeName(i.name) === normalizeName(trimmed));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || saving) return;

    const raw = quantity.trim().replace(",", ".");
    const parsed = raw === "" ? null : Number(raw);

    setSaving(true);
    const ok = await onSubmit({
      name: trimmed,
      quantity: parsed !== null && Number.isNaN(parsed) ? null : parsed,
      unit,
      category,
      staple,
    });
    setSaving(false);

    if (ok) {
      setName("");
      setQuantity("");
      setStaple(false);
      nameRef.current?.focus();
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-2 rounded-xl bg-stone-50 p-3"
    >
      <label htmlFor={`${uid}-name`} className="text-sm font-medium text-stone-700">
        {label}
      </label>

      <input
        id={`${uid}-name`}
        ref={nameRef}
        autoFocus={autoFocus}
        list={`${uid}-list`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Ej: mozzarella, arroz, cebolla"
        autoComplete="off"
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#293d30]"
      />
      <datalist id={`${uid}-list`}>
        {ingredients.map((i) => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>

      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          placeholder="Cantidad (opcional)"
          aria-label="Cantidad"
          className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#293d30]"
        />
        <select
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          aria-label="Unidad"
          className="rounded-xl border border-stone-200 bg-white px-2 py-3 text-sm outline-none focus:border-[#293d30]"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {isNew && (
        <div className="space-y-2 rounded-lg border border-dashed border-stone-300 bg-white p-3">
          <p className="text-xs text-stone-500">
            «{trimmed}» es nuevo. Dinos dónde se compra.
          </p>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Categoría"
            className="w-full rounded-lg border border-stone-200 bg-white px-2 py-2.5 text-sm outline-none focus:border-[#293d30]"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={staple}
              onChange={(event) => setStaple(event.target.checked)}
              className="h-4 w-4"
            />
            Es un básico: normalmente ya lo tengo en casa
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={!trimmed || saving}
        className="w-full rounded-xl bg-[#293d30] py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {saving ? "Guardando..." : submitLabel}
      </button>
    </form>
  );
}

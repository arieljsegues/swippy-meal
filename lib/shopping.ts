import { supabase } from "@/lib/supabase/client";

export const HOUSEHOLD_ID = "f6182e7d-ae8e-418c-b828-4ac925a51781";

/** Ordered roughly like a supermarket walk. */
export const CATEGORIES = [
  "Verdura y fruta",
  "Carne y pescado",
  "Lácteos y huevos",
  "Despensa",
  "Congelados",
  "Otros",
] as const;

export const UNITS = [
  "ud",
  "g",
  "kg",
  "ml",
  "l",
  "lata",
  "paquete",
  "diente",
  "manojo",
  "cda",
] as const;

export type Ingredient = {
  id: string;
  name: string;
  category: string | null;
  is_staple: boolean;
  in_stock: boolean;
};

export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}

/** Converts kg → g and l → ml so quantities of the same ingredient can be added. */
export function toBase(quantity: number, unit: string) {
  if (unit === "kg") return { quantity: quantity * 1000, unit: "g" };
  if (unit === "l") return { quantity: quantity * 1000, unit: "ml" };
  return { quantity, unit };
}

const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("es-ES");

export function formatQuantity(quantity: number, unit: string) {
  if (unit === "g" && quantity >= 1000) return `${fmt(quantity / 1000)} kg`;
  if (unit === "ml" && quantity >= 1000) return `${fmt(quantity / 1000)} l`;
  return `${fmt(quantity)} ${unit}`;
}

export function formatQuantities(quantities: Map<string, number>) {
  return [...quantities.entries()]
    .map(([unit, quantity]) => formatQuantity(quantity, unit))
    .join(" + ");
}

export const INGREDIENT_COLUMNS = "id, name, category, is_staple, in_stock";

export type RecipeRow = {
  dish_id: string;
  ingredient_id: string;
  quantity: number | null;
  unit: string | null;
};

/** A change that only applies to one dish during one week. */
export type Override = RecipeRow & { action: "add" | "remove" };

export type NewIngredientInput = {
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
  staple: boolean;
};

export function categoryOf(category: string | null) {
  return category && (CATEGORIES as readonly string[]).includes(category)
    ? category
    : "Otros";
}

/** Returns the existing ingredient with that name, or creates it. */
export async function findOrCreateIngredient(
  input: Pick<NewIngredientInput, "name" | "category" | "staple">,
  existing: Ingredient[]
): Promise<{ ingredient: Ingredient; created: boolean }> {
  const clean = input.name.trim().replace(/\s+/g, " ");
  const found = existing.find(
    (i) => normalizeName(i.name) === normalizeName(clean)
  );
  if (found) return { ingredient: found, created: false };

  const { data, error } = await supabase
    .from("ingredients")
    .insert({
      household_id: HOUSEHOLD_ID,
      name: clean,
      category: input.category,
      is_staple: input.staple,
      in_stock: input.staple,
    })
    .select(INGREDIENT_COLUMNS)
    .single();

  if (error) throw error;
  return { ingredient: data as Ingredient, created: true };
}

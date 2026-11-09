"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "@/lib/supabase/client";
import {
  CATEGORIES,
  HOUSEHOLD_ID,
  INGREDIENT_COLUMNS,
  errorMessage,
  findOrCreateIngredient,
  formatQuantities,
  toBase,
  type Ingredient,
  type NewIngredientInput,
  type Override,
  type RecipeRow,
} from "@/lib/shopping";
import WeekDishEditor from "./WeekDishEditor";

/* ────────────────────────────────────────────────────────────────────────── */
/* Types                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

type Meal = {
  id: string;
  dish_id: string;
  is_for_one: boolean;
  needs_shopping: boolean;
  dishName: string;
};

type Status = "bought" | "have";
type Check = { ingredient_id: string; status: Status };
type Extra = { id: string; name: string; checked: boolean };
type Item = {
  ingredient: Ingredient;
  quantities: Map<string, number>;
  dishes: string[];
  dishIds: string[];
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Date helpers                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

const dateToKey = (d: Date) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");

const keyToDate = (key: string) => new Date(`${key}T12:00:00`);

function getMonday(date: Date) {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function isValidMonday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = keyToDate(value);
  return !Number.isNaN(date.getTime()) && dateToKey(getMonday(date)) === value;
}

function formatWeekRange(start: string) {
  const opts = { day: "numeric", month: "short" } as const;
  return `${keyToDate(start).toLocaleDateString("es-ES", opts)} – ${addDays(
    keyToDate(start),
    6
  ).toLocaleDateString("es-ES", opts)}`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Component                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

export default function ShoppingList({
  onOpenMenu,
  onOpenDishes,
  onOpenIngredients,
}: {
  onOpenMenu?: () => void;
  onOpenDishes?: () => void;
  onOpenIngredients?: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() =>
    dateToKey(getMonday(new Date()))
  );
  const [ready, setReady] = useState(false);

  const [menuId, setMenuId] = useState<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<Record<string, Ingredient>>({});
  const [checks, setChecks] = useState<Check[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [editor, setEditor] = useState<{ dishId: string | null } | null>(null);
  const [extras, setExtras] = useState<Extra[]>([]);

  const [loading, setLoading] = useState(true);
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [extraDraft, setExtraDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const requestId = useRef(0);

  const notify = useCallback((text: string) => setToast(text), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* ── Week from URL ───────────────────────────────────────────────────── */

  useEffect(() => {
    const week = new URLSearchParams(window.location.search).get("week");
    if (week && isValidMonday(week)) setWeekStart(week);
    setReady(true);
  }, []);

  function goToWeek(monday: string) {
    setWeekStart(monday);
    setExpanded(null);
    const params = new URLSearchParams(window.location.search);
    params.set("week", monday);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}${window.location.hash}`
    );
  }

  /* ── Loading ─────────────────────────────────────────────────────────── */

  const load = useCallback(
    async (silent = false) => {
      if (!ready) return;

      const id = ++requestId.current;
      if (!silent) setLoading(true);

      try {
        const [menuRes, extrasRes] = await Promise.all([
          supabase
            .from("weekly_menus")
            .select("id")
            .eq("household_id", HOUSEHOLD_ID)
            .eq("week_start", weekStart)
            .maybeSingle(),
          supabase
            .from("shopping_extras")
            .select("id, name, checked")
            .eq("household_id", HOUSEHOLD_ID)
            .order("created_at"),
        ]);

        if (menuRes.error) throw menuRes.error;
        if (extrasRes.error) throw extrasRes.error;

        let nextMeals: Meal[] = [];
        let nextRecipe: RecipeRow[] = [];
        let nextIngredients: Record<string, Ingredient> = {};
        let nextChecks: Check[] = [];
        const nextOverrides: Override[] = [];
        const menu = menuRes.data;

        if (menu) {
          const slotsRes = await supabase
            .from("meal_slots")
            .select("id, dish_id, is_for_one, needs_shopping, dishes(name)")
            .eq("menu_id", menu.id)
            .not("dish_id", "is", null);

          if (slotsRes.error) throw slotsRes.error;

          nextMeals = (slotsRes.data ?? []).map((raw) => {
            const row = raw as unknown as {
              id: string;
              dish_id: string;
              is_for_one: boolean | null;
              needs_shopping: boolean | null;
              dishes: { name: string } | null;
            };
            return {
              id: row.id,
              dish_id: row.dish_id,
              is_for_one: row.is_for_one ?? false,
              needs_shopping: row.needs_shopping ?? false,
              dishName: row.dishes?.name ?? "Plato",
            };
          });

          const dishIds = [...new Set(nextMeals.map((m) => m.dish_id))];

          if (dishIds.length > 0) {
            const [recipeRes, checksRes, overridesRes] = await Promise.all([
              supabase
                .from("dish_ingredients")
                .select(
                  "dish_id, ingredient_id, quantity, unit, ingredient:ingredients(id, name, category, is_staple, in_stock)"
                )
                .in("dish_id", dishIds),
              supabase
                .from("shopping_checks")
                .select("ingredient_id, status")
                .eq("menu_id", menu.id),
              supabase
                .from("week_dish_ingredients")
                .select(
                  "dish_id, ingredient_id, action, quantity, unit, ingredient:ingredients(id, name, category, is_staple, in_stock)"
                )
                .eq("menu_id", menu.id),
            ]);

            if (recipeRes.error) throw recipeRes.error;
            if (checksRes.error) throw checksRes.error;

            for (const raw of recipeRes.data ?? []) {
              const row = raw as unknown as RecipeRow & {
                ingredient: Ingredient | null;
              };
              if (!row.ingredient) continue;
              nextIngredients[row.ingredient.id] = row.ingredient;
              nextRecipe.push({
                dish_id: row.dish_id,
                ingredient_id: row.ingredient_id,
                quantity: row.quantity === null ? null : Number(row.quantity),
                unit: row.unit,
              });
            }

            nextChecks = (checksRes.data ?? []) as Check[];

            if (overridesRes.error) {
              notify(
                `No se pudieron cargar los cambios de la semana: ${errorMessage(overridesRes.error)}`
              );
            } else {
              for (const raw of overridesRes.data ?? []) {
                const row = raw as unknown as Override & {
                  ingredient: Ingredient | null;
                };
                if (!row.ingredient) continue;
                nextIngredients[row.ingredient.id] = row.ingredient;
                nextOverrides.push({
                  dish_id: row.dish_id,
                  ingredient_id: row.ingredient_id,
                  action: row.action,
                  quantity: row.quantity === null ? null : Number(row.quantity),
                  unit: row.unit,
                });
              }
            }
          }
        }

        if (id !== requestId.current) return;

        setMenuId(menu?.id ?? null);
        setMeals(nextMeals);
        setRecipe(nextRecipe);
        setIngredients(nextIngredients);
        setChecks(nextChecks);
        setOverrides(nextOverrides);
        setExtras((extrasRes.data ?? []) as Extra[]);
      } catch (error) {
        if (id !== requestId.current) return;
        notify(`No se pudo cargar la lista: ${errorMessage(error)}`);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [ready, weekStart, notify]
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  /* ── Realtime sync ───────────────────────────────────────────────────── */

  useEffect(() => {
    if (!ready) return;

    let timer: number | undefined;
    const trigger = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadRef.current(true), 300);
    };

    const channel = supabase
      .channel("shopping-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_checks" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_extras" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "ingredients" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "week_dish_ingredients" }, trigger)
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [ready]);

  /* ── Derived list ────────────────────────────────────────────────────── */

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase
        .from("ingredients")
        .select(INGREDIENT_COLUMNS)
        .eq("household_id", HOUSEHOLD_ID)
        .order("name");
      if (active && data) setAllIngredients(data as Ingredient[]);
    })();

    return () => {
      active = false;
    };
  }, []);

  const weekDishes = useMemo(
    () =>
      [...new Map(meals.map((m) => [m.dish_id, m.dishName])).entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [meals]
  );

  const statusById = useMemo(
    () => new Map(checks.map((c) => [c.ingredient_id, c.status])),
    [checks]
  );

  const derived = useMemo(() => {
    const included = onlyMarked ? meals.filter((m) => m.needs_shopping) : meals;

    const mealsByDish = new Map<string, Meal[]>();
    for (const meal of included) {
      mealsByDish.set(meal.dish_id, [
        ...(mealsByDish.get(meal.dish_id) ?? []),
        meal,
      ]);
    }

    const items = new Map<string, Item>();
    const dishesWithRecipe = new Set<string>();

    const removed = new Set(
      overrides
        .filter((o) => o.action === "remove")
        .map((o) => `${o.dish_id}|${o.ingredient_id}`)
    );

    for (const row of recipe) dishesWithRecipe.add(row.dish_id);
    for (const o of overrides) dishesWithRecipe.add(o.dish_id);

    // Recipe, minus what was removed this week, plus what was added this week.
    const effective = [
      ...recipe.filter((r) => !removed.has(`${r.dish_id}|${r.ingredient_id}`)),
      ...overrides.filter((o) => o.action === "add"),
    ];

    for (const row of effective) {
      const ingredient = ingredients[row.ingredient_id];
      if (!ingredient) continue;

      for (const meal of mealsByDish.get(row.dish_id) ?? []) {
        const item = items.get(ingredient.id) ?? {
          ingredient,
          quantities: new Map<string, number>(),
          dishes: [],
          dishIds: [],
        };

        if (row.quantity !== null) {
          const base = toBase(
            row.quantity * (meal.is_for_one ? 0.5 : 1),
            row.unit ?? "ud"
          );
          item.quantities.set(
            base.unit,
            (item.quantities.get(base.unit) ?? 0) + base.quantity
          );
        }

        if (!item.dishes.includes(meal.dishName)) item.dishes.push(meal.dishName);
        if (!item.dishIds.includes(meal.dish_id)) item.dishIds.push(meal.dish_id);
        items.set(ingredient.id, item);
      }
    }

    const toBuy: Item[] = [];
    const home: Item[] = [];

    for (const item of items.values()) {
      const status = statusById.get(item.ingredient.id);
      const stocked = item.ingredient.is_staple && item.ingredient.in_stock;

      if (status === "bought") toBuy.push(item);
      else if (status === "have" || stocked) home.push(item);
      else toBuy.push(item);
    }

    const missing = [
      ...new Set(
        included
          .filter((m) => !dishesWithRecipe.has(m.dish_id))
          .map((m) => m.dishName)
      ),
    ];

    const byName = (a: Item, b: Item) =>
      a.ingredient.name.localeCompare(b.ingredient.name, "es");

    const groups = CATEGORIES.map((category) => {
      const list = toBuy
        .filter((item) => {
          const c = item.ingredient.category;
          return (c && (CATEGORIES as readonly string[]).includes(c) ? c : "Otros") === category;
        })
        .sort((a, b) => {
          const aDone = statusById.get(a.ingredient.id) === "bought" ? 1 : 0;
          const bDone = statusById.get(b.ingredient.id) === "bought" ? 1 : 0;
          return aDone - bDone || byName(a, b);
        });
      return { category, list };
    }).filter((g) => g.list.length > 0);

    return { groups, toBuy, home: home.sort(byName), missing };
  }, [meals, recipe, overrides, ingredients, statusById, onlyMarked]);

  const totals = useMemo(() => {
    const done =
      derived.toBuy.filter((i) => statusById.get(i.ingredient.id) === "bought")
        .length + extras.filter((e) => e.checked).length;
    return { done, total: derived.toBuy.length + extras.length };
  }, [derived.toBuy, extras, statusById]);

  /* ── Mutations (optimistic, resync on error) ─────────────────────────── */

  async function sync(promise: PromiseLike<{ error: unknown }>) {
    const { error } = await promise;
    if (error) {
      notify(`No se pudo guardar: ${errorMessage(error)}`);
      void load(true);
    }
  }

  function setStatus(ingredientId: string, status: Status | null) {
    setChecks((cur) => {
      const rest = cur.filter((c) => c.ingredient_id !== ingredientId);
      return status ? [...rest, { ingredient_id: ingredientId, status }] : rest;
    });

    if (!menuId) return;

    void sync(
      status
        ? supabase
            .from("shopping_checks")
            .upsert(
              { menu_id: menuId, ingredient_id: ingredientId, status },
              { onConflict: "menu_id,ingredient_id" }
            )
        : supabase
            .from("shopping_checks")
            .delete()
            .eq("menu_id", menuId)
            .eq("ingredient_id", ingredientId)
    );
  }

  function patchIngredient(
    id: string,
    patch: Partial<Pick<Ingredient, "is_staple" | "in_stock">>
  ) {
    setIngredients((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
    void sync(supabase.from("ingredients").update(patch).eq("id", id));
  }

  function toggleBought(item: Item) {
    const { ingredient } = item;
    const bought = statusById.get(ingredient.id) === "bought";

    setStatus(ingredient.id, bought ? null : "bought");
    // Buying a staple restocks it; unticking undoes that.
    if (ingredient.is_staple) patchIngredient(ingredient.id, { in_stock: !bought });
  }

  function haveThisWeek(item: Item) {
    setStatus(item.ingredient.id, "have");
    setExpanded(null);
  }

  function makeStaple(item: Item) {
    patchIngredient(item.ingredient.id, { is_staple: true, in_stock: true });
    setExpanded(null);
  }

  function removeStaple(item: Item) {
    patchIngredient(item.ingredient.id, { is_staple: false, in_stock: false });
    if (statusById.get(item.ingredient.id) === "have") {
      setStatus(item.ingredient.id, null);
    }
    setExpanded(null);
  }

  function needIt(item: Item) {
    if (item.ingredient.is_staple) {
      patchIngredient(item.ingredient.id, { in_stock: false });
    }
    if (statusById.get(item.ingredient.id) === "have") {
      setStatus(item.ingredient.id, null);
    }
    setExpanded(null);
  }

  async function addExtra(event: FormEvent) {
    event.preventDefault();
    const name = extraDraft.trim();
    if (!name) return;
    setExtraDraft("");

    const { data, error } = await supabase
      .from("shopping_extras")
      .insert({ household_id: HOUSEHOLD_ID, name })
      .select("id, name, checked")
      .single();

    if (error) {
      notify(`No se pudo añadir: ${errorMessage(error)}`);
      return;
    }
    setExtras((cur) => [...cur, data as Extra]);
  }

  function toggleExtra(extra: Extra) {
    setExtras((cur) =>
      cur.map((e) => (e.id === extra.id ? { ...e, checked: !e.checked } : e))
    );
    void sync(
      supabase
        .from("shopping_extras")
        .update({ checked: !extra.checked })
        .eq("id", extra.id)
    );
  }

  function deleteExtra(extra: Extra) {
    setExtras((cur) => cur.filter((e) => e.id !== extra.id));
    void sync(supabase.from("shopping_extras").delete().eq("id", extra.id));
  }

  function clearCheckedExtras() {
    setExtras((cur) => cur.filter((e) => !e.checked));
    void sync(
      supabase
        .from("shopping_extras")
        .delete()
        .eq("household_id", HOUSEHOLD_ID)
        .eq("checked", true)
    );
  }

  /* ── Share ───────────────────────────────────────────────────────────── */

  /* Week-only ingredient changes */

  function upsertOverride(o: Override) {
    setOverrides((cur) => [
      ...cur.filter(
        (x) => !(x.dish_id === o.dish_id && x.ingredient_id === o.ingredient_id)
      ),
      o,
    ]);

    if (!menuId) return;

    void sync(
      supabase.from("week_dish_ingredients").upsert(
        {
          menu_id: menuId,
          dish_id: o.dish_id,
          ingredient_id: o.ingredient_id,
          action: o.action,
          quantity: o.quantity,
          unit: o.unit,
        },
        { onConflict: "menu_id,dish_id,ingredient_id" }
      )
    );
  }

  function deleteOverride(dishId: string, ingredientId: string) {
    setOverrides((cur) =>
      cur.filter(
        (x) => !(x.dish_id === dishId && x.ingredient_id === ingredientId)
      )
    );

    if (!menuId) return;

    void sync(
      supabase
        .from("week_dish_ingredients")
        .delete()
        .eq("menu_id", menuId)
        .eq("dish_id", dishId)
        .eq("ingredient_id", ingredientId)
    );
  }

  async function resolveIngredient(
    input: NewIngredientInput
  ): Promise<Ingredient | null> {
    try {
      const { ingredient, created } = await findOrCreateIngredient(
        input,
        allIngredients
      );

      if (created) {
        setAllIngredients((cur) =>
          [...cur, ingredient].sort((a, b) => a.name.localeCompare(b.name, "es"))
        );
      }
      setIngredients((cur) => ({
        ...cur,
        [ingredient.id]: cur[ingredient.id] ?? ingredient,
      }));
      return ingredient;
    } catch (error) {
      notify(`No se pudo crear el ingrediente: ${errorMessage(error)}`);
      return null;
    }
  }

  async function shareList() {
    const lines = [`🛒 Compra ${formatWeekRange(weekStart)}`];

    for (const { category, list } of derived.groups) {
      const pending = list.filter(
        (i) => statusById.get(i.ingredient.id) !== "bought"
      );
      if (pending.length === 0) continue;

      lines.push("", `*${category}*`);
      for (const item of pending) {
        const qty = formatQuantities(item.quantities);
        lines.push(`- ${item.ingredient.name}${qty ? ` (${qty})` : ""}`);
      }
    }

    const pendingExtras = extras.filter((e) => !e.checked);
    if (pendingExtras.length > 0) {
      lines.push("", "*Otros*", ...pendingExtras.map((e) => `- ${e.name}`));
    }

    const text = lines.join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        notify("Lista copiada. Ya puedes pegarla en WhatsApp.");
      }
    } catch {
      /* user cancelled the share sheet */
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  const isCurrentWeek = weekStart === dateToKey(getMonday(new Date()));
  const progress = totals.total ? (totals.done / totals.total) * 100 : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 bg-[#fafaf9] p-3 pb-24 text-[#292524] sm:p-6">
      {/* Header */}
      <section className="sticky top-0 z-30 -mx-3 border-b border-stone-200 bg-[#fafaf9]/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goToWeek(dateToKey(addDays(keyToDate(weekStart), -7)))}
            disabled={loading}
            aria-label="Semana anterior"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-2xl text-stone-700 active:scale-95 disabled:opacity-40"
          >
            ‹
          </button>

          <div className="min-w-0 text-center">
            <h1 className="text-base font-semibold text-stone-900">
              Lista de la compra
            </h1>
            <p className="text-xs text-stone-500">{formatWeekRange(weekStart)}</p>
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => goToWeek(dateToKey(getMonday(new Date())))}
                className="text-xs font-medium text-[#293d30] underline underline-offset-2"
              >
                Volver a esta semana
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => goToWeek(dateToKey(addDays(keyToDate(weekStart), 7)))}
            disabled={loading}
            aria-label="Semana siguiente"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-2xl text-stone-700 active:scale-95 disabled:opacity-40"
          >
            ›
          </button>
        </div>

        {totals.total > 0 && (
          <div className="mt-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-[#293d30] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-stone-500">
              {totals.done} de {totals.total} en el carrito
            </p>
          </div>
        )}
      </section>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Qué comidas incluir"
          className="flex rounded-xl border border-stone-200 bg-white p-0.5 text-xs font-medium"
        >
          {[
            { value: false, label: "Toda la semana" },
            { value: true, label: "Solo marcadas 🛒" },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setOnlyMarked(option.value)}
              aria-pressed={onlyMarked === option.value}
              className={`rounded-lg px-3 py-2 transition ${
                onlyMarked === option.value
                  ? "bg-[#293d30] text-white"
                  : "text-stone-600 hover:bg-stone-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void shareList()}
          disabled={loading || totals.total === 0}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40"
        >
          Compartir
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-medium">
        <button
          type="button"
          onClick={() => setEditor({ dishId: null })}
          disabled={loading || meals.length === 0}
          className="rounded-full border border-stone-200 bg-white px-3 py-2 text-stone-700 hover:bg-stone-50 disabled:opacity-40"
        >
          Ajustar platos de la semana
        </button>
        {onOpenIngredients && (
          <button
            type="button"
            onClick={onOpenIngredients}
            className="rounded-full border border-stone-200 bg-white px-3 py-2 text-stone-700 hover:bg-stone-50"
          >
            Ingredientes
          </button>
        )}
        {onOpenDishes && (
          <button
            type="button"
            onClick={onOpenDishes}
            className="rounded-full border border-stone-200 bg-white px-3 py-2 text-stone-700 hover:bg-stone-50"
          >
            Recetas
          </button>
        )}
      </div>

      {/* Missing recipes */}
      {!loading && derived.missing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">
            {derived.missing.length === 1
              ? "1 plato sin ingredientes"
              : `${derived.missing.length} platos sin ingredientes`}
          </p>
          <p className="mt-0.5 text-xs">{derived.missing.join(", ")}</p>
          {onOpenDishes && (
            <button
              type="button"
              onClick={onOpenDishes}
              className="mt-2 text-xs font-semibold underline underline-offset-2"
            >
              Añadir ingredientes
            </button>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-stone-200 bg-white"
            />
          ))}
        </div>
      ) : (
        <>
          {meals.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
              No hay platos planificados esta semana.
              {onOpenMenu && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={onOpenMenu}
                    className="font-semibold underline"
                  >
                    Ir al menú
                  </button>
                </>
              )}
            </div>
          )}

          {derived.groups.map(({ category, list }) => (
            <section key={category}>
              <h2 className="mb-1.5 px-1 text-sm font-semibold text-stone-700">
                {category}
              </h2>
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                {list.map((item) => (
                  <ItemRow
                    key={item.ingredient.id}
                    item={item}
                    variant="buy"
                    done={statusById.get(item.ingredient.id) === "bought"}
                    open={expanded === item.ingredient.id}
                    onToggle={() => toggleBought(item)}
                    onOpen={() =>
                      setExpanded((cur) =>
                        cur === item.ingredient.id ? null : item.ingredient.id
                      )
                    }
                    onHave={() => haveThisWeek(item)}
                    onMakeStaple={() => makeStaple(item)}
                    onRemoveStaple={() => removeStaple(item)}
                    onNeed={() => needIt(item)}
                    onSwap={() => {
                      setExpanded(null);
                      setEditor({
                        dishId: item.dishIds.length === 1 ? item.dishIds[0] : null,
                      });
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}

          {/* Extras */}
          <section>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-stone-700">Otros artículos</h2>
              {extras.some((e) => e.checked) && (
                <button
                  type="button"
                  onClick={clearCheckedExtras}
                  className="text-xs font-medium text-stone-500 underline underline-offset-2"
                >
                  Quitar marcados
                </button>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {extras.length > 0 && (
                <ul className="divide-y divide-stone-100">
                  {extras.map((extra) => (
                    <li key={extra.id} className="flex items-center gap-1 pr-1">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={extra.checked}
                        onClick={() => toggleExtra(extra)}
                        className="flex min-h-[52px] flex-1 items-center gap-3 px-3 text-left"
                      >
                        <Checkbox checked={extra.checked} />
                        <span
                          className={`text-sm ${
                            extra.checked ? "text-stone-400 line-through" : "text-stone-800"
                          }`}
                        >
                          {extra.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteExtra(extra)}
                        aria-label={`Borrar ${extra.name}`}
                        className="h-10 w-10 text-lg text-stone-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form
                onSubmit={(event) => void addExtra(event)}
                className={`flex gap-2 p-2 ${extras.length > 0 ? "border-t border-stone-100" : ""}`}
              >
                <input
                  value={extraDraft}
                  onChange={(event) => setExtraDraft(event.target.value)}
                  maxLength={80}
                  placeholder="Ej: papel de cocina"
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-[#293d30]"
                />
                <button
                  type="submit"
                  disabled={!extraDraft.trim()}
                  className="shrink-0 rounded-xl bg-[#293d30] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Añadir
                </button>
              </form>
            </div>
          </section>

          {/* Already at home */}
          {derived.home.length > 0 && (
            <details className="group rounded-2xl border border-stone-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-stone-700">
                <span>Ya en casa ({derived.home.length})</span>
                <span className="text-stone-400 transition group-open:rotate-90">›</span>
              </summary>
              <ul className="divide-y divide-stone-100 border-t border-stone-100">
                {derived.home.map((item) => (
                  <ItemRow
                    key={item.ingredient.id}
                    item={item}
                    variant="home"
                    done={false}
                    open={expanded === item.ingredient.id}
                    onToggle={() => needIt(item)}
                    onOpen={() =>
                      setExpanded((cur) =>
                        cur === item.ingredient.id ? null : item.ingredient.id
                      )
                    }
                    onHave={() => haveThisWeek(item)}
                    onMakeStaple={() => makeStaple(item)}
                    onRemoveStaple={() => removeStaple(item)}
                    onNeed={() => needIt(item)}
                  />
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {editor && (
        <WeekDishEditor
          initialDishId={editor.dishId}
          dishes={weekDishes}
          recipe={recipe}
          overrides={overrides}
          ingredients={ingredients}
          allIngredients={allIngredients}
          onClose={() => setEditor(null)}
          onUpsert={upsertOverride}
          onDelete={deleteOverride}
          resolveIngredient={resolveIngredient}
          notify={notify}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-4 z-[110] flex justify-center px-3"
        >
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
/* Pieces                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
        checked
          ? "border-[#293d30] bg-[#293d30] text-white"
          : "border-stone-300 bg-white text-transparent"
      }`}
    >
      ✓
    </span>
  );
}

function ItemRow({
  item,
  variant,
  done,
  open,
  onToggle,
  onOpen,
  onHave,
  onMakeStaple,
  onRemoveStaple,
  onNeed,
  onSwap,
}: {
  item: Item;
  variant: "buy" | "home";
  done: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onHave: () => void;
  onMakeStaple: () => void;
  onRemoveStaple: () => void;
  onNeed: () => void;
  onSwap?: () => void;
}) {
  const quantity = formatQuantities(item.quantities);
  const { ingredient } = item;
  const actionClass =
    "rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50";

  return (
    <li className={done ? "bg-stone-50" : ""}>
      <div className="flex items-center gap-1 pr-1">
        {variant === "buy" ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            onClick={onToggle}
            className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 px-3 text-left"
          >
            <Checkbox checked={done} />
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm font-medium ${
                  done ? "text-stone-400 line-through" : "text-stone-900"
                }`}
              >
                {ingredient.name}
                {ingredient.is_staple && (
                  <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-normal text-stone-500 no-underline">
                    Básico
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-xs text-stone-400">
                {item.dishes.join(", ")}
              </span>
            </span>
            {quantity && (
              <span
                className={`shrink-0 text-sm ${done ? "text-stone-400" : "text-stone-600"}`}
              >
                {quantity}
              </span>
            )}
          </button>
        ) : (
          <div className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-stone-700">{ingredient.name}</span>
              <span className="block truncate text-xs text-stone-400">
                {item.dishes.join(", ")}
              </span>
            </span>
            {quantity && <span className="shrink-0 text-sm text-stone-500">{quantity}</span>}
          </div>
        )}

        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          aria-label={`Opciones de ${ingredient.name}`}
          className="h-10 w-10 shrink-0 rounded-full text-lg text-stone-400 hover:bg-stone-100"
        >
          ⋯
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap gap-2 px-3 pb-3 pl-12">
          {variant === "buy" ? (
            <>
              <button type="button" onClick={onHave} className={actionClass}>
                Ya lo tengo esta semana
              </button>
              {onSwap && (
                <button type="button" onClick={onSwap} className={actionClass}>
                  Cambiar por otro ingrediente
                </button>
              )}
              {ingredient.is_staple ? (
                <button type="button" onClick={onRemoveStaple} className={actionClass}>
                  Quitar de básicos
                </button>
              ) : (
                <button type="button" onClick={onMakeStaple} className={actionClass}>
                  Es un básico: siempre en casa
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={onNeed} className={actionClass}>
                Lo necesito
              </button>
              {ingredient.is_staple && (
                <button type="button" onClick={onRemoveStaple} className={actionClass}>
                  Quitar de básicos
                </button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

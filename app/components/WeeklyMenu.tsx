"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase/client";

/* ────────────────────────────────────────────────────────────────────────── */
/* Constants & types                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

const HOUSEHOLD_ID = "f6182e7d-ae8e-418c-b828-4ac925a51781";
const BLOCKED_LABEL = "NO_DISPONIBLE";
const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 10;

const SLOT_SELECT =
  "id, day_of_week, meal_type, dish_id, special_label, is_for_one, needs_defrost, needs_shopping, note, dishes(name)";

type MealType = "lunch" | "dinner";

const MEALS = [
  { label: "Comida", type: "lunch" },
  { label: "Cena", type: "dinner" },
] as const;

type SlotValues = {
  dish_id: string | null;
  special_label: string | null;
  is_for_one: boolean;
  needs_defrost: boolean;
  needs_shopping: boolean;
  note: string | null;
};

type Slot = SlotValues & {
  id: string;
  day_of_week: number;
  meal_type: MealType;
  dishes: { name: string } | null;
  date_key: string;
};

type SlotRow = Omit<Slot, "date_key" | "is_for_one" | "needs_defrost" | "needs_shopping" | "note"> & {
  is_for_one: boolean | null;
  needs_defrost: boolean | null;
  needs_shopping: boolean | null;
  note: string | null;
};

type Dish = { id: string; name: string };
type MenuNote = { id: string; text: string; done: boolean };
type Target = { dateKey: string; mealType: MealType };
type Toast = { id: number; text: string; tone: "error" | "info" };

/* ────────────────────────────────────────────────────────────────────────── */
/* Date & text helpers                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

function dateToKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function keyToDate(key: string) {
  return new Date(`${key}T12:00:00`);
}

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

function getWeekday(date: Date) {
  return (date.getDay() + 6) % 7;
}

function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = keyToDate(value);
  return !Number.isNaN(date.getTime()) && dateToKey(date) === value;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function formatWeekRange(start: string, end: string) {
  const s = keyToDate(start);
  const e = keyToDate(end);
  const sameMonth =
    s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();

  if (sameMonth) {
    return `${s.getDate()} – ${e.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }

  return `${s.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  })} – ${e.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Slot helpers                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

const isBlocked = (slot?: Slot) => slot?.special_label === BLOCKED_LABEL;
const canSwap = (slot?: Slot) => Boolean(slot && slot.dish_id && !isBlocked(slot));

function toSlot(raw: unknown, weekStart: string): Slot {
  const row = raw as SlotRow;
  return {
    id: row.id,
    day_of_week: row.day_of_week,
    meal_type: row.meal_type,
    dish_id: row.dish_id,
    special_label: row.special_label,
    is_for_one: row.is_for_one ?? false,
    needs_defrost: row.needs_defrost ?? false,
    needs_shopping: row.needs_shopping ?? false,
    note: row.note ?? null,
    dishes: row.dishes,
    date_key: dateToKey(addDays(keyToDate(weekStart), row.day_of_week)),
  };
}

function pickValues(slot: Slot): SlotValues {
  return {
    dish_id: slot.dish_id,
    special_label: slot.special_label,
    is_for_one: slot.is_for_one,
    needs_defrost: slot.needs_defrost,
    needs_shopping: slot.needs_shopping,
    note: slot.note,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Main component                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

export default function WeeklyMenu() {
  const [weekStart, setWeekStart] = useState(() =>
    dateToKey(getMonday(new Date()))
  );
  const [ready, setReady] = useState(false);

  const [menuId, setMenuId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [notes, setNotes] = useState<MenuNote[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [picker, setPicker] = useState<Target | null>(null);
  const [sheetSlotId, setSheetSlotId] = useState<string | null>(null);

  const requestId = useRef(0);
  const todayRef = useRef<HTMLElement | null>(null);

  const weekEnd = dateToKey(addDays(keyToDate(weekStart), 6));
  const todayKey = dateToKey(new Date());
  const isCurrentWeek = weekStart === dateToKey(getMonday(new Date()));

  const dates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => addDays(keyToDate(weekStart), i)),
    [weekStart]
  );

  const notify = useCallback(
    (text: string, tone: Toast["tone"] = "error") =>
      setToast({ id: Date.now(), text, tone }),
    []
  );

  const fail = useCallback(
    (prefix: string, error: unknown) => {
      const detail = errorMessage(error);
      notify(detail ? `${prefix}: ${detail}` : prefix);
    },
    [notify]
  );

  /* ── Week from URL ───────────────────────────────────────────────────── */

  useEffect(() => {
    const week = new URLSearchParams(window.location.search).get("week");
    if (
      week &&
      isValidDateKey(week) &&
      dateToKey(getMonday(keyToDate(week))) === week
    ) {
      setWeekStart(week);
    }
    setReady(true);
  }, []);

  const goToWeek = useCallback((monday: string) => {
    setWeekStart(monday);
    setSwapSource(null);
    setSheetSlotId(null);
    setToast(null);

    const params = new URLSearchParams(window.location.search);
    params.set("week", monday);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}${window.location.hash}`
    );
  }, []);

  const changeWeek = (offset: number) =>
    goToWeek(dateToKey(addDays(keyToDate(weekStart), offset * 7)));

  /* ── Data loading ────────────────────────────────────────────────────── */

  const loadMenu = useCallback(
    async (silent = false) => {
      if (!ready) return;

      const id = ++requestId.current;
      if (!silent) setLoading(true);

      try {
        const { data: menu, error: menuError } = await supabase
          .from("weekly_menus")
          .select("id")
          .eq("household_id", HOUSEHOLD_ID)
          .eq("week_start", weekStart)
          .maybeSingle();

        if (menuError) throw menuError;
        if (id !== requestId.current) return;

        if (!menu) {
          setMenuId(null);
          setSlots([]);
          setNotes([]);
          return;
        }

        const [slotsRes, notesRes] = await Promise.all([
          supabase.from("meal_slots").select(SLOT_SELECT).eq("menu_id", menu.id),
          supabase
            .from("menu_notes")
            .select("id, text, done")
            .eq("menu_id", menu.id)
            .order("created_at"),
        ]);

        if (slotsRes.error) throw slotsRes.error;
        if (id !== requestId.current) return;

        setMenuId(menu.id as string);
        setSlots((slotsRes.data ?? []).map((row) => toSlot(row, weekStart)));

        if (notesRes.error) {
          setNotes([]);
          fail("No se pudieron cargar las notas", notesRes.error);
        } else {
          setNotes((notesRes.data ?? []) as MenuNote[]);
        }
      } catch (error) {
        if (id !== requestId.current) return;
        setSlots([]);
        setNotes([]);
        fail("No se pudo cargar el menú", error);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [ready, weekStart, fail]
  );

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("dishes")
        .select("id, name")
        .eq("household_id", HOUSEHOLD_ID)
        .order("name");

      if (!active) return;
      if (error) {
        fail("No se pudieron cargar los platos", error);
        return;
      }
      setDishes((data ?? []) as Dish[]);
    })();

    return () => {
      active = false;
    };
  }, [fail]);

  /* ── Small effects ───────────────────────────────────────────────────── */

  useEffect(() => {
    if (!loading && isCurrentWeek) {
      todayRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [loading, isCurrentWeek, weekStart]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!swapSource) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSwapSource(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [swapSource]);

  /* ── Derived data ────────────────────────────────────────────────────── */

  const slotMap = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const slot of slots) map.set(`${slot.date_key}|${slot.meal_type}`, slot);
    return map;
  }, [slots]);

  const findSlot = useCallback(
    (dateKey: string, mealType: MealType) =>
      slotMap.get(`${dateKey}|${mealType}`),
    [slotMap]
  );

  const summary = useMemo(() => {
    const planned = slots.filter((s) => s.dish_id && !isBlocked(s));
    const blocked = slots.filter(isBlocked).length;
    return {
      planned: planned.length,
      empty: 14 - planned.length - blocked,
      shopping: planned.filter((s) => s.needs_shopping).length,
      defrost: planned.filter((s) => s.needs_defrost).length,
    };
  }, [slots]);

  const sheetSlot = sheetSlotId
    ? slots.find((s) => s.id === sheetSlotId)
    : undefined;

  /* ── Mutations ───────────────────────────────────────────────────────── */

  async function run(errorText: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      fail(errorText, error);
    } finally {
      setBusy(false);
    }
  }

  async function ensureMenuId() {
    if (menuId) return menuId;

    const { data, error } = await supabase
      .from("weekly_menus")
      .upsert(
        { household_id: HOUSEHOLD_ID, week_start: weekStart },
        { onConflict: "household_id,week_start" }
      )
      .select("id")
      .single();

    if (error) throw error;

    setMenuId(data.id as string);
    return data.id as string;
  }

  /** Optimistic update with rollback. */
  async function patchSlot(slotId: string, values: Partial<SlotValues>) {
    const previous = slots.find((s) => s.id === slotId);
    if (!previous) return;

    const rollback = Object.fromEntries(
      Object.keys(values).map((key) => [key, previous[key as keyof Slot]])
    );

    setSlots((cur) =>
      cur.map((s) => (s.id === slotId ? { ...s, ...values } : s))
    );

    const { error } = await supabase
      .from("meal_slots")
      .update(values)
      .eq("id", slotId);

    if (error) {
      setSlots((cur) =>
        cur.map((s) => (s.id === slotId ? { ...s, ...rollback } : s))
      );
      fail("No se pudo guardar el cambio", error);
    }
  }

  async function removeSlot(slot: Slot) {
    setSheetSlotId(null);
    setSlots((cur) => cur.filter((s) => s.id !== slot.id));

    const { error } = await supabase
      .from("meal_slots")
      .delete()
      .eq("id", slot.id);

    if (error) {
      setSlots((cur) => [...cur, slot]);
      fail("No se pudo quitar el plato", error);
    }
  }

  async function toggleBlocked(target: Target) {
    await run("No se pudo cambiar la disponibilidad", async () => {
      const existing = findSlot(target.dateKey, target.mealType);

      if (existing && isBlocked(existing)) {
        const { error } = await supabase
          .from("meal_slots")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        setSlots((cur) => cur.filter((s) => s.id !== existing.id));
        return;
      }

      if (existing) {
        notify("Quita primero el plato para bloquear esta casilla.", "info");
        return;
      }

      const id = await ensureMenuId();
      const { data, error } = await supabase
        .from("meal_slots")
        .insert({
          menu_id: id,
          day_of_week: getWeekday(keyToDate(target.dateKey)),
          meal_type: target.mealType,
          dish_id: null,
          special_label: BLOCKED_LABEL,
        })
        .select(SLOT_SELECT)
        .single();

      if (error) throw error;
      setSlots((cur) => [...cur, toSlot(data, weekStart)]);
    });
  }

  async function assignDishCore(dish: Dish, target: Target) {
    const existing = findSlot(target.dateKey, target.mealType);

    if (existing) {
      const values: SlotValues = {
        dish_id: dish.id,
        special_label: null,
        is_for_one: false,
        needs_defrost: false,
        needs_shopping: false,
        note: null,
      };

      const { error } = await supabase
        .from("meal_slots")
        .update(values)
        .eq("id", existing.id);
      if (error) throw error;

      setSlots((cur) =>
        cur.map((s) =>
          s.id === existing.id
            ? { ...s, ...values, dishes: { name: dish.name } }
            : s
        )
      );
    } else {
      const id = await ensureMenuId();
      const { data, error } = await supabase
        .from("meal_slots")
        .insert({
          menu_id: id,
          day_of_week: getWeekday(keyToDate(target.dateKey)),
          meal_type: target.mealType,
          dish_id: dish.id,
        })
        .select(SLOT_SELECT)
        .single();

      if (error) throw error;
      setSlots((cur) => [...cur, toSlot(data, weekStart)]);
    }

    setPicker(null);
  }

  const assignDish = (dish: Dish, target: Target) =>
    run("No se pudo asignar el plato", () => assignDishCore(dish, target));

  const createAndAssign = (name: string, target: Target) =>
    run("No se pudo crear el plato", async () => {
      const clean = name.trim().replace(/\s+/g, " ");

      const { data, error } = await supabase
        .from("dishes")
        .insert({ household_id: HOUSEHOLD_ID, name: clean })
        .select("id, name")
        .single();

      if (error) throw error;

      const dish = data as Dish;
      setDishes((cur) =>
        [...cur, dish].sort((a, b) => a.name.localeCompare(b.name, "es"))
      );
      await assignDishCore(dish, target);
    });

  async function performSwap(
    target: Slot | undefined,
    dateKey: string,
    mealType: MealType
  ) {
    const source = slots.find((s) => s.id === swapSource);

    if (!source || !canSwap(source) || target?.id === source.id) {
      setSwapSource(null);
      return;
    }

    if (isBlocked(target)) return;

    await run("No se pudo completar el intercambio", async () => {
      const sourceValues = pickValues(source);

      try {
        if (!target || !target.dish_id) {
          if (target) {
            const { error } = await supabase
              .from("meal_slots")
              .update(sourceValues)
              .eq("id", target.id);
            if (error) throw error;
          } else {
            const id = await ensureMenuId();
            const { error } = await supabase.from("meal_slots").insert({
              ...sourceValues,
              menu_id: id,
              day_of_week: getWeekday(keyToDate(dateKey)),
              meal_type: mealType,
            });
            if (error) throw error;
          }

          const { error: deleteError } = await supabase
            .from("meal_slots")
            .delete()
            .eq("id", source.id);
          if (deleteError) throw deleteError;
          return;
        }

        const targetValues = pickValues(target);

        const { error: first } = await supabase
          .from("meal_slots")
          .update(targetValues)
          .eq("id", source.id);
        if (first) throw first;

        const { error: second } = await supabase
          .from("meal_slots")
          .update(sourceValues)
          .eq("id", target.id);

        if (second) {
          await supabase
            .from("meal_slots")
            .update(sourceValues)
            .eq("id", source.id);
          throw second;
        }
      } finally {
        await loadMenu(true);
        setSwapSource(null);
      }
    });
  }

  /* Notes */

  async function addNote(text: string) {
    const clean = text.trim();
    if (!clean) return;

    await run("No se pudo añadir la nota", async () => {
      const id = await ensureMenuId();
      const { data, error } = await supabase
        .from("menu_notes")
        .insert({ menu_id: id, text: clean })
        .select("id, text, done")
        .single();

      if (error) throw error;
      setNotes((cur) => [...cur, data as MenuNote]);
    });
  }

  async function toggleNote(note: MenuNote) {
    setNotes((cur) =>
      cur.map((n) => (n.id === note.id ? { ...n, done: !n.done } : n))
    );

    const { error } = await supabase
      .from("menu_notes")
      .update({ done: !note.done })
      .eq("id", note.id);

    if (error) {
      setNotes((cur) =>
        cur.map((n) => (n.id === note.id ? { ...n, done: note.done } : n))
      );
      fail("No se pudo actualizar la nota", error);
    }
  }

  async function deleteNote(note: MenuNote) {
    setNotes((cur) => cur.filter((n) => n.id !== note.id));

    const { error } = await supabase
      .from("menu_notes")
      .delete()
      .eq("id", note.id);

    if (error) {
      setNotes((cur) => [...cur, note]);
      fail("No se pudo borrar la nota", error);
    }
  }

  /* ── Interaction ─────────────────────────────────────────────────────── */

  function handleSlotTap(slot: Slot | undefined, target: Target) {
    if (busy || loading) return;

    if (swapSource) {
      void performSwap(slot, target.dateKey, target.mealType);
      return;
    }

    if (!slot || (!slot.dish_id && !isBlocked(slot))) {
      setPicker(target);
      return;
    }

    setSheetSlotId(slot.id);
  }

  function startSwap(slot: Slot) {
    setSheetSlotId(null);
    setSwapSource(slot.id);
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  const weekTitle = keyToDate(weekStart).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 bg-[#fafaf9] p-3 pb-28 text-[#292524] sm:p-6 sm:pb-28">
      {/* Week navigator */}
      <section className="sticky top-0 z-30 -mx-3 flex items-center justify-between gap-3 border-b border-stone-200 bg-[#fafaf9]/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <button
          type="button"
          onClick={() => changeWeek(-1)}
          disabled={loading || busy}
          aria-label="Semana anterior"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-2xl text-stone-700 transition hover:bg-stone-100 active:scale-95 disabled:opacity-40"
        >
          ‹
        </button>

        <div className="min-w-0 text-center">
          <h1 className="text-base font-semibold text-stone-900">
            Semana del {weekTitle}
          </h1>
          <p className="text-xs text-stone-500">
            {formatWeekRange(weekStart, weekEnd)}
          </p>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={() => goToWeek(dateToKey(getMonday(new Date())))}
              disabled={loading || busy}
              className="mt-0.5 text-xs font-medium text-[#293d30] underline underline-offset-2 disabled:opacity-40"
            >
              Volver a esta semana
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => changeWeek(1)}
          disabled={loading || busy}
          aria-label="Semana siguiente"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-2xl text-stone-700 transition hover:bg-stone-100 active:scale-95 disabled:opacity-40"
        >
          ›
        </button>
      </section>

      {/* Weekly summary */}
      {!loading && (
        <section
          aria-label="Resumen de la semana"
          className="flex flex-wrap gap-2 text-xs"
        >
          <SummaryChip
            tone="green"
            label={`${summary.planned}/14 planificadas`}
          />
          {summary.empty > 0 && (
            <SummaryChip tone="stone" label={`${summary.empty} sin asignar`} />
          )}
          {summary.shopping > 0 && (
            <SummaryChip
              tone="red"
              label={`🛒 ${summary.shopping} por comprar`}
            />
          )}
          {summary.defrost > 0 && (
            <SummaryChip
              tone="blue"
              label={`🧊 ${summary.defrost} por descongelar`}
            />
          )}
        </section>
      )}

      {/* Notes */}
      {!loading && (
        <NotesPanel
          notes={notes}
          busy={busy}
          onAdd={addNote}
          onToggle={toggleNote}
          onDelete={deleteNote}
        />
      )}

      {/* Week grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-2xl border border-stone-200 bg-white"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {dates.map((date) => {
            const dateKey = dateToKey(date);
            const isToday = dateKey === todayKey;
            const isPast = dateKey < todayKey;

            const filled = MEALS.filter(({ type }) => {
              const s = findSlot(dateKey, type);
              return s?.dish_id && !isBlocked(s);
            }).length;

            return (
              <section
                key={dateKey}
                ref={isToday ? todayRef : undefined}
                className={`min-w-0 space-y-2 rounded-2xl border p-2.5 ${
                  isToday
                    ? "border-[#293d30] bg-[#f3f7f4] ring-2 ring-[#293d30]/20"
                    : isPast
                      ? "border-stone-200 bg-white/60"
                      : "border-stone-200 bg-white"
                }`}
              >
                <header
                  className={`flex items-center justify-between gap-1 border-b px-1 pb-2 ${
                    isToday ? "border-[#293d30]/20" : "border-stone-100"
                  }`}
                >
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold capitalize text-stone-800">
                      {date.toLocaleDateString("es-ES", { weekday: "long" })}
                    </h2>
                    <p className="text-xs text-stone-500">
                      {date.toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {isToday && (
                      <span className="rounded-md bg-[#293d30] px-1.5 py-1 text-[11px] font-semibold text-white">
                        Hoy
                      </span>
                    )}
                    <span className="rounded-md bg-stone-100 px-1.5 py-1 text-[11px] font-medium text-stone-500">
                      {filled}/2
                    </span>
                  </div>
                </header>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                  {MEALS.map(({ label, type }) => {
                    const slot = findSlot(dateKey, type);
                    return (
                      <SlotCard
                        key={type}
                        slot={slot}
                        label={label}
                        selected={Boolean(slot && slot.id === swapSource)}
                        swapActive={Boolean(swapSource)}
                        disabled={busy}
                        onTap={() => handleSlotTap(slot, { dateKey, mealType: type })}
                        onLongPress={() => {
                          if (slot && canSwap(slot)) setSwapSource(slot.id);
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Slot actions */}
      {sheetSlot && (
        <SlotSheet
          slot={sheetSlot}
          busy={busy}
          onClose={() => setSheetSlotId(null)}
          onChangeDish={() => {
            setSheetSlotId(null);
            setPicker({
              dateKey: sheetSlot.date_key,
              mealType: sheetSlot.meal_type,
            });
          }}
          onToggle={(flag) =>
            void patchSlot(sheetSlot.id, { [flag]: !sheetSlot[flag] })
          }
          onSaveNote={(note) => void patchSlot(sheetSlot.id, { note })}
          onSwap={() => startSwap(sheetSlot)}
          onRemove={() => void removeSlot(sheetSlot)}
          onUnblock={() => {
            setSheetSlotId(null);
            void toggleBlocked({
              dateKey: sheetSlot.date_key,
              mealType: sheetSlot.meal_type,
            });
          }}
        />
      )}

      {/* Dish picker */}
      {picker && (
        <DishPicker
          target={picker}
          dishes={dishes}
          busy={busy}
          onClose={() => setPicker(null)}
          onPick={(dish) => void assignDish(dish, picker)}
          onCreate={(name) => void createAndAssign(name, picker)}
          onBlock={
            findSlot(picker.dateKey, picker.mealType)
              ? undefined
              : () => {
                  const target = picker;
                  setPicker(null);
                  void toggleBlocked(target);
                }
          }
        />
      )}

      {/* Swap mode bar */}
      {swapSource && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-3">
          <div className="flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-[#293d30] px-4 py-3 text-sm text-white shadow-lg">
            <span>Toca otra casilla para mover o intercambiar.</span>
            <button
              type="button"
              onClick={() => setSwapSource(null)}
              className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 font-medium hover:bg-white/25"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed inset-x-0 z-50 flex justify-center px-3 ${
            swapSource ? "bottom-24" : "bottom-4"
          }`}
        >
          <div
            className={`flex w-full max-w-md items-start gap-3 rounded-xl border p-3 text-sm shadow-lg ${
              toast.tone === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-stone-200 bg-white text-stone-700"
            }`}
          >
            <p className="flex-1">{toast.text}</p>
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
/* Summary chip                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

function SummaryChip({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "stone" | "red" | "blue";
}) {
  const styles = {
    green: "bg-[#e6f3e9] text-[#285d3b]",
    stone: "bg-stone-100 text-stone-600",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
  }[tone];

  return (
    <span className={`rounded-full px-3 py-1.5 font-medium ${styles}`}>
      {label}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Notes panel                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

function NotesPanel({
  notes,
  busy,
  onAdd,
  onToggle,
  onDelete,
}: {
  notes: MenuNote[];
  busy: boolean;
  onAdd: (text: string) => Promise<void>;
  onToggle: (note: MenuNote) => void;
  onDelete: (note: MenuNote) => void;
}) {
  const [draft, setDraft] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void onAdd(text);
  }

  return (
    <section
      aria-label="Notas de la semana"
      className="rounded-2xl border border-stone-200 bg-white p-3"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-stone-800">
          Notas de la semana
        </h2>
        {notes.length > 0 && (
          <span className="text-xs text-stone-400">
            {notes.filter((n) => !n.done).length} pendientes
          </span>
        )}
      </div>

      {notes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className={`flex items-center overflow-hidden rounded-full border text-sm ${
                note.done
                  ? "border-stone-200 bg-stone-50 text-stone-400"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(note)}
                aria-pressed={note.done}
                title={note.done ? "Marcar como pendiente" : "Marcar como hecha"}
                className={`py-1.5 pl-3 pr-2 text-left ${
                  note.done ? "line-through" : ""
                }`}
              >
                {note.text}
              </button>
              <button
                type="button"
                onClick={() => onDelete(note)}
                aria-label={`Borrar nota: ${note.text}`}
                className="px-2.5 py-1.5 text-base leading-none opacity-50 hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={140}
          placeholder="Ej: salsa de roquefort con las sobras"
          className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-[#293d30]"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-xl bg-[#293d30] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1f2f25] disabled:opacity-40"
        >
          Añadir
        </button>
      </form>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Slot card                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

function SlotCard({
  slot,
  label,
  selected,
  swapActive,
  disabled,
  onTap,
  onLongPress,
}: {
  slot?: Slot;
  label: string;
  selected: boolean;
  swapActive: boolean;
  disabled: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const blocked = isBlocked(slot);
  const hasDish = Boolean(slot?.dish_id) && !blocked;

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!hasDish || disabled || swapActive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    clear();
    fired.current = false;
    start.current = { x: event.clientX, y: event.clientY };

    timer.current = window.setTimeout(() => {
      fired.current = true;
      timer.current = null;
      navigator.vibrate?.(15);
      onLongPress();
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clear();
  }

  function onClick() {
    if (fired.current) {
      fired.current = false;
      return;
    }
    onTap();
  }

  const name = slot
    ? (slot.dishes?.name ?? (blocked ? "No disponible" : slot.special_label ?? "Opción especial"))
    : "Añadir plato";

  const surface = selected
    ? "border-blue-500 bg-white ring-2 ring-blue-100"
    : blocked
      ? "border-[#f4d4d0] bg-[#fbe9e7]"
      : slot?.needs_shopping
        ? "border-red-400 bg-[#e6f3e9]"
        : slot?.is_for_one
          ? "border-amber-300 bg-amber-50"
          : hasDish
            ? "border-[#d3e8d8] bg-[#e6f3e9]"
            : "border-dashed border-stone-300 bg-[#f5f4f1]";

  const nameColor = blocked
    ? "text-[#a34c43]"
    : slot?.is_for_one
      ? "text-amber-900"
      : hasDish
        ? "text-[#285d3b]"
        : "text-stone-400";

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(event) => event.preventDefault()}
      disabled={disabled}
      aria-label={`${label}: ${name}${slot?.note ? `. Nota: ${slot.note}` : ""}`}
      style={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
      className={`flex min-h-[96px] w-full min-w-0 select-none flex-col rounded-xl border p-2.5 text-left transition active:scale-[0.98] disabled:opacity-60 ${surface}`}
    >
      <span className="flex w-full items-center justify-between gap-1">
        <span className="text-xs font-medium text-stone-500">{label}</span>
        <span className="flex items-center gap-1 text-xs">
          {slot?.needs_defrost && hasDish && <span title="Descongelar">🧊</span>}
          {slot?.needs_shopping && hasDish && <span title="Comprar">🛒</span>}
          {slot?.is_for_one && hasDish && (
            <span title="Solo 1 persona" className="font-semibold text-amber-800">
              👤1
            </span>
          )}
        </span>
      </span>

      <span
        className={`mt-1.5 break-words text-sm font-medium leading-snug ${nameColor}`}
      >
        {name}
      </span>

      {slot?.note && hasDish && (
        <span className="mt-1.5 line-clamp-2 break-words text-xs italic text-stone-600">
          📝 {slot.note}
        </span>
      )}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Overlay (shared by sheet + picker)                                         */
/* ────────────────────────────────────────────────────────────────────────── */

function Overlay({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        {children}
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Slot action sheet                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

function SlotSheet({
  slot,
  busy,
  onClose,
  onChangeDish,
  onToggle,
  onSaveNote,
  onSwap,
  onRemove,
  onUnblock,
}: {
  slot: Slot;
  busy: boolean;
  onClose: () => void;
  onChangeDish: () => void;
  onToggle: (flag: "needs_defrost" | "needs_shopping" | "is_for_one") => void;
  onSaveNote: (note: string | null) => void;
  onSwap: () => void;
  onRemove: () => void;
  onUnblock: () => void;
}) {
  const blocked = isBlocked(slot);
  const [draft, setDraft] = useState(slot.note ?? "");

  const commit = () => {
    const next = draft.trim() || null;
    if (next !== (slot.note ?? null)) onSaveNote(next);
  };

  // Make sure a half-written note is never lost when the sheet closes.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);

  const mealLabel = slot.meal_type === "lunch" ? "Comida" : "Cena";
  const dateLabel = keyToDate(slot.date_key).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const toggles = [
    { flag: "needs_defrost", icon: "🧊", label: "Descongelar", on: slot.needs_defrost, active: "border-blue-500 bg-blue-50 text-blue-700" },
    { flag: "needs_shopping", icon: "🛒", label: "Comprar", on: slot.needs_shopping, active: "border-red-500 bg-red-50 text-red-700" },
    { flag: "is_for_one", icon: "👤", label: "Solo 1", on: slot.is_for_one, active: "border-amber-400 bg-amber-50 text-amber-800" },
  ] as const;

  return (
    <Overlay onClose={onClose} labelledBy="slot-sheet-title">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="slot-sheet-title"
            className="break-words text-lg font-semibold text-stone-900"
          >
            {blocked ? "No disponible" : slot.dishes?.name ?? "Opción especial"}
          </h2>
          <p className="mt-0.5 text-sm capitalize text-stone-500">
            {mealLabel}, {dateLabel}
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

      {blocked ? (
        <button
          type="button"
          onClick={onUnblock}
          disabled={busy}
          className="mt-5 w-full rounded-xl bg-[#293d30] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Hacer disponible
        </button>
      ) : (
        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
          <div>
            <label
              htmlFor="slot-note"
              className="text-sm font-medium text-stone-700"
            >
              Nota
            </label>
            <input
              id="slot-note"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                  (event.target as HTMLInputElement).blur();
                }
              }}
              maxLength={140}
              placeholder="Ej: salsa de roquefort con las sobras"
              className="mt-1.5 w-full rounded-xl border border-stone-200 px-3 py-3 text-sm outline-none focus:border-[#293d30]"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {toggles.map((t) => (
              <button
                key={t.flag}
                type="button"
                onClick={() => onToggle(t.flag)}
                aria-pressed={t.on}
                className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-medium transition ${
                  t.on
                    ? t.active
                    : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
                }`}
              >
                <span className="text-xl">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
            <button
              type="button"
              onClick={onChangeDish}
              className="w-full px-4 py-3 text-left text-sm text-stone-800 hover:bg-stone-50"
            >
              Cambiar plato
            </button>
            <button
              type="button"
              onClick={onSwap}
              className="w-full px-4 py-3 text-left text-sm text-stone-800 hover:bg-stone-50"
            >
              Mover o intercambiar con otra casilla
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Quitar plato
            </button>
          </div>
        </div>
      )}
    </Overlay>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Dish picker                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

function DishPicker({
  target,
  dishes,
  busy,
  onClose,
  onPick,
  onCreate,
  onBlock,
}: {
  target: Target;
  dishes: Dish[];
  busy: boolean;
  onClose: () => void;
  onPick: (dish: Dish) => void;
  onCreate: (name: string) => void;
  onBlock?: () => void;
}) {
  const [search, setSearch] = useState("");

  const query = normalizeSearch(search);
  const filtered = useMemo(
    () => dishes.filter((d) => normalizeSearch(d.name).includes(query)),
    [dishes, query]
  );
  const exactMatch = dishes.some((d) => normalizeSearch(d.name) === query);
  const canCreate = query.length > 0 && !exactMatch;

  return (
    <Overlay onClose={onClose} labelledBy="dish-picker-title">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div>
          <h2
            id="dish-picker-title"
            className="text-lg font-semibold text-stone-900"
          >
            Elegir plato
          </h2>
          <p className="mt-0.5 text-sm capitalize text-stone-500">
            {target.mealType === "lunch" ? "Comida" : "Cena"},{" "}
            {keyToDate(target.dateKey).toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
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

      <input
        autoFocus
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar o escribir un plato nuevo..."
        className="mt-4 w-full shrink-0 rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-[#293d30]"
      />

      <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
        {canCreate && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCreate(search)}
            className="w-full rounded-xl bg-[#e6f3e9] px-4 py-3 text-left text-sm font-medium text-[#285d3b] transition hover:bg-[#d8ecdd] disabled:opacity-50"
          >
            Crear «{search.trim()}»
          </button>
        )}

        {filtered.map((dish) => (
          <button
            key={dish.id}
            type="button"
            disabled={busy}
            onClick={() => onPick(dish)}
            className="w-full rounded-xl px-4 py-3 text-left text-sm text-stone-800 transition hover:bg-stone-100 disabled:opacity-50"
          >
            {dish.name}
          </button>
        ))}

        {filtered.length === 0 && !canCreate && (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            Todavía no hay platos. Escribe un nombre para crear el primero.
          </p>
        )}
      </div>

      {onBlock && (
        <button
          type="button"
          onClick={onBlock}
          disabled={busy}
          className="mt-3 w-full shrink-0 rounded-xl border border-stone-200 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
        >
          Marcar como no disponible
        </button>
      )}
    </Overlay>
  );
}

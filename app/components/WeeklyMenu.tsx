"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { supabase } from "@/lib/supabase/client";

const HOUSEHOLD_ID = "f6182e7d-ae8e-418c-b828-4ac925a51781";
const BLOCKED_LABEL = "NO_DISPONIBLE";
const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 10;

type MealType = "lunch" | "dinner";

type Slot = {
  id: string;
  day_of_week: number;
  meal_type: MealType;
  dish_id: string | null;
  special_label: string | null;
  is_for_one: boolean;
  dishes: { name: string } | null;
  date_key: string;
};

type WeeklyMenuRecord = {
  id: string;
  week_start: string;
};

type Dish = {
  id: string;
  name: string;
};

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

function getInitialRange() {
  const monday = getMonday(new Date());
  return {
    start: dateToKey(monday),
    end: dateToKey(addDays(monday, 6)),
  };
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export default function WeeklyMenu() {
  const [availableDishes, setAvailableDishes] = useState<Dish[]>([]);
  const [dishSearch, setDishSearch] = useState("");
  const [pickerTarget, setPickerTarget] = useState<{
    dateKey: string;
    mealType: MealType;
  } | null>(null);

  const initialRange = getInitialRange();

  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [appliedStart, setAppliedStart] = useState(initialRange.start);
  const [appliedEnd, setAppliedEnd] = useState(initialRange.end);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cancelLongPress();
  }, [cancelLongPress]);

  const getRangeDates = useCallback(() => {
    const dates: Date[] = [];
    const start = keyToDate(appliedStart);
    const end = keyToDate(appliedEnd);

    for (let date = start; date <= end; date = addDays(date, 1)) {
      dates.push(new Date(date));
    }

    return dates;
  }, [appliedStart, appliedEnd]);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setSelectedSlot(null);

    try {
      if (!appliedStart || !appliedEnd || appliedStart > appliedEnd) {
        setSlots([]);
        setMessage("Selecciona un intervalo de fechas válido.");
        return;
      }

      const dates: Date[] = [];
      const start = keyToDate(appliedStart);
      const end = keyToDate(appliedEnd);

      for (let date = start; date <= end; date = addDays(date, 1)) {
        dates.push(new Date(date));
      }

      const weekStarts = [
        ...new Set(dates.map((date) => dateToKey(getMonday(date)))),
      ];

      const { data: menus, error: menuError } = await supabase
        .from("weekly_menus")
        .select("id, week_start")
        .eq("household_id", HOUSEHOLD_ID)
        .in("week_start", weekStarts);

      if (menuError) throw menuError;

      const menuRecords = (menus ?? []) as WeeklyMenuRecord[];

      if (menuRecords.length === 0) {
        setSlots([]);
        return;
      }

      const { data: rowsWithMenu, error: relationError } = await supabase
        .from("meal_slots")
        .select(
          "id, menu_id, day_of_week, meal_type, dish_id, special_label, is_for_one, dishes(name)"
        )
        .in(
          "menu_id",
          menuRecords.map((menu) => menu.id)
        )
        .order("day_of_week");

      if (relationError) throw relationError;

      const weekByMenuId = new Map(
        menuRecords.map((menu) => [menu.id, menu.week_start])
      );

      const finalSlots: Slot[] = (rowsWithMenu ?? []).map((raw) => {
        const row = raw as unknown as Slot & { menu_id: string };
        const weekStart = weekByMenuId.get(row.menu_id);

        if (!weekStart) {
          throw new Error(`No se encontró la semana del menú ${row.menu_id}.`);
        }

        return {
          id: row.id,
          day_of_week: row.day_of_week,
          meal_type: row.meal_type,
          dish_id: row.dish_id,
          special_label: row.special_label,
          is_for_one: row.is_for_one ?? false,
          dishes: row.dishes,
          date_key: dateToKey(
            addDays(keyToDate(weekStart), row.day_of_week)
          ),
        };
      });

      setSlots(finalSlots);
    } catch (error) {
      setSlots([]);
      setMessage(
        error instanceof Error
          ? `Error al cargar el menú: ${error.message}`
          : "No se pudo cargar el menú."
      );
    } finally {
      setLoading(false);
    }
  }, [appliedStart, appliedEnd]);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    async function loadDishes() {
      const { data, error } = await supabase
        .from("dishes")
        .select("id, name")
        .order("name");

      if (error) {
        console.error("Error cargando platos:", error);
        setMessage(`No se pudieron cargar los platos: ${error.message}`);
        return;
      }

      setAvailableDishes((data ?? []) as Dish[]);
    }

    void loadDishes();
  }, []);

  function findSlot(dateKey: string, mealType: MealType) {
    return slots.find(
      (slot) => slot.date_key === dateKey && slot.meal_type === mealType
    );
  }

  function isBlocked(slot: Slot) {
    return slot.special_label === BLOCKED_LABEL;
  }

  function canSwap(slot?: Slot) {
    return Boolean(slot && slot.dish_id && !isBlocked(slot));
  }

  async function ensureMenuIdForDate(dateKey: string) {
    const weekStart = dateToKey(getMonday(keyToDate(dateKey)));

    const { data, error } = await supabase
      .from("weekly_menus")
      .upsert(
        {
          household_id: HOUSEHOLD_ID,
          week_start: weekStart,
        },
        { onConflict: "household_id,week_start" }
      )
      .select("id")
      .single();

    if (error) throw error;

    return data.id as string;
  }

  async function toggleBlocked(dateKey: string, mealType: MealType) {
    if (busy) return;

    const existing = findSlot(dateKey, mealType);
    setBusy(true);
    setMessage("");

    try {
      if (existing && isBlocked(existing)) {
        const { error } = await supabase
          .from("meal_slots")
          .delete()
          .eq("id", existing.id);

        if (error) throw error;

        setSlots((current) =>
          current.filter((slot) => slot.id !== existing.id)
        );
        return;
      }

      if (existing) {
        setMessage("Quita primero el plato para bloquear esta casilla.");
        return;
      }

      const menuId = await ensureMenuIdForDate(dateKey);
      const date = keyToDate(dateKey);

      const { data, error } = await supabase
        .from("meal_slots")
        .insert({
          menu_id: menuId,
          day_of_week: getWeekday(date),
          meal_type: mealType,
          dish_id: null,
          special_label: BLOCKED_LABEL,
          is_for_one: false,
        })
        .select(
          "id, day_of_week, meal_type, dish_id, special_label, is_for_one, dishes(name)"
        )
        .single();

      if (error) throw error;

      setSlots((current) => [
        ...current,
        {
          ...(data as unknown as Slot),
          is_for_one: false,
          date_key: dateKey,
        },
      ]);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `No se pudo cambiar la disponibilidad: ${error.message}`
          : "No se pudo cambiar la disponibilidad."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeSlot(slotId: string) {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("meal_slots")
        .delete()
        .eq("id", slotId);

      if (error) throw error;

      setSlots((current) => current.filter((slot) => slot.id !== slotId));

      if (selectedSlot === slotId) setSelectedSlot(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `No se pudo quitar el plato: ${error.message}`
          : "No se pudo quitar el plato."
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleForOne(slot: Slot) {
    if (busy || !slot.dish_id || isBlocked(slot)) return;

    const nextValue = !slot.is_for_one;
    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("meal_slots")
        .update({ is_for_one: nextValue })
        .eq("id", slot.id);

      if (error) throw error;

      setSlots((current) =>
        current.map((item) =>
          item.id === slot.id ? { ...item, is_for_one: nextValue } : item
        )
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `No se pudo cambiar el número de personas: ${error.message}`
          : "No se pudo cambiar el número de personas."
      );
    } finally {
      setBusy(false);
    }
  }

  async function selectForSwap(
    target: Slot | undefined,
    targetDate: string,
    targetMealType: MealType
  ) {
    if (busy || (target && isBlocked(target))) return;

    if (!selectedSlot) {
      if (!canSwap(target)) return;

      setSelectedSlot(target!.id);
      setMessage("");
      return;
    }

    if (target?.id === selectedSlot) {
      setSelectedSlot(null);
      return;
    }

    const source = slots.find((slot) => slot.id === selectedSlot);

    if (!source || !canSwap(source)) {
      setSelectedSlot(null);
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      if (!target || !target.dish_id) {
        const destinationMenuId = await ensureMenuIdForDate(targetDate);
        const destinationDate = keyToDate(targetDate);

        if (target) {
          const { error } = await supabase
            .from("meal_slots")
            .update({
              dish_id: source.dish_id,
              special_label: source.special_label,
              is_for_one: source.is_for_one,
            })
            .eq("id", target.id);

          if (error) throw error;
        } else {
          const { error } = await supabase.from("meal_slots").insert({
            menu_id: destinationMenuId,
            day_of_week: getWeekday(destinationDate),
            meal_type: targetMealType,
            dish_id: source.dish_id,
            special_label: source.special_label,
            is_for_one: source.is_for_one,
          });

          if (error) throw error;
        }

        const { error: deleteError } = await supabase
          .from("meal_slots")
          .delete()
          .eq("id", source.id);

        if (deleteError) {
          await loadMenu();
          throw deleteError;
        }

        await loadMenu();
        return;
      }

      const sourceValues = {
        dish_id: source.dish_id,
        special_label: source.special_label,
        is_for_one: source.is_for_one,
      };
      const targetValues = {
        dish_id: target.dish_id,
        special_label: target.special_label,
        is_for_one: target.is_for_one,
      };

      const { error: firstError } = await supabase
        .from("meal_slots")
        .update(targetValues)
        .eq("id", source.id);

      if (firstError) throw firstError;

      const { error: secondError } = await supabase
        .from("meal_slots")
        .update(sourceValues)
        .eq("id", target.id);

      if (secondError) {
        await supabase
          .from("meal_slots")
          .update(sourceValues)
          .eq("id", source.id);

        await loadMenu();
        throw secondError;
      }

      await loadMenu();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `No se pudo completar la operación: ${error.message}`
          : "No se pudo completar la operación."
      );
    } finally {
      setSelectedSlot(null);
      setBusy(false);
    }
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    slot?: Slot
  ) {
    if (busy || loading || !canSwap(slot)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    cancelLongPress();
    longPressTriggered.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY };

    longPressTimer.current = window.setTimeout(() => {
      if (!slot) return;

      longPressTriggered.current = true;
      setSelectedSlot(slot.id);
      setMessage("");
      longPressTimer.current = null;
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointerStart.current) return;

    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;

    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
      cancelLongPress();
    }
  }

  function handlePointerUp(
    slot: Slot | undefined,
    dateKey: string,
    mealType: MealType
  ) {
    cancelLongPress();
    pointerStart.current = null;

    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }

    if (selectedSlot) {
      void selectForSwap(slot, dateKey, mealType);
    }
  }

  function handlePointerCancel() {
    cancelLongPress();
    pointerStart.current = null;
    longPressTriggered.current = false;
  }

  async function assignDish(dish: Dish) {
    if (!pickerTarget || busy) return;

    const { dateKey, mealType } = pickerTarget;
    const existing = findSlot(dateKey, mealType);

    setBusy(true);
    setMessage("");

    try {
      if (existing) {
        const { error } = await supabase
          .from("meal_slots")
          .update({
            dish_id: dish.id,
            special_label: null,
            is_for_one: false,
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const menuId = await ensureMenuIdForDate(dateKey);

        const { error } = await supabase.from("meal_slots").insert({
          menu_id: menuId,
          day_of_week: getWeekday(keyToDate(dateKey)),
          meal_type: mealType,
          dish_id: dish.id,
          special_label: null,
          is_for_one: false,
        });

        if (error) throw error;
      }

      setPickerTarget(null);
      setDishSearch("");
      await loadMenu();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `No se pudo asignar el plato: ${error.message}`
          : "No se pudo asignar el plato."
      );
    } finally {
      setBusy(false);
    }
  }

  const dates = getRangeDates();

  const dateLabel =
    dates.length > 0
      ? `${keyToDate(appliedStart).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })} – ${keyToDate(appliedEnd).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`
      : "Selecciona un intervalo";

  const filteredDishes = availableDishes.filter((dish) =>
    normalizeSearch(dish.name).includes(normalizeSearch(dishSearch))
  );

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-5 bg-[#fafaf9] p-3 pb-8 text-[#292524] sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Nuestro menú
          </h1>
          <p className="mt-1 text-sm text-stone-500">{dateLabel}</p>
        </div>

        <button
          onClick={() => void loadMenu()}
          disabled={loading || busy}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium transition hover:bg-stone-50 disabled:opacity-50"
        >
          Actualizar
        </button>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <label className="flex min-w-[140px] flex-1 flex-col gap-1.5 text-xs font-medium text-stone-500">
          Desde
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-lg border border-stone-200 bg-white p-2.5 text-sm text-stone-800 outline-none focus:border-stone-400"
          />
        </label>

        <label className="flex min-w-[140px] flex-1 flex-col gap-1.5 text-xs font-medium text-stone-500">
          Hasta
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="rounded-lg border border-stone-200 bg-white p-2.5 text-sm text-stone-800 outline-none focus:border-stone-400"
          />
        </label>

        <button
          onClick={() => {
            if (!startDate || !endDate || startDate > endDate) {
              setMessage("Selecciona un intervalo de fechas válido.");
              return;
            }

            setAppliedStart(startDate);
            setAppliedEnd(endDate);
            setSelectedSlot(null);
            setMessage("");
          }}
          disabled={loading || busy}
          className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
        >
          Mostrar fechas
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-stone-600">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#e6f3e9]" />
          Para 2
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-amber-100" />
          👤 Para 1
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#f5f4f1]" />
          Vacío
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#fbe9e7]" />
          No disponible
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border-2 border-blue-500 bg-white" />
          Seleccionado
        </span>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">
          Cargando menú...
        </div>
      ) : dates.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">
          Selecciona un intervalo de fechas válido.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {dates.map((date) => {
            const dateKey = dateToKey(date);
            const dayName = date.toLocaleDateString("es-ES", {
              weekday: "long",
            });
            const formattedDate = date.toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
            });
            const daySlots = slots.filter(
              (slot) => slot.date_key === dateKey
            );
            const filledCount = daySlots.filter(
              (slot) => Boolean(slot.dish_id) && !isBlocked(slot)
            ).length;

            return (
              <section
                key={dateKey}
                className="min-w-0 space-y-2 rounded-2xl border border-stone-200 bg-white p-2.5"
              >
                <header className="flex min-h-[54px] items-center justify-between gap-1 border-b border-stone-100 px-1 pb-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold capitalize text-stone-800">
                      {dayName}
                    </h2>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {formattedDate}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-stone-100 px-1.5 py-1 text-[10px] font-medium text-stone-500">
                    {filledCount}/2
                  </span>
                </header>

                {(
                  [
                    { label: "Comida", type: "lunch" },
                    { label: "Cena", type: "dinner" },
                  ] as const
                ).map(({ label, type }) => {
                  const slot = findSlot(dateKey, type);
                  const blocked = slot ? isBlocked(slot) : false;
                  const selected = slot?.id === selectedSlot;

                  const dishName = slot
                    ? slot.dishes?.name ??
                      (blocked
                        ? "No disponible"
                        : slot.special_label ?? "Opción especial")
                    : "Sin asignar";

                  const slotStyle = selected
                    ? "border-blue-500 bg-white ring-2 ring-blue-100"
                    : blocked
                      ? "border-[#f4d4d0] bg-[#fbe9e7]"
                      : slot?.is_for_one
                        ? "border-amber-300 bg-amber-50"
                        : slot
                          ? "border-[#d3e8d8] bg-[#e6f3e9]"
                          : "border-stone-200 bg-[#f5f4f1]";

                  return (
                    <div
                      key={type}
                      onPointerDown={(event) =>
                        handlePointerDown(event, slot)
                      }
                      onPointerMove={handlePointerMove}
                      onPointerUp={() =>
                        handlePointerUp(slot, dateKey, type)
                      }
                      onPointerCancel={handlePointerCancel}
                      className={`relative flex min-h-[142px] min-w-0 flex-col rounded-xl border p-3 pt-9 transition-colors ${slotStyle} ${
                        slot && !blocked ? "cursor-pointer" : ""
                      }`}
                      style={{ touchAction: "pan-y" }}
                    >
                      {slot?.dish_id && !blocked && (
                        <button
                          type="button"
                          aria-label="Borrar plato"
                          title="Borrar plato"
                          onPointerDown={(event) => event.stopPropagation()}
                          onPointerUp={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeSlot(slot.id);
                          }}
                          disabled={busy}
                          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-stone-400 transition hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
                        >
                          ×
                        </button>
                      )}

                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-medium text-stone-500">
                          {label}
                        </span>
                        {selected && (
                          <span className="text-[10px] font-semibold text-blue-600">
                            Elegido
                          </span>
                        )}
                      </div>

                      <p
                        className={`mt-3 flex-1 break-words text-sm font-medium leading-snug ${
                          blocked
                            ? "text-[#a34c43]"
                            : slot?.is_for_one
                              ? "text-amber-900"
                              : slot
                                ? "text-[#285d3b]"
                                : "text-stone-400"
                        }`}
                      >
                        {dishName}
                      </p>

                      {slot?.is_for_one && (
                        <span className="mt-1 text-xs font-semibold text-amber-800">
                          👤 Solo 1 persona
                        </span>
                      )}

                      <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDishSearch("");
                          setPickerTarget({
                            dateKey,
                            mealType: type,
                          });
                        }}
                        disabled={busy}
                        className="mt-3 w-full rounded-lg bg-white px-2 py-2.5 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-50"
                      >
                        {slot?.dish_id ? "Cambiar plato" : "Elegir plato"}
                      </button>

                      {slot?.dish_id && !blocked && (
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onPointerUp={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            void toggleForOne(slot);
                          }}
                          disabled={busy}
                          aria-pressed={slot.is_for_one}
                          className={`mt-2 w-full rounded-lg px-2 py-2.5 text-xs font-semibold transition disabled:opacity-50 ${
                            slot.is_for_one
                              ? "bg-amber-200 text-amber-900 hover:bg-amber-300"
                              : "bg-white/80 text-stone-600 hover:bg-white"
                          }`}
                        >
                          {slot.is_for_one ? "👤 For 1 · ↻ For 2" : "👥 For 1"}
                        </button>
                      )}

                      <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleBlocked(dateKey, type);
                        }}
                        disabled={busy || (!!slot && !blocked)}
                        className={`mt-2 w-full rounded-lg px-2 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          blocked
                            ? "bg-white/80 text-[#a34c43] hover:bg-white"
                            : "text-stone-500 hover:bg-white/80 hover:text-stone-800"
                        }`}
                        title={
                          slot && !blocked
                            ? "Quita primero el plato"
                            : undefined
                        }
                      >
                        {blocked ? "Hacer disponible" : "No disponible"}
                      </button>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {pickerTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => {
            if (!busy) setPickerTarget(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dish-picker-title"
            className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2
                  id="dish-picker-title"
                  className="text-lg font-semibold text-stone-900"
                >
                  Elegir plato
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {keyToDate(pickerTarget.dateKey).toLocaleDateString(
                    "es-ES",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    }
                  )}
                  {" · "}
                  {pickerTarget.mealType === "lunch" ? "Comida" : "Cena"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!busy) setPickerTarget(null);
                }}
                disabled={busy}
                className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-50"
              >
                Cerrar
              </button>
            </div>

            <input
              autoFocus
              type="search"
              value={dishSearch}
              onChange={(event) => setDishSearch(event.target.value)}
              placeholder="Buscar plato... ej. mac"
              className="mt-4 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-stone-500"
            />

            <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
              {filteredDishes.map((dish) => (
                <button
                  key={dish.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void assignDish(dish)}
                  className="w-full rounded-xl px-4 py-3 text-left text-sm text-stone-800 transition hover:bg-stone-100 disabled:opacity-50"
                >
                  {dish.name}
                </button>
              ))}

              {filteredDishes.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-stone-500">
                  No hay platos que coincidan con la búsqueda.
                </p>
              )}

              {busy && (
                <p className="py-2 text-center text-sm text-stone-500">
                  Guardando...
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {message && (
        <p
          role="status"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {message}
        </p>
      )}
    </main>
  );
}

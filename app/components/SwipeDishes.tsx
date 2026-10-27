
"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { supabase } from "@/lib/supabase/client";

type Dish = {
  id: string;
  name: string;
  image_url: string | null;
  meal_types: string[];
  category: string;
  is_special: boolean;
};

const HOUSEHOLD_ID = "f6182e7d-ae8e-418c-b828-4ac925a51781";
const SWIPE_THRESHOLD = 110;
const EXIT_DISTANCE = 700;

function getMonday(date: Date): Date {
  const monday = new Date(date);
  const dayIndex = (monday.getDay() + 6) % 7;

  monday.setDate(monday.getDate() - dayIndex);
  monday.setHours(12, 0, 0, 0);

  return monday;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

function shuffleDishes<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

export default function SwipeDishes() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);

  const [weekStart, setWeekStart] = useState<Date>(() =>
    getMonday(new Date())
  );

  const startX = useRef(0);
  const currentX = useRef(0);
  const pointerId = useRef<number | null>(null);
  const busyRef = useRef(false);
  const exitTimer = useRef<number | null>(null);

  const weekEnd = addDays(weekStart, 6);
  const weekStartString = formatDate(weekStart);

  useEffect(() => {
    let active = true;

    async function loadDishes() {
        const { data, error } = await supabase
        .from("dishes")
        .select("id, name, image_url, meal_types, category, is_special")
        .eq("household_id", HOUSEHOLD_ID);

      if (!active) return;

    if (error) {
    setError(error.message);
    } else {
    setDishes(shuffleDishes(data ?? []));
    }

      setLoading(false);
    }

    void loadDishes();

    return () => {
      active = false;

      if (exitTimer.current !== null) {
        window.clearTimeout(exitTimer.current);
      }
    };
  }, []);

  function changeWeek(offset: number) {
    setWeekStart((current) => addDays(current, offset * 7));
    setMessage("");
  }

  function nextDish() {
    setIndex((current) => (current + 1) % dishes.length);
    setDragX(0);
    setDragging(false);
    setExiting(false);
    currentX.current = 0;
    pointerId.current = null;
  }

  function finishExit() {
    if (exitTimer.current !== null) {
      window.clearTimeout(exitTimer.current);
    }

    exitTimer.current = window.setTimeout(() => {
      nextDish();
      exitTimer.current = null;
    }, 240);
  }

  function skipDish() {
    if (dishes.length === 0 || busyRef.current || exiting) return;

    setMessage("");
    setExiting(true);
    setDragX(-EXIT_DISTANCE);
    finishExit();
  }

  async function addDish() {
    const dish = dishes[index];

    if (!dish || busyRef.current || exiting) return;

    busyRef.current = true;
    setMessage("");
    setSaving(true);

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        setMessage("Inicia sesión para añadir platos al menú.");
        return;
      }

      // La semana de destino es la seleccionada en pantalla.
      const { data: menu, error: menuError } = await supabase
        .from("weekly_menus")
        .upsert(
          {
            household_id: HOUSEHOLD_ID,
            week_start: weekStartString,
          },
          { onConflict: "household_id,week_start" }
        )
        .select("id")
        .single();

      if (menuError) throw menuError;

      const { data: existingSlots, error: slotsError } = await supabase
        .from("meal_slots")
        .select("day_of_week, meal_type")
        .eq("menu_id", menu.id);

      if (slotsError) throw slotsError;

      const occupied = new Set(
        (existingSlots ?? []).map(
          (slot) => `${slot.day_of_week}-${slot.meal_type}`
        )
      );

      const mealTypes = dish.meal_types.filter(
        (type) => type === "lunch" || type === "dinner"
      );

      if (mealTypes.length === 0) {
        setMessage("Este plato no tiene Comida ni Cena como tipo de comida.");
        return;
      }

      // Si es la semana actual, empieza por hoy.
      // Para semanas futuras o pasadas, empieza por el lunes.
      const today = new Date();
      const currentMonday = getMonday(today);
      const selectedMonday = weekStart;

      const isCurrentWeek =
        formatDate(currentMonday) === formatDate(selectedMonday);

      const startDay = isCurrentWeek
        ? (today.getDay() + 6) % 7
        : 0;

      let target: { day: number; mealType: string } | null = null;

      for (let offset = 0; offset < 7 && !target; offset++) {
        const day = (startDay + offset) % 7;

        for (const mealType of mealTypes) {
          if (!occupied.has(`${day}-${mealType}`)) {
            target = { day, mealType };
            break;
          }
        }
      }

      if (!target) {
        setMessage("No quedan casillas compatibles libres en esta semana.");
        return;
      }

      const { error: insertError } = await supabase
        .from("meal_slots")
        .insert({
          menu_id: menu.id,
          day_of_week: target.day,
          meal_type: target.mealType,
          dish_id: dish.id,
          special_label: null,
        });

      if (insertError) throw insertError;

      const dayName = addDays(weekStart, target.day).toLocaleDateString(
        "es-ES",
        { weekday: "long", day: "numeric", month: "short" }
      );

      const mealName =
        target.mealType === "lunch" ? "Comida" : "Cena";

      setMessage(`${dish.name} añadido a ${mealName} del ${dayName}.`);
      setExiting(true);
      setDragX(EXIT_DISTANCE);
      finishExit();
    } catch (error) {
      console.error("Error al añadir el plato:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "No se ha podido añadir el plato."
      );
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (busyRef.current || exiting || loading) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    pointerId.current = event.pointerId;
    startX.current = event.clientX;
    currentX.current = 0;

    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!dragging || pointerId.current !== event.pointerId) return;

    const delta = event.clientX - startX.current;

    currentX.current = delta;
    setDragX(delta);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (!dragging || pointerId.current !== event.pointerId) return;

    const delta = currentX.current;

    pointerId.current = null;
    setDragging(false);

    if (delta >= SWIPE_THRESHOLD) {
      void addDish();
    } else if (delta <= -SWIPE_THRESHOLD) {
      skipDish();
    } else {
      currentX.current = 0;
      setDragX(0);
    }
  }

  function handlePointerCancel() {
    pointerId.current = null;
    currentX.current = 0;
    setDragging(false);
    setDragX(0);
  }

  if (loading) {
    return <main className="p-6">Cargando platos...</main>;
  }

  if (error) {
    return (
      <main className="p-6">
        Error al cargar los platos: {error}
      </main>
    );
  }

  if (dishes.length === 0) {
    return (
      <main className="p-6">
        Todavía no hay platos disponibles.
      </main>
    );
  }

  const dish = dishes[index];
  const rotation = dragX * 0.045;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col gap-3 overflow-hidden px-3 py-3 sm:px-4">
      <header className="flex shrink-0 items-center justify-center border-b border-gray-100 pb-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-rose-500">
          Swippy Meal
        </h1>
      </header>

      {/* Selector de semana */}
      <section className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3">
        <button
          type="button"
          onClick={() => changeWeek(-1)}
          aria-label="Semana anterior"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-700 active:scale-95"
        >
          ‹
        </button>

        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold text-gray-800">
            Semana seleccionada
          </p>
          <p className="text-sm text-gray-500">
            {formatDisplayDate(weekStart)} – {formatDisplayDate(weekEnd)}
          </p>
          <button
            type="button"
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="mt-1 text-xs font-medium text-rose-500 underline"
          >
            Volver a esta semana
          </button>
        </div>

        <button
          type="button"
          onClick={() => changeWeek(1)}
          aria-label="Semana siguiente"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-700 active:scale-95"
        >
          ›
        </button>
      </section>

      <p className="text-center text-xs text-gray-500">
        Desliza la tarjeta a la derecha para añadir el plato o a la izquierda para descartarlo.
        La semana seleccionada determina dónde se guarda.
      </p>

      {/* Tarjeta del plato */}
      <div className="relative min-h-[420px] flex-1 pb-2">
        <section
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className="relative z-10 flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md"
          style={{
            transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
            transition: dragging
              ? "none"
              : "transform 240ms ease, opacity 240ms ease",
            opacity: exiting ? 0 : 1,
            touchAction: "pan-y",
            userSelect: "none",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-5 z-20 rotate-[15deg] rounded-lg border-[3px] border-rose-500 px-3 py-1 text-2xl font-black tracking-wide text-rose-500 sm:right-6 sm:top-7 sm:text-3xl"
            style={{
              opacity: Math.min(Math.max(-dragX / SWIPE_THRESHOLD, 0), 1),
            }}
          >
            NOPE
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-5 z-20 rotate-[-15deg] rounded-lg border-[3px] border-green-500 px-3 py-1 text-2xl font-black tracking-wide text-green-500 sm:left-6 sm:top-7 sm:text-3xl"
            style={{
              opacity: Math.min(Math.max(dragX / SWIPE_THRESHOLD, 0), 1),
            }}
          >
            LIKE
          </div>

          {dish.image_url ? (
            <img
              src={dish.image_url}
              alt={dish.name}
              draggable={false}
              className="pointer-events-none min-h-0 w-full flex-1 object-cover"
            />
          ) : (
            <div className="pointer-events-none flex min-h-[280px] flex-1 items-center justify-center bg-orange-50 text-7xl">
              {dish.is_special ? "🍕" : "🍽️"}
            </div>
          )}

          <div className="relative z-10 shrink-0 space-y-2 border-t border-gray-100 bg-white px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="break-words text-2xl font-bold leading-tight text-gray-800">
                {dish.name}
              </h2>

              {dish.is_special && (
                <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1 text-sm text-orange-800">
                  Especial
                </span>
              )}
            </div>

            <p className="text-sm text-gray-500">
              {dish.category} · {dish.meal_types.join(" / ")}
            </p>
          </div>
        </section>
      </div>

      

      {message && (
        <p role="status" className="shrink-0 text-center text-sm text-gray-600">
          {message}
        </p>
      )}

      {saving && (
        <p className="shrink-0 text-center text-xs text-gray-500">
          Guardando en la semana del {formatDisplayDate(weekStart)}…
        </p>
      )}
    </div>
  );
}

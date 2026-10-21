
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Dish = {
  id: string;
  name: string;
  meal_types: string[];
  category: string;
  is_special: boolean;
};

const HOUSEHOLD_ID = "f6182e7d-ae8e-418c-b828-4ac925a51781";

export default function DishList() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDishes() {
      const { data, error } = await supabase
        .from("dishes")
        .select("id, name, meal_types, category, is_special")
        .eq("household_id", HOUSEHOLD_ID)
        .order("name");

      if (error) {
        setError(error.message);
      } else {
        setDishes(data ?? []);
      }

      setLoading(false);
    }

    loadDishes();
  }, []);

  if (loading) {
    return <p>Cargando platos...</p>;
  }

  if (error) {
    return <p role="alert">Error al cargar los platos: {error}</p>;
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Tinder Meal</h1>
      <h2 className="text-lg font-semibold">
        Nuestros platos ({dishes.length})
      </h2>

      {dishes.length === 0 ? (
        <p>No hay platos guardados todavía.</p>
      ) : (
        <ul className="space-y-3">
          {dishes.map((dish) => (
            <li key={dish.id} className="rounded-lg border p-4">
              <p className="font-semibold">
                {dish.name}
                {dish.is_special && " ★"}
              </p>
              <p className="text-sm text-gray-600">
                Categoría: {dish.category}
              </p>
              <p className="text-sm text-gray-600">
                Comidas: {dish.meal_types.join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

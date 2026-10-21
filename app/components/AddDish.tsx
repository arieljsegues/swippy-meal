
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const HOUSEHOLD_ID = "f6182e7d-ae8e-418c-b828-4ac925a51781";
const BUCKET = "dish-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const CATEGORIES = [
  { value: "meat", label: "Carne" },
  { value: "fish", label: "Pescado" },
  { value: "legumes", label: "Legumbres" },
  { value: "eggs", label: "Huevos" },
  { value: "vegetables", label: "Verduras" },
  { value: "pasta_rice", label: "Pasta y arroz" },
  { value: "other", label: "Otros" },
];

type Dish = {
  id: string;
  name: string;
  category: string;
  meal_types: string[];
  image_url: string | null;
  is_special: boolean;
};

const EMPTY_MEAL_TYPES = ["lunch"];

function getExtension(file: File) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };

  return extensions[file.type] ?? null;
}

export default function AddDish() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [mealTypes, setMealTypes] = useState<string[]>(EMPTY_MEAL_TYPES);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isSpecial, setIsSpecial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingDishes, setLoadingDishes] = useState(true);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = selectedId !== "";

  const loadDishes = useCallback(async () => {
    setLoadingDishes(true);

    const { data, error } = await supabase
      .from("dishes")
      .select("id, name, category, meal_types, image_url, is_special")
      .eq("household_id", HOUSEHOLD_ID)
      .order("name");

    if (error) {
      setMessage(`No se pudieron cargar los platos: ${error.message}`);
    } else {
      setDishes((data ?? []) as Dish[]);
    }

    setLoadingDishes(false);
  }, []);

  useEffect(() => {
    void loadDishes();
  }, [loadDishes]);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  function resetForm() {
    setSelectedId("");
    setName("");
    setCategory("other");
    setMealTypes([...EMPTY_MEAL_TYPES]);
    setImageUrl("");
    setImageFile(null);
    setIsSpecial(false);
    setMessage("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function selectDish(id: string) {
    setSelectedId(id);
    setImageFile(null);
    setMessage("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (!id) {
      setName("");
      setCategory("other");
      setMealTypes([...EMPTY_MEAL_TYPES]);
      setImageUrl("");
      setIsSpecial(false);
      return;
    }

    const dish = dishes.find((item) => item.id === id);
    if (!dish) return;

    setName(dish.name);
    setCategory(dish.category);
    setMealTypes([...dish.meal_types]);
    setImageUrl(dish.image_url ?? "");
    setIsSpecial(dish.is_special);
  }

  function handleImageChange(file: File | undefined) {
    setMessage("");

    if (!file) {
      setImageFile(null);
      return;
    }

    if (!getExtension(file)) {
      setMessage("Formato no compatible. Usa JPG, PNG, WebP, GIF o AVIF.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setMessage("La imagen supera los 5 MB. Elige una imagen más pequeña.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImageFile(file);
  }

  function toggleMealType(type: string) {
    setMealTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type]
    );
  }

  

async function deleteDish() {
  if (!selectedId) return;

  const dish = dishes.find((item) => item.id === selectedId);
  if (!dish) return;

  const confirmed = window.confirm(
    `¿Eliminar definitivamente "${dish.name}" y su imagen de Supabase? Esta acción no se puede deshacer.`
  );

  if (!confirmed) return;

  setSaving(true);
  setMessage("");

  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      setMessage("Inicia sesión antes de eliminar platos.");
      return;
    }

    // Comprobar si el plato está asignado a algún menú.
    const { data: slots, error: slotsError } = await supabase
      .from("meal_slots")
      .select("id")
      .eq("dish_id", selectedId)
      .limit(1);

    if (slotsError) {
      setMessage(
        `No se pudo comprobar si el plato está en el menú: ${slotsError.message}`
      );
      return;
    }

    if (slots && slots.length > 0) {
      setMessage(
        "No se puede eliminar porque el plato está asignado a un menú. Quítalo primero del menú semanal."
      );
      return;
    }

    // Guardar la ruta de la imagen antes de eliminar el registro.
    let imagePath: string | null = null;

    if (dish.image_url) {
      try {
        const imageUrl = new URL(dish.image_url);
        const marker = `/storage/v1/object/public/${BUCKET}/`;

        const markerIndex = imageUrl.pathname.indexOf(marker);

        // Solo eliminar archivos que pertenezcan a nuestro bucket.
        if (markerIndex !== -1) {
          imagePath = decodeURIComponent(
            imageUrl.pathname.slice(markerIndex + marker.length)
          );
        }
      } catch {
        // Una URL externa no corresponde a un archivo de nuestro bucket.
      }
    }

    // Eliminar el plato primero.
    const { data: deletedRows, error: deleteError } = await supabase
      .from("dishes")
      .delete()
      .eq("id", selectedId)
      .eq("household_id", HOUSEHOLD_ID)
      .select("id");

    if (deleteError) {
      setMessage(`No se pudo eliminar el plato: ${deleteError.message}`);
      return;
    }

    if (!deletedRows || deletedRows.length === 0) {
      setMessage(
        "No se eliminó ningún plato. Comprueba los permisos de Supabase."
      );
      return;
    }

    // Si tenía una imagen en nuestro bucket, eliminar también el archivo.
    if (imagePath) {
      const { error: imageError } = await supabase.storage
        .from(BUCKET)
        .remove([imagePath]);

      if (imageError) {
        resetForm();
        await loadDishes();
        setMessage(
          `El plato se eliminó, pero no se pudo borrar su imagen: ${imageError.message}. Puedes eliminarla manualmente desde Storage.`
        );
        return;
      }
    }

    resetForm();
    await loadDishes();
    setMessage("Plato e imagen eliminados correctamente.");
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Error inesperado.";
    setMessage(`Error al eliminar: ${detail}`);
  } finally {
    setSaving(false);
  }
}



  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!name.trim()) {
      setMessage("Escribe el nombre del plato.");
      return;
    }

    if (mealTypes.length === 0) {
      setMessage("Selecciona comida, cena o ambas.");
      return;
    }

    setSaving(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        setMessage("Inicia sesión antes de guardar platos.");
        return;
      }

      let finalImageUrl = imageUrl.trim() || null;

      if (imageFile) {
        const extension = getExtension(imageFile);

        if (!extension) {
          setMessage("El formato de imagen no es compatible.");
          return;
        }

        const filePath = `${HOUSEHOLD_ID}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, imageFile, {
            cacheControl: "3600",
            contentType: imageFile.type,
            upsert: false,
          });

        if (uploadError) {
          setMessage(`No se pudo subir la imagen: ${uploadError.message}`);
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(filePath);

        finalImageUrl = publicUrlData.publicUrl;
      }

      const values = {
        name: name.trim(),
        category,
        meal_types: mealTypes,
        image_url: finalImageUrl,
        is_special: isSpecial,
      };

      const result = isEditing
        ? await supabase
            .from("dishes")
            .update(values)
            .eq("id", selectedId)
            .eq("household_id", HOUSEHOLD_ID)
            .select("id")
        : await supabase
            .from("dishes")
            .insert({
              ...values,
              household_id: HOUSEHOLD_ID,
            })
            .select("id");

      if (result.error) {
        setMessage(
          `No se pudo ${isEditing ? "actualizar" : "guardar"} el plato: ${result.error.message}`
        );
        return;
      }

      if (!result.data || result.data.length === 0) {
        setMessage(
          "No se modificó ningún plato. Comprueba los permisos de Supabase."
        );
        return;
      }

      const wasEditing = isEditing;

      await loadDishes();
      resetForm();

      setMessage(
        wasEditing
          ? "Plato actualizado correctamente."
          : "Plato añadido correctamente."
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Error inesperado.";
      setMessage(`No se pudo guardar el plato: ${detail}`);
    } finally {
      setSaving(false);
    }
  }

  
return (
  <main className="mx-auto min-h-screen max-w-2xl space-y-5 bg-[#fafaf9] p-3 pb-10 text-stone-800 sm:p-6">
    {/* Cabecera */}
    <header>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Gestionar platos
      </h1>
      <p className="mt-1 text-sm text-stone-500">
        Tu colección de platos, organizada en un solo lugar.
      </p>
    </header>

    {/* Selector de plato */}
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">Tus platos</h2>
        <p className="mt-1 text-sm text-stone-500">
          Selecciona uno para editarlo o crea uno nuevo.
        </p>
      </div>

      <label
        htmlFor="existing-dish"
        className="block text-xs font-medium text-stone-500"
      >
        Plato existente
      </label>

      <select
        id="existing-dish"
        value={selectedId}
        onChange={(event) => selectDish(event.target.value)}
        disabled={loadingDishes || saving}
        className="w-full rounded-xl border border-stone-200 bg-[#fafaf9] p-3 text-sm outline-none transition focus:border-stone-400 disabled:opacity-50"
      >
        <option value="">
          {loadingDishes ? "Cargando platos..." : "+ Crear un plato nuevo"}
        </option>

        {dishes.map((dish) => (
          <option key={dish.id} value={dish.id}>
            {dish.name}
          </option>
        ))}
      </select>

      {!loadingDishes && (
        <p className="text-xs text-stone-400">
          {dishes.length} {dishes.length === 1 ? "plato guardado" : "platos guardados"}
        </p>
      )}
    </section>

    {/* Formulario */}
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-stone-200 bg-white p-4 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-4">
        <div>
          <h2 className="text-lg font-semibold">
            {isEditing ? "Editar plato" : "Nuevo plato"}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {isEditing
              ? "Modifica los datos que necesites."
              : "Añade un plato a vuestra colección."}
          </p>
        </div>

        {isEditing && (
          <span className="shrink-0 rounded-lg bg-[#e6f3e9] px-2.5 py-1.5 text-xs font-medium text-[#285d3b]">
            Editando
          </span>
        )}
      </div>

      {/* Nombre */}
      <div className="space-y-2">
        <label
          htmlFor="dish-name"
          className="block text-sm font-medium"
        >
          Nombre del plato
        </label>
        <input
          id="dish-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ej. Tortilla de patatas"
          maxLength={100}
          required
          className="w-full rounded-xl border border-stone-200 bg-white p-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-100"
        />
      </div>

      {/* Categoría */}
      <div className="space-y-2">
        <label
          htmlFor="dish-category"
          className="block text-sm font-medium"
        >
          Categoría
        </label>
        <select
          id="dish-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="w-full rounded-xl border border-stone-200 bg-white p-3 text-sm outline-none transition focus:border-stone-400"
        >
          {CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {/* Comida y cena */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">
          ¿Cuándo se puede comer?
        </legend>

        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "lunch", label: "Comida" },
            { value: "dinner", label: "Cena" },
          ].map((item) => {
            const checked = mealTypes.includes(item.value);

            return (
              <label
                key={item.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                  checked
                    ? "border-[#cfe3d4] bg-[#e6f3e9]"
                    : "border-stone-200 bg-white hover:bg-stone-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleMealType(item.value)}
                  className="h-4 w-4 accent-[#477b55]"
                />
                <span className="text-sm font-medium">
                  {item.label}
                </span>
              </label>
            );
          })}
        </div>

        <p className="text-xs text-stone-400">
          Puedes seleccionar una o ambas opciones.
        </p>
      </fieldset>

      {/* Imagen */}
      <section className="space-y-4 border-t border-stone-100 pt-5">
        <div>
          <h3 className="text-sm font-semibold">Imagen del plato</h3>
          <p className="mt-1 text-xs text-stone-500">
            Opcional. Añade una foto para identificarlo visualmente.
          </p>
        </div>

        {(previewUrl || imageUrl) ? (
          <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-[#f5f4f1]">
            <img
              src={previewUrl || imageUrl}
              alt="Vista previa del plato"
              className="h-52 w-full object-cover"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />

            {imageFile && (
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                className="absolute right-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-white"
              >
                Quitar nueva foto
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-[#fafaf9] px-4 py-7 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-500">
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium">
              Sin imagen
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Sube una foto o utiliza una URL.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label
            htmlFor="dish-file"
            className="block text-sm font-medium"
          >
            Subir imagen
          </label>
          <input
            ref={fileInputRef}
            id="dish-file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            onChange={(event) =>
              handleImageChange(event.target.files?.[0])
            }
            className="block w-full rounded-xl border border-stone-200 bg-white p-2.5 text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-stone-700 hover:file:bg-stone-200"
          />
          <p className="text-xs text-stone-400">
            JPG, PNG, WebP, GIF o AVIF. Máximo 5 MB.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="dish-image-url"
            className="block text-sm font-medium"
          >
            URL de imagen
          </label>
          <input
            id="dish-image-url"
            type="url"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://..."
            className="w-full rounded-xl border border-stone-200 bg-white p-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-stone-400"
          />
          <p className="text-xs text-stone-400">
            Si subes una foto nueva, se utilizará esa imagen al guardar.
          </p>
        </div>
      </section>

      {/* Plato especial */}
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
          isSpecial
            ? "border-[#cfe3d4] bg-[#e6f3e9]"
            : "border-stone-200 bg-white hover:bg-stone-50"
        }`}
      >
        <input
          type="checkbox"
          checked={isSpecial}
          onChange={(event) => setIsSpecial(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#477b55]"
        />
        <span>
          <span className="block text-sm font-medium">
            Plato especial
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-stone-500">
            Para platos como pizza, sushi u otras opciones ocasionales.
          </span>
        </span>
      </label>

      {/* Mensajes */}
      {message && (
        <p
          role="status"
          className={`break-words rounded-xl border p-3 text-sm ${
            message.includes("correctamente")
              ? "border-[#d3e8d8] bg-[#e6f3e9] text-[#285d3b]"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message}
        </p>
      )}

      {/* Acciones */}
      <div className="space-y-3 border-t border-stone-100 pt-5">
        <button
          type="submit"
          disabled={saving || loadingDishes}
          className="w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? "Guardando..."
            : isEditing
              ? "Guardar cambios"
              : "Crear plato"}
        </button>

        {isEditing && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={() => void deleteDish()}
              disabled={saving}
              className="flex-1 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              Eliminar plato
            </button>
          </div>
        )}
      </div>
    </form>
  </main>
);

}

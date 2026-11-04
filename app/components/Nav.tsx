"use client";

import { Utensils, Settings, Flame } from "lucide-react";

export type Section = "swipe" | "menu" | "add";

interface NavProps {
  section: Section;
  setSection: (section: Section) => void;
}

const items = [
  {
    id: "menu" as Section,
    label: "Menú",
    icon: Utensils,
    activeClass: "bg-emerald-100 text-emerald-700",
    indicatorClass: "bg-emerald-500",
  },
  {
    id: "swipe" as Section,
    label: "Swippy",
    icon: Flame,
    activeClass: "bg-red-100 text-red-700",
    indicatorClass: "bg-red-500",
  },
  {
    id: "add" as Section,
    label: "Ajustes",
    icon: Settings,
    activeClass: "bg-blue-100 text-blue-700",
    indicatorClass: "bg-blue-500",
  },
];

export default function Nav({ section, setSection }: NavProps) {
  return (
    <nav className="shrink-0 border-t border-black/[0.06] bg-white/85 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-around gap-3">
        {items.map((item) => {
          const active = section === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => setSection(item.id)}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 transition-all duration-200 active:scale-95 ${
                active
                  ? `${item.activeClass} shadow-sm`
                  : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              }`}
            >
              <Icon
                size={21}
                strokeWidth={active ? 2.5 : 2}
                className="transition-transform duration-200"
              />

              <span className={`text-xs font-semibold tracking-wide ${
                active ? "" : "font-medium"
              }`}>
                {item.label}
              </span>

              {active && (
                <span
                  className={`absolute -bottom-1 h-1 w-5 rounded-full ${item.indicatorClass}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
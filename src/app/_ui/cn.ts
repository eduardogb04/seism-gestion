import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta clases de Tailwind resolviendo choques (la última gana). */
export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases));
}

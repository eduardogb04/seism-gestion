/**
 * `Origen` (F0-22, DISENO): *"todo registro guarda su origen: persona,
 * ingesta de mail o propuesta de IA, y si un humano la confirmó"*. Tres
 * vías: cargado a mano (siempre confirmado, porque lo hizo una persona en
 * el momento), llegado por un mail (nunca confirmado por sí solo: alguien
 * todavía tiene que revisarlo), o propuesto por una IA (confirmado solo si
 * `confirmadoPor` dice qué `Actor` lo confirmó).
 */
import type { Actor } from "./actor.ts";

/** De dónde salió un registro. */
export type Origen =
  | { readonly via: "manual"; readonly actor: Actor }
  | { readonly via: "ingesta-mail"; readonly mensajeId: string }
  | {
      readonly via: "propuesta-ia";
      readonly modelo: string;
      readonly versionPrompt: string;
      readonly confirmadoPor?: Actor;
    };

/**
 * `true` si el origen alcanza para que el dato cuente como confirmado:
 * manual siempre, propuesta de IA solo si un `Actor` la confirmó, ingesta de
 * mail nunca por sí sola. `switch` exhaustivo: una vía nueva no compila
 * hasta que se decida acá si cuenta como confirmada.
 */
export function estaConfirmado(origen: Origen): boolean {
  switch (origen.via) {
    case "manual":
      return true;
    case "propuesta-ia":
      return origen.confirmadoPor !== undefined;
    case "ingesta-mail":
      return false;
    default: {
      const viaNoContemplada: never = origen;
      return viaNoContemplada;
    }
  }
}

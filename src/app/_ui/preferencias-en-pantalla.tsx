"use client";

/**
 * Las preferencias que leyó el layout, al alcance del elegidor de tema y de
 * la barra lateral (F3-05, ADR 0040). Al guardar una, Next vuelve a dibujar el
 * layout con la cookie nueva y esto se actualiza solo.
 */

import { createContext, type ReactNode, useContext } from "react";
import type { Preferencias } from "./preferencias.ts";

const Contexto = createContext<Preferencias | null>(null);

export function ConPreferencias({
  preferencias,
  children,
}: {
  readonly preferencias: Preferencias;
  readonly children: ReactNode;
}) {
  return <Contexto value={preferencias}>{children}</Contexto>;
}

export function usePreferencias(): Preferencias {
  const preferencias = useContext(Contexto);
  if (preferencias === null) {
    throw new Error("Falta <ConPreferencias>: lo pone el layout raíz.");
  }
  return preferencias;
}

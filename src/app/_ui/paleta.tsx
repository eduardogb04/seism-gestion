"use client";

import { Command } from "cmdk";
import { Building2, CornerDownLeft, Plus, Search, Wrench } from "lucide-react";
import { useRouter } from "next/navigation.js";
import { useEffect, useRef, useState, useTransition } from "react";
import { buscar, type Resultado } from "../../server/busqueda.ts";
import { ALTAS, GRUPOS } from "./navegacion.ts";

export const EVENTO_ABRIR_PALETA = "seism:paleta";

/** Abre la paleta desde cualquier botón. */
export function abrirPaleta() {
  window.dispatchEvent(new Event(EVENTO_ABRIR_PALETA));
}

const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function esCampoDeTexto(objetivo: EventTarget | null): boolean {
  const el = objetivo as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
}

/**
 * Paleta de comandos (Ctrl K): ir a cualquier sección, crear algo o encontrar
 * un servicio o cliente. También los atajos `G` + letra y `N` (nuevo servicio).
 */
export function Paleta({
  esAdministrador,
}: {
  readonly esAdministrador: boolean;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<readonly Resultado[]>([]);
  const [buscando, empezar] = useTransition();
  const esperandoG = useRef(false);

  useEffect(() => {
    const abrir = () => setAbierta(true);
    const teclas = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierta((a) => !a);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || esCampoDeTexto(e.target))
        return;
      if (esperandoG.current) {
        esperandoG.current = false;
        const destino = GRUPOS.flatMap((g) => g.secciones).find(
          (s) => s.atajo === e.key.toLowerCase(),
        );
        if (destino) router.push(destino.ruta);
        return;
      }
      if (e.key === "g") {
        esperandoG.current = true;
        setTimeout(() => {
          esperandoG.current = false;
        }, 900);
      } else if (e.key === "N" || e.key === "n") {
        router.push("/servicios?nuevo=1");
      }
    };
    window.addEventListener(EVENTO_ABRIR_PALETA, abrir);
    window.addEventListener("keydown", teclas);
    return () => {
      window.removeEventListener(EVENTO_ABRIR_PALETA, abrir);
      window.removeEventListener("keydown", teclas);
    };
  }, [router]);

  useEffect(() => {
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      empezar(async () => setResultados(await buscar(texto)));
    }, 160);
    return () => clearTimeout(t);
  }, [texto]);

  const ir = (ruta: string) => {
    setAbierta(false);
    setTexto("");
    router.push(ruta);
  };

  const coincide = (t: string) =>
    normalizar(t).includes(normalizar(texto.trim()));
  const altas = ALTAS.filter((a) => coincide(`Nuevo ${a.texto}`));
  const grupos = GRUPOS.map((g) => ({
    ...g,
    secciones: g.secciones.filter(
      (s) => (!s.soloAdministrador || esAdministrador) && coincide(s.texto),
    ),
  })).filter((g) => g.secciones.length > 0);
  const nada =
    !buscando &&
    resultados.length === 0 &&
    altas.length === 0 &&
    grupos.length === 0;

  const item =
    "flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-texto-2 data-[selected=true]:bg-superficie-2 data-[selected=true]:text-texto";

  return (
    <Command.Dialog
      open={abierta}
      onOpenChange={setAbierta}
      label="Buscar o ir a…"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-50 bg-velo/30 backdrop-blur-[2px] motion-safe:animate-[aparecer_150ms_ease-out]"
      contentClassName="fixed top-[14vh] left-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-borde bg-superficie shadow-flota origin-top motion-safe:animate-[paleta_220ms_var(--ease-resorte)]"
    >
      <div className="flex items-center gap-3 border-b border-borde px-4">
        <Search aria-hidden="true" className="size-4 text-texto-3" />
        <Command.Input
          value={texto}
          onValueChange={setTexto}
          placeholder="Buscar servicios, clientes o ir a una sección…"
          className="h-13 flex-1 bg-transparent text-[15px] text-texto outline-none placeholder:text-texto-3"
        />
        {buscando ? (
          <span className="text-xs text-texto-3">Buscando…</span>
        ) : null}
      </div>
      <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-texto-3">
        {nada ? (
          <p className="m-0 px-3 py-8 text-center text-texto-2">
            No encontré nada con eso.
          </p>
        ) : null}
        {resultados.length > 0 ? (
          <Command.Group heading="Resultados">
            {resultados.map((r) => (
              <Command.Item
                key={r.ruta}
                value={`${r.titulo} ${r.detalle}`}
                onSelect={() => ir(r.ruta)}
                className={item}
              >
                {r.tipo === "servicio" ? (
                  <Wrench aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <Building2 aria-hidden="true" className="size-4 shrink-0" />
                )}
                <span className="truncate text-texto">{r.titulo}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-texto-3">
                  {r.detalle}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        {altas.length > 0 ? (
          <Command.Group heading="Crear">
            {altas.map((a) => (
              <Command.Item
                key={a.ruta}
                value={`Nuevo ${a.texto}`}
                onSelect={() => ir(a.ruta)}
                className={item}
              >
                <Plus aria-hidden="true" className="size-4" />
                Nuevo {a.texto.toLowerCase()}
                {"atajo" in a ? (
                  <kbd className="ml-auto text-xs text-texto-3">{a.atajo}</kbd>
                ) : null}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        {grupos.map((g) => (
          <Command.Group key={g.nombre} heading={g.nombre}>
            {g.secciones.map(({ texto: t, ruta, Icono, atajo }) => (
              <Command.Item
                key={ruta}
                value={`Ir a ${t}`}
                onSelect={() => ir(ruta)}
                className={item}
              >
                <Icono aria-hidden="true" className="size-4" />
                {t}
                {atajo ? (
                  <kbd className="ml-auto text-xs text-texto-3">
                    G {atajo.toUpperCase()}
                  </kbd>
                ) : null}
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
      <div className="flex items-center gap-4 border-t border-borde px-4 py-2 text-xs text-texto-3">
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft aria-hidden="true" className="size-3" /> abrir
        </span>
        <span>↑↓ moverse</span>
        <span>Esc cerrar</span>
      </div>
    </Command.Dialog>
  );
}

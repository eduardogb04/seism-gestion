"use client";

import {
  ChevronDown,
  ChevronsUpDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation.js";
import { DropdownMenu } from "radix-ui";
import { useEffect, useState, useTransition } from "react";
import { contraerMenu, elegirTema } from "./acciones-de-preferencias.ts";
import { cn } from "./cn.ts";
import { Enlace as Link } from "./enlace-next.ts";
import { ALTAS, rutaActiva, seccionesVisibles } from "./navegacion.ts";
import { abrirPaleta, Paleta } from "./paleta.tsx";
import type { Tema } from "./preferencias.ts";
import { usePreferencias } from "./preferencias-en-pantalla.tsx";

const TEMAS: readonly { tema: Tema; texto: string; Icono: typeof Sun }[] = [
  { tema: "claro", texto: "Claro", Icono: Sun },
  { tema: "oscuro", texto: "Oscuro", Icono: Moon },
  { tema: "sistema", texto: "Como el sistema", Icono: Monitor },
];

function iniciales(email: string): string {
  const nombre = email.split("@")[0] ?? "";
  const partes = nombre.split(/[._-]+/).filter(Boolean);
  return (
    (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? partes[0]?.[1] ?? "")
  ).toUpperCase();
}

const ITEM_MENU =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-texto-2 outline-none select-none data-[highlighted]:bg-superficie-2 data-[highlighted]:text-texto";
const CONTENIDO_MENU =
  "menu-flotante z-50 min-w-56 rounded-[10px] border border-borde bg-superficie p-1.5 shadow-flota";

export function BarraLateral({
  email,
  rolTexto,
  esAdministrador,
}: {
  readonly email: string;
  readonly rolTexto: string;
  readonly esAdministrador: boolean;
}) {
  const { menuContraido: contraida, tema } = usePreferencias();
  const ruta = usePathname();
  const [abiertaEnCelular, setAbiertaEnCelular] = useState(false);
  const [, empezar] = useTransition();
  const grupos = seccionesVisibles(esAdministrador);
  const activa = rutaActiva(
    ruta,
    grupos.flatMap((g) => g.secciones.map((s) => s.ruta)),
  );
  const enConfiguracion = grupos
    .find((g) => g.plegable)
    ?.secciones.some((s) => s.ruta === activa);
  const [configAbierta, setConfigAbierta] = useState(!!enConfiguracion);

  // biome-ignore lint/correctness/useExhaustiveDependencies: se cierra cada vez que cambia la ruta
  useEffect(() => setAbiertaEnCelular(false), [ruta]);

  const cambiarTema = (t: Tema) =>
    empezar(async () => {
      const datos = new FormData();
      datos.set("tema", t);
      await elegirTema(datos);
    });

  const alternarContraida = () =>
    empezar(async () => {
      const datos = new FormData();
      datos.set("menu", contraida ? "expandido" : "contraido");
      await contraerMenu(datos);
    });

  const compacta = contraida && !abiertaEnCelular;

  return (
    <>
      <Paleta esAdministrador={esAdministrador} />

      {/* Barra superior del celular */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-borde bg-fondo/85 px-3 backdrop-blur md:hidden">
        <button
          type="button"
          aria-label="Abrir el menú"
          onClick={() => setAbiertaEnCelular(true)}
          className="presionable inline-flex size-10 items-center justify-center rounded-md text-texto-2 hover:bg-superficie-2"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <Marca />
        <button
          type="button"
          aria-label="Búsqueda global"
          onClick={abrirPaleta}
          className="presionable ml-auto inline-flex size-10 items-center justify-center rounded-md text-texto-2 hover:bg-superficie-2"
        >
          <Search aria-hidden="true" className="size-5" />
        </button>
      </div>

      {abiertaEnCelular ? (
        <button
          type="button"
          aria-label="Cerrar el menú"
          onClick={() => setAbiertaEnCelular(false)}
          className="fixed inset-0 z-40 bg-velo/40 md:hidden motion-safe:animate-[aparecer_150ms_ease-out]"
        />
      ) : null}

      <nav
        aria-label="Secciones"
        data-compacta={compacta ? "si" : "no"}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAbiertaEnCelular(false);
        }}
        className={cn(
          "group/barra fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-borde bg-fondo transition-[translate,width] duration-200 ease-out",
          "md:sticky md:top-0 md:z-auto md:h-dvh md:w-[240px] md:translate-x-0",
          abiertaEnCelular ? "translate-x-0 shadow-flota" : "-translate-x-full",
          compacta && "md:w-[60px]",
        )}
      >
        {/* Marca y plegado */}
        <div className="flex h-14 shrink-0 items-center gap-2 px-3 group-data-[compacta=si]/barra:justify-center group-data-[compacta=si]/barra:px-0">
          {compacta ? null : <Marca />}
          <button
            type="button"
            onClick={
              abiertaEnCelular
                ? () => setAbiertaEnCelular(false)
                : alternarContraida
            }
            aria-label={
              abiertaEnCelular
                ? "Cerrar el menú"
                : compacta
                  ? "Mostrar los nombres"
                  : "Solo íconos"
            }
            title={compacta ? "Mostrar los nombres" : "Solo íconos"}
            className={cn(
              "presionable ml-auto inline-flex size-8 items-center justify-center rounded-md text-texto-3 hover:bg-superficie-2 hover:text-texto",
              compacta && "ml-0",
            )}
          >
            {abiertaEnCelular ? (
              <X aria-hidden="true" className="size-4" />
            ) : compacta ? (
              <PanelLeftOpen aria-hidden="true" className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>

        {/* Buscar y Nuevo */}
        <div className="flex flex-col gap-2 px-3 pb-3 group-data-[compacta=si]/barra:items-center group-data-[compacta=si]/barra:px-0">
          <button
            type="button"
            onClick={abrirPaleta}
            title="Buscar (Ctrl K)"
            aria-label="Búsqueda global (Ctrl K)"
            className="presionable flex h-9 items-center gap-2 rounded-md border border-borde bg-superficie px-2.5 text-texto-3 shadow-tarjeta hover:border-borde-fuerte hover:text-texto-2 group-data-[compacta=si]/barra:size-9 group-data-[compacta=si]/barra:justify-center group-data-[compacta=si]/barra:px-0"
          >
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <span className="group-data-[compacta=si]/barra:sr-only">
              Buscar…
            </span>
            <kbd className="ml-auto rounded border border-borde bg-superficie-2 px-1.5 font-sans text-[11px] text-texto-3 group-data-[compacta=si]/barra:hidden">
              Ctrl K
            </kbd>
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                title="Nuevo"
                className="presionable flex h-9 items-center justify-center gap-2 rounded-md bg-acento px-3 font-medium text-sobre-acento shadow-tarjeta hover:bg-acento-fuerte group-data-[compacta=si]/barra:size-9 group-data-[compacta=si]/barra:px-0"
              >
                <Plus aria-hidden="true" className="size-4" />
                <span className="group-data-[compacta=si]/barra:sr-only">
                  Nuevo
                </span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={6}
                className={CONTENIDO_MENU}
              >
                {ALTAS.map((a) => (
                  <DropdownMenu.Item key={a.ruta} asChild className={ITEM_MENU}>
                    <Link href={a.ruta} className="no-underline">
                      <Plus aria-hidden="true" className="size-4" />
                      {a.texto}
                      {"atajo" in a ? (
                        <kbd className="ml-auto text-xs text-texto-3">
                          {a.atajo}
                        </kbd>
                      ) : null}
                    </Link>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        {/* Secciones */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 group-data-[compacta=si]/barra:px-2">
          {grupos.map((g) => {
            const plegada = g.plegable && !configAbierta && !compacta;
            return (
              <div key={g.nombre} className="mt-4 first:mt-1">
                {g.plegable ? (
                  <button
                    type="button"
                    onClick={() => setConfigAbierta((a) => !a)}
                    aria-expanded={!plegada}
                    className="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium text-texto-3 hover:text-texto-2 group-data-[compacta=si]/barra:sr-only"
                  >
                    <Settings2 aria-hidden="true" className="size-3.5" />
                    {g.nombre}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "ml-auto size-3.5 transition-transform",
                        plegada && "-rotate-90",
                      )}
                    />
                  </button>
                ) : (
                  <p className="flex h-7 items-center px-2.5 text-xs font-medium text-texto-3 group-data-[compacta=si]/barra:sr-only">
                    {g.nombre}
                  </p>
                )}
                {plegada ? null : (
                  <ul className="flex flex-col gap-px">
                    {g.secciones.map(({ texto, ruta: destino, Icono }) => {
                      const actual = destino === activa;
                      return (
                        <li key={destino}>
                          <Link
                            href={destino}
                            title={texto}
                            aria-current={actual ? "page" : undefined}
                            className={cn(
                              "presionable relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-texto-2 no-underline hover:bg-superficie-2 hover:text-texto",
                              "aria-[current=page]:bg-superficie aria-[current=page]:font-medium aria-[current=page]:text-texto aria-[current=page]:shadow-[0_0_0_1px_var(--color-borde),0_1px_2px_rgb(0_0_0/0.04)]",
                              "group-data-[compacta=si]/barra:mx-auto group-data-[compacta=si]/barra:size-9 group-data-[compacta=si]/barra:justify-center group-data-[compacta=si]/barra:px-0",
                            )}
                          >
                            <Icono
                              aria-hidden="true"
                              strokeWidth={1.75}
                              className={cn(
                                "size-4 shrink-0",
                                actual ? "text-acento" : "text-texto-3",
                              )}
                            />
                            <span className="truncate group-data-[compacta=si]/barra:sr-only">
                              {texto}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Persona */}
        <div className="border-t border-borde p-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="presionable flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-superficie-2 group-data-[compacta=si]/barra:justify-center"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-acento-suave text-[11px] font-semibold text-acento">
                  {iniciales(email ?? "")}
                </span>
                <span className="min-w-0 flex-1 group-data-[compacta=si]/barra:sr-only">
                  <span className="block truncate text-[13px] font-medium text-texto">
                    {email.split("@")[0]}
                  </span>
                  <span className="block truncate text-xs text-texto-3">
                    {rolTexto}
                  </span>
                </span>
                <ChevronsUpDown
                  aria-hidden="true"
                  className="size-4 text-texto-3 group-data-[compacta=si]/barra:hidden"
                />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="top"
                align="start"
                sideOffset={8}
                className={CONTENIDO_MENU}
              >
                <DropdownMenu.Label className="px-2.5 pt-1.5 pb-2 text-xs text-texto-3">
                  {email}
                </DropdownMenu.Label>
                <DropdownMenu.RadioGroup
                  value={tema}
                  onValueChange={(v) => cambiarTema(v as Tema)}
                >
                  {TEMAS.map(({ tema: t, texto, Icono }) => (
                    <DropdownMenu.RadioItem
                      key={t}
                      value={t}
                      className={ITEM_MENU}
                    >
                      <Icono aria-hidden="true" className="size-4" />
                      {texto}
                      <DropdownMenu.ItemIndicator className="ml-auto size-1.5 rounded-full bg-acento" />
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
                <DropdownMenu.Separator className="my-1.5 h-px bg-borde" />
                <form method="post" action="/salir">
                  <DropdownMenu.Item asChild className={ITEM_MENU}>
                    <button type="submit" className="w-full">
                      <LogOut aria-hidden="true" className="size-4" />
                      Salir
                    </button>
                  </DropdownMenu.Item>
                </form>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </nav>
    </>
  );
}

function Marca({ oculta = false }: { readonly oculta?: boolean }) {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 no-underline"
      aria-label="SeisM, inicio"
    >
      <span className="grid size-7 place-items-center rounded-md bg-placa p-1 shadow-[0_0_0_1px_var(--color-borde)]">
        {/* biome-ignore lint/performance/noImgElement: logo chico y estático */}
        <img src="/logo-seism-simbolo.png" alt="" className="h-auto w-full" />
      </span>
      {oculta ? null : (
        <span className="text-[15px] font-semibold tracking-tight text-texto">
          SeisM
        </span>
      )}
    </Link>
  );
}

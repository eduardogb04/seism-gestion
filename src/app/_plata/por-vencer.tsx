/**
 * Lo que queda por cobrar o por pagar, por vencimiento: arriba lo vencido,
 * después lo próximo. En celular, cada fila es una tarjeta.
 */

import type { ReactNode } from "react";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import { IconoDeDocumento } from "../_ui/icono-de-documento.tsx";
import {
  CLASES_DE_ACCIONES,
  CLASES_DE_ENLACE_DE_FILA,
  CLASES_DE_FILA_ENLAZADA,
  Tabla,
} from "../_ui/tabla.tsx";
import {
  ChipVencida,
  Importe,
  ListaDeTarjetas,
  TarjetaDeFila,
  TituloDeBloque,
  Vacio,
} from "./piezas.tsx";

type Cabecera = Parameters<typeof Tabla>[0]["cabeceras"][number];

export type FilaPorVencer = {
  readonly id: string;
  readonly href: string;
  /** El número del comprobante (o el concepto del egreso). */
  readonly principal: string;
  readonly mono: boolean;
  /** El cliente o el proveedor, debajo del principal. */
  readonly tercero: string;
  readonly servicio: { readonly codigo: string; readonly href: string } | null;
  readonly vence: string;
  /** `10 días`, o vacío si no venció. */
  readonly atraso: string;
  readonly total: string;
  readonly saldo: string;
  readonly accion: ReactNode;
  /** El documento que respalda el comprobante, si hay. */
  readonly documentoId?: string | null;
};

export type Grupo = {
  readonly id: string;
  readonly titulo: string;
  readonly tono: "normal" | "peligro";
  readonly filas: readonly FilaPorVencer[];
};

/** Total y saldo van a la derecha: la posición depende de si hay columna de servicio. */
const A_LA_DERECHA = {
  conServicio: "[&_th:nth-child(4)]:text-right [&_th:nth-child(5)]:text-right",
  sinServicio: "[&_th:nth-child(3)]:text-right [&_th:nth-child(4)]:text-right",
} as const;

export function PorVencer({
  grupos,
  cabeceras,
  conServicio,
  vacio,
  conAccion,
}: {
  readonly grupos: readonly Grupo[];
  /** Ya con sus enlaces de orden, si ordenan: [principal, servicio, vence]. */
  readonly cabeceras: {
    readonly principal: Cabecera;
    readonly servicio: Cabecera;
    readonly vence: Cabecera;
  };
  readonly conServicio: boolean;
  readonly vacio: string;
  readonly conAccion: boolean;
}) {
  const visibles = grupos.filter(({ filas }) => filas.length > 0);
  if (visibles.length === 0) {
    return <Vacio titulo={vacio} />;
  }
  const conDocumento = visibles.some(({ filas }) =>
    filas.some(({ documentoId }) => documentoId != null),
  );
  const columnas: Cabecera[] = [
    cabeceras.principal,
    ...(conServicio ? [cabeceras.servicio] : []),
    cabeceras.vence,
    "Total",
    "Saldo",
    ...(conAccion || conDocumento ? ["Acciones"] : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      {visibles.map((grupo) => (
        <section key={grupo.id} className="flex flex-col gap-3">
          <TituloDeBloque
            titulo={grupo.titulo}
            cantidad={grupo.filas.length}
            tono={grupo.tono}
          />
          <div
            className={cn(
              "hidden md:block [&_td]:text-[13px] [&_th]:text-[12px]",
              conServicio ? A_LA_DERECHA.conServicio : A_LA_DERECHA.sinServicio,
            )}
          >
            <Tabla cabeceras={columnas} titulo={grupo.titulo}>
              {grupo.filas.map((fila) => (
                <tr
                  key={fila.id}
                  className={cn(
                    CLASES_DE_FILA_ENLAZADA,
                    grupo.tono === "peligro" && "bg-peligro-suave",
                  )}
                >
                  <td>
                    <Enlace
                      href={fila.href}
                      className={cn(
                        CLASES_DE_ENLACE_DE_FILA,
                        fila.mono && "font-mono text-[12px]",
                      )}
                    >
                      {fila.principal}
                    </Enlace>
                    {fila.tercero === "" ? null : (
                      <span className="block truncate text-[12px] text-texto-3">
                        {fila.tercero}
                      </span>
                    )}
                  </td>
                  {conServicio ? (
                    <td className={cn(CLASES_DE_ACCIONES, "whitespace-nowrap")}>
                      {fila.servicio === null ? (
                        <span className="text-texto-3">—</span>
                      ) : (
                        <a
                          href={fila.servicio.href}
                          className="font-mono text-[12px]"
                        >
                          {fila.servicio.codigo}
                        </a>
                      )}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap">
                    <span className="cifras block">
                      {fila.vence === "" ? "Sin vencimiento" : fila.vence}
                    </span>
                    {fila.atraso === "" ? null : (
                      <ChipVencida atraso={fila.atraso} />
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap text-texto-2">
                    <Importe texto={fila.total} className="font-normal" />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Importe texto={fila.saldo} />
                  </td>
                  {conAccion || conDocumento ? (
                    <td className={cn(CLASES_DE_ACCIONES, "text-right")}>
                      <div className="flex items-center justify-end gap-1">
                        <IconoDeDocumento id={fila.documentoId} />
                        {fila.accion}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </Tabla>
          </div>
          <ListaDeTarjetas>
            {grupo.filas.map((fila) => (
              <TarjetaDeFila
                key={fila.id}
                href={fila.href}
                tono={grupo.tono}
                titulo={
                  <span
                    className={cn(
                      "block truncate",
                      fila.mono && "font-mono text-[13px]",
                    )}
                  >
                    {fila.principal}
                  </span>
                }
                derecha={<Importe texto={fila.saldo} />}
                accion={
                  fila.documentoId == null &&
                  fila.accion == null ? undefined : (
                    <div className="flex items-center gap-1">
                      <IconoDeDocumento id={fila.documentoId} />
                      {fila.accion}
                    </div>
                  )
                }
              >
                {fila.tercero === "" ? null : (
                  <span className="truncate text-[13px] text-texto-2">
                    {fila.tercero}
                  </span>
                )}
                <span className="cifras flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-texto-3">
                  {fila.vence === ""
                    ? "Sin vencimiento"
                    : `Vence ${fila.vence}`}
                  {fila.atraso === "" ? null : (
                    <ChipVencida atraso={fila.atraso} />
                  )}
                  {fila.servicio === null ? null : (
                    <a
                      href={fila.servicio.href}
                      className="relative z-10 font-mono"
                    >
                      {fila.servicio.codigo}
                    </a>
                  )}
                </span>
              </TarjetaDeFila>
            ))}
          </ListaDeTarjetas>
        </section>
      ))}
    </div>
  );
}

/** La vista Mes: siete columnas de lunes a domingo, cada entrada una píldora de una línea. */

import type { EntradaDelCalendario } from "../../casos-uso/calendario/calendario.ts";
import type { DiaDeLaGrilla } from "../../casos-uso/calendario/semanas.ts";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import {
  claveDeEntrada,
  type Estado,
  enlaceDelCalendario,
  PUNTO_DE_TIPO,
} from "./eventos.ts";

const POR_DIA = 3;

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function GrillaDelMes({
  semanas,
  estado,
  hoy,
}: {
  readonly semanas: readonly (readonly (DiaDeLaGrilla<EntradaDelCalendario> | null)[])[];
  readonly estado: Estado;
  /** `aaaa-mm-dd`. */
  readonly hoy: string;
}) {
  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie shadow-tarjeta">
      <div role="presentation" className="grid grid-cols-7 bg-superficie-2">
        {DIAS.map((dia) => (
          <p
            key={dia}
            className="m-0 px-2 py-2 text-xs font-medium text-texto-3"
          >
            {dia}
          </p>
        ))}
      </div>
      {semanas.map((semana) => (
        <ol
          key={semana.find(Boolean)?.fecha}
          className="m-0 grid list-none grid-cols-7 border-t border-borde p-0"
        >
          {semana.map((dia, lugar) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: el lugar en la semana es su identidad
              key={lugar}
              className="min-h-24 min-w-0 border-l border-borde p-1 first:border-l-0 md:min-h-28 md:p-1.5"
            >
              {dia === null ? null : (
                <>
                  <p
                    className={cn(
                      "cifras m-0 mb-1 grid size-6 place-items-center rounded-full text-xs",
                      dia.fecha === hoy
                        ? "bg-acento font-semibold text-sobre-acento"
                        : "text-texto-2",
                    )}
                  >
                    {dia.dia}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {dia.entradas.slice(0, POR_DIA).map((entrada) => (
                      <li key={claveDeEntrada(entrada)}>
                        <Enlace
                          href={enlaceDelCalendario(estado, {
                            evento: claveDeEntrada(entrada),
                          })}
                          scroll={false}
                          title={entrada.titulo}
                          className={cn(
                            "flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-4 no-underline md:text-xs",
                            entrada.vencida
                              ? "bg-peligro-suave text-peligro"
                              : "bg-superficie-2 text-texto hover:bg-superficie-3",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              PUNTO_DE_TIPO[entrada.tipo],
                            )}
                          />
                          <span
                            className={cn(
                              "truncate",
                              entrada.renovacion !== null && "text-texto-3",
                            )}
                          >
                            {entrada.titulo}
                          </span>
                        </Enlace>
                      </li>
                    ))}
                  </ul>
                  {dia.entradas.length > POR_DIA ? (
                    <Enlace
                      href={enlaceDelCalendario(
                        { ...estado, vista: "agenda" },
                        { ancla: `dia-${dia.fecha}` },
                      )}
                      className="mt-1 inline-block px-1 text-[11px] text-texto-2 md:text-xs"
                    >
                      +{dia.entradas.length - POR_DIA} más
                    </Enlace>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ol>
      ))}
    </div>
  );
}

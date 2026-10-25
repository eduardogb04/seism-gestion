import type {
  EntradaDelCalendario,
  TipoDeEntrada,
} from "../../casos-uso/calendario/calendario.ts";
import type { DiaDeLaGrilla } from "../../casos-uso/calendario/semanas.ts";
import { Enlace } from "../_ui/enlace-next.ts";

const POR_DIA = 3;

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** El color de cada tipo: los de serie del tema (claro y oscuro). */
export const BORDE_DE_TIPO: Readonly<Record<TipoDeEntrada, string>> = {
  vencimiento: "border-serie-1",
  factura: "border-serie-2",
  egreso: "border-serie-3",
  inicio: "border-serie-4",
};

/** «Vencido» en rojo si su fecha ya pasó; si no, «Pendiente». */
export function EstadoDeEntrada({ vencida }: { readonly vencida: boolean }) {
  return vencida ? (
    <span className="font-semibold text-peligro">Vencido</span>
  ) : (
    <span className="text-texto-suave">Pendiente</span>
  );
}

/** Abre la confirmación de cotizar la renovación de un vencimiento pendiente. */
export function EnlaceDeRenovacion({ href }: { readonly href: string }) {
  return (
    <Enlace href={href} scroll={false} className="text-xs">
      Cotizar renovación
    </Enlace>
  );
}

export function GrillaDelMes({
  semanas,
  enlaceDeRenovacion,
}: {
  /** El enlace que abre la renovación de un vencimiento; `null` si quien mira no puede. */
  readonly enlaceDeRenovacion: ((vencimientoId: string) => string) | null;
  readonly semanas: readonly (readonly (DiaDeLaGrilla<EntradaDelCalendario> | null)[])[];
}) {
  return (
    <div className="overflow-x-auto rounded border border-borde bg-superficie">
      <table className="w-full min-w-[56rem] table-fixed border-collapse">
        <caption className="sr-only">Vista del mes</caption>
        <thead>
          <tr>
            {DIAS.map((dia) => (
              <th key={dia} className="bg-superficie-alta px-2 py-1 text-left">
                {dia}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((semana) => (
            <tr key={semana.find(Boolean)?.fecha}>
              {semana.map((dia, lugar) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: el lugar en la semana es su identidad
                  key={lugar}
                  className="h-28 border-t border-l border-borde p-1 align-top first:border-l-0"
                >
                  {dia === null ? null : (
                    <>
                      <p className="text-sm text-texto-suave">{dia.dia}</p>
                      <ul className="flex flex-col gap-1">
                        {dia.entradas.slice(0, POR_DIA).map((entrada) => (
                          <li key={entrada.enlace + entrada.tipo}>
                            <a
                              href={entrada.enlace}
                              title={entrada.titulo}
                              className={`block truncate border-l-4 ${BORDE_DE_TIPO[entrada.tipo]} bg-superficie-alta px-1 text-xs text-texto no-underline hover:underline`}
                            >
                              {entrada.vencida ? (
                                <span className="font-semibold text-peligro">
                                  Vencido ·{" "}
                                </span>
                              ) : null}
                              {entrada.titulo}
                            </a>
                            {enlaceDeRenovacion !== null &&
                            entrada.vencimiento !== null ? (
                              <EnlaceDeRenovacion
                                href={enlaceDeRenovacion(
                                  entrada.vencimiento.id,
                                )}
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      {dia.entradas.length > POR_DIA ? (
                        <a
                          href="#lista"
                          className="text-xs"
                          aria-label={`${dia.entradas.length - POR_DIA} entradas más el día ${dia.dia}`}
                        >
                          +{dia.entradas.length - POR_DIA}
                        </a>
                      ) : null}
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

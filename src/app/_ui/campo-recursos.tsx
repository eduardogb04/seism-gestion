import { ChevronUp, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { textosDeLista } from "../../casos-uso/abm/definicion.ts";
import {
  lineaDeRecurso,
  recursoDeLinea,
  TIPOS_DE_RECURSO_DE_PLANTILLA,
} from "../../dominio/servicios/recurso-de-plantilla.ts";
import { Boton } from "./boton.tsx";
import { controlDe } from "./campo-lista.tsx";
import { CLASES_DE_CONTROL, ErrorDeCampo } from "./campo-texto.tsx";
import { cn } from "./cn.ts";

const ETIQUETA_DE_TIPO: Readonly<Record<string, string>> = {
  persona: "Persona",
  equipo: "Equipo",
  material: "Material",
};

const PRIMER_TIPO = TIPOS_DE_RECURSO_DE_PLANTILLA[0];

type Fila = {
  readonly clave: number;
  readonly tipo: string;
  readonly descripcion: string;
  readonly cantidad: string;
};

/** Una línea guardada, en sus campos; una línea que no se entiende se conserva como descripción. */
function filaDeLinea(linea: string, clave: number): Fila {
  const recurso = recursoDeLinea(linea);
  return recurso === null
    ? { clave, tipo: PRIMER_TIPO, descripcion: linea, cantidad: "" }
    : {
        clave,
        tipo: recurso.tipo,
        descripcion: recurso.descripcion,
        cantidad: recurso.cantidad ?? "",
      };
}

/** La línea `tipo | descripción | cantidad` de una fila; las filas sin descripción no mandan nada. */
function lineaDeFila({ tipo, descripcion, cantidad }: Fila): string {
  const texto = descripcion.replaceAll("|", "/").trim();
  if (texto === "") {
    return "";
  }
  const unidades = cantidad.replaceAll("|", "/").trim();
  return lineaDeRecurso({
    tipo,
    descripcion: texto,
    cantidad: tipo === "material" && unidades !== "" ? unidades : null,
  });
}

/**
 * Los recursos de una plantilla (R7): una fila por recurso, con tipo,
 * descripción y cantidad (solo un material la lleva). Manda un solo control,
 * `name`, con una línea `tipo | descripción | cantidad` por recurso: lo mismo
 * que recibía el campo de lista de textos.
 */
export function CampoRecursos({
  etiqueta,
  name,
  defaultValue,
  error,
}: {
  readonly etiqueta: string;
  readonly name: string;
  readonly defaultValue: string;
  readonly error: string | undefined;
}) {
  const id = useId();
  const [filas, setFilas] = useState<readonly Fila[]>(() =>
    textosDeLista(defaultValue).map(filaDeLinea),
  );
  const cambiar = (clave: number, cambio: Partial<Fila>) =>
    setFilas((previas) =>
      previas.map((fila) =>
        fila.clave === clave ? { ...fila, ...cambio } : fila,
      ),
    );
  return (
    <fieldset className="flex flex-col gap-2" data-lista={name}>
      <legend className="mb-1.5 text-[13px] leading-[18px] font-medium text-texto">
        {etiqueta}
      </legend>
      <input
        type="hidden"
        name={name}
        value={filas
          .map(lineaDeFila)
          .filter((linea) => linea !== "")
          .join("\n")}
      />
      <ol className="flex flex-col gap-2">
        {filas.map((fila, lugar) => (
          <li
            key={fila.clave}
            className="flex flex-wrap items-center gap-1.5 rounded-control border border-borde bg-superficie-2 p-2"
          >
            <select
              aria-label={`Tipo del recurso ${lugar + 1}`}
              className={cn(CLASES_DE_CONTROL, "w-32 shrink-0")}
              value={fila.tipo}
              onChange={(evento) =>
                cambiar(fila.clave, {
                  tipo: controlDe(evento.target)?.[1] ?? PRIMER_TIPO,
                })
              }
            >
              {TIPOS_DE_RECURSO_DE_PLANTILLA.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ETIQUETA_DE_TIPO[tipo]}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label={`Descripción del recurso ${lugar + 1}`}
              placeholder="Descripción"
              aria-invalid={error !== undefined}
              aria-describedby={error === undefined ? undefined : `${id}-error`}
              className={cn(CLASES_DE_CONTROL, "min-w-40 flex-1")}
              value={fila.descripcion}
              onChange={(evento) =>
                cambiar(fila.clave, {
                  descripcion: controlDe(evento.target)?.[1] ?? "",
                })
              }
            />
            {fila.tipo === "material" ? (
              <input
                type="text"
                aria-label={`Cantidad del recurso ${lugar + 1}`}
                placeholder="Cantidad"
                className={cn(CLASES_DE_CONTROL, "w-28 shrink-0")}
                value={fila.cantidad}
                onChange={(evento) =>
                  cambiar(fila.clave, {
                    cantidad: controlDe(evento.target)?.[1] ?? "",
                  })
                }
              />
            ) : null}
            <Boton
              variante="fantasma"
              type="button"
              disabled={lugar === 0}
              aria-label={`Subir recurso ${lugar + 1}`}
              onClick={() =>
                setFilas((previas) =>
                  previas.map((otra, posicion) =>
                    posicion === lugar
                      ? (previas[lugar - 1] ?? otra)
                      : posicion === lugar - 1
                        ? (previas[lugar] ?? otra)
                        : otra,
                  ),
                )
              }
            >
              <ChevronUp aria-hidden="true" />
            </Boton>
            <Boton
              variante="fantasma"
              type="button"
              aria-label={`Quitar recurso ${lugar + 1}`}
              onClick={() =>
                setFilas((previas) =>
                  previas.filter(({ clave }) => clave !== fila.clave),
                )
              }
            >
              <Trash2 aria-hidden="true" />
            </Boton>
          </li>
        ))}
      </ol>
      <div>
        <Boton
          variante="secundario"
          type="button"
          onClick={() =>
            setFilas((previas) => [
              ...previas,
              {
                clave: Math.max(-1, ...previas.map(({ clave }) => clave)) + 1,
                tipo: PRIMER_TIPO,
                descripcion: "",
                cantidad: "",
              },
            ])
          }
        >
          <Plus aria-hidden="true" />
          Agregar recurso
        </Boton>
      </div>
      <ErrorDeCampo id={id} error={error} />
    </fieldset>
  );
}

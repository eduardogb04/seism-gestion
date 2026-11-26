import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { textosDeLista } from "../../casos-uso/abm/definicion.ts";
import { Boton } from "./boton.tsx";
import { CLASES_DE_CONTROL, ErrorDeCampo } from "./campo-texto.tsx";
import { cn } from "./cn.ts";

/** El nombre y el valor del control que cambió. El DOM no está en los tipos de este proyecto: se mira lo que trae. */
export function controlDe(destino: unknown): readonly [string, string] | null {
  return typeof destino === "object" &&
    destino !== null &&
    "name" in destino &&
    typeof destino.name === "string" &&
    "value" in destino &&
    typeof destino.value === "string"
    ? [destino.name, destino.value]
    : null;
}

/** La fila recién agregada toma el foco al aparecer. */
function enfocar(campo: { focus(): void } | null) {
  campo?.focus();
}

type Fila = {
  readonly clave: number;
  readonly texto: string;
  /** Agregada con el botón: toma el foco al aparecer. */
  readonly nueva: boolean;
};

/**
 * Una lista ordenada de textos de una línea (campo `lista` del molde, F6-02):
 * se agrega, se quita y se sube o baja cada uno. Manda un solo control, `name`,
 * con los textos uno por línea; los controles de cada fila no mandan nada.
 */
export function CampoLista({
  etiqueta,
  elemento,
  name,
  defaultValue,
  error,
}: {
  readonly etiqueta: string;
  /** Qué es cada fila, en minúscula: "hito". */
  readonly elemento: string;
  readonly name: string;
  /** Los textos del inicio, uno por línea. */
  readonly defaultValue: string;
  readonly error: string | undefined;
}) {
  const id = useId();
  const [filas, setFilas] = useState<readonly Fila[]>(() =>
    textosDeLista(defaultValue).map((texto, clave) => ({
      clave,
      texto,
      nueva: false,
    })),
  );
  const nombre = elemento.charAt(0).toUpperCase() + elemento.slice(1);
  const mover = (lugar: number, hacia: number) =>
    setFilas((previas) => {
      const otra = previas[hacia];
      const esta = previas[lugar];
      return otra === undefined || esta === undefined
        ? previas
        : previas.map((fila, posicion) =>
            posicion === lugar ? otra : posicion === hacia ? esta : fila,
          );
    });
  return (
    <fieldset className="flex flex-col gap-1.5" data-lista={name}>
      <legend className="mb-1.5 text-[13px] leading-[18px] font-medium text-texto">
        {etiqueta}
      </legend>
      <input
        type="hidden"
        name={name}
        value={filas.map(({ texto }) => texto).join("\n")}
      />
      <ol className="flex flex-col gap-1.5">
        {filas.map((fila, lugar) => (
          <li key={fila.clave} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="cifras w-5 shrink-0 text-right text-xs text-texto-3"
            >
              {lugar + 1}
            </span>
            <input
              type="text"
              aria-label={`${nombre} ${lugar + 1}`}
              aria-invalid={error !== undefined}
              aria-describedby={error === undefined ? undefined : `${id}-error`}
              ref={fila.nueva ? enfocar : undefined}
              className={cn(CLASES_DE_CONTROL, "ml-1 flex-1")}
              value={fila.texto}
              onChange={(evento) => {
                const texto = controlDe(evento.target)?.[1] ?? "";
                setFilas((previas) =>
                  previas.map((otra) =>
                    otra.clave === fila.clave ? { ...otra, texto } : otra,
                  ),
                );
              }}
            />
            <Boton
              variante="fantasma"
              type="button"
              disabled={lugar === 0}
              aria-label={`Subir ${elemento} ${lugar + 1}`}
              onClick={() => mover(lugar, lugar - 1)}
            >
              <ChevronUp aria-hidden="true" />
            </Boton>
            <Boton
              variante="fantasma"
              type="button"
              disabled={lugar === filas.length - 1}
              aria-label={`Bajar ${elemento} ${lugar + 1}`}
              onClick={() => mover(lugar, lugar + 1)}
            >
              <ChevronDown aria-hidden="true" />
            </Boton>
            <Boton
              variante="fantasma"
              type="button"
              aria-label={`Quitar ${elemento} ${lugar + 1}`}
              onClick={() =>
                setFilas((previas) =>
                  previas.filter(({ clave }) => clave !== fila.clave),
                )
              }
            >
              <X aria-hidden="true" />
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
                texto: "",
                nueva: true,
              },
            ])
          }
        >
          <Plus aria-hidden="true" />
          Agregar {elemento}
        </Boton>
      </div>
      <ErrorDeCampo id={id} error={error} />
    </fieldset>
  );
}

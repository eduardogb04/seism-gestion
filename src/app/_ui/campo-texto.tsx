import { ChevronDown, CircleAlert } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "./cn.ts";

type PropsDeCampo = {
  readonly etiqueta: string;
  /** Lo que la persona tiene que corregir en este campo: va debajo, pegado a él. */
  readonly error?: string | undefined;
  /** Se puede dejar vacío: la etiqueta lo dice con «opcional» (FRONT_SPEC 4.3). */
  readonly opcional?: boolean | undefined;
};

/**
 * Las clases de un control de formulario (36 px, borde con contraste, foco
 * con anillo, error en `peligro`). `:user-invalid` lo marca recién después de
 * que la persona pasó por el campo, nunca al abrir.
 */
export const CLASES_DE_CONTROL =
  "h-9 w-full min-w-0 rounded-control border border-borde-control bg-superficie px-3 text-base text-texto shadow-tarjeta placeholder:text-texto-3 transition-[border-color,box-shadow] duration-150 hover:border-texto-3 focus-visible:border-acento focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-acento/20 disabled:cursor-not-allowed disabled:bg-superficie-2 disabled:opacity-70 aria-invalid:border-peligro aria-invalid:focus-visible:ring-peligro/20 user-invalid:border-peligro sm:text-sm pointer-coarse:h-11";

/** La etiqueta de un campo: 13 px, arriba, con «opcional» si corresponde. */
export function Etiqueta({
  htmlFor,
  opcional,
  oculta = false,
  children,
}: {
  readonly htmlFor: string;
  readonly opcional?: boolean | undefined;
  readonly oculta?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={
        oculta
          ? "sr-only"
          : "flex items-baseline gap-1.5 text-[13px] leading-[18px] font-medium text-texto"
      }
    >
      {children}
      {opcional === true ? (
        <span className="text-xs font-normal text-texto-3">opcional</span>
      ) : null}
    </label>
  );
}

/** El mensaje de error de un campo, debajo de él. */
export function ErrorDeCampo({
  id,
  error,
}: {
  readonly id: string;
  readonly error: string | undefined;
}) {
  return error === undefined ? null : (
    <p
      id={`${id}-error`}
      data-error-de-campo
      className="flex items-start gap-1.5 text-[13px] leading-[18px] text-peligro"
    >
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{error}</span>
    </p>
  );
}

function Campo({
  id,
  etiqueta,
  error,
  opcional,
  children,
}: PropsDeCampo & { readonly id: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Etiqueta htmlFor={id} opcional={opcional}>
        {etiqueta}
      </Etiqueta>
      {children}
      <ErrorDeCampo id={id} error={error} />
    </div>
  );
}

function atributos(id: string, error: string | undefined) {
  return {
    id,
    className: CLASES_DE_CONTROL,
    "aria-invalid": error !== undefined,
    "aria-describedby": error === undefined ? undefined : `${id}-error`,
  };
}

export function CampoTexto({
  etiqueta,
  error,
  opcional,
  ...resto
}: PropsDeCampo & Omit<ComponentProps<"input">, "className" | "id">) {
  const id = useId();
  return (
    <Campo id={id} etiqueta={etiqueta} error={error} opcional={opcional}>
      <input {...atributos(id, error)} {...resto} />
    </Campo>
  );
}

/** Una casilla de sí/no: marcada manda su `value`, desmarcada no manda nada. */
export function CasillaSiNo({
  etiqueta,
  error,
  opcional: _opcional,
  ...resto
}: PropsDeCampo & Omit<ComponentProps<"input">, "className" | "id" | "type">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-9 items-center gap-2.5">
        <input
          type="checkbox"
          className="size-4 shrink-0 cursor-pointer rounded-[4px]"
          id={id}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          {...resto}
        />
        <label htmlFor={id} className="cursor-pointer text-sm text-texto">
          {etiqueta}
        </label>
      </div>
      <ErrorDeCampo id={id} error={error} />
    </div>
  );
}

/**
 * Un importe: el monto y, al lado, su moneda, bajo una sola etiqueta y con un
 * solo mensaje de error. Manda dos controles: `name` (el monto, tal cual se
 * escribió) y `nombreMoneda`.
 */
export function CampoImporte({
  etiqueta,
  error,
  opcional,
  nombreMoneda,
  monedas,
  monedaInicial,
  ...resto
}: PropsDeCampo &
  Omit<ComponentProps<"input">, "className" | "id" | "type"> & {
    readonly nombreMoneda: string;
    readonly monedas: readonly string[];
    readonly monedaInicial: string;
  }) {
  const id = useId();
  return (
    <Campo id={id} etiqueta={etiqueta} error={error} opcional={opcional}>
      <div className="flex">
        <span className="relative shrink-0">
          <select
            name={nombreMoneda}
            aria-label={`Moneda de ${etiqueta}`}
            defaultValue={monedaInicial}
            key={monedaInicial}
            className={cn(
              CLASES_DE_CONTROL,
              "w-auto cursor-pointer appearance-none rounded-r-none border-r-0 bg-superficie-2 pr-7 font-medium text-texto-2",
            )}
          >
            {monedas.map((moneda) => (
              <option key={moneda} value={moneda}>
                {moneda}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-texto-3"
          />
        </span>
        <input
          {...atributos(id, error)}
          className={cn(CLASES_DE_CONTROL, "cifras flex-1 rounded-l-none")}
          type="text"
          inputMode="decimal"
          {...resto}
        />
      </div>
    </Campo>
  );
}

/**
 * Un tipo de cambio: el valor y, al lado, su fuente, bajo una sola etiqueta y
 * con un solo mensaje de error. Manda dos controles: `name` (el valor, tal cual
 * se escribió) y `nombreFuente`.
 */
export function CampoCambio({
  etiqueta,
  error,
  opcional,
  nombreFuente,
  fuenteInicial,
  ...resto
}: PropsDeCampo &
  Omit<ComponentProps<"input">, "className" | "id" | "type"> & {
    readonly nombreFuente: string;
    readonly fuenteInicial: string;
  }) {
  const id = useId();
  return (
    <Campo id={id} etiqueta={etiqueta} error={error} opcional={opcional}>
      <div className="flex gap-2">
        <input
          {...atributos(id, error)}
          className={cn(CLASES_DE_CONTROL, "cifras flex-1")}
          type="text"
          inputMode="decimal"
          {...resto}
        />
        <input
          name={nombreFuente}
          aria-label={`Fuente de ${etiqueta}`}
          placeholder="Fuente"
          defaultValue={fuenteInicial}
          type="text"
          className={cn(CLASES_DE_CONTROL, "flex-1")}
        />
      </div>
    </Campo>
  );
}

export function CampoTextoLargo({
  etiqueta,
  error,
  opcional,
  ...resto
}: PropsDeCampo & Omit<ComponentProps<"textarea">, "className" | "id">) {
  const id = useId();
  return (
    <Campo id={id} etiqueta={etiqueta} error={error} opcional={opcional}>
      <textarea
        rows={4}
        {...atributos(id, error)}
        className={cn(CLASES_DE_CONTROL, "h-auto min-h-20 py-2 leading-5")}
        {...resto}
      />
    </Campo>
  );
}

/** Un archivo a subir (F2-05). El navegador no lo conserva si el formulario vuelve con errores. */
export function CampoArchivo({
  etiqueta,
  error,
  opcional,
  ...resto
}: PropsDeCampo & Omit<ComponentProps<"input">, "className" | "id" | "type">) {
  const id = useId();
  return (
    <Campo id={id} etiqueta={etiqueta} error={error} opcional={opcional}>
      <input
        {...atributos(id, error)}
        className={cn(
          CLASES_DE_CONTROL,
          "h-auto cursor-pointer py-1.5 text-texto-2 file:mr-3 file:h-7 file:cursor-pointer file:rounded-[5px] file:border file:border-borde-fuerte file:bg-superficie-2 file:px-2.5 file:text-[13px] file:font-medium file:text-texto",
        )}
        type="file"
        {...resto}
      />
    </Campo>
  );
}

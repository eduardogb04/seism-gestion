"use client";

/**
 * El formulario del alta de un servicio con «+ Nuevo tipo» junto al selector de
 * tipo (SYSTEM_SPEC 7.1): el tipo se crea ahí mismo, entra al selector y queda
 * elegido, sin salir de la ventana ni perder lo escrito.
 */

import { Check, Plus, X } from "lucide-react";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import type { OpcionDeRelacion } from "../../../casos-uso/abm/abm.ts";
import { MODALIDADES } from "../../../casos-uso/abm/tipos-de-servicio.ts";
import { Boton } from "../../_ui/boton.tsx";
import { CampoTexto } from "../../_ui/campo-texto.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Selector } from "../../_ui/selector.tsx";
import { crearTipoDeServicio } from "../acciones.ts";

const CAMPO_TIPO = "tipoServicioId";

export function FormularioDeAlta({
  elegibles,
  ...resto
}: ComponentProps<typeof FormularioAbm>) {
  const [tipos, setTipos] = useState<readonly OpcionDeRelacion[]>(
    elegibles[CAMPO_TIPO] ?? [],
  );
  const [elegido, setElegido] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  // El tipo recién creado ya es una opción: se elige en el selector del formulario.
  useEffect(() => {
    if (elegido === null) {
      return;
    }
    const selector = raiz.current?.querySelector<HTMLSelectElement>(
      `select[name="${CAMPO_TIPO}"]`,
    );
    if (selector !== null && selector !== undefined) {
      selector.value = elegido;
      selector.setCustomValidity("");
    }
    setElegido(null);
  }, [elegido]);

  return (
    <div ref={raiz}>
      <FormularioAbm
        {...resto}
        elegibles={{ ...elegibles, [CAMPO_TIPO]: tipos }}
        despuesDe={{
          ...resto.despuesDe,
          [CAMPO_TIPO]: (
            <NuevoTipo
              alCrear={({ id, nombre }) => {
                setTipos((previos) => [
                  ...previos,
                  { valor: id, texto: nombre },
                ]);
                setElegido(id);
              }}
            />
          ),
        }}
      />
    </div>
  );
}

function NuevoTipo({
  alCrear,
}: {
  readonly alCrear: (tipo: { id: string; nombre: string }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [modalidad, setModalidad] = useState("puntual");
  const [error, setError] = useState<string | undefined>(undefined);
  const [creando, setCreando] = useState(false);

  const cerrar = () => {
    setAbierto(false);
    setNombre("");
    setError(undefined);
  };
  const crear = async () => {
    setCreando(true);
    const resultado = await crearTipoDeServicio(nombre, modalidad);
    setCreando(false);
    if (resultado.ok) {
      alCrear(resultado);
      cerrar();
    } else {
      setError(resultado.mensaje);
    }
  };

  if (!abierto) {
    return (
      <div className="mt-1.5">
        <Boton
          variante="fantasma"
          type="button"
          onClick={() => setAbierto(true)}
        >
          <Plus aria-hidden="true" />
          Nuevo tipo
        </Boton>
      </div>
    );
  }
  // Sin `name`: estos controles no viajan con el formulario del servicio.
  return (
    <fieldset
      className="mt-2 flex flex-col gap-3 rounded-control border border-borde bg-superficie-2 p-3"
      onKeyDown={(evento) => {
        if (evento.key === "Enter") {
          evento.preventDefault();
          void crear();
        }
      }}
    >
      <legend className="px-1 text-[13px] font-medium text-texto">
        Nuevo tipo de servicio
      </legend>
      <CampoTexto
        type="text"
        etiqueta="Nombre del tipo"
        autoFocus
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        error={error}
      />
      <Selector
        etiqueta="Modalidad por defecto"
        value={modalidad}
        onChange={(evento) => setModalidad(evento.target.value)}
        opciones={MODALIDADES.map(({ valor, etiqueta }) => ({
          valor,
          texto: etiqueta,
        }))}
      />
      <div className="flex gap-2">
        <Boton
          variante="primario"
          type="button"
          cargando={creando}
          onClick={() => void crear()}
        >
          <Check aria-hidden="true" />
          Crear tipo
        </Boton>
        <Boton variante="fantasma" type="button" onClick={cerrar}>
          <X aria-hidden="true" />
          Cancelar
        </Boton>
      </div>
    </fieldset>
  );
}

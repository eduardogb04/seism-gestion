/**
 * La pantalla de cualquier ABM (F1-03, ADR 0031): el listado, y encima, según
 * la URL, la ventana de alta (`?nuevo=1`), de edición (`?editar=<id>`) o de
 * baja (`?baja=<id>`) (F1-09). La `page.tsx` de cada entidad solo exige la
 * sesión (`sesionExigida()`) y le pasa a `PaginaListado` su definición.
 *
 * Los botones de escritura se ocultan a quien no tiene un rol de
 * `rolesQueEscriben`; lo que protege es el caso de uso, no esto.
 */

import { Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { OpcionesPorCampo } from "../../../casos-uso/abm/abm.ts";
import {
  cabecerasDe,
  camposDe,
  type DefinicionAbm,
  type Escrito,
  escritoDe,
  textoDeCampo,
  textosDe,
  valoresDeAlta,
} from "../../../casos-uso/abm/definicion.ts";
import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../casos-uso/sesion/errores.ts";
import type { SesionValida } from "../../../casos-uso/sesion/sesion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import type { EntidadAbm } from "../../../puertos/repositorios/abm.ts";
import { Cambios } from "../../_ui/cambios.tsx";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import {
  AccionDeFila,
  consultaDe,
  enlace,
  ListadoAbm,
  type TipoDeColumna,
  type VentanaPedida,
  vistaDe,
} from "../../_ui/listado-abm.tsx";
import { Marco } from "../../_ui/marco.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import {
  crearRegistro,
  darDeBajaRegistro,
  guardarRegistro,
} from "./acciones.ts";
import { CAMPO_ARCHIVO } from "./escrito.ts";

type Parametros = Record<string, string | string[] | undefined>;

export type PropsListado = {
  readonly searchParams: Promise<Parametros>;
};

/** Lo que se muestra de cada registro que se puede elegir, por id. */
function etiquetasDe(elegibles: OpcionesPorCampo): ReadonlyMap<string, string> {
  return new Map(
    Object.values(elegibles).flatMap((lista) =>
      lista.map(({ valor, texto }) => [valor, texto] as const),
    ),
  );
}

const VENTANAS = ["baja", "editar", "nuevo"] as const;

/** La ventana que pide la URL; si piden más de una, gana la primera de `VENTANAS`. */
export function ventanaPedida(
  parametros: Awaited<PropsListado["searchParams"]>,
): VentanaPedida | null {
  for (const clave of VENTANAS) {
    const valor = parametros[clave];
    if (typeof valor === "string") {
      return { clave, valor };
    }
  }
  return null;
}

/** Cómo se dibuja cada columna del listado, según el tipo del campo que muestra. */
function tiposDe<E extends EntidadAbm>(
  definicion: DefinicionAbm<E>,
): readonly TipoDeColumna[] {
  const campos = Object.fromEntries(camposDe(definicion));
  return definicion.listado.map((columna) => {
    if (typeof columna !== "string") {
      return "calculada";
    }
    const campo = campos[columna];
    if (campo?.tipo === "numero" || campo?.tipo === "importe") {
      return "cifra";
    }
    if (campo?.tipo === "fecha") {
      return "cifra";
    }
    return campo?.tipo === "siNo" && columna.startsWith("activ")
      ? "estado"
      : "texto";
  });
}

/** El campo de archivo del formulario, si la definición adjunta uno. */
function archivoDe<E extends EntidadAbm>(definicion: DefinicionAbm<E>) {
  const campo = camposDe(definicion).find(
    ([, { tipo }]) => tipo === "archivo",
  )?.[1];
  return campo === undefined
    ? undefined
    : { nombre: CAMPO_ARCHIVO, etiqueta: campo.etiqueta, accept: ACEPTA };
}

export async function ContenidoDeVentana<E extends EntidadAbm>({
  definicion,
  pedida,
  vuelta,
  rutaAlCerrar,
  preseleccion,
}: {
  readonly definicion: DefinicionAbm<E>;
  readonly pedida: VentanaPedida;
  readonly vuelta: string;
  readonly rutaAlCerrar: string;
  /** Lo que el alta trae elegido desde otra pantalla (el servicio, desde su panel). */
  readonly preseleccion: Escrito;
}) {
  const { entidad, singular } = definicion;
  const elegibles = await armado().abm.opciones(
    definicion,
    pedida.clave === "editar" ? pedida.valor : undefined,
  );
  const titulos = {
    nuevo: `Alta de ${singular}`,
    editar: `Edición de ${singular}`,
    baja: `Baja de ${singular}`,
  };
  let titulo = titulos[pedida.clave];
  let contenido: ReactNode;
  try {
    if (pedida.clave === "nuevo") {
      contenido = (
        <FormularioAbm
          accion={crearRegistro.bind(null, entidad, vuelta)}
          campos={camposDe(definicion)}
          elegibles={elegibles}
          archivo={archivoDe(definicion)}
          inicial={{
            escrito: { ...valoresDeAlta(definicion), ...preseleccion },
            errores: {},
          }}
          enviar={{ texto: "Guardar", variante: "primario" }}
          rutaAlCancelar={rutaAlCerrar}
        />
      );
    } else {
      const { valor } = await armado().abm.obtener(definicion, pedida.valor);
      const textos = escritoDe(definicion, valor);
      if (pedida.clave === "baja") {
        const primera = definicion.listado[0];
        const nombre =
          typeof primera === "string"
            ? textoDeCampo(definicion, primera, valor, etiquetasDe(elegibles))
            : undefined;
        titulo = `¿Dar de baja "${nombre || singular}"?`;
      }
      contenido =
        pedida.clave === "editar" ? (
          <>
            <FormularioAbm
              accion={guardarRegistro.bind(null, entidad, valor.id, vuelta)}
              campos={camposDe(definicion)}
              elegibles={elegibles}
              archivo={archivoDe(definicion)}
              inicial={{ escrito: textos, errores: {} }}
              enviar={{ texto: "Guardar", variante: "primario" }}
              rutaAlCancelar={rutaAlCerrar}
            />
            <Cambios
              cambios={await armado().abm.historial(definicion, valor.id)}
            />
          </>
        ) : (
          <>
            <p>Se da de baja este {singular}:</p>
            <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {textosDe(definicion, valor, etiquetasDe(elegibles)).map(
                ([etiqueta, texto]) => (
                  <div key={etiqueta} className="contents">
                    <dt className="font-medium">{etiqueta}</dt>
                    <dd className="whitespace-pre-line">{texto}</dd>
                  </div>
                ),
              )}
            </dl>
            <FormularioAbm
              accion={darDeBajaRegistro.bind(null, entidad, valor.id, vuelta)}
              campos={[]}
              elegibles={{}}
              inicial={{ escrito: {}, errores: {} }}
              enviar={{ texto: "Confirmar baja", variante: "peligro" }}
              rutaAlCancelar={rutaAlCerrar}
            />
          </>
        );
    }
  } catch (fallo) {
    const codigo = codigoDeError(fallo);
    if (codigo === null) {
      throw fallo;
    }
    contenido = <ErrorEnPantalla error={pantallaDeCodigo(codigo)} />;
  }
  return (
    <Ventana titulo={titulo} rutaAlCerrar={rutaAlCerrar}>
      {contenido}
    </Ventana>
  );
}

export async function PaginaListado<E extends EntidadAbm>({
  definicion,
  sesion,
  bajada,
  searchParams,
}: {
  readonly definicion: DefinicionAbm<E>;
  readonly sesion: SesionValida;
  /** Una frase corta que dice para qué sirve el padrón. */
  readonly bajada?: string;
} & PropsListado) {
  const parametros = await searchParams;
  const listado = await armado().abm.listar(definicion, parametros);
  const vista = vistaDe(listado);
  const pedida = ventanaPedida(parametros);
  const { email, rol } = sesion.usuario;
  const { ruta } = definicion;
  const puedeEscribir = definicion.rolesQueEscriben.includes(rol);
  return (
    <Marco email={email} rol={rol} rutaActual={definicion.ruta}>
      <main className="flex flex-col gap-5">
        <ListadoAbm
          ruta={ruta}
          singular={definicion.singular}
          plural={definicion.plural}
          titulo={definicion.plural}
          bajada={bajada}
          cabeceras={cabecerasDe(definicion)}
          tipos={tiposDe(definicion)}
          ordenes={definicion.orden.map((columna) => ({
            columna,
            etiqueta: definicion.campos[columna].etiqueta,
          }))}
          listado={listado}
          puedeEscribir={puedeEscribir}
          rutaDeFila={definicion.rutaDeFila}
          acciones={
            puedeEscribir
              ? (id, deLaVista) => (
                  <>
                    <AccionDeFila
                      href={enlace(ruta, deLaVista, {
                        clave: "editar",
                        valor: id,
                      })}
                      texto="Editar"
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </AccionDeFila>
                    <AccionDeFila
                      href={enlace(ruta, deLaVista, {
                        clave: "baja",
                        valor: id,
                      })}
                      texto="Dar de baja"
                      peligro
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </AccionDeFila>
                  </>
                )
              : null
          }
        />
      </main>
      {pedida === null ? null : (
        <ContenidoDeVentana
          definicion={definicion}
          pedida={pedida}
          vuelta={consultaDe(vista)}
          rutaAlCerrar={enlace(definicion.ruta, vista)}
          preseleccion={
            typeof parametros.servicio === "string" &&
            "servicioId" in definicion.campos
              ? { servicioId: parametros.servicio }
              : {}
          }
        />
      )}
    </Marco>
  );
}

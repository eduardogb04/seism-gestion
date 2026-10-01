/**
 * La pantalla de cualquier ABM (F1-03, ADR 0031): el listado, y encima, según
 * la URL, la ventana de alta (`?nuevo=1`), de edición (`?editar=<id>`) o de
 * baja (`?baja=<id>`) (F1-09). La `page.tsx` de cada entidad solo exige la
 * sesión (`sesionExigida()`) y le pasa a `PaginaListado` su definición.
 *
 * Los botones de escritura se ocultan a quien no tiene un rol de
 * `rolesQueEscriben`; lo que protege es el caso de uso, no esto.
 */

import type { ReactNode } from "react";
import type { OpcionesPorCampo } from "../../../casos-uso/abm/abm.ts";
import {
  camposDe,
  type DefinicionAbm,
  escritoDe,
  textosDe,
  valoresDeAlta,
} from "../../../casos-uso/abm/definicion.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../casos-uso/sesion/errores.ts";
import type { SesionValida } from "../../../casos-uso/sesion/sesion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import type { EntidadAbm } from "../../../puertos/repositorios/abm.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import {
  consultaDe,
  enlace,
  ListadoAbm,
  type VentanaPedida,
  type Vista,
} from "../../_ui/listado-abm.tsx";
import { Marco } from "../../_ui/marco.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import {
  crearRegistro,
  darDeBajaRegistro,
  guardarRegistro,
} from "./acciones.ts";

export type PropsListado = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
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
function ventanaPedida(
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

async function ContenidoDeVentana<E extends EntidadAbm>({
  definicion,
  pedida,
  vuelta,
  rutaAlCerrar,
}: {
  readonly definicion: DefinicionAbm<E>;
  readonly pedida: VentanaPedida;
  readonly vuelta: string;
  readonly rutaAlCerrar: string;
}) {
  const { entidad, singular } = definicion;
  const elegibles = await armado().abm.opciones(definicion);
  const titulos = {
    nuevo: `Alta de ${singular}`,
    editar: `Edición de ${singular}`,
    baja: `Baja de ${singular}`,
  };
  let contenido: ReactNode;
  try {
    if (pedida.clave === "nuevo") {
      contenido = (
        <FormularioAbm
          accion={crearRegistro.bind(null, entidad, vuelta)}
          campos={camposDe(definicion)}
          elegibles={elegibles}
          inicial={{ escrito: valoresDeAlta(definicion), errores: {} }}
          enviar={{ texto: "Guardar", variante: "primario" }}
          rutaAlCancelar={rutaAlCerrar}
        />
      );
    } else {
      const { valor } = await armado().abm.obtener(definicion, pedida.valor);
      const textos = escritoDe(definicion, valor);
      contenido =
        pedida.clave === "editar" ? (
          <FormularioAbm
            accion={guardarRegistro.bind(null, entidad, valor.id, vuelta)}
            campos={camposDe(definicion)}
            elegibles={elegibles}
            inicial={{ escrito: textos, errores: {} }}
            enviar={{ texto: "Guardar", variante: "primario" }}
            rutaAlCancelar={rutaAlCerrar}
          />
        ) : (
          <>
            <p>Confirmá la baja de {singular}:</p>
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
    <Ventana titulo={titulos[pedida.clave]} rutaAlCerrar={rutaAlCerrar}>
      {contenido}
    </Ventana>
  );
}

export async function PaginaListado<E extends EntidadAbm>({
  definicion,
  sesion,
  searchParams,
}: {
  readonly definicion: DefinicionAbm<E>;
  readonly sesion: SesionValida;
} & PropsListado) {
  const parametros = await searchParams;
  const listado = await armado().abm.listar(definicion, parametros);
  const { buscar, orden, direccion, pagina } = listado;
  const vista: Vista = { buscar, orden, direccion, pagina };
  const pedida = ventanaPedida(parametros);
  const { email, rol } = sesion.usuario;
  return (
    <Marco email={email} rol={rol} rutaActual={definicion.ruta}>
      <main>
        <h1>{definicion.plural}</h1>
        <ListadoAbm
          definicion={definicion}
          listado={listado}
          puedeEscribir={definicion.rolesQueEscriben.includes(rol)}
        />
      </main>
      {pedida === null ? null : (
        <ContenidoDeVentana
          definicion={definicion}
          pedida={pedida}
          vuelta={consultaDe(vista)}
          rutaAlCerrar={enlace(definicion.ruta, vista)}
        />
      )}
    </Marco>
  );
}

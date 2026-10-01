/**
 * Las cuatro pantallas de cualquier ABM (F1-03, ADR 0031): listado, alta,
 * edición y confirmación de baja. La `page.tsx` de cada entidad solo exige la
 * sesión (`sesionExigida()`) y le pasa a una de estas su definición: por eso
 * todas piden la `sesion`, que no se consigue de otra forma.
 *
 * Los botones de escritura se ocultan a quien no tiene un rol de
 * `rolesQueEscriben`; lo que protege es el caso de uso, no esto.
 */

import type { ReactNode } from "react";
import {
  camposDe,
  type DefinicionAbm,
  escritoDe,
} from "../../../casos-uso/abm/definicion.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../casos-uso/sesion/errores.ts";
import type { SesionValida } from "../../../casos-uso/sesion/sesion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import type {
  EntidadAbm,
  RegistroAbm,
} from "../../../puertos/repositorios/abm.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { ListadoAbm } from "../../_ui/listado-abm.tsx";
import { Marco } from "../../_ui/marco.tsx";
import {
  crearRegistro,
  darDeBajaRegistro,
  guardarRegistro,
} from "./acciones.ts";

type PropsDePantalla<E extends EntidadAbm> = {
  readonly definicion: DefinicionAbm<E>;
  readonly sesion: SesionValida;
};

export type PropsListado = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export type PropsDeRegistro = {
  readonly params: Promise<{ readonly id: string }>;
};

function Pantalla<E extends EntidadAbm>({
  definicion,
  sesion,
  titulo,
  children,
}: PropsDePantalla<E> & {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  const { email, rol } = sesion.usuario;
  return (
    <Marco email={email} rol={rol} rutaActual={definicion.ruta}>
      <main>
        <h1>{titulo}</h1>
        {children}
      </main>
    </Marco>
  );
}

/** La pantalla de un registro que ya existe; si no existe o está dado de baja, su error y la vuelta al listado. */
async function PantallaDeRegistro<E extends EntidadAbm>({
  definicion,
  sesion,
  params,
  titulo,
  contenido,
}: PropsDePantalla<E> &
  PropsDeRegistro & {
    readonly titulo: string;
    readonly contenido: (registro: RegistroAbm<E>) => ReactNode;
  }) {
  const { id } = await params;
  let cuerpo: ReactNode;
  try {
    cuerpo = contenido(await armado().abm.obtener(definicion, id));
  } catch (fallo) {
    const codigo = codigoDeError(fallo);
    if (codigo === null) {
      throw fallo;
    }
    cuerpo = (
      <>
        <ErrorEnPantalla error={pantallaDeCodigo(codigo)} />
        <a href={definicion.ruta}>Volver al listado</a>
      </>
    );
  }
  return (
    <Pantalla definicion={definicion} sesion={sesion} titulo={titulo}>
      {cuerpo}
    </Pantalla>
  );
}

export async function PaginaListado<E extends EntidadAbm>({
  definicion,
  sesion,
  searchParams,
}: PropsDePantalla<E> & PropsListado) {
  const parametros = await searchParams;
  const listado = await armado().abm.listar(definicion, parametros);
  return (
    <Pantalla
      definicion={definicion}
      sesion={sesion}
      titulo={definicion.plural}
    >
      <ListadoAbm
        definicion={definicion}
        listado={listado}
        puedeEscribir={definicion.rolesQueEscriben.includes(sesion.usuario.rol)}
      />
    </Pantalla>
  );
}

export function PaginaAlta<E extends EntidadAbm>({
  definicion,
  sesion,
}: PropsDePantalla<E>) {
  return (
    <Pantalla
      definicion={definicion}
      sesion={sesion}
      titulo={`Alta de ${definicion.singular}`}
    >
      <FormularioAbm
        accion={crearRegistro.bind(null, definicion.entidad)}
        campos={camposDe(definicion)}
        inicial={{ escrito: {}, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={definicion.ruta}
      />
    </Pantalla>
  );
}

export function PaginaEdicion<E extends EntidadAbm>(
  props: PropsDePantalla<E> & PropsDeRegistro,
) {
  const { definicion } = props;
  return (
    <PantallaDeRegistro
      {...props}
      titulo={`Edición de ${definicion.singular}`}
      contenido={({ valor }) => (
        <FormularioAbm
          accion={guardarRegistro.bind(null, definicion.entidad, valor.id)}
          campos={camposDe(definicion)}
          inicial={{ escrito: escritoDe(valor), errores: {} }}
          enviar={{ texto: "Guardar", variante: "primario" }}
          rutaAlCancelar={definicion.ruta}
        />
      )}
    />
  );
}

/** La confirmación de la baja: muestra qué se va a dar de baja; recién *Confirmar baja* la hace. */
export function PaginaBaja<E extends EntidadAbm>(
  props: PropsDePantalla<E> & PropsDeRegistro,
) {
  const { definicion } = props;
  return (
    <PantallaDeRegistro
      {...props}
      titulo={`Baja de ${definicion.singular}`}
      contenido={({ valor }) => {
        const textos = escritoDe(valor);
        return (
          <>
            <p>Confirmá la baja de {definicion.singular}:</p>
            <dl className="my-4 grid max-w-xl grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {camposDe(definicion).map(([nombre, campo]) => (
                <div key={nombre} className="contents">
                  <dt className="font-medium">{campo.etiqueta}</dt>
                  <dd className="whitespace-pre-line">{textos[nombre]}</dd>
                </div>
              ))}
            </dl>
            <FormularioAbm
              accion={darDeBajaRegistro.bind(
                null,
                definicion.entidad,
                valor.id,
              )}
              campos={[]}
              inicial={{ escrito: {}, errores: {} }}
              enviar={{ texto: "Confirmar baja", variante: "peligro" }}
              rutaAlCancelar={definicion.ruta}
            />
          </>
        );
      }}
    />
  );
}

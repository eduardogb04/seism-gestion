/**
 * El molde del servicio, igual en todas sus etapas (F6-01, ADR 0048;
 * FRONT_SPEC §6.3): el encabezado fijo al desplazar, la línea de etapas y, en
 * dos columnas, el panel de la etapa (la página) y a la derecha los datos y la
 * actividad (debajo en una caja angosta). Las columnas dependen del ancho del
 * cuerpo (`@container/cuerpo`), no de la pantalla. Un layout no recibe los
 * parámetros de la dirección: sus botones abren las ventanas en el panel de la
 * etapa actual, que las dibuja.
 */

import type { ReactNode } from "react";
import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../../casos-uso/servicios/servicios.ts";
import { pantallaDeCodigo } from "../../../casos-uso/sesion/errores.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { Marco } from "../../_ui/marco.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import { accionPrincipalDe } from "./_molde/accion-principal.ts";
import {
  DatosDelServicio,
  EncabezadoDelServicio,
} from "./_molde/encabezado.tsx";
import { LineaDeEtapas } from "./_molde/linea-de-etapas.tsx";
import { esSoloLectura } from "./estado-del-servicio.tsx";
import { rutaDeEtapa, servicioDe } from "./rutas.ts";
import { Actividad } from "./sucesos.tsx";

const LISTADO = "/servicios";

export default async function LayoutDelServicio({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly id: string }>;
}) {
  const sesion = await sesionExigida();
  const { id } = await params;
  const { email, rol } = sesion.usuario;
  const leido = await servicioDe(id);
  if (!leido.ok) {
    return (
      <Marco email={email} rol={rol} rutaActual={LISTADO}>
        <main>
          <ErrorEnPantalla error={pantallaDeCodigo(leido.codigo)} />
          <a href={LISTADO}>Volver a Servicios</a>
        </main>
      </Marco>
    );
  }
  const { servicio } = leido;
  const { modalidad } = await armado().facturacion.ver(servicio.id);
  const rutaActual = rutaDeEtapa(servicio.id, servicio.etapa);
  const puedeActuar = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  // Lo que se escribe desde el encabezado o la actividad va al panel de la etapa actual.
  const puedeEscribir = puedeActuar && !esSoloLectura(servicio.etapa);
  return (
    <Marco email={email} rol={rol} rutaActual={LISTADO}>
      <main>
        <EncabezadoDelServicio
          servicio={servicio}
          rutaActual={rutaActual}
          principal={accionPrincipalDe(servicio, rutaActual)}
          puedeEscribir={puedeEscribir}
          puedeActuar={puedeActuar}
        />
        <div className="mt-5 rounded-tarjeta border border-borde bg-superficie px-3 pt-4 pb-2 shadow-tarjeta">
          <LineaDeEtapas servicio={servicio} />
        </div>
        <div className="@container/cuerpo mt-5">
          <div className="grid items-start gap-5 @4xl/cuerpo:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0">{children}</div>
            <aside
              aria-label="Actividad"
              className="flex min-w-0 flex-col gap-4"
            >
              <DatosDelServicio servicio={servicio} facturacion={modalidad} />
              <Actividad
                servicioId={servicio.id}
                historial={servicio.historial}
                ruta={rutaActual}
                puedeEscribir={puedeEscribir}
              />
            </aside>
          </div>
        </div>
      </main>
    </Marco>
  );
}

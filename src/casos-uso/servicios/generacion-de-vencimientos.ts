/**
 * Los vencimientos que nacen al finalizar un servicio (F4-02, ADR 0045): uno
 * por camión, por sitio o por servicio, con la fecha de la regla de su tipo
 * (F4-01), y el de renovar el contrato de uno recurrente (F4-03). Aparte de
 * `vencimientos.ts` porque los llama `servicios.ts`, que ese archivo importa.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import {
  crearAuditable,
  marcarActualizado,
  marcarEliminado,
} from "../../dominio/compartido/auditable.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import { identificadorDesde } from "../../dominio/compartido/identificador.ts";
import { formatearISO, type Reloj } from "../../dominio/compartido/reloj.ts";
import {
  fechaDeVencimiento,
  objetivosDeVencimiento,
} from "../../dominio/servicios/vencimiento.ts";
import type { GeneradorId } from "../../puertos/generador-id.ts";
import type { Servicio } from "../../puertos/repositorios/servicios.ts";
import type { RepositoriosEnTransaccion } from "../../puertos/repositorios/transaccion.ts";
import { aFechaHora } from "../compartido/movimientos.ts";

/**
 * Los vencimientos de `servicio`, recién finalizado, calculados al día del
 * cambio. Quien llama ya tomó la fila del servicio. Un tipo sin plazo no genera
 * ninguno.
 */
export async function generarVencimientos(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  reloj: Reloj,
  generadorId: GeneradorId,
  { valor: servicio }: Servicio,
): Promise<void> {
  const tipo = await repos
    .abm("TipoServicio")
    .buscarPorId(servicio.tipoServicioId);
  if (tipo === null) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "hay un servicio con un tipo que no existe",
      servicioId: servicio.id,
    });
  }
  const idsDeCamiones = (await repos.recursos.listarDe(servicio.id)).flatMap(
    ({ valor }) => (valor.camionId === null ? [] : [valor.camionId]),
  );
  const camiones = (await repos.abm("Camion").buscarPorIds(idsDeCamiones)).map(
    ({ valor }) => valor,
  );
  const idsDeSitios = await repos.servicios.sitiosDe(servicio.id);
  const sitios = (await repos.abm("Sitio").buscarPorIds(idsDeSitios)).map(
    ({ valor }) => valor,
  );
  // La función de la regla recibe el día a medianoche: `sumarMeses` conserva la hora.
  const finalizacion = aFechaHora(formatearISO(reloj.ahora()).slice(0, 10));
  const objetivos = objetivosDeVencimiento(
    servicio.titulo,
    idsDeCamiones.flatMap(
      (id) => camiones.find((camion) => camion.id === id) ?? [],
    ),
    idsDeSitios.flatMap((id) => sitios.find((sitio) => sitio.id === id) ?? []),
  );
  for (const objetivo of objetivos) {
    const vence = fechaDeVencimiento(finalizacion, tipo.valor, objetivo.camion);
    if (vence !== null) {
      await repos.vencimientos.crear(
        actor,
        crearAuditable(
          {
            id: identificadorDesde<string>(generadorId.generar()),
            servicioId: servicio.id,
            sitioId: objetivo.sitioId,
            camionId: objetivo.camionId,
            fecha: formatearISO(vence).slice(0, 10),
            descripcion: objetivo.descripcion,
            clase: "trabajo",
            origen: "calculado",
            estado: "pendiente",
            motivoDescarte: null,
          },
          actor,
          reloj,
        ),
      );
    }
  }
}

/**
 * El vencimiento «Renovar contrato» de `servicioId` al día de su vigencia hasta
 * (`null` si no tiene): crea el pendiente, lo mueve o, sin vigencia, lo da de
 * baja. Uno ya renovado o descartado no se toca. Quien llama ya tomó la fila del
 * servicio.
 */
export async function sincronizarRenovacionDeContrato(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  reloj: Reloj,
  generadorId: GeneradorId,
  servicioId: string,
  vigenciaHasta: string | null,
): Promise<void> {
  const pendiente = await repos.vencimientos.pendienteDeContratoDe(servicioId);
  if (pendiente === null) {
    if (vigenciaHasta !== null) {
      await repos.vencimientos.crear(
        actor,
        crearAuditable(
          {
            id: identificadorDesde<string>(generadorId.generar()),
            servicioId,
            sitioId: null,
            camionId: null,
            fecha: vigenciaHasta,
            descripcion: "Renovar contrato",
            clase: "contrato",
            origen: "calculado",
            estado: "pendiente",
            motivoDescarte: null,
          },
          actor,
          reloj,
        ),
      );
    }
    return;
  }
  const cambiado =
    vigenciaHasta === null
      ? marcarEliminado(pendiente, actor, reloj)
      : marcarActualizado(
          pendiente,
          { ...pendiente.valor, fecha: vigenciaHasta, origen: "calculado" },
          actor,
          reloj,
        );
  if (!cambiado.ok) {
    throw nuevoError(catalogo.DOM_0009, {
      entidad: "Vencimiento",
      id: pendiente.valor.id,
    });
  }
  await repos.vencimientos.actualizar(
    actor,
    cambiado.valor,
    vigenciaHasta === null ? "eliminar" : "actualizar",
  );
}

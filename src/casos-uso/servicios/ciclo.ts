/**
 * El estado de un servicio dentro de una transacción (F3-01, ADR 0039): se lee
 * del historial, cambia solo por el recorrido del dominio y limita lo que se
 * carga. Quien llama ya tomó la fila del servicio (`servicioVigenteBloqueado`):
 * así la etapa que se miró es la misma en la que se escribe.
 */

import type { Actor } from "../../dominio/compartido/actor.ts";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import type { Reloj } from "../../dominio/compartido/reloj.ts";
import { todoCobrado } from "../../dominio/servicios/cobro.ts";
import {
  admiteCarga,
  admiteFactura,
  type Carga,
  type Causa,
  cicloServicio,
  type EstadoServicio,
  type HistorialServicio,
  type ModalidadDeFacturacion,
  pedirCambio,
  porCausa,
} from "../../dominio/servicios/estados.ts";
import type { RepositoriosEnTransaccion } from "../../puertos/repositorios/transaccion.ts";
import { conCobrosDe } from "./cobranza.ts";

export async function historialDe(
  repos: RepositoriosEnTransaccion,
  id: string,
): Promise<HistorialServicio> {
  const [alta, ...cambios] = await repos.servicios.eventosDe(id);
  if (alta === undefined) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "hay un servicio sin su evento de alta",
      id,
    });
  }
  return { eventos: [alta, ...cambios] };
}

/** Guarda el último evento de `nuevo`, que es `anterior` más un cambio. */
async function agregarUltimo(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  id: string,
  anterior: HistorialServicio,
  nuevo: HistorialServicio,
): Promise<void> {
  const posicion = anterior.eventos.length;
  const evento = nuevo.eventos[posicion];
  if (evento === undefined) {
    throw nuevoError(catalogo.INF_0001, {
      motivo: "el historial no agregó el evento",
    });
  }
  await repos.servicios.agregarEvento(actor, id, { ...evento, posicion });
}

/**
 * El cambio que pide la persona: `DOM-0011` si no es uno de los manuales desde
 * el estado actual, `DOM-0017` si pide motivo y no lo trae. No guarda nada si
 * lo rechaza.
 */
export async function pedirCambioDeEstado(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  reloj: Reloj,
  id: string,
  destino: EstadoServicio,
  nota: string | null,
): Promise<void> {
  const historial = await historialDe(repos, id);
  const resultado = pedirCambio(historial, destino, {
    en: reloj.ahora(),
    actor,
    origen: nota,
  });
  if (!resultado.ok) {
    const { codigo, de, a } = resultado.error;
    throw nuevoError(
      codigo === catalogo.DOM_0017.codigo
        ? catalogo.DOM_0017
        : catalogo.DOM_0011,
      { id, de, a },
    );
  }
  await agregarUltimo(actor, repos, id, historial, resultado.valor);
}

/** El cambio automático que dispara `causa`, si desde el estado actual mueve algo. */
export async function cambiarPorCausa(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  reloj: Reloj,
  id: string,
  causa: Causa,
  nota: string,
): Promise<void> {
  const historial = await historialDe(repos, id);
  const nuevo = porCausa(historial, causa, {
    en: reloj.ahora(),
    actor,
    origen: nota,
  });
  if (nuevo !== null) {
    await agregarUltimo(actor, repos, id, historial, nuevo);
  }
}

/** `DOM-0018` si en la etapa actual del servicio no se carga (o anula) `carga`. */
export async function exigirEtapa(
  repos: RepositoriosEnTransaccion,
  id: string,
  carga: Carga,
): Promise<void> {
  const estado = cicloServicio.estadoActual(await historialDe(repos, id));
  if (!admiteCarga(estado, carga)) {
    throw nuevoError(catalogo.DOM_0018, { id, estado, carga });
  }
}

/**
 * Para cargar una factura (F3-03): `DOM-0021` si el servicio no tiene modalidad
 * de facturación, `DOM-0018` si con la suya no se factura en la etapa actual.
 */
export async function exigirEtapaDeFactura(
  repos: RepositoriosEnTransaccion,
  id: string,
  modalidad: ModalidadDeFacturacion | null,
): Promise<void> {
  if (modalidad === null) {
    throw nuevoError(catalogo.DOM_0021, { id });
  }
  const estado = cicloServicio.estadoActual(await historialDe(repos, id));
  if (!admiteFactura(estado, modalidad)) {
    throw nuevoError(catalogo.DOM_0018, {
      id,
      estado,
      carga: "factura",
      modalidad,
    });
  }
}

/** Un servicio finalizado con al menos una factura y todas en saldo cero pasa a «Cerrado». */
export async function cerrarSiEstaCobrado(
  actor: Actor,
  repos: RepositoriosEnTransaccion,
  reloj: Reloj,
  id: string,
): Promise<void> {
  const facturas = await conCobrosDe(repos, await repos.facturas.listarDe(id));
  if (todoCobrado(facturas.map(({ saldo }) => saldo))) {
    await cambiarPorCausa(
      actor,
      repos,
      reloj,
      id,
      "cobrado",
      "Se cobró todo lo facturado",
    );
  }
}

"use server";

/**
 * Las acciones de escritura de Servicios (F2-04, ADR 0033). El `Actor` sale
 * solo de la sesión, y si esa persona puede escribir lo decide el caso de uso.
 *
 * Las del formulario (alta, edición, baja, cargar y anular una cotización, una orden de compra, una factura o un suceso) devuelven su estado, como las del
 * molde de ABM. El cambio de estado y los sitios son formularios sin
 * JavaScript: si el caso de uso los rechaza, vuelven a la pantalla del servicio
 * con el código del error en la URL.
 */

import { redirect } from "next/navigation.js";
import type { ErroresPorCampo } from "../../casos-uso/abm/abm.ts";
import { pantallaDeCodigo } from "../../casos-uso/sesion/errores.ts";
import type { Actor } from "../../dominio/compartido/actor.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import type { EstadoFormulario } from "../_ui/formulario-abm.tsx";
import { conActorDeSesion } from "../(auth)/sesion-actual.ts";
import { archivoSubidoEn, escritoEn } from "../catalogo/_abm/escrito.ts";

const RUTA = "/servicios";

type Escritura =
  | { readonly ok: true; readonly ruta: string }
  | { readonly ok: false; readonly errores: ErroresPorCampo };

async function escribir(
  formulario: FormData,
  trabajo: (actor: Actor) => Promise<Escritura>,
): Promise<EstadoFormulario> {
  const escrito = escritoEn(formulario);
  const resultado = await conActorDeSesion(trabajo);
  if (!resultado.ok) {
    return { escrito, errores: {}, error: pantallaDeCodigo(resultado.codigo) };
  }
  if (!resultado.valor.ok) {
    return { escrito, errores: resultado.valor.errores };
  }
  redirect(resultado.valor.ruta);
}

/** El alta lleva a la pantalla del servicio nuevo: ahí se marcan sus sitios. */
export async function crearServicio(
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const creado = await armado().servicios.crear(actor, escritoEn(formulario));
    return creado.ok ? { ok: true, ruta: `${RUTA}/${creado.id}` } : creado;
  });
}

export async function guardarServicio(
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const guardado = await armado().servicios.guardar(
      actor,
      id,
      escritoEn(formulario),
    );
    return guardado.ok ? { ok: true, ruta: `${RUTA}/${id}` } : guardado;
  });
}

/** La baja, ya confirmada. */
export async function darDeBajaServicio(
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    await armado().servicios.marcarEliminado(actor, id);
    return { ok: true, ruta: RUTA };
  });
}

/** Cargar una cotización con su documento: vuelve a la pantalla del servicio. */
export async function cargarCotizacion(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cargada = await armado().cotizaciones.crear(
      actor,
      servicioId,
      escritoEn(formulario),
      archivo,
    );
    return cargada.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargada;
  });
}

/** La anulación, ya confirmada. */
export async function anularCotizacion(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    await armado().cotizaciones.marcarEliminado(actor, id);
    return { ok: true, ruta: `${RUTA}/${servicioId}` };
  });
}

/** Cargar una orden de compra, con su documento si se eligió uno. */
export async function cargarOrdenDeCompra(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cargada = await armado().ordenesDeCompra.crear(
      actor,
      servicioId,
      escritoEn(formulario),
      archivo,
    );
    return cargada.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargada;
  });
}

/** La anulación, ya confirmada. */
export async function anularOrdenDeCompra(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    await armado().ordenesDeCompra.marcarEliminado(actor, id);
    return { ok: true, ruta: `${RUTA}/${servicioId}` };
  });
}

/** Cargar una factura, con su documento si se eligió uno. */
export async function cargarFactura(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cargada = await armado().facturas.crear(
      actor,
      servicioId,
      escritoEn(formulario),
      archivo,
    );
    return cargada.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargada;
  });
}

/** La anulación, ya confirmada. */
export async function anularFactura(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    await armado().facturas.marcarEliminado(actor, id);
    return { ok: true, ruta: `${RUTA}/${servicioId}` };
  });
}

/** Cobrar una factura del servicio. */
export async function cobrarFactura(
  servicioId: string,
  facturaId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const cobrada = await armado().cobros.registrar(
      actor,
      facturaId,
      escritoEn(formulario),
    );
    return cobrada.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cobrada;
  });
}

/** La anulación de un cobro, ya confirmada. */
export async function anularCobro(
  servicioId: string,
  cobroId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    await armado().cobros.marcarAnulado(actor, cobroId);
    return { ok: true, ruta: `${RUTA}/${servicioId}` };
  });
}

/** Cargar un suceso del servicio. */
export async function registrarSuceso(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const cargado = await armado().sucesos.crear(
      actor,
      servicioId,
      escritoEn(formulario),
    );
    return cargado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargado;
  });
}

/** La anulación de un suceso, con su motivo. */
export async function anularSuceso(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const anulado = await armado().sucesos.marcarAnulado(
      actor,
      id,
      escritoEn(formulario),
    );
    return anulado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : anulado;
  });
}

async function enElServicio(
  id: string,
  trabajo: (actor: Actor) => Promise<void>,
): Promise<never> {
  const resultado = await conActorDeSesion(trabajo);
  const ruta = `${RUTA}/${encodeURIComponent(id)}`;
  redirect(resultado.ok ? ruta : `${ruta}?error=${resultado.codigo}`);
}

/** El estado al que pasa es el `value` del botón que se apretó. */
export async function cambiarEstadoDeServicio(
  id: string,
  formulario: FormData,
): Promise<void> {
  const { a = "", nota = "" } = escritoEn(formulario);
  return enElServicio(id, (actor) =>
    armado().servicios.cambiarEstado(actor, id, a, nota),
  );
}

export async function guardarSitiosDeServicio(
  id: string,
  formulario: FormData,
): Promise<void> {
  const sitioIds = formulario
    .getAll("sitio")
    .filter((valor) => typeof valor === "string");
  return enElServicio(id, (actor) =>
    armado().servicios.guardarSitios(actor, id, sitioIds),
  );
}

/** El responsable y la fecha estimada de inicio. */
export async function guardarPlanificacionDeServicio(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const guardada = await armado().planificacion.guardarPlanificacion(
      actor,
      servicioId,
      escritoEn(formulario),
    );
    return guardada.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : guardada;
  });
}

/** Cargar un hito del servicio. */
export async function cargarHito(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const cargado = await armado().planificacion.crearHito(
      actor,
      servicioId,
      escritoEn(formulario),
    );
    return cargado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargado;
  });
}

/** Cambiar el texto de un hito. */
export async function guardarHito(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const guardado = await armado().planificacion.guardarHito(
      actor,
      id,
      escritoEn(formulario),
    );
    return guardado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : guardado;
  });
}

/** Quitar un hito de la lista. */
export async function quitarHito(
  servicioId: string,
  id: string,
): Promise<void> {
  return enElServicio(servicioId, (actor) =>
    armado().planificacion.marcarEliminadoHito(actor, id),
  );
}

/** Tildar un hito como realizado o destildarlo. */
export async function cambiarRealizadoDeHito(
  servicioId: string,
  id: string,
  realizado: boolean,
): Promise<void> {
  return enElServicio(servicioId, (actor) =>
    armado().planificacion.cambiarRealizadoDeHito(actor, id, realizado),
  );
}

/** Cargar un recurso del servicio. */
export async function cargarRecurso(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const cargado = await armado().planificacion.crearRecurso(
      actor,
      servicioId,
      escritoEn(formulario),
    );
    return cargado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargado;
  });
}

/** Cambiar un recurso. */
export async function guardarRecurso(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const guardado = await armado().planificacion.guardarRecurso(
      actor,
      id,
      escritoEn(formulario),
    );
    return guardado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : guardado;
  });
}

/** Quitar un recurso de la lista. */
export async function quitarRecurso(
  servicioId: string,
  id: string,
): Promise<void> {
  return enElServicio(servicioId, (actor) =>
    armado().planificacion.marcarEliminadoRecurso(actor, id),
  );
}

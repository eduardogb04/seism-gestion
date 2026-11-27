"use server";

/**
 * Las acciones de escritura de Servicios (F2-04, ADR 0033). El `Actor` sale
 * solo de la sesión, y si esa persona puede escribir lo decide el caso de uso.
 *
 * Las del formulario (alta, edición, baja, cargar y anular una cotización, una orden de compra, una factura o un suceso, elegir la modalidad de facturación y ajustar la cuota) devuelven su estado, como las del
 * molde de ABM. El cambio de estado y los sitios son formularios sin
 * JavaScript: si el caso de uso los rechaza, vuelven a la pantalla del servicio
 * con el código del error en la URL.
 */

import type { ErroresPorCampo } from "../../casos-uso/abm/abm.ts";
import { CLIENTES } from "../../casos-uso/abm/clientes.ts";
import { MARCADA } from "../../casos-uso/abm/definicion.ts";
import { TIPOS_DE_SERVICIO } from "../../casos-uso/abm/tipos-de-servicio.ts";
import type { Ajuste } from "../../casos-uso/servicios/ajustes.ts";
import type { OrigenDeAnulacion } from "../../casos-uso/servicios/sucesos.ts";
import { pantallaDeCodigo } from "../../casos-uso/sesion/errores.ts";
import type { Actor } from "../../dominio/compartido/actor.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import { cotizacionDolar } from "../../server/tipo-de-cambio.ts";
import type { EstadoFormulario } from "../_ui/formulario-abm.tsx";
import { volverEnElLugar } from "../_ui/volver-en-el-lugar.ts";
import { actorDesdeSesion, conActorDeSesion } from "../(auth)/sesion-actual.ts";
import { archivoSubidoEn, escritoEn } from "../catalogo/_abm/escrito.ts";
import { panelDeLaEtapaActual } from "./[id]/rutas.ts";

const RUTA = "/servicios";

/**
 * Vuelve a la pantalla de `ruta` después de escribir: si es un servicio, al
 * panel de la etapa en la que quedó (F6-01). `refresh` hace que se vuelva a
 * dibujar también el layout del servicio (estado, línea de etapas, sucesos,
 * historial): sin él, Next reusa el que ya tenía al navegar dentro del mismo
 * servicio.
 */
async function volverA(ruta: string): Promise<void> {
  await volverEnElLugar(await panelDeLaEtapaActual(ruta));
}

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
  await volverA(resultado.valor.ruta);
  return { escrito, errores: {}, hecho: true };
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

export type ResultadoDeTipoNuevo =
  | { readonly ok: true; readonly id: string; readonly nombre: string }
  | { readonly ok: false; readonly mensaje: string };

/** Da de alta un tipo de servicio desde el alta de un servicio, sin salir de ella (SYSTEM_SPEC 7.1). */
export async function crearTipoDeServicio(
  nombre: string,
  modalidad: string,
): Promise<ResultadoDeTipoNuevo> {
  const resultado = await conActorDeSesion((actor) =>
    armado().abm.crear(actor, TIPOS_DE_SERVICIO, {
      nombre,
      modalidad,
      activo: MARCADA,
    }),
  );
  if (!resultado.ok) {
    return { ok: false, mensaje: pantallaDeCodigo(resultado.codigo).mensaje };
  }
  const creado = resultado.valor;
  return creado.ok
    ? {
        ok: true,
        id: creado.registro.valor.id,
        nombre: creado.registro.valor.nombre,
      }
    : {
        ok: false,
        mensaje:
          Object.values(creado.errores)[0] ?? "No se pudo crear el tipo.",
      };
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

/** El responsable y la fecha estimada de inicio, desde el panel de «Adjudicado»: el resto del servicio queda como estaba. */
export async function guardarPlanificacionDeServicio(
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const { escrito } = await armado().servicios.formulario(id);
    const guardado = await armado().servicios.guardar(actor, id, {
      ...escrito,
      ...escritoEn(formulario),
    });
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

/** Cargar un documento de alcance: vuelve a la pantalla del servicio. */
export async function cargarDocumentoDeAlcance(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cargado = await armado().documentosDeAlcance.crear(
      actor,
      servicioId,
      archivo,
    );
    return cargado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargado;
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

/** Cargar una orden que reemplaza a la vigente. */
export async function reemplazarOrdenDeCompra(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cargada = await armado().ordenesDeCompra.reemplazar(
      actor,
      servicioId,
      escritoEn(formulario),
      archivo,
    );
    return cargada.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargada;
  });
}

/** Ampliar la orden de compra vigente. */
export async function ampliarOrdenDeCompra(
  servicioId: string,
  ordenId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cargada = await armado().ordenesDeCompra.ampliar(
      actor,
      ordenId,
      escritoEn(formulario),
      archivo,
    );
    return cargada.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargada;
  });
}

/** Anular una ampliación, ya confirmada. */
export async function anularAmpliacionDeOrden(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    await armado().ordenesDeCompra.anularAmpliacion(actor, id);
    return { ok: true, ruta: `${RUTA}/${servicioId}` };
  });
}

/** Completar o cambiar el tipo de cambio de una orden de compra. */
export async function guardarCambioDeOrdenDeCompra(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const guardado = await armado().ordenesDeCompra.guardarTipoDeCambio(
      actor,
      id,
      escritoEn(formulario),
    );
    return guardado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : guardado;
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

/** Cargar un anticipo: una factura sin período, contra la orden vigente. */
export async function cargarAnticipo(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cargada = await armado().facturas.crear(
      actor,
      servicioId,
      { ...escritoEn(formulario), anticipo: "1" },
      archivo,
    );
    return cargada.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargada;
  });
}

/** Completar o cambiar el tipo de cambio de una factura. */
export async function guardarCambioDeFactura(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const guardado = await armado().facturas.guardarTipoDeCambio(
      actor,
      id,
      escritoEn(formulario),
    );
    return guardado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : guardado;
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

/** Cargar una nota de crédito, una de débito o una factura adicional (F6-03). */
export async function cargarAjuste(
  servicioId: string,
  ajuste: Ajuste,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cargado = await armado().ajustes.crear(
      actor,
      servicioId,
      ajuste,
      escritoEn(formulario),
      archivo,
    );
    return cargado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargado;
  });
}

/** Emitir la factura adicional de un recargo aprobado o la nota de crédito de un descuento aprobado (R5): se liga al ajuste. */
export async function cargarAjusteDesde(
  servicioId: string,
  ajuste: Ajuste,
  ajusteId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cargado = await armado().ajustes.crear(
      actor,
      servicioId,
      ajuste,
      escritoEn(formulario),
      archivo,
      ajusteId,
    );
    return cargado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargado;
  });
}

/** Proponer un recargo o un descuento (R5). */
export async function proponerAjusteDeFacturacion(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cargado = await armado().ajustesDeFacturacion.proponer(
      actor,
      servicioId,
      escritoEn(formulario),
      archivo,
    );
    return cargado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargado;
  });
}

/** Aprobar un ajuste propuesto (solo administrador). */
export async function aprobarAjusteDeFacturacion(
  servicioId: string,
  id: string,
): Promise<void> {
  return enElServicio(servicioId, (actor) =>
    armado().ajustesDeFacturacion.aprobar(actor, id),
  );
}

/** Rechazar un ajuste propuesto, con el motivo del formulario (solo administrador). */
export async function rechazarAjusteDeFacturacion(
  servicioId: string,
  id: string,
  formulario: FormData,
): Promise<void> {
  return enElServicio(servicioId, async (actor) => {
    await armado().ajustesDeFacturacion.rechazar(
      actor,
      id,
      escritoEn(formulario),
    );
  });
}

/** Anular un ajuste propuesto todavía pendiente (quien lo cargó). */
export async function anularAjusteDeFacturacion(
  servicioId: string,
  id: string,
): Promise<void> {
  return enElServicio(servicioId, (actor) =>
    armado().ajustesDeFacturacion.anular(actor, id),
  );
}

/** Anular un ajuste, con el motivo. */
export async function anularAjuste(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const anulado = await armado().ajustes.marcarAnulado(
      actor,
      id,
      escritoEn(formulario),
    );
    return anulado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : anulado;
  });
}

/** Cobrar una factura, con el documento de la orden de pago si se eligió uno. Al guardar vuelve a `rutaAlVolver`: la pantalla desde la que se abrió la ventana. */
export async function cobrarFactura(
  facturaId: string,
  rutaAlVolver: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const archivo = await archivoSubidoEn(formulario);
  return escribir(formulario, async (actor) => {
    const cobrada = await armado().cobros.registrar(
      actor,
      facturaId,
      escritoEn(formulario),
      archivo,
    );
    return cobrada.ok ? { ok: true, ruta: rutaAlVolver } : cobrada;
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

/** Cargar un suceso de un servicio o, sin servicio, una situación suelta del cliente. */
export async function registrarSuceso(
  clienteId: string,
  servicioId: string | null,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const cargado = await armado().sucesos.crear(
      actor,
      { clienteId, servicioId },
      escritoEn(formulario),
    );
    return cargado.ok
      ? {
          ok: true,
          ruta:
            servicioId === null
              ? `${CLIENTES.ruta}/${clienteId}`
              : `${RUTA}/${servicioId}`,
        }
      : cargado;
  });
}

/** La anulación de un suceso, con su motivo; vuelve a la pantalla desde la que se pidió. */
export async function anularSuceso(
  origen: OrigenDeAnulacion,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const anulado = await armado().sucesos.marcarAnulado(
      actor,
      origen,
      id,
      escritoEn(formulario),
    );
    return anulado.ok
      ? {
          ok: true,
          ruta:
            "servicioId" in origen
              ? `${RUTA}/${origen.servicioId}`
              : `${CLIENTES.ruta}/${origen.clienteId}`,
        }
      : anulado;
  });
}

/** Elegir o cambiar la modalidad de facturación (F3-03). */
export async function cambiarModalidadDeFacturacion(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const cambiada = await armado().facturacion.cambiarModalidad(
      actor,
      servicioId,
      escritoEn(formulario),
    );
    return cambiada.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cambiada;
  });
}

/** Un ajuste de la cuota mensual (F3-03). */
export async function ajustarCuota(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const ajustada = await armado().facturacion.registrarAjuste(
      actor,
      servicioId,
      escritoEn(formulario),
    );
    return ajustada.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : ajustada;
  });
}

async function enElServicio(
  id: string,
  trabajo: (actor: Actor) => Promise<void>,
): Promise<void> {
  const resultado = await conActorDeSesion(trabajo);
  const ruta = `${RUTA}/${encodeURIComponent(id)}`;
  return volverA(resultado.ok ? ruta : `${ruta}?error=${resultado.codigo}`);
}

/** El estado al que pasa es el `value` del botón que se apretó. */
export async function cambiarEstadoDeServicio(
  id: string,
  formulario: FormData,
): Promise<void> {
  const { a = "", nota = "", inicioReal = "" } = escritoEn(formulario);
  return enElServicio(id, (actor) =>
    armado().servicios.cambiarEstado(actor, id, a, nota, inicioReal),
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

/** Cambiar el texto de un hito, en el lugar. */
export async function editarHito(
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

/**
 * Destildar un hito pide el motivo (`motivo` en el formulario): el caso de uso
 * no lo guarda, así que queda como observación del servicio.
 */
export async function destildarHitoConMotivo(
  servicioId: string,
  clienteId: string,
  id: string,
  texto: string,
  formulario: FormData,
): Promise<void> {
  const { motivo = "" } = escritoEn(formulario);
  const hoy = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return enElServicio(servicioId, async (actor) => {
    await armado().planificacion.cambiarRealizadoDeHito(actor, id, false);
    await armado().sucesos.crear(
      actor,
      { clienteId, servicioId },
      {
        fecha: hoy,
        texto: `Hito "${texto}" destildado: ${motivo.trim()}`,
        tipo: "observacion",
      },
    );
  });
}

/** Subir o bajar un hito un lugar en la lista. */
export async function cambiarOrdenDeHito(
  servicioId: string,
  id: string,
  sentido: "subir" | "bajar",
): Promise<void> {
  return enElServicio(servicioId, (actor) =>
    armado().planificacion.cambiarOrdenDeHito(actor, id, sentido),
  );
}

/** Copiar al final de los hitos los de la plantilla elegida (`plantilla` en el formulario). */
export async function aplicarPlantillaDeHitos(
  servicioId: string,
  formulario: FormData,
): Promise<void> {
  const { plantilla = "" } = escritoEn(formulario);
  return enElServicio(servicioId, (actor) =>
    armado().planificacion.crearHitosDePlantilla(actor, servicioId, plantilla),
  );
}

/** Copiar al final de los recursos los de la plantilla elegida (`plantilla` en el formulario). */
export async function aplicarPlantillaDeRecursos(
  servicioId: string,
  formulario: FormData,
): Promise<void> {
  const { plantilla = "" } = escritoEn(formulario);
  return enElServicio(servicioId, (actor) =>
    armado().planificacion.crearRecursosDePlantilla(
      actor,
      servicioId,
      plantilla,
    ),
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

/** Cambiar un recurso, en el lugar. */
export async function editarRecurso(
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

/** Cotizar la renovación de un vencimiento: sigue en el servicio nuevo, o vuelve a este con el error. */
export async function cotizarRenovacion(
  servicioId: string,
  id: string,
): Promise<void> {
  const resultado = await conActorDeSesion((actor) =>
    armado().vencimientos.renovar(actor, id),
  );
  return volverA(
    resultado.ok
      ? `${RUTA}/${encodeURIComponent(resultado.valor.servicioId)}`
      : `${RUTA}/${encodeURIComponent(servicioId)}?error=${resultado.codigo}`,
  );
}

/** Cargar un vencimiento a mano. */
export async function cargarVencimiento(
  servicioId: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const cargado = await armado().vencimientos.crear(
      actor,
      servicioId,
      escritoEn(formulario),
    );
    return cargado.ok ? { ok: true, ruta: `${RUTA}/${servicioId}` } : cargado;
  });
}

/** Corregir la fecha de un vencimiento pendiente. */
export async function corregirFechaDeVencimiento(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const corregido = await armado().vencimientos.cambiarFecha(
      actor,
      id,
      escritoEn(formulario),
    );
    return corregido.ok
      ? { ok: true, ruta: `${RUTA}/${servicioId}` }
      : corregido;
  });
}

/** Descartar un vencimiento pendiente, con su motivo. */
export async function descartarVencimiento(
  servicioId: string,
  id: string,
  _previo: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  return escribir(formulario, async (actor) => {
    const descartado = await armado().vencimientos.marcarDescartado(
      actor,
      id,
      escritoEn(formulario),
    );
    return descartado.ok
      ? { ok: true, ruta: `${RUTA}/${servicioId}` }
      : descartado;
  });
}

/** La cotización del dólar para el formulario de una factura: texto listo para el campo, o `null` si no se pudo traer. */
export async function traerCotizacion(fuente: "billete" | "divisa"): Promise<{
  readonly valor: string;
  readonly fecha: string;
  readonly fuente: string;
} | null> {
  await actorDesdeSesion();
  const cotizacion = await cotizacionDolar(
    fuente === "divisa" ? "divisa" : "billete",
  );
  return cotizacion === null
    ? null
    : {
        valor: new Intl.NumberFormat("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
          useGrouping: false,
        }).format(cotizacion.valor),
        fecha: cotizacion.fecha,
        fuente: cotizacion.fuente,
      };
}

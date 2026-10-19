/**
 * Un servicio de prueba con su cliente y su tipo, armados por los casos de uso
 * (F2-05), y llevado a la etapa que el test necesite (F3-01). Datos inventados.
 */

import type { crearGeneradorIdCrypto } from "../../../src/adaptadores/memoria/generador-id.ts";
import type { crearClientePrisma } from "../../../src/adaptadores/prisma/cliente.ts";
import { crearCasosUsoAbm } from "../../../src/casos-uso/abm/abm.ts";
import { CLIENTES } from "../../../src/casos-uso/abm/clientes.ts";
import { TIPOS_DE_SERVICIO } from "../../../src/casos-uso/abm/tipos-de-servicio.ts";
import { crearCasosUsoServicios } from "../../../src/casos-uso/servicios/servicios.ts";
import type { Actor } from "../../../src/dominio/compartido/actor.ts";
import type {
  FechaHora,
  Reloj,
} from "../../../src/dominio/compartido/reloj.ts";
import type { EstadoServicio } from "../../../src/dominio/servicios/estados.ts";
import type { Transaccional } from "../../../src/puertos/repositorios/transaccion.ts";

type Dependencias = {
  readonly transaccional: Transaccional;
  readonly reloj: Reloj;
  readonly generadorId: ReturnType<typeof crearGeneradorIdCrypto>;
};

/** Un servicio nuevo del primer cliente y del primer tipo que haya en la base. */
export async function altaDeServicio(
  prisma: ReturnType<typeof crearClientePrisma>,
  dependencias: Dependencias,
  actor: Actor,
  responsableId: string,
  titulo: string,
): Promise<string> {
  const cliente = await prisma.cliente.findFirstOrThrow();
  const tipo = await prisma.tipoServicio.findFirstOrThrow();
  const resultado = await crearCasosUsoServicios(dependencias).crear(actor, {
    clienteId: cliente.id,
    tipoServicioId: tipo.id,
    titulo,
    modalidad: "puntual",
    responsableId,
    fechaPedido: "2031-07-01",
    vigenciaDesde: "",
    vigenciaHasta: "",
    observaciones: "",
  });
  if (!resultado.ok) {
    throw new Error(`el alta no pasó: ${JSON.stringify(resultado.errores)}`);
  }
  return resultado.id;
}

/** Un cliente, un tipo de servicio y un servicio «Creado» de ellos. */
export async function sembrarServicio(
  prisma: ReturnType<typeof crearClientePrisma>,
  dependencias: Dependencias,
  actor: Actor,
  responsableId: string,
): Promise<string> {
  const abm = crearCasosUsoAbm(dependencias);
  const cliente = await abm.crear(actor, CLIENTES, {
    razonSocial: "Minera Ejemplo S.A.",
    cuit: "30-00000001-5",
    condicionIva: "responsable_inscripto",
    domicilio: "Calle Falsa 123",
    localidad: "Ciudad Ejemplo",
    provincia: "cordoba",
    codigoPostal: "X5000",
    esCliente: "si",
    esProveedor: "",
  });
  const tipo = await abm.crear(actor, TIPOS_DE_SERVICIO, {
    nombre: "Auditoría de ejemplo",
    descripcion: "",
    modalidad: "puntual",
    activo: "si",
  });
  if (!cliente.ok || !tipo.ok) {
    throw new Error("no se pudo armar la base de la prueba");
  }
  return altaDeServicio(
    prisma,
    dependencias,
    actor,
    responsableId,
    "Auditoría de ejemplo",
  );
}

/**
 * Lleva el servicio por `recorrido` escribiendo sus eventos directo en el
 * repositorio, sin pasar por el recorrido del dominio ni por las causas: arma
 * la etapa que el test necesita, o un historial que hoy ya no se permite.
 */
export function llevarServicioA(
  transaccional: Transaccional,
  actor: Actor,
  id: string,
  recorrido: readonly EstadoServicio[],
  en: FechaHora,
): Promise<void> {
  return transaccional.ejecutar(async (repos) => {
    const eventos = await repos.servicios.eventosDe(id);
    let de = eventos.at(-1)?.a ?? null;
    for (const [indice, a] of recorrido.entries()) {
      await repos.servicios.agregarEvento(actor, id, {
        de,
        a,
        en,
        origen: "Armado por el test",
        posicion: eventos.length + indice,
      });
      de = a;
    }
  });
}

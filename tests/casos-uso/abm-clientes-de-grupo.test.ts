/**
 * Los clientes de un grupo vistos desde el grupo (F3-09), contra el Postgres de
 * verdad del arnés: agregar uno sin grupo, mover uno que ya tenía otro solo con
 * confirmación (sin ella no escribe nada) y sacarlo. Datos inventados.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { crearGeneradorIdCrypto } from "../../src/adaptadores/memoria/generador-id.ts";
import { crearClientePrisma } from "../../src/adaptadores/prisma/cliente.ts";
import { crearTransaccionalPrisma } from "../../src/adaptadores/prisma/transaccion.ts";
import { crearCasosUsoAbm } from "../../src/casos-uso/abm/abm.ts";
import { CLIENTES } from "../../src/casos-uso/abm/clientes.ts";
import { crearCasosUsoClientesDeGrupo } from "../../src/casos-uso/abm/clientes-de-grupo.ts";
import { GRUPOS } from "../../src/casos-uso/abm/grupos.ts";
import type { Actor } from "../../src/dominio/compartido/actor.ts";
import {
  crearFechaHora,
  RelojFijo,
} from "../../src/dominio/compartido/reloj.ts";
import { ADMIN_UNO, sembrarUsuarios } from "./_arnes/administradores.ts";
import { limpiarBase, uriBaseCompartida } from "./_arnes/base.ts";

const REVOCADO = {
  email: "ex.operador@ejemplo.test",
  rol: "operador",
  estado: "revocado",
} as const;

let prisma: ReturnType<typeof crearClientePrisma> | undefined;
let admin: Actor;
let revocado: Actor;

function cliente(): ReturnType<typeof crearClientePrisma> {
  expect(prisma, "el cliente de Prisma no se armó").toBeDefined();
  return prisma as ReturnType<typeof crearClientePrisma>;
}

const AHORA = (() => {
  const resultado = crearFechaHora({
    anio: 2031,
    mes: 7,
    dia: 9,
    hora: 10,
    minuto: 30,
    segundo: 0,
    milisegundo: 0,
  });
  if (!resultado.ok) {
    throw new Error(resultado.mensaje);
  }
  return resultado.fechaHora;
})();

function dependencias() {
  return {
    transaccional: crearTransaccionalPrisma(cliente()),
    reloj: RelojFijo(AHORA),
    generadorId: crearGeneradorIdCrypto(),
  };
}

function abm() {
  return crearCasosUsoAbm(dependencias());
}

function casos() {
  return crearCasosUsoClientesDeGrupo(dependencias());
}

async function altaDeGrupo(nombre: string): Promise<string> {
  const resultado = await abm().crear(admin, GRUPOS, {
    nombre,
    observaciones: "",
  });
  if (!resultado.ok) {
    throw new Error(`el alta del grupo "${nombre}" no pasó`);
  }
  return resultado.registro.valor.id;
}

async function altaDeCliente(
  razonSocial: string,
  cuit: string,
  grupoId = "",
): Promise<string> {
  const resultado = await abm().crear(admin, CLIENTES, {
    razonSocial,
    cuit,
    condicionIva: "responsable_inscripto",
    domicilio: "Calle Falsa 123",
    localidad: "Ciudad Ejemplo",
    provincia: "cordoba",
    codigoPostal: "X5000",
    esCliente: "si",
    grupoId,
  });
  if (!resultado.ok) {
    throw new Error(
      `el alta del cliente no pasó: ${JSON.stringify(resultado.errores)}`,
    );
  }
  return resultado.registro.valor.id;
}

async function grupoDe(clienteId: string): Promise<string | null | undefined> {
  const fila = await cliente().cliente.findUnique({
    where: { id: clienteId },
  });
  return fila?.grupoId;
}

function auditorias() {
  return cliente().auditoria.count({ where: { entidad: "Cliente" } });
}

describe("los clientes de un grupo, desde el grupo", () => {
  let norte: string;
  let sur: string;
  let sinGrupo: string;
  let enNorte: string;
  let enSur: string;

  beforeAll(() => {
    prisma = crearClientePrisma(uriBaseCompartida());
  });

  beforeEach(async () => {
    await limpiarBase();
    const sembrados = await sembrarUsuarios(cliente(), [ADMIN_UNO, REVOCADO]);
    const [uno, dos] = sembrados;
    if (uno === undefined || dos === undefined) {
      throw new Error("faltan usuarios sembrados");
    }
    admin = { tipo: "persona", usuarioId: uno.id };
    revocado = { tipo: "persona", usuarioId: dos.id };
    norte = await altaDeGrupo("Grupo Norte");
    sur = await altaDeGrupo("Grupo Sur");
    sinGrupo = await altaDeCliente("Empresa Ejemplo Uno S.A.", "30000000015");
    enNorte = await altaDeCliente(
      "Empresa Ejemplo Dos S.R.L.",
      "30000000023",
      norte,
    );
    enSur = await altaDeCliente(
      "Empresa Ejemplo Tres S.A.",
      "30000000031",
      sur,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("la pantalla del grupo lista sus clientes, y ofrece primero los sin grupo y después los de otro grupo, con su nombre", async () => {
    const pantalla = await casos().pantalla(norte);

    expect(pantalla.grupo).toMatchObject({ id: norte, nombre: "Grupo Norte" });
    expect(pantalla.clientes).toEqual([
      {
        id: enNorte,
        razonSocial: "Empresa Ejemplo Dos S.R.L.",
        cuit: "30-00000002-3",
      },
    ]);
    expect(pantalla.candidatos).toEqual([
      { id: sinGrupo, razonSocial: "Empresa Ejemplo Uno S.A.", grupo: null },
      {
        id: enSur,
        razonSocial: "Empresa Ejemplo Tres S.A.",
        grupo: "Grupo Sur",
      },
    ]);
  });

  test("agrega un cliente sin grupo: queda en el grupo, con su auditoría", async () => {
    const antes = await auditorias();

    const resultado = await casos().agregarClienteAGrupo(
      admin,
      norte,
      sinGrupo,
      false,
    );

    expect(resultado).toEqual({ ok: true });
    expect(await grupoDe(sinGrupo)).toBe(norte);
    expect(await auditorias()).toBe(antes + 1);
  });

  test("agregar uno que ya está en ese grupo no escribe nada", async () => {
    const antes = await auditorias();

    const resultado = await casos().agregarClienteAGrupo(
      admin,
      norte,
      enNorte,
      false,
    );

    expect(resultado).toEqual({ ok: true });
    expect(await auditorias()).toBe(antes);
  });

  test("agregar uno que tiene otro grupo, sin confirmar, dice cuál tiene y no escribe nada", async () => {
    const antes = await auditorias();

    const resultado = await casos().agregarClienteAGrupo(
      admin,
      norte,
      enSur,
      false,
    );

    expect(resultado).toEqual({ ok: false, grupoActual: "Grupo Sur" });
    expect(await grupoDe(enSur)).toBe(sur);
    expect(await auditorias()).toBe(antes);
  });

  test("con la confirmación, lo mueve", async () => {
    const resultado = await casos().agregarClienteAGrupo(
      admin,
      norte,
      enSur,
      true,
    );

    expect(resultado).toEqual({ ok: true });
    expect(await grupoDe(enSur)).toBe(norte);
  });

  test("un cliente dado de baja no se acepta (DOM-0009) ni se ofrece", async () => {
    await abm().marcarEliminado(admin, CLIENTES, sinGrupo);

    await expect(
      casos().agregarClienteAGrupo(admin, norte, sinGrupo, false),
    ).rejects.toMatchObject({ codigo: "DOM-0009" });
    const { candidatos } = await casos().pantalla(norte);
    expect(candidatos.map(({ id }) => id)).not.toContain(sinGrupo);
  });

  test("saca un cliente del grupo; sacar uno que está en otro grupo no lo toca", async () => {
    await casos().sacarClienteDeGrupo(admin, norte, enNorte);
    expect(await grupoDe(enNorte)).toBeNull();

    const antes = await auditorias();
    await casos().sacarClienteDeGrupo(admin, norte, enSur);
    expect(await grupoDe(enSur)).toBe(sur);
    expect(await auditorias()).toBe(antes);
  });

  test("quien no puede escribir (AUT-0009) no agrega ni saca", async () => {
    const antes = await auditorias();

    await expect(
      casos().agregarClienteAGrupo(revocado, norte, sinGrupo, false),
    ).rejects.toMatchObject({ codigo: "AUT-0009" });
    await expect(
      casos().sacarClienteDeGrupo(revocado, norte, enNorte),
    ).rejects.toMatchObject({ codigo: "AUT-0009" });
    expect(await auditorias()).toBe(antes);
    expect(await grupoDe(enNorte)).toBe(norte);
  });
});

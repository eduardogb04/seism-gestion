/**
 * El mecanismo de semilla (F0-10): `npm run db:seed` lo corre después de
 * validar el entorno (`scripts/db-seed.ts`). Acá solo vive **el mecanismo**:
 * los casos reales de la empresa son Fase 1.
 *
 * Desde F0-30 también da de alta al **primer administrador** (el email de
 * `ADMIN_INICIAL_EMAIL`), si no existe: es el único usuario que no crea
 * otro administrador, y por eso no pasa por `darDeAlta` (que exige una
 * persona administradora) sino por este camino aparte, con el actor de
 * sistema `db-seed` (ADR 0024).
 *
 * Desde F1-03, los **datos de demostración**: tres grupos inventados (y, desde
 * F1-04, cuatro clientes; desde F1-05, cinco sitios; desde F1-06, cuatro camiones; desde F1-07, los cinco tipos de servicio; desde F2-01, los cinco centros de costo; desde F2-02, las cuatro cuentas; desde F2-03, seis egresos en pesos y en dólares; desde F2-04, cuatro servicios en distintos estados, por su repositorio), por el repositorio del molde de ABM (ADR 0031), con
 * el actor `db-seed` y su auditoría. En el servidor (`appEntorno`) no van.
 *
 * Importa de `adaptadores` (el cliente de Prisma y los repositorios) y del
 * dominio; nada de entorno: la validación de entorno, el reloj del sistema y
 * el permiso para correr en el servidor viven en `scripts/db-seed.ts`, no
 * acá. Así `sembrar` se prueba sola, dos veces seguidas contra un Postgres
 * real, sin nada de eso en el medio (`tests/casos-uso/seed.test.ts` y
 * `tests/casos-uso/usuarios-semilla.test.ts`).
 *
 * **Las semillas de Fase 1 serán ficticias**: clientes, sitios, personas y
 * montos inventados que respeten la forma de los casos reales de la empresa,
 * sin nombrar ninguno. El repo es público (P14, AGENTS.md regla 1): ni un
 * dato real entra acá, ni ahora ni en Fase 1.
 */

import { crearGeneradorIdCrypto } from "../src/adaptadores/memoria/generador-id.ts";
import { repositorioAbmPrisma } from "../src/adaptadores/prisma/abm/tablas.ts";
import type { PrismaClient } from "../src/adaptadores/prisma/generado/client.ts";
import { crearSecuenciasPrisma } from "../src/adaptadores/prisma/secuencias.ts";
import { crearRepositorioServiciosPrisma } from "../src/adaptadores/prisma/servicios.ts";
import { crearRepositorioUsuariosPrisma } from "../src/adaptadores/prisma/usuarios.ts";
import {
  type Actor,
  crearNombreProceso,
} from "../src/dominio/compartido/actor.ts";
import { crearAuditable } from "../src/dominio/compartido/auditable.ts";
import { catalogo } from "../src/dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../src/dominio/compartido/errores/error-sistema.ts";
import {
  generarCodigoLegible,
  identificadorDesde,
} from "../src/dominio/compartido/identificador.ts";
import {
  crearImporte,
  type Moneda,
} from "../src/dominio/compartido/importe.ts";
import { type Reloj, RelojFijo } from "../src/dominio/compartido/reloj.ts";
import {
  cicloServicio,
  ESTADO_INICIAL,
  type EstadoServicio,
  PREFIJO_DE_CODIGO,
} from "../src/dominio/servicios/estados.ts";
import type { DatosAbm } from "../src/puertos/repositorios/abm.ts";
import type { DatosUsuario } from "../src/puertos/repositorios/usuarios.ts";

/** Lo que la semilla necesita de afuera: lo arma `scripts/db-seed.ts`. */
export type OpcionesSemilla = {
  /** `ADMIN_INICIAL_EMAIL`, ya validado como email. */
  readonly adminInicialEmail: string;
  readonly reloj: Reloj;
  /** `APP_ENTORNO`: los datos de demostración no se siembran en `servidor`. */
  readonly appEntorno: "local" | "ci" | "servidor";
};

/** El actor de lo que crea la semilla. */
function actorSemilla(): Actor {
  const proceso = crearNombreProceso("db-seed");
  if (!proceso.ok) {
    throw nuevoError(catalogo.INF_0001, { motivo: proceso.error });
  }
  return { tipo: "sistema", proceso: proceso.valor };
}

/** Claves de `configuracion` con su valor por defecto. */
const CONFIGURACION_POR_DEFECTO: ReadonlyArray<{
  readonly clave: string;
  readonly valor: string;
}> = [
  // IA (F0-28, ADR 0026): dólares con punto decimal, hasta seis decimales.
  // Valores inventados de arranque.
  // El tope de gasto del mes: si el gasto del mes más el costo estimado de
  // la llamada lo supera, `interpretar` no llama y lanza IA-0001.
  { clave: "ia.tope_mensual_usd", valor: "10.00" },
  // Costo estimado de una llamada, para el perfil que no tenga su propia
  // clave `ia.costo_estimado_usd.<perfil>`.
  { clave: "ia.costo_estimado_usd.defecto", valor: "0.01" },
];

/**
 * Inserta las claves de `configuracion` que todavía no existen y actualiza
 * las que cambiaron de valor. **Idempotente**: si una clave ya tiene el valor
 * por defecto, no la toca (ni una escritura), así correrla dos veces deja la
 * base exactamente igual, `id` y `creado_en` incluidos. Después, el
 * administrador inicial (`sembrarAdministradorInicial`), también idempotente.
 */
export async function sembrar(
  prisma: PrismaClient,
  opciones: OpcionesSemilla,
): Promise<void> {
  for (const { clave, valor } of CONFIGURACION_POR_DEFECTO) {
    const existente = await prisma.configuracion.findUnique({
      where: { clave },
    });
    if (existente === null) {
      await prisma.configuracion.create({ data: { clave, valor } });
    } else if (existente.valor !== valor) {
      await prisma.configuracion.update({ where: { clave }, data: { valor } });
    }
  }
  await sembrarAdministradorInicial(prisma, opciones);
  if (opciones.appEntorno !== "servidor") {
    await sembrarGruposDeDemostracion(prisma, opciones.reloj);
    await sembrarClientesDeDemostracion(prisma, opciones.reloj);
    await sembrarSitiosDeDemostracion(prisma, opciones.reloj);
    await sembrarCamionesDeDemostracion(prisma, opciones.reloj);
    await sembrarTiposDeServicio(prisma, opciones.reloj);
    await sembrarCentrosDeCosto(prisma, opciones.reloj);
    await sembrarCuentas(prisma, opciones.reloj);
    await sembrarEgresos(prisma, opciones.reloj);
    await sembrarServicios(prisma, opciones);
  }
}

/** Inventados y genéricos: no nombran a nadie (AGENTS.md, regla 1). */
const GRUPOS_DE_DEMOSTRACION = ["Grupo Norte", "Grupo Centro", "Grupo Sur"];

/**
 * Da de alta cada grupo de demostración si **nunca hubo** uno con ese nombre:
 * a uno que alguien cambió o dio de baja no lo repone.
 */
async function sembrarGruposDeDemostracion(
  prisma: PrismaClient,
  reloj: Reloj,
): Promise<void> {
  const actor = actorSemilla();
  await prisma.$transaction(async (tx) => {
    const grupos = repositorioAbmPrisma(tx, "Grupo");
    for (const nombre of GRUPOS_DE_DEMOSTRACION) {
      if ((await tx.grupo.findFirst({ where: { nombre } })) !== null) {
        continue;
      }
      await grupos.crear(
        actor,
        crearAuditable(
          {
            id: identificadorDesde<string>(crearGeneradorIdCrypto().generar()),
            nombre,
            observaciones: null,
          },
          actor,
          reloj,
        ),
      );
    }
  });
}

type DatosCliente = DatosAbm<"Cliente">;

/** Lo común a los clientes de demostración; cada uno cambia lo suyo. */
const CLIENTE_BASE: DatosCliente = {
  razonSocial: "",
  cuit: "",
  condicionIva: "responsable_inscripto",
  domicilio: "Calle Falsa 123",
  localidad: "Ciudad Ejemplo",
  provincia: "cordoba",
  codigoPostal: "X5000",
  esCliente: true,
  esProveedor: false,
  nombreCorto: null,
  grupoId: null,
  contactoNombre: null,
  contactoTelefono: null,
  contactoEmail: null,
  emailFacturacion: null,
  observaciones: null,
};

/** Inventados: los CUIT tienen cuerpo `30-0000000x` y su dígito calculado. */
const CLIENTES_DE_DEMOSTRACION: readonly {
  readonly datos: Partial<DatosCliente>;
  readonly grupo: string | null;
}[] = [
  {
    datos: {
      razonSocial: "Empresa Ejemplo Uno S.A.",
      cuit: "30000000015",
      nombreCorto: "Ejemplo Uno",
      contactoNombre: "Persona de Ejemplo",
      contactoEmail: "contacto@ejemplo.test",
      emailFacturacion: "facturas@ejemplo.test",
    },
    grupo: "Grupo Norte",
  },
  {
    datos: {
      razonSocial: "Empresa Ejemplo Dos S.R.L.",
      cuit: "30000000023",
      condicionIva: "monotributo",
      provincia: "santa_fe",
      localidad: "Pueblo Ejemplo",
      codigoPostal: "S2000",
    },
    grupo: null,
  },
  {
    datos: {
      razonSocial: "Servicios Ejemplo Tres S.A.",
      cuit: "30000000031",
      esProveedor: true,
    },
    grupo: "Grupo Centro",
  },
  {
    datos: {
      razonSocial: "Proveedora Ejemplo Cinco S.A.",
      cuit: "30000000058",
      esCliente: false,
      esProveedor: true,
      provincia: "mendoza",
      codigoPostal: "M5500",
    },
    grupo: null,
  },
];

/**
 * Da de alta cada cliente de demostración si **nunca hubo** uno con ese CUIT
 * (como los grupos), con su grupo si ese grupo sigue existiendo.
 */
async function sembrarClientesDeDemostracion(
  prisma: PrismaClient,
  reloj: Reloj,
): Promise<void> {
  const actor = actorSemilla();
  await prisma.$transaction(async (tx) => {
    const clientes = repositorioAbmPrisma(tx, "Cliente");
    for (const { datos, grupo } of CLIENTES_DE_DEMOSTRACION) {
      const cuit = datos.cuit ?? "";
      if ((await tx.cliente.findFirst({ where: { cuit } })) !== null) {
        continue;
      }
      const grupoVigente =
        grupo === null
          ? null
          : await tx.grupo.findFirst({
              where: { nombre: grupo, eliminadoEn: null },
            });
      await clientes.crear(
        actor,
        crearAuditable(
          {
            ...CLIENTE_BASE,
            ...datos,
            grupoId: grupoVigente?.id ?? null,
            id: identificadorDesde<string>(crearGeneradorIdCrypto().generar()),
          },
          actor,
          reloj,
        ),
      );
    }
  });
}

const TIPOS_DE_SERVICIO_DE_DEMOSTRACION: readonly {
  readonly nombre: string;
  readonly descripcion: string;
  readonly modalidad: "puntual" | "recurrente";
}[] = [
  {
    nombre: "Auditoría de tanques",
    descripcion: "Relevamiento y verificación del estado de tanques.",
    modalidad: "puntual",
  },
  {
    nombre: "Logística",
    descripcion: "Traslado y coordinación de cargas.",
    modalidad: "puntual",
  },
  {
    nombre: "Certificación de camiones",
    descripcion: "Verificación y certificación de camiones.",
    modalidad: "puntual",
  },
  {
    nombre: "Informes",
    descripcion: "Informes técnicos a pedido.",
    modalidad: "puntual",
  },
  {
    nombre: "Servicio de operación / alquiler de tanques",
    descripcion: "Operación o alquiler de tanques, con servicio continuo.",
    modalidad: "recurrente",
  },
];

/** Da de alta cada tipo de servicio si **nunca hubo** uno con ese nombre (como los grupos). */
async function sembrarTiposDeServicio(
  prisma: PrismaClient,
  reloj: Reloj,
): Promise<void> {
  const actor = actorSemilla();
  await prisma.$transaction(async (tx) => {
    const tipos = repositorioAbmPrisma(tx, "TipoServicio");
    for (const datos of TIPOS_DE_SERVICIO_DE_DEMOSTRACION) {
      if (
        (await tx.tipoServicio.findFirst({
          where: { nombre: datos.nombre },
        })) !== null
      ) {
        continue;
      }
      await tipos.crear(
        actor,
        crearAuditable(
          {
            ...datos,
            activo: true,
            id: identificadorDesde<string>(crearGeneradorIdCrypto().generar()),
          },
          actor,
          reloj,
        ),
      );
    }
  });
}

const CUENTAS_DE_DEMOSTRACION: readonly {
  readonly nombre: string;
  readonly tipo: "banco" | "efectivo";
  readonly moneda: Moneda;
}[] = [
  {
    nombre: "Banco Ejemplo Uno — cuenta corriente",
    tipo: "banco",
    moneda: "ARS",
  },
  {
    nombre: "Banco Ejemplo Dos — cuenta corriente",
    tipo: "banco",
    moneda: "ARS",
  },
  { nombre: "Banco Ejemplo Uno — dólares", tipo: "banco", moneda: "USD" },
  { nombre: "Caja", tipo: "efectivo", moneda: "ARS" },
];

/** Da de alta cada cuenta si **nunca hubo** una con ese nombre (como los grupos). */
async function sembrarCuentas(
  prisma: PrismaClient,
  reloj: Reloj,
): Promise<void> {
  const actor = actorSemilla();
  await prisma.$transaction(async (tx) => {
    const cuentas = repositorioAbmPrisma(tx, "Cuenta");
    for (const datos of CUENTAS_DE_DEMOSTRACION) {
      if (
        (await tx.cuenta.findFirst({ where: { nombre: datos.nombre } })) !==
        null
      ) {
        continue;
      }
      await cuentas.crear(
        actor,
        crearAuditable(
          {
            ...datos,
            observaciones: null,
            activa: true,
            id: identificadorDesde<string>(crearGeneradorIdCrypto().generar()),
          },
          actor,
          reloj,
        ),
      );
    }
  });
}

/**
 * Da de alta el administrador inicial si **no hay ningún usuario con ese
 * email** (sin distinguir mayúsculas), con su auditoría, en una transacción.
 * Si ya existe —con cualquier rol o estado— no lo toca: la semilla no
 * reactiva a un revocado ni le devuelve el rol a nadie. A los demás usuarios
 * no los mira.
 */
async function sembrarAdministradorInicial(
  prisma: PrismaClient,
  { adminInicialEmail, reloj }: OpcionesSemilla,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const usuarios = crearRepositorioUsuariosPrisma(tx);
    if ((await usuarios.buscarPorEmail(adminInicialEmail)) !== null) {
      return;
    }
    const actor = actorSemilla();
    const admin = crearAuditable<DatosUsuario>(
      {
        id: identificadorDesde<"Usuario">(crearGeneradorIdCrypto().generar()),
        email: adminInicialEmail.trim().toLowerCase(),
        nombre: null,
        rol: "administrador",
        estado: "activo",
      },
      actor,
      reloj,
    );
    await usuarios.crear(actor, admin);
  });
}

const CENTROS_DE_COSTO_DE_DEMOSTRACION: readonly {
  readonly nombre: string;
  readonly clase: string;
  readonly descripcion: string;
}[] = [
  {
    nombre: "Servicios a clientes",
    clase: "proyecto",
    descripcion: "Gastos de los servicios que se facturan a clientes.",
  },
  {
    nombre: "Administración",
    clase: "gestion_administrativa",
    descripcion: "Gastos generales de la administración.",
  },
  {
    nombre: "Vehículos",
    clase: "gestion_administrativa",
    descripcion: "Combustible, patentes y mantenimiento de los vehículos.",
  },
  {
    nombre: "Capacitaciones",
    clase: "fuera_de_rentabilidad",
    descripcion: "Cursos y formación del personal.",
  },
  {
    nombre: "Compra de activos",
    clase: "fuera_de_rentabilidad",
    descripcion: "Equipamiento y bienes de uso.",
  },
];

/** Da de alta cada centro de costo si **nunca hubo** uno con ese nombre (como los grupos). */
async function sembrarCentrosDeCosto(
  prisma: PrismaClient,
  reloj: Reloj,
): Promise<void> {
  const actor = actorSemilla();
  await prisma.$transaction(async (tx) => {
    const centros = repositorioAbmPrisma(tx, "CentroCosto");
    for (const datos of CENTROS_DE_COSTO_DE_DEMOSTRACION) {
      if (
        (await tx.centroCosto.findFirst({
          where: { nombre: datos.nombre },
        })) !== null
      ) {
        continue;
      }
      await centros.crear(
        actor,
        crearAuditable(
          {
            ...datos,
            activo: true,
            id: identificadorDesde<string>(crearGeneradorIdCrypto().generar()),
          },
          actor,
          reloj,
        ),
      );
    }
  });
}

type DatosSitio = DatosAbm<"Sitio">;

/** Lo común a los sitios de demostración; cada uno cambia lo suyo. */
const SITIO_BASE: Omit<DatosSitio, "clienteId"> = {
  nombre: "",
  provincia: "cordoba",
  localidad: "Villa Ejemplo",
  direccion: null,
  latitud: null,
  longitud: null,
  cantidadTanques: 1,
  capacidadTotalLitros: 20000,
  observaciones: null,
};

/** Inventados y evidentemente ficticios; solo el primero lleva coordenadas, redondas. */
const SITIOS_DE_DEMOSTRACION: readonly {
  readonly cuit: string;
  readonly datos: Partial<DatosSitio>;
}[] = [
  {
    cuit: "30000000015",
    datos: {
      nombre: "Planta Ejemplo Norte",
      direccion: "Ruta Ficticia km 10",
      latitud: -30,
      longitud: -65,
      cantidadTanques: 4,
      capacidadTotalLitros: 120000,
    },
  },
  {
    cuit: "30000000015",
    datos: {
      nombre: "Planta Ejemplo Sur",
      localidad: "Pueblo Ejemplo",
      cantidadTanques: 2,
      capacidadTotalLitros: 40000,
    },
  },
  {
    cuit: "30000000023",
    datos: {
      nombre: "Estación Ejemplo Este",
      provincia: "santa_fe",
      localidad: "Pueblo Ejemplo",
      cantidadTanques: 3,
      capacidadTotalLitros: 60000,
    },
  },
  {
    cuit: "30000000023",
    datos: { nombre: "Depósito Ejemplo", provincia: "santa_fe" },
  },
  {
    cuit: "30000000031",
    datos: {
      nombre: "Base Ejemplo Centro",
      cantidadTanques: 6,
      capacidadTotalLitros: 250000,
    },
  },
];

/**
 * Da de alta cada sitio de demostración si **nunca hubo** uno con ese nombre
 * para ese cliente (como los grupos), siempre que el cliente siga vigente.
 */
async function sembrarSitiosDeDemostracion(
  prisma: PrismaClient,
  reloj: Reloj,
): Promise<void> {
  const actor = actorSemilla();
  await prisma.$transaction(async (tx) => {
    const sitios = repositorioAbmPrisma(tx, "Sitio");
    for (const { cuit, datos } of SITIOS_DE_DEMOSTRACION) {
      const cliente = await tx.cliente.findFirst({
        where: { cuit, eliminadoEn: null },
      });
      const nombre = datos.nombre ?? "";
      if (
        cliente === null ||
        (await tx.sitio.findFirst({
          where: { clienteId: cliente.id, nombre },
        })) !== null
      ) {
        continue;
      }
      await sitios.crear(
        actor,
        crearAuditable(
          {
            ...SITIO_BASE,
            ...datos,
            clienteId: cliente.id,
            id: identificadorDesde<string>(crearGeneradorIdCrypto().generar()),
          },
          actor,
          reloj,
        ),
      );
    }
  });
}

type DatosCamion = DatosAbm<"Camion">;

/** Lo común a los camiones de demostración; cada uno cambia lo suyo. */
const CAMION_BASE: Omit<DatosCamion, "clienteId" | "patenteTractor"> = {
  tipo: "semi_con_cisterna",
  marcaTractor: "Marca Ejemplo",
  anioTractor: 2018,
  patenteCisterna: null,
  marcaCisterna: "Marca Ejemplo",
  anioCisterna: 2021,
  capacidadLitros: 30000,
  observaciones: null,
};

/** Inventados: patentes `ZZ…ZZ`, marcas genéricas. Dos semis, un chasis y un otro. */
const CAMIONES_DE_DEMOSTRACION: readonly {
  readonly cuit: string;
  readonly datos: Partial<DatosCamion> & Pick<DatosCamion, "patenteTractor">;
}[] = [
  {
    cuit: "30000000015",
    datos: { patenteTractor: "ZZ001ZZ", patenteCisterna: "ZZ101ZZ" },
  },
  {
    cuit: "30000000015",
    datos: {
      patenteTractor: "ZZ002ZZ",
      patenteCisterna: "ZZ102ZZ",
      anioTractor: 2012,
      anioCisterna: 2015,
      capacidadLitros: 36000,
    },
  },
  {
    cuit: "30000000023",
    datos: {
      patenteTractor: "ZZ003ZZ",
      tipo: "chasis",
      anioTractor: 2020,
      marcaCisterna: null,
      anioCisterna: null,
      capacidadLitros: 12000,
    },
  },
  {
    cuit: "30000000031",
    datos: {
      patenteTractor: "ZZ004ZZ",
      tipo: "otro",
      marcaCisterna: null,
      anioCisterna: null,
      capacidadLitros: 8000,
      observaciones: "Camión de demostración",
    },
  },
];

/**
 * Da de alta cada camión de demostración si **nunca hubo** uno con esa patente
 * de tractor (como los sitios), siempre que el cliente siga vigente.
 */
async function sembrarCamionesDeDemostracion(
  prisma: PrismaClient,
  reloj: Reloj,
): Promise<void> {
  const actor = actorSemilla();
  await prisma.$transaction(async (tx) => {
    const camiones = repositorioAbmPrisma(tx, "Camion");
    for (const { cuit, datos } of CAMIONES_DE_DEMOSTRACION) {
      const cliente = await tx.cliente.findFirst({
        where: { cuit, eliminadoEn: null },
      });
      if (
        cliente === null ||
        (await tx.camion.findFirst({
          where: { patenteTractor: datos.patenteTractor },
        })) !== null
      ) {
        continue;
      }
      await camiones.crear(
        actor,
        crearAuditable(
          {
            ...CAMION_BASE,
            ...datos,
            clienteId: cliente.id,
            id: identificadorDesde<string>(crearGeneradorIdCrypto().generar()),
          },
          actor,
          reloj,
        ),
      );
    }
  });
}

/** Inventados: conceptos genéricos y montos redondos, en pesos y en dólares, de dos meses y de distintos centros. */
const EGRESOS_DE_DEMOSTRACION: readonly {
  readonly fecha: string;
  readonly concepto: string;
  readonly centro: string;
  readonly cuitProveedor: string | null;
  readonly numeroComprobante: string | null;
  readonly centavos: bigint;
  readonly moneda: Moneda;
  readonly vencimiento: string | null;
}[] = [
  {
    fecha: "2026-09-03",
    concepto: "Combustible",
    centro: "Vehículos",
    cuitProveedor: null,
    numeroComprobante: null,
    centavos: 15_000_000n,
    moneda: "ARS",
    vencimiento: null,
  },
  {
    fecha: "2026-09-15",
    concepto: "Honorarios contables",
    centro: "Administración",
    cuitProveedor: "30000000031",
    numeroComprobante: "0001-00000010",
    centavos: 50_000_000n,
    moneda: "ARS",
    vencimiento: "2026-09-30",
  },
  {
    fecha: "2026-09-22",
    concepto: "Curso de capacitación",
    centro: "Capacitaciones",
    cuitProveedor: "30000000058",
    numeroComprobante: "0002-00000020",
    centavos: 80_000n,
    moneda: "USD",
    vencimiento: "2026-10-10",
  },
  {
    fecha: "2026-10-01",
    concepto: "Repuestos para el servicio",
    centro: "Servicios a clientes",
    cuitProveedor: "30000000058",
    numeroComprobante: "0002-00000021",
    centavos: 32_500_000n,
    moneda: "ARS",
    vencimiento: null,
  },
  {
    fecha: "2026-10-05",
    concepto: "Notebook para el equipo",
    centro: "Compra de activos",
    cuitProveedor: null,
    numeroComprobante: null,
    centavos: 120_000n,
    moneda: "USD",
    vencimiento: null,
  },
  {
    fecha: "2026-10-12",
    concepto: "Combustible",
    centro: "Vehículos",
    cuitProveedor: null,
    numeroComprobante: null,
    centavos: 18_000_000n,
    moneda: "ARS",
    vencimiento: null,
  },
];

/** Da de alta cada egreso de demostración si **nunca hubo** uno con esa fecha y ese concepto. */
async function sembrarEgresos(
  prisma: PrismaClient,
  reloj: Reloj,
): Promise<void> {
  const actor = actorSemilla();
  await prisma.$transaction(async (tx) => {
    const egresos = repositorioAbmPrisma(tx, "Egreso");
    for (const demo of EGRESOS_DE_DEMOSTRACION) {
      const centro = await tx.centroCosto.findFirst({
        where: { nombre: demo.centro, eliminadoEn: null },
      });
      const proveedor =
        demo.cuitProveedor === null
          ? null
          : await tx.cliente.findFirst({
              where: { cuit: demo.cuitProveedor, eliminadoEn: null },
            });
      if (
        centro === null ||
        (await tx.egreso.findFirst({
          where: {
            fecha: new Date(`${demo.fecha}T00:00:00.000Z`),
            concepto: demo.concepto,
          },
        })) !== null
      ) {
        continue;
      }
      await egresos.crear(
        actor,
        crearAuditable(
          {
            fecha: demo.fecha,
            concepto: demo.concepto,
            centroCostoId: centro.id,
            proveedorId: proveedor?.id ?? null,
            numeroComprobante: demo.numeroComprobante,
            importe: crearImporte(demo.centavos, demo.moneda),
            vencimiento: demo.vencimiento,
            observaciones: null,
            id: identificadorDesde<string>(crearGeneradorIdCrypto().generar()),
          },
          actor,
          reloj,
        ),
      );
    }
  });
}

/** Inventados: `estados` son los cambios después del alta, en orden. */
const SERVICIOS_DE_DEMOSTRACION: readonly {
  readonly cuit: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly fechaPedido: string;
  readonly vigencia: readonly [desde: string, hasta: string] | null;
  readonly estados: readonly EstadoServicio[];
  readonly sitios: readonly string[];
}[] = [
  {
    cuit: "30000000015",
    tipo: "Auditoría de tanques",
    titulo: "Auditoría de tanques — ejemplo",
    fechaPedido: "2026-09-28",
    vigencia: null,
    estados: [],
    sitios: ["Planta Ejemplo Norte", "Planta Ejemplo Sur"],
  },
  {
    cuit: "30000000023",
    tipo: "Certificación de camiones",
    titulo: "Certificación de camiones — ejemplo",
    fechaPedido: "2026-09-15",
    vigencia: null,
    estados: ["cotizado"],
    sitios: [],
  },
  {
    cuit: "30000000031",
    tipo: "Servicio de operación / alquiler de tanques",
    titulo: "Operación de tanques — ejemplo",
    fechaPedido: "2026-08-03",
    vigencia: ["2026-09-01", "2027-08-31"],
    estados: ["cotizado", "adjudicado", "vigente"],
    sitios: [],
  },
  {
    cuit: "30000000015",
    tipo: "Informes",
    titulo: "Informe técnico — ejemplo",
    fechaPedido: "2026-07-06",
    vigencia: null,
    estados: ["cotizado", "adjudicado", "vigente", "cerrado"],
    sitios: [],
  },
];

/**
 * Da de alta cada servicio de demostración si **nunca hubo** uno con ese título
 * para ese cliente, con el administrador inicial de responsable, su código de
 * la secuencia y su historial de estados, por las reglas del ciclo.
 */
async function sembrarServicios(
  prisma: PrismaClient,
  { adminInicialEmail, reloj }: OpcionesSemilla,
): Promise<void> {
  const actor = actorSemilla();
  await prisma.$transaction(async (tx) => {
    const servicios = crearRepositorioServiciosPrisma(tx);
    const secuencias = crearSecuenciasPrisma(tx);
    const responsable =
      await crearRepositorioUsuariosPrisma(tx).buscarPorEmail(
        adminInicialEmail,
      );
    const ahora = reloj.ahora();
    for (const demo of SERVICIOS_DE_DEMOSTRACION) {
      const cliente = await tx.cliente.findFirst({
        where: { cuit: demo.cuit, eliminadoEn: null },
      });
      const tipo = await tx.tipoServicio.findFirst({
        where: { nombre: demo.tipo, eliminadoEn: null },
      });
      if (
        responsable === null ||
        cliente === null ||
        tipo === null ||
        (await tx.servicio.findFirst({
          where: { clienteId: cliente.id, titulo: demo.titulo },
        })) !== null
      ) {
        continue;
      }
      const codigo = generarCodigoLegible(RelojFijo(ahora), {
        prefijo: PREFIJO_DE_CODIGO,
        secuencia: await secuencias.siguiente(PREFIJO_DE_CODIGO, ahora.anio),
      });
      if (!codigo.ok) {
        throw nuevoError(catalogo.DOM_0006, { motivo: codigo.mensaje });
      }
      const id = identificadorDesde<string>(crearGeneradorIdCrypto().generar());
      await servicios.crear(
        actor,
        crearAuditable(
          {
            id,
            codigo: codigo.codigo,
            clienteId: cliente.id,
            tipoServicioId: tipo.id,
            titulo: demo.titulo,
            modalidad: demo.vigencia === null ? "puntual" : "recurrente",
            responsableId: responsable.valor.id,
            fechaPedido: demo.fechaPedido,
            vigenciaDesde: demo.vigencia?.[0] ?? null,
            vigenciaHasta: demo.vigencia?.[1] ?? null,
            observaciones: null,
          },
          actor,
          RelojFijo(ahora),
        ),
      );
      const marca = { en: ahora, actor, origen: null };
      let historial = cicloServicio.crear(ESTADO_INICIAL, marca);
      for (const estado of demo.estados) {
        const siguiente = cicloServicio.agregar(historial, estado, marca);
        if (!siguiente.ok) {
          throw nuevoError(catalogo.DOM_0011, { titulo: demo.titulo, estado });
        }
        historial = siguiente.valor;
      }
      for (const [posicion, evento] of historial.eventos.entries()) {
        await servicios.agregarEvento(actor, id, { ...evento, posicion });
      }
      const sitios = await tx.sitio.findMany({
        where: {
          clienteId: cliente.id,
          nombre: { in: [...demo.sitios] },
          eliminadoEn: null,
        },
      });
      if (sitios.length > 0) {
        await servicios.guardarSitios(
          actor,
          id,
          sitios.map((sitio) => sitio.id),
          ahora,
        );
      }
    }
  });
}

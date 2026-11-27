/**
 * La ficha de un cliente: encabezado con sus datos, cuatro métricas y pestañas
 * como enlaces (`?pestaña=`): Servicios, Sitios, Camiones, Plata y Actividad (los
 * sucesos propios y los de sus servicios, F4-05, ADR 0044). Edición, baja y la
 * carga o anulación de un suceso son ventanas sobre esta misma pantalla. HTML
 * del servidor: funciona sin JavaScript.
 */

import { Building2, HandCoins, History, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { CAMIONES } from "../../../../casos-uso/abm/camiones.ts";
import { CLIENTES } from "../../../../casos-uso/abm/clientes.ts";
import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../../../casos-uso/servicios/servicios.ts";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../../casos-uso/sesion/errores.ts";
import { formatearCuit } from "../../../../dominio/compartido/cuit.ts";
import { armado } from "../../../../infraestructura/arranque/armado.ts";
import { listadoDeServicios } from "../../../../server/servicios.ts";
import { diasHasta, fechaCorta, hoyISO } from "../../../_inicio/formato.ts";
import { Importe } from "../../../_plata/piezas.tsx";
import { type FilaPorVencer, PorVencer } from "../../../_plata/por-vencer.tsx";
import { clasesDeBoton } from "../../../_ui/boton.tsx";
import { cn } from "../../../_ui/cn.ts";
import { Enlace } from "../../../_ui/enlace-next.ts";
import { ErrorEnPantalla } from "../../../_ui/error-en-pantalla.tsx";
import { Marco } from "../../../_ui/marco.tsx";
import { TarjetaKpi } from "../../../_ui/tarjeta-kpi.tsx";
import { VentanaDeCobro } from "../../../_ui/ventana-de-movimiento.tsx";
import { sesionExigida } from "../../../(auth)/sesion-actual.ts";
import {
  VentanaDeAnulacion,
  VentanaDeCarga,
} from "../../../servicios/[id]/sucesos.tsx";
import { ContenidoDeVentana } from "../../_abm/paginas.tsx";
import {
  anioActual,
  diasDeAviso,
  estaVivo,
  textoDe,
  textosDe,
} from "../_datos.ts";
import {
  type CamionDeFicha,
  PestanaActividad,
  PestanaCamiones,
  PestanaServicios,
  PestanaSitios,
  type SitioDeFicha,
} from "../_ficha/pestanas.tsx";

type Props = {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PESTANAS = [
  "servicios",
  "sitios",
  "camiones",
  "plata",
  "actividad",
] as const;
type Pestana = (typeof PESTANAS)[number];
const TEXTO_DE_PESTANA: Record<Pestana, string> = {
  servicios: "Servicios",
  sitios: "Sitios",
  camiones: "Camiones",
  plata: "Plata",
  actividad: "Actividad",
};

const texto = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

const unaPalabra = (t: string) =>
  `${t.charAt(0).toUpperCase()}${t.slice(1).replaceAll("_", " ")}`;

function Menu({
  ruta,
  editar,
}: {
  readonly ruta: string;
  readonly editar: boolean;
}) {
  if (!editar) {
    return null;
  }
  return (
    <details className="relative">
      <summary
        aria-label="Más acciones"
        title="Más acciones"
        className={cn(
          clasesDeBoton("secundario", "w-9 px-0"),
          "list-none [&::-webkit-details-marker]:hidden",
        )}
      >
        <MoreHorizontal aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex w-44 flex-col rounded-tarjeta border border-borde bg-superficie p-1 shadow-flota">
        <Enlace
          href={`${ruta}?editar=1`}
          scroll={false}
          className="rounded-md px-3 py-2 text-texto no-underline hover:bg-superficie-2"
        >
          Editar
        </Enlace>
        <Enlace
          href={`${ruta}?baja=1`}
          scroll={false}
          className="rounded-md px-3 py-2 text-peligro no-underline hover:bg-peligro-suave"
        >
          Dar de baja
        </Enlace>
      </div>
    </details>
  );
}

export default async function FichaDeUnCliente({
  params,
  searchParams,
}: Props) {
  const sesion = await sesionExigida();
  const { id } = await params;
  const parametros = await searchParams;
  const { email, rol } = sesion.usuario;
  const ruta = `${CLIENTES.ruta}/${id}`;
  const puedeCargar = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  const puedeEditar = CLIENTES.rolesQueEscriben.includes(rol);
  const pedida = texto(parametros.pestaña);
  const activa: Pestana = (PESTANAS as readonly string[]).includes(pedida ?? "")
    ? (pedida as Pestana)
    : "servicios";
  const suceso = texto(parametros.suceso);
  const anularSuceso = texto(parametros.anularSuceso);
  const cobrar = texto(parametros.cobrar);
  const ventana = texto(parametros.editar)
    ? ("editar" as const)
    : texto(parametros.baja)
      ? ("baja" as const)
      : null;

  let contenido: ReactNode;
  try {
    const { prisma, sucesos, cobros } = armado();
    const ficha = await sucesos.delCliente(id);
    const hoy = hoyISO();
    const [cliente, { servicios }, porCobrar, sitios, camiones, avisoDias] =
      await Promise.all([
        prisma.cliente.findFirstOrThrow({
          where: { id, eliminadoEn: null },
          select: {
            cuit: true,
            contactoNombre: true,
            contactoTelefono: true,
            contactoEmail: true,
            grupo: { select: { nombre: true } },
          },
        }),
        listadoDeServicios({
          buscar: "",
          clienteId: id,
          responsableId: "",
          tipoId: "",
        }),
        cobros.porCobrar({}),
        prisma.sitio.findMany({
          where: { clienteId: id, eliminadoEn: null },
          orderBy: { nombre: "asc" },
        }),
        prisma.camion.findMany({
          where: { clienteId: id, eliminadoEn: null },
          orderBy: { patenteTractor: "asc" },
          include: {
            vencimientos: {
              where: { eliminadoEn: null, estado: "pendiente" },
              orderBy: { fecha: "asc" },
            },
          },
        }),
        diasDeAviso(),
      ]);

    const delCliente = new Set(servicios.map((s) => s.id));
    const filas = porCobrar.filas.filter((f) => delCliente.has(f.servicioId));
    const saldo = new Map<string, bigint>();
    const vencido = new Map<string, bigint>();
    for (const f of filas) {
      const [moneda = "", ...resto] = f.saldo.split(" ");
      const centavos = BigInt(resto.join("").replace(/[^\d-]/g, "") || "0");
      saldo.set(moneda, (saldo.get(moneda) ?? 0n) + centavos);
      if (f.atraso !== "") {
        vencido.set(moneda, (vencido.get(moneda) ?? 0n) + centavos);
      }
    }
    const anio = anioActual(hoy);
    const [facturas, ultimo] = await Promise.all([
      prisma.factura.findMany({
        where: {
          eliminadoEn: null,
          motivoAnulacion: null,
          tipo: "factura",
          fecha: {
            gte: new Date(`${anio}-01-01T00:00:00Z`),
            lt: new Date(`${anio + 1}-01-01T00:00:00Z`),
          },
          servicio: { clienteId: id, eliminadoEn: null },
        },
        select: { importeCentavos: true, importeMoneda: true },
      }),
      prisma.servicio.aggregate({
        where: { clienteId: id, eliminadoEn: null },
        _max: { fechaPedido: true },
      }),
    ]);
    const facturado = new Map<string, bigint>();
    for (const f of facturas) {
      facturado.set(
        f.importeMoneda,
        (facturado.get(f.importeMoneda) ?? 0n) + f.importeCentavos,
      );
    }

    const vivos = servicios.filter((s) => estaVivo(s.etapa)).length;
    const ordenados = [...servicios].sort(
      (a, b) =>
        Number(estaVivo(b.etapa)) - Number(estaVivo(a.etapa)) ||
        b.codigo.localeCompare(a.codigo),
    );
    const saldos = textosDe(saldo);
    const vencidos = textosDe(vencido);
    const sitiosDe: SitioDeFicha[] = sitios.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      lugar: [s.localidad, s.provincia].filter(Boolean).join(", "),
      tanques: s.cantidadTanques,
      litros: s.capacidadTotalLitros,
    }));
    const camionesDe: CamionDeFicha[] = camiones.map((c) => ({
      id: c.id,
      patente: c.patenteTractor,
      cisterna: c.patenteCisterna ?? "",
      tipo: unaPalabra(c.tipo),
      vencimientos: c.vencimientos.map((v) => {
        const dias = diasHasta(v.fecha.toISOString());
        return {
          id: v.id,
          descripcion: v.descripcion,
          fecha: v.fecha.toISOString().slice(0, 10),
          tono: dias < 0 ? "peligro" : dias <= avisoDias ? "aviso" : "exito",
        };
      }),
    }));
    const puedeEscribir = puedeEditar;
    const vistaPlata: FilaPorVencer[] = filas.map((f) => ({
      id: f.facturaId,
      href: `/servicios/facturas/${f.facturaId}`,
      principal: f.numero,
      mono: true,
      tercero: "",
      servicio: { codigo: f.servicio, href: `/servicios/${f.servicioId}` },
      vence: f.vencimiento,
      atraso: f.atraso,
      total: f.total,
      saldo: f.saldo,
      accion: puedeCargar ? (
        <Enlace
          href={`${ruta}?pestaña=plata&cobrar=${f.facturaId}`}
          scroll={false}
          className={clasesDeBoton("secundario", "h-8 px-2.5 text-[13px]")}
        >
          Registrar cobro
        </Enlace>
      ) : null,
    }));
    const contactos = [
      cliente.contactoNombre,
      cliente.contactoTelefono,
      cliente.contactoEmail,
    ].filter((t): t is string => t !== null && t !== "");
    const cuenta: Record<Pestana, number | null> = {
      servicios: servicios.length,
      sitios: sitios.length,
      camiones: camiones.length,
      plata: filas.length,
      actividad: null,
    };

    contenido = (
      <>
        <header className="aparece flex flex-col gap-1">
          <Enlace
            href={CLIENTES.ruta}
            className="w-fit text-[13px] text-texto-2 no-underline hover:text-texto"
          >
            ← Clientes
          </Enlace>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="m-0 text-[24px] leading-8 font-semibold tracking-tight">
                {ficha.razonSocial}
              </h1>
              {cliente.grupo === null ? null : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-superficie-3 px-2.5 py-0.5 text-[13px] font-medium text-texto-2">
                  <Building2 aria-hidden="true" className="size-3.5" />
                  {cliente.grupo.nombre}
                </span>
              )}
            </div>
            <Menu ruta={ruta} editar={puedeEditar} />
          </div>
          <p className="m-0 flex flex-wrap gap-x-2 text-texto-2">
            <span className="font-mono text-[13px]">
              {formatearCuit(cliente.cuit)}
            </span>
            {contactos.map((c) => (
              <span key={c}>· {c}</span>
            ))}
          </p>
        </header>

        <div className="aparece grid grid-cols-1 gap-4 [--orden:1] sm:grid-cols-2 xl:grid-cols-4">
          <TarjetaKpi
            titulo="Servicios vivos"
            Icono={History}
            valor={String(vivos)}
            detalle={`de ${servicios.length} en total`}
          />
          <TarjetaKpi
            titulo="Por cobrar"
            Icono={HandCoins}
            valor={
              saldos[0] === undefined ? "Nada" : <Importe texto={saldos[0]} />
            }
            detalle={
              vencidos.length > 0 ? (
                <span className="text-peligro">
                  {vencidos.join(" y ")} vencido
                </span>
              ) : saldos.length > 1 ? (
                `y ${saldos.slice(1).join(" y ")}`
              ) : undefined
            }
          />
          <TarjetaKpi
            titulo={`Facturado en ${anio}`}
            valor={
              facturado.size === 0 ? (
                "Nada"
              ) : (
                <Importe
                  texto={textoDe(
                    [...facturado.keys()].sort()[0] ?? "ARS",
                    facturado.get([...facturado.keys()].sort()[0] ?? "ARS") ??
                      0n,
                  )}
                />
              )
            }
            detalle={
              facturado.size < 2
                ? undefined
                : `y ${textosDe(facturado).slice(1).join(" y ")}`
            }
          />
          <TarjetaKpi
            titulo="Último servicio"
            valor={
              ultimo._max.fechaPedido === null
                ? "Ninguno"
                : fechaCorta(ultimo._max.fechaPedido.toISOString())
            }
            detalle={
              ultimo._max.fechaPedido === null
                ? undefined
                : `pedido en ${ultimo._max.fechaPedido.getUTCFullYear()}`
            }
          />
        </div>

        <nav
          aria-label="Ficha del cliente"
          className="aparece -mx-4 overflow-x-auto border-b border-borde px-4 [--orden:2] [scrollbar-width:none] md:mx-0 md:px-0"
        >
          <ul className="m-0 flex list-none gap-1 p-0">
            {PESTANAS.map((p) => {
              const contador = cuenta[p];
              return (
                <li key={p} className="shrink-0">
                  <Enlace
                    href={`${ruta}?pestaña=${p}`}
                    aria-current={p === activa ? "page" : undefined}
                    className={cn(
                      "-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap no-underline hover:text-texto",
                      p === activa
                        ? "border-acento text-texto"
                        : "border-transparent text-texto-2",
                    )}
                  >
                    {TEXTO_DE_PESTANA[p]}
                    {contador === null || contador === 0 ? null : (
                      <span className="cifras rounded-full bg-superficie-3 px-1.5 text-xs text-texto-2">
                        {contador}
                      </span>
                    )}
                  </Enlace>
                </li>
              );
            })}
          </ul>
        </nav>

        {activa === "servicios" ? (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              {puedeCargar ? (
                <Enlace
                  href="/servicios"
                  className={clasesDeBoton("secundario")}
                >
                  Nuevo servicio
                </Enlace>
              ) : null}
            </div>
            <PestanaServicios servicios={ordenados} />
          </div>
        ) : null}
        {activa === "sitios" ? (
          <PestanaSitios sitios={sitiosDe} puedeEscribir={puedeEscribir} />
        ) : null}
        {activa === "camiones" ? (
          <PestanaCamiones
            camiones={camionesDe}
            ruta={CAMIONES.ruta}
            puedeEscribir={puedeEscribir}
          />
        ) : null}
        {activa === "plata" ? (
          <PorVencer
            grupos={[
              {
                id: "vencido",
                titulo: "Vencido",
                tono: "peligro",
                filas: vistaPlata.filter(({ atraso }) => atraso !== ""),
              },
              {
                id: "proximo",
                titulo: "Próximo",
                tono: "normal",
                filas: vistaPlata.filter(({ atraso }) => atraso === ""),
              },
            ]}
            cabeceras={{
              principal: "Comprobante",
              servicio: "Servicio",
              vence: "Vence",
            }}
            conServicio
            conAccion={puedeCargar}
            vacio="Este cliente no tiene nada por cobrar."
          />
        ) : null}
        {activa === "actividad" ? (
          <PestanaActividad
            ficha={ficha}
            ruta={ruta}
            puedeCargar={puedeCargar}
          />
        ) : null}

        {puedeCargar && suceso !== undefined ? (
          <VentanaDeCarga
            clienteId={id}
            servicioId={null}
            rutaAlCerrar={`${ruta}?pestaña=actividad`}
          />
        ) : null}
        {puedeCargar && anularSuceso !== undefined ? (
          <VentanaDeAnulacion
            origen={{ clienteId: id }}
            suceso={ficha.situaciones.find(
              ({ id: de, servicio, motivoAnulacion }) =>
                de === anularSuceso &&
                servicio === null &&
                motivoAnulacion === null,
            )}
            rutaAlCerrar={`${ruta}?pestaña=actividad`}
          />
        ) : null}
        {puedeCargar && cobrar !== undefined ? (
          <VentanaDeCobro
            facturaId={cobrar}
            rutaAlCerrar={`${ruta}?pestaña=plata`}
          />
        ) : null}
        {puedeEditar && ventana !== null ? (
          <ContenidoDeVentana
            definicion={CLIENTES}
            pedida={{ clave: ventana, valor: id }}
            vuelta=""
            rutaAlCerrar={ruta}
            preseleccion={{}}
          />
        ) : null}
      </>
    );
  } catch (fallo) {
    const codigo = codigoDeError(fallo);
    if (codigo === null) {
      throw fallo;
    }
    contenido = <ErrorEnPantalla error={pantallaDeCodigo(codigo)} />;
  }
  return (
    <Marco email={email} rol={rol} rutaActual={CLIENTES.ruta}>
      <main className="flex flex-col gap-5">{contenido}</main>
    </Marco>
  );
}

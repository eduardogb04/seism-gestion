/**
 * Servicios: el tablero por etapa (por defecto) o la tabla (`?vista=tabla`),
 * con buscador y filtros por cliente, responsable y tipo. `?nuevo=1` abre el
 * alta.
 */

import { KanbanSquare, Plus, Rows3, UserRound } from "lucide-react";
import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../casos-uso/servicios/servicios.ts";
import { ESTADOS_SERVICIO } from "../../dominio/servicios/estados.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import {
  esEstado,
  filtrosDe,
  listadoDeServicios,
  type ServicioDelListado,
  totalesPorMoneda,
} from "../../server/servicios.ts";
import { cn } from "../_ui/cn.ts";
import { Enlace } from "../_ui/enlace-next.ts";
import { NOMBRE_DE_ETAPA } from "../_ui/etapa.tsx";
import { FormularioAbm } from "../_ui/formulario-abm.tsx";
import { Marco } from "../_ui/marco.tsx";
import { Ventana } from "../_ui/ventana.tsx";
import { sesionExigida } from "../(auth)/sesion-actual.ts";
import {
  enlaceDelListado,
  type ParametrosDelListado,
  parametrosDe,
} from "./_listado/enlaces.ts";
import { ETAPAS_PLEGADAS, ETAPAS_VIVAS, esViva } from "./_listado/etapas.ts";
import { Filtros } from "./_listado/filtros.tsx";
import { esColumna, TablaDeServicios } from "./_listado/tabla-de-servicios.tsx";
import { type ColumnaDelTablero, Tablero } from "./_listado/tablero.tsx";
import { crearServicio } from "./acciones.ts";

const RUTA = "/servicios";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function columnaDe(
  etapa: ColumnaDelTablero["etapa"],
  servicios: readonly ServicioDelListado[],
): ColumnaDelTablero {
  const deLaEtapa = servicios
    .filter((s) => s.etapa === etapa)
    .sort((a, b) => b.dias - a.dias);
  return {
    etapa,
    servicios: deLaEtapa,
    totales: totalesPorMoneda(deLaEtapa),
  };
}

function resumenDe(servicios: readonly ServicioDelListado[]): string {
  const vivos = servicios.filter((s) => esViva(s.etapa));
  const vencidos = vivos.filter((s) => s.aviso?.vencida).length;
  const partes = [`${vivos.length} ${vivos.length === 1 ? "vivo" : "vivos"}`];
  if (vencidos > 0) {
    partes.push(`${vencidos} con algo vencido`);
  }
  const porVencer = vivos.filter(
    (s) => s.aviso && !s.aviso.vencida && s.aviso.tipo !== "inicio",
  ).length;
  if (porVencer > 0) {
    partes.push(`${porVencer} por vencer`);
  }
  return partes.join(" · ");
}

export default async function Servicios({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const crudos = await searchParams;
  const parametros = parametrosDe(crudos);
  const { id: miId, email, rol } = sesion.usuario;
  const puedeEscribir = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  const vista = parametros.vista === "tabla" ? "tabla" : "tablero";
  const filtros = filtrosDe(parametros);
  const etapa = esEstado(parametros.estado) ? parametros.estado : null;
  const { servicios, opciones } = await listadoDeServicios(filtros);

  const conFiltros =
    filtros.buscar !== "" ||
    filtros.clienteId !== "" ||
    filtros.responsableId !== "" ||
    filtros.tipoId !== "" ||
    (vista === "tabla" && etapa !== null);
  const mios = filtros.responsableId === miId;

  const orden = esColumna(parametros.orden) ? parametros.orden : "codigo";
  const direccion = parametros.direccion === "asc" ? "asc" : "desc";
  const pagina = Number.parseInt(parametros.pagina ?? "1", 10) || 1;

  const listas = [
    {
      nombre: "clienteId",
      etiqueta: "Cliente",
      todos: "Todos los clientes",
      opciones: opciones.clientes,
      elegido: filtros.clienteId,
    },
    {
      nombre: "responsable",
      etiqueta: "Responsable",
      todos: "Todos los responsables",
      opciones: opciones.responsables,
      elegido: filtros.responsableId,
    },
    {
      nombre: "tipo",
      etiqueta: "Tipo",
      todos: "Todos los tipos",
      opciones: opciones.tipos,
      elegido: filtros.tipoId,
    },
    ...(vista === "tabla"
      ? [
          {
            nombre: "estado",
            etiqueta: "Etapa",
            todos: "Todas las etapas",
            opciones: ESTADOS_SERVICIO.map((e) => ({
              valor: e,
              texto: NOMBRE_DE_ETAPA[e],
            })),
            elegido: etapa ?? "",
          },
        ]
      : []),
  ];

  const deLaTabla =
    vista === "tabla" && etapa !== null
      ? servicios.filter((s) => s.etapa === etapa)
      : servicios;

  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main className="flex flex-col gap-5">
        <header className="aparece flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-[24px] leading-8 font-semibold tracking-tight">
              Servicios
            </h1>
            <p className="cifras m-0 mt-1 text-texto-2">
              {resumenDe(servicios)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SelectorDeVista vista={vista} parametros={parametros} />
            {puedeEscribir ? (
              <Enlace
                href={enlaceDelListado(parametros, { nuevo: "1" })}
                className="presionable inline-flex h-9 items-center gap-1.5 rounded-md bg-acento px-3.5 text-[13px] font-medium text-sobre-acento no-underline shadow-tarjeta hover:bg-acento-fuerte"
              >
                <Plus aria-hidden="true" className="size-4" />
                Nuevo servicio
              </Enlace>
            ) : null}
          </div>
        </header>

        <div className="aparece [--orden:1]">
          <Filtros
            key={JSON.stringify(parametros)}
            vista={vista}
            buscar={filtros.buscar}
            listas={listas}
            ocultos={
              vista === "tabla"
                ? Object.fromEntries(
                    Object.entries({
                      orden: parametros.orden,
                      direccion: parametros.direccion,
                    }).filter((par): par is [string, string] => !!par[1]),
                  )
                : {}
            }
            limpiar={
              conFiltros
                ? enlaceDelListado(
                    vista === "tabla" ? { vista: "tabla" } : {},
                    {},
                  )
                : null
            }
          >
            <Enlace
              href={enlaceDelListado(parametros, {
                responsable: mios ? null : miId,
              })}
              aria-pressed={mios}
              className="presionable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-borde bg-superficie px-3 text-[13px] font-medium text-texto-2 no-underline shadow-tarjeta hover:border-borde-fuerte hover:text-texto aria-pressed:border-acento/40 aria-pressed:bg-acento-suave aria-pressed:text-texto"
            >
              <UserRound aria-hidden="true" className="size-4" />
              Míos
            </Enlace>
          </Filtros>
        </div>

        {vista === "tablero" ? (
          servicios.length === 0 && conFiltros ? (
            <SinResultados />
          ) : (
            <Tablero
              key={JSON.stringify(parametros)}
              columnas={ETAPAS_VIVAS.map((e) => columnaDe(e, servicios))}
              plegadas={ETAPAS_PLEGADAS.map((e) => columnaDe(e, servicios))}
              inicial={
                etapa ??
                ETAPAS_VIVAS.find((e) =>
                  servicios.some((s) => s.etapa === e),
                ) ??
                // Sin vivos, se abre lo plegado si tiene algo.
                (servicios.length > 0 ? "cerrado" : "creado")
              }
              arrastrable={puedeEscribir}
            />
          )
        ) : (
          <TablaDeServicios
            servicios={deLaTabla}
            parametros={parametros}
            orden={orden}
            direccion={direccion}
            pagina={pagina}
          />
        )}
      </main>
      {puedeEscribir && parametros.nuevo !== undefined ? (
        <VentanaDeAlta
          clienteId={parametros.clienteId}
          rutaAlCerrar={enlaceDelListado(parametros, {
            pagina: parametros.pagina ?? null,
          })}
        />
      ) : null}
    </Marco>
  );
}

function SinResultados() {
  return (
    <div className="rounded-tarjeta border border-borde bg-superficie px-5 py-16 text-center shadow-tarjeta">
      <p className="m-0 font-medium">Ningún servicio coincide</p>
      <p className="m-0 mt-1 text-texto-2">
        Probá con otra búsqueda o sacá algún filtro.
      </p>
    </div>
  );
}

function SelectorDeVista({
  vista,
  parametros,
}: {
  readonly vista: "tablero" | "tabla";
  readonly parametros: ParametrosDelListado;
}) {
  const opciones = [
    { valor: "tablero", texto: "Tablero", Icono: KanbanSquare },
    { valor: "tabla", texto: "Tabla", Icono: Rows3 },
  ] as const;
  return (
    <nav
      aria-label="Vista"
      className="flex rounded-lg border border-borde bg-superficie-2 p-0.5"
    >
      {opciones.map(({ valor, texto, Icono }) => (
        <Enlace
          key={valor}
          href={enlaceDelListado(parametros, {
            vista: valor === "tabla" ? "tabla" : null,
            orden: null,
            direccion: null,
          })}
          aria-current={vista === valor ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-texto-3 no-underline transition-colors duration-150 hover:text-texto",
            "aria-[current=page]:bg-superficie aria-[current=page]:text-texto aria-[current=page]:shadow-tarjeta",
          )}
        >
          <Icono aria-hidden="true" className="size-4" />
          <span className="max-sm:sr-only">{texto}</span>
        </Enlace>
      ))}
    </nav>
  );
}

async function VentanaDeAlta({
  clienteId,
  rutaAlCerrar,
}: {
  readonly clienteId: string | undefined;
  readonly rutaAlCerrar: string;
}) {
  const formulario = await armado().servicios.formulario();
  const { campos, elegibles } = formulario;
  // Desde la ficha del cliente (`?clienteId=`), el alta llega con él elegido.
  const escrito =
    clienteId === undefined
      ? formulario.escrito
      : { ...formulario.escrito, clienteId };
  return (
    <Ventana titulo="Alta de servicio" rutaAlCerrar={rutaAlCerrar}>
      <FormularioAbm
        accion={crearServicio}
        campos={campos}
        elegibles={elegibles}
        inicial={{ escrito, errores: {} }}
        enviar={{ texto: "Guardar", variante: "primario" }}
        rutaAlCancelar={rutaAlCerrar}
      />
    </Ventana>
  );
}

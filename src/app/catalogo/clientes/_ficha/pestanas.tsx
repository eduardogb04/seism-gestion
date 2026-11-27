/**
 * Las pestañas de la ficha de un cliente: cada una es una pieza del servidor
 * que recibe sus datos ya leídos.
 */

import { Pencil, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { SITIOS } from "../../../../casos-uso/abm/sitios.ts";
import type { FichaDelCliente } from "../../../../casos-uso/servicios/sucesos.ts";
import type { ServicioDelListado } from "../../../../server/servicios.ts";
import { fechaCorta } from "../../../_inicio/formato.ts";
import {
  ListaDeTarjetas,
  TarjetaDeFila,
  Vacio,
} from "../../../_plata/piezas.tsx";
import { clasesDeBoton } from "../../../_ui/boton.tsx";
import { cn } from "../../../_ui/cn.ts";
import { Enlace } from "../../../_ui/enlace-next.ts";
import { ChipDeEtapa } from "../../../_ui/etapa.tsx";
import {
  CLASES_DE_ACCIONES,
  CLASES_DE_ENLACE_DE_FILA,
  CLASES_DE_FILA_ENLAZADA,
  Tabla,
} from "../../../_ui/tabla.tsx";
import { diasEnLaEtapa, Persona } from "../../../servicios/_listado/piezas.tsx";
import { BotonDeIcono } from "./piezas.tsx";

export function Pie({ children }: { readonly children: ReactNode }) {
  return <div className="flex justify-end">{children}</div>;
}

export function PestanaServicios({
  servicios,
}: {
  readonly servicios: readonly ServicioDelListado[];
}) {
  if (servicios.length === 0) {
    return (
      <Vacio
        titulo="Este cliente todavía no tiene servicios."
        texto="Cuando se cargue el primero aparece acá."
      />
    );
  }
  return (
    <>
      <div className="hidden md:block [&_td]:text-[13px] [&_th]:text-[12px]">
        <Tabla
          titulo="Servicios del cliente"
          cabeceras={[
            "Código",
            "Título",
            "Etapa",
            "Responsable",
            "En la etapa",
          ]}
        >
          {servicios.map((s) => (
            <tr key={s.id} className={CLASES_DE_FILA_ENLAZADA}>
              <td className="whitespace-nowrap">
                <Enlace
                  href={s.enlace}
                  className={cn(
                    CLASES_DE_ENLACE_DE_FILA,
                    "font-mono text-[12px]",
                  )}
                >
                  {s.codigo}
                </Enlace>
              </td>
              <td className="w-full max-w-0">
                <span className="block truncate font-medium">{s.titulo}</span>
                <span className="block truncate text-[12px] text-texto-3">
                  {s.tipo.nombre}
                </span>
              </td>
              <td>
                <ChipDeEtapa etapa={s.etapa} />
              </td>
              <td className="whitespace-nowrap">
                <Persona persona={s.responsable} />
              </td>
              <td className="cifras whitespace-nowrap text-texto-2">
                {diasEnLaEtapa(s.dias)}
              </td>
            </tr>
          ))}
        </Tabla>
      </div>
      <ListaDeTarjetas>
        {servicios.map((s) => (
          <TarjetaDeFila
            key={s.id}
            href={s.enlace}
            titulo={<span className="block truncate">{s.titulo}</span>}
            derecha={<ChipDeEtapa etapa={s.etapa} />}
          >
            <span className="font-mono text-[12px] text-texto-3">
              {s.codigo}
            </span>
            <span className="text-[12px] text-texto-2">
              {s.responsable.nombre} · {diasEnLaEtapa(s.dias)} en la etapa
            </span>
          </TarjetaDeFila>
        ))}
      </ListaDeTarjetas>
    </>
  );
}

export type SitioDeFicha = {
  readonly id: string;
  readonly nombre: string;
  readonly lugar: string;
  readonly tanques: number;
  readonly litros: number;
};

const LITROS = new Intl.NumberFormat("es-AR");

export function PestanaSitios({
  sitios,
  puedeEscribir,
}: {
  readonly sitios: readonly SitioDeFicha[];
  readonly puedeEscribir: boolean;
}) {
  const nuevo = puedeEscribir ? (
    <Pie>
      <Enlace
        href={`${SITIOS.ruta}?nuevo=1`}
        className={clasesDeBoton("secundario")}
      >
        <Plus aria-hidden="true" />
        Nuevo sitio
      </Enlace>
    </Pie>
  ) : null;
  if (sitios.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Vacio
          titulo="Este cliente no tiene sitios cargados."
          texto="Un sitio es donde están las instalaciones sobre las que se trabaja."
        />
        {nuevo}
      </div>
    );
  }
  const datos = (s: SitioDeFicha) =>
    `${s.tanques} ${s.tanques === 1 ? "tanque" : "tanques"} · ${LITROS.format(s.litros)} L`;
  const editar = (id: string) =>
    puedeEscribir ? (
      <BotonDeIcono href={`${SITIOS.ruta}?editar=${id}`} texto="Editar sitio">
        <Pencil aria-hidden="true" className="size-4" />
      </BotonDeIcono>
    ) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden md:block [&_td]:text-[13px] [&_th]:text-[12px]">
        <Tabla
          titulo="Sitios del cliente"
          cabeceras={[
            "Sitio",
            "Lugar",
            "Instalación",
            ...(puedeEscribir ? ["Acciones"] : []),
          ]}
        >
          {sitios.map((s) => (
            <tr key={s.id}>
              <td className="font-medium">{s.nombre}</td>
              <td className="text-texto-2">{s.lugar}</td>
              <td className="cifras whitespace-nowrap text-texto-2">
                {datos(s)}
              </td>
              {puedeEscribir ? (
                <td className={cn(CLASES_DE_ACCIONES, "text-right")}>
                  <div className="flex justify-end">{editar(s.id)}</div>
                </td>
              ) : null}
            </tr>
          ))}
        </Tabla>
      </div>
      <ListaDeTarjetas>
        {sitios.map((s) => (
          <TarjetaDeFila
            key={s.id}
            href={null}
            titulo={<span className="block truncate">{s.nombre}</span>}
            accion={editar(s.id)}
          >
            <span className="text-[12px] text-texto-2">{s.lugar}</span>
            <span className="cifras text-[12px] text-texto-3">{datos(s)}</span>
          </TarjetaDeFila>
        ))}
      </ListaDeTarjetas>
      {nuevo}
    </div>
  );
}

export type CamionDeFicha = {
  readonly id: string;
  readonly patente: string;
  readonly cisterna: string;
  readonly tipo: string;
  readonly vencimientos: readonly {
    readonly id: string;
    readonly descripcion: string;
    readonly fecha: string;
    readonly tono: "peligro" | "aviso" | "exito";
  }[];
};

const PUNTO = {
  peligro: "bg-peligro",
  aviso: "bg-aviso",
  exito: "bg-exito",
} as const;
const ESTADO = {
  peligro: "vencido",
  aviso: "por vencer",
  exito: "al día",
} as const;

function Vencimientos({ camion }: { readonly camion: CamionDeFicha }) {
  if (camion.vencimientos.length === 0) {
    return <span className="text-texto-3">Sin vencimientos cargados</span>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {camion.vencimientos.map((v) => (
        <li key={v.id} className="flex items-center gap-2 text-[13px]">
          <span
            aria-hidden="true"
            className={cn("size-2 shrink-0 rounded-full", PUNTO[v.tono])}
          />
          <span className="sr-only">{ESTADO[v.tono]}: </span>
          <span className="truncate">{v.descripcion}</span>
          <span className="cifras shrink-0 text-texto-3">
            {fechaCorta(v.fecha)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PestanaCamiones({
  camiones,
  ruta,
  puedeEscribir,
}: {
  readonly camiones: readonly CamionDeFicha[];
  readonly ruta: string;
  readonly puedeEscribir: boolean;
}) {
  const nuevo = puedeEscribir ? (
    <Pie>
      <Enlace href={`${ruta}?nuevo=1`} className={clasesDeBoton("secundario")}>
        <Plus aria-hidden="true" />
        Nuevo camión
      </Enlace>
    </Pie>
  ) : null;
  if (camiones.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Vacio
          titulo="Este cliente no tiene camiones cargados."
          texto="Los camiones con sus vencimientos de inspección aparecen acá."
        />
        {nuevo}
      </div>
    );
  }
  const editar = (id: string) =>
    puedeEscribir ? (
      <BotonDeIcono href={`${ruta}?editar=${id}`} texto="Editar camión">
        <Pencil aria-hidden="true" className="size-4" />
      </BotonDeIcono>
    ) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden md:block [&_td]:text-[13px] [&_th]:text-[12px]">
        <Tabla
          titulo="Camiones del cliente"
          cabeceras={[
            "Patente",
            "Tipo",
            "Vencimientos",
            ...(puedeEscribir ? ["Acciones"] : []),
          ]}
        >
          {camiones.map((c) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap">
                <span className="font-mono text-[12px] font-medium">
                  {c.patente}
                </span>
                {c.cisterna === "" ? null : (
                  <span className="block font-mono text-[12px] text-texto-3">
                    {c.cisterna}
                  </span>
                )}
              </td>
              <td className="text-texto-2">{c.tipo}</td>
              <td>
                <Vencimientos camion={c} />
              </td>
              {puedeEscribir ? (
                <td className={cn(CLASES_DE_ACCIONES, "text-right")}>
                  <div className="flex justify-end">{editar(c.id)}</div>
                </td>
              ) : null}
            </tr>
          ))}
        </Tabla>
      </div>
      <ListaDeTarjetas>
        {camiones.map((c) => (
          <TarjetaDeFila
            key={c.id}
            href={null}
            titulo={<span className="font-mono">{c.patente}</span>}
            derecha={<span className="text-[12px] text-texto-2">{c.tipo}</span>}
            accion={editar(c.id)}
          >
            <Vencimientos camion={c} />
          </TarjetaDeFila>
        ))}
      </ListaDeTarjetas>
      {nuevo}
    </div>
  );
}

export function PestanaActividad({
  ficha,
  ruta,
  puedeCargar,
}: {
  readonly ficha: FichaDelCliente;
  readonly ruta: string;
  readonly puedeCargar: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {puedeCargar ? (
        <Pie>
          <Enlace
            href={`${ruta}?pestaña=actividad&suceso=1`}
            scroll={false}
            className={clasesDeBoton("secundario")}
          >
            <Plus aria-hidden="true" />
            Nuevo suceso
          </Enlace>
        </Pie>
      ) : null}
      {ficha.situaciones.length === 0 ? (
        <Vacio
          titulo="Todavía no hay sucesos cargados."
          texto="Acá se juntan las observaciones del cliente y las de sus servicios."
        />
      ) : (
        <ul
          aria-label="Sucesos"
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {ficha.situaciones.map(
            ({ id, fecha, servicio, texto, autor, motivoAnulacion }) => (
              <li
                key={id}
                className="flex flex-col gap-1 rounded-tarjeta border border-borde bg-superficie p-3 shadow-tarjeta"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-texto-3">
                  <span className="cifras">{fecha}</span>
                  {servicio === null ? (
                    <span>Sin servicio</span>
                  ) : (
                    <Enlace
                      href={`/servicios/${servicio.id}`}
                      className="font-mono"
                    >
                      {servicio.codigo}
                    </Enlace>
                  )}
                  <span>{autor}</span>
                  {puedeCargar &&
                  servicio === null &&
                  motivoAnulacion === null ? (
                    <Enlace
                      href={`${ruta}?pestaña=actividad&anularSuceso=${id}`}
                      scroll={false}
                      className="ml-auto"
                    >
                      Anular
                    </Enlace>
                  ) : null}
                </div>
                <p className="m-0 whitespace-pre-line">
                  {motivoAnulacion === null ? (
                    texto
                  ) : (
                    <>
                      <del className="text-texto-3">{texto}</del>
                      <br />
                      <span className="text-peligro">
                        Anulada: {motivoAnulacion}
                      </span>
                    </>
                  )}
                </p>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

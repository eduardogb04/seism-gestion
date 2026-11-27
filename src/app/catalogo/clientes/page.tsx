/**
 * Clientes: listado propio con grupo, servicios vivos y saldo por cobrar. Alta,
 * edición y baja abren la ventana del ABM sobre este mismo listado; la fila
 * lleva a la ficha. HTML del servidor, sin JavaScript de cliente.
 */

import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { CLIENTES } from "../../../casos-uso/abm/clientes.ts";
import { formatearCuit } from "../../../dominio/compartido/cuit.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import {
  FilaDeFiltros,
  FiltroEnlace,
  Importe,
  ListaDeTarjetas,
  Paginas,
  TarjetaDeFila,
  Vacio,
} from "../../_plata/piezas.tsx";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { CLASES_DE_CONTROL } from "../../_ui/campo-texto.tsx";
import { cn } from "../../_ui/cn.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { Marco } from "../../_ui/marco.tsx";
import {
  CLASES_DE_ACCIONES,
  CLASES_DE_ENLACE_DE_FILA,
  CLASES_DE_FILA_ENLAZADA,
  Tabla,
} from "../../_ui/tabla.tsx";
import { sesionExigida } from "../../(auth)/sesion-actual.ts";
import {
  ContenidoDeVentana,
  type PropsListado,
  ventanaPedida,
} from "../_abm/paginas.tsx";
import { resumenDeClientes, textosDe } from "./_datos.ts";
import { BotonDeIcono } from "./_ficha/piezas.tsx";

const { ruta } = CLIENTES;
const POR_PAGINA = 25;

type Vista = { buscar: string; grupo: string; pagina: number };

function consultaDe(vista: Vista, extra?: Record<string, string>): string {
  return new URLSearchParams({
    ...(vista.buscar === "" ? {} : { buscar: vista.buscar }),
    ...(vista.grupo === "" ? {} : { grupo: vista.grupo }),
    ...(vista.pagina > 1 ? { pagina: String(vista.pagina) } : {}),
    ...extra,
  }).toString();
}

function enlaceA(vista: Vista, extra?: Record<string, string>): string {
  const consulta = consultaDe(vista, extra);
  return consulta === "" ? ruta : `${ruta}?${consulta}`;
}

const normal = (texto: string) =>
  texto
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

function texto(valor: string | string[] | undefined): string {
  return typeof valor === "string" ? valor.trim() : "";
}

type Fila = {
  readonly id: string;
  readonly nombre: string;
  readonly cuit: string;
  readonly grupo: string;
  readonly proveedor: boolean;
  readonly vivos: number;
  readonly saldos: readonly string[];
  readonly vencido: boolean;
};

function Saldos({ fila }: { readonly fila: Fila }) {
  if (fila.saldos.length === 0) {
    return <span className="text-texto-3">—</span>;
  }
  return (
    <span className="flex flex-col items-end">
      {fila.saldos.map((s) => (
        <Importe
          key={s}
          texto={s}
          {...(fila.vencido ? { className: "[&_span]:text-peligro" } : {})}
        />
      ))}
    </span>
  );
}

export default async function Clientes({ searchParams }: PropsListado) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const { email, rol } = sesion.usuario;
  const puedeEscribir = CLIENTES.rolesQueEscriben.includes(rol);
  const buscar = texto(parametros.buscar);
  const grupo = texto(parametros.grupo);
  const [clientes, resumen] = await Promise.all([
    armado().prisma.cliente.findMany({
      where: { eliminadoEn: null },
      select: {
        id: true,
        razonSocial: true,
        nombreCorto: true,
        cuit: true,
        esProveedor: true,
        grupo: { select: { id: true, nombre: true } },
      },
      orderBy: { razonSocial: "asc" },
    }),
    resumenDeClientes(),
  ]);

  const nombresDeGrupo = new Map<string, string>();
  for (const { grupo: g } of clientes) {
    if (g !== null) {
      nombresDeGrupo.set(g.id, g.nombre);
    }
  }
  const grupos = [...nombresDeGrupo].sort(([, a], [, b]) =>
    a.localeCompare(b, "es"),
  );
  const hayLibres = clientes.some(({ grupo: g }) => g === null);

  const buscado = normal(buscar);
  const digitos = buscar.replace(/\D/g, "");
  const filtrados = clientes.filter(
    (c) =>
      (grupo === "" ||
        (grupo === "sin" ? c.grupo === null : c.grupo?.id === grupo)) &&
      (buscado === "" ||
        normal(c.razonSocial).includes(buscado) ||
        normal(c.nombreCorto ?? "").includes(buscado) ||
        (digitos !== "" && c.cuit.includes(digitos))),
  );
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pagina = Math.min(
    Math.max(1, Number.parseInt(texto(parametros.pagina), 10) || 1),
    paginas,
  );
  const vista: Vista = { buscar, grupo, pagina };
  const pedida = ventanaPedida(parametros);
  const filtrado = buscar !== "" || grupo !== "";

  const filas: Fila[] = filtrados
    .slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
    .map((c) => {
      const datos = resumen.get(c.id);
      const saldos = textosDe(datos?.cobranza.saldo ?? new Map());
      return {
        id: c.id,
        nombre: c.razonSocial,
        cuit: formatearCuit(c.cuit),
        grupo: c.grupo?.nombre ?? "",
        proveedor: c.esProveedor,
        vivos: datos?.vivos ?? 0,
        saldos,
        vencido: textosDe(datos?.cobranza.vencido ?? new Map()).length > 0,
      };
    });
  const acciones = (id: string) =>
    puedeEscribir ? (
      <div className="flex justify-end gap-0.5">
        <BotonDeIcono href={enlaceA(vista, { editar: id })} texto="Editar">
          <Pencil aria-hidden="true" className="size-4" />
        </BotonDeIcono>
        <BotonDeIcono
          href={enlaceA(vista, { baja: id })}
          texto="Dar de baja"
          peligro
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </BotonDeIcono>
      </div>
    ) : undefined;

  return (
    <Marco email={email} rol={rol} rutaActual={ruta}>
      <main className="flex flex-col gap-5">
        <header className="aparece flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-[24px] leading-8 font-semibold tracking-tight">
              Clientes
            </h1>
            <p className="m-0 mt-1 text-texto-2">
              Con quién trabajamos, cuántos servicios tienen en curso y cuánto
              nos deben.
            </p>
          </div>
          {puedeEscribir ? (
            <Enlace
              href={enlaceA(vista, { nuevo: "1" })}
              scroll={false}
              className={clasesDeBoton("primario")}
            >
              <Plus aria-hidden="true" />
              Nuevo cliente
            </Enlace>
          ) : null}
        </header>

        <form action={ruta} className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-80">
            <label htmlFor="buscar-cliente" className="sr-only">
              Buscar cliente
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-3"
            />
            <input
              id="buscar-cliente"
              type="search"
              name="buscar"
              defaultValue={buscar}
              placeholder="Buscar por nombre o CUIT…"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              className={cn(CLASES_DE_CONTROL, "pl-9")}
            />
          </div>
          {grupo === "" ? null : (
            <input type="hidden" name="grupo" value={grupo} />
          )}
        </form>
        {grupos.length === 0 ? null : (
          <FilaDeFiltros>
            <FiltroEnlace
              href={enlaceA({ buscar, grupo: "", pagina: 1 })}
              activo={grupo === ""}
            >
              Todos
            </FiltroEnlace>
            {grupos.map(([id, nombre]) => (
              <FiltroEnlace
                key={id}
                href={enlaceA({ buscar, grupo: id, pagina: 1 })}
                activo={grupo === id}
              >
                {nombre}
              </FiltroEnlace>
            ))}
            {hayLibres ? (
              <FiltroEnlace
                href={enlaceA({ buscar, grupo: "sin", pagina: 1 })}
                activo={grupo === "sin"}
              >
                Sin grupo
              </FiltroEnlace>
            ) : null}
          </FilaDeFiltros>
        )}

        {filtrados.length === 0 ? (
          <Vacio
            titulo={
              filtrado
                ? "No encontramos clientes con esa búsqueda."
                : "Todavía no se cargó ningún cliente."
            }
            {...(filtrado
              ? { texto: "Probá con otras palabras o sacá los filtros." }
              : puedeEscribir
                ? { texto: "Con «Nuevo cliente» cargás el primero." }
                : {})}
          />
        ) : (
          <>
            <div className="hidden md:block [&_th:nth-child(4)]:text-right">
              <Tabla
                titulo="Clientes"
                cabeceras={[
                  "Cliente",
                  "Grupo",
                  "Servicios vivos",
                  "Por cobrar",
                  ...(puedeEscribir ? ["Acciones"] : []),
                ]}
              >
                {filas.map((fila) => (
                  <tr key={fila.id} className={CLASES_DE_FILA_ENLAZADA}>
                    <td className="w-full max-w-0">
                      <Enlace
                        href={`${ruta}/${fila.id}`}
                        className={cn(
                          CLASES_DE_ENLACE_DE_FILA,
                          "block truncate",
                        )}
                      >
                        {fila.nombre}
                      </Enlace>
                      <span className="block truncate font-mono text-[12px] text-texto-3">
                        {fila.cuit}
                        {fila.proveedor ? " · también proveedor" : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-texto-2">
                      {fila.grupo === "" ? (
                        <span className="text-texto-3">—</span>
                      ) : (
                        fila.grupo
                      )}
                    </td>
                    <td className="cifras whitespace-nowrap">{fila.vivos}</td>
                    <td className="text-right whitespace-nowrap">
                      <Saldos fila={fila} />
                    </td>
                    {puedeEscribir ? (
                      <td
                        className={cn(CLASES_DE_ACCIONES, "whitespace-nowrap")}
                      >
                        {acciones(fila.id)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </Tabla>
            </div>
            <ListaDeTarjetas>
              {filas.map((fila) => (
                <TarjetaDeFila
                  key={fila.id}
                  href={`${ruta}/${fila.id}`}
                  titulo={<span className="block truncate">{fila.nombre}</span>}
                  derecha={
                    fila.saldos.length === 0 ? undefined : (
                      <span className="shrink-0">
                        <Saldos fila={fila} />
                      </span>
                    )
                  }
                  accion={acciones(fila.id)}
                  tono={fila.vencido ? "peligro" : "normal"}
                >
                  <span className="truncate font-mono text-[12px] text-texto-3">
                    {fila.cuit}
                  </span>
                  <span className="text-[12px] text-texto-2">
                    {[
                      fila.grupo,
                      `${fila.vivos} ${fila.vivos === 1 ? "servicio vivo" : "servicios vivos"}`,
                    ]
                      .filter((t) => t !== "")
                      .join(" · ")}
                  </span>
                </TarjetaDeFila>
              ))}
            </ListaDeTarjetas>
            <Paginas
              texto={`Página ${pagina} de ${paginas} · ${filtrados.length} en total`}
              anterior={
                pagina > 1 ? enlaceA({ ...vista, pagina: pagina - 1 }) : null
              }
              siguiente={
                pagina < paginas
                  ? enlaceA({ ...vista, pagina: pagina + 1 })
                  : null
              }
            />
          </>
        )}
      </main>
      {pedida === null ? null : (
        <ContenidoDeVentana
          definicion={CLIENTES}
          pedida={pedida}
          vuelta={consultaDe(vista)}
          rutaAlCerrar={enlaceA(vista)}
          preseleccion={{}}
        />
      )}
    </Marco>
  );
}

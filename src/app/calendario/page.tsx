/**
 * El calendario (F4-04, ADR 0046): lo que vence o empieza en un mes, en una
 * grilla de semanas y en una lista debajo. `?mes=aaaa-mm` elige el mes y
 * `?tipo=` (uno o varios) filtra por tipo de entrada. HTML del servidor, sin
 * JavaScript de cliente.
 */

import { diaConBarras } from "../../casos-uso/abm/definicion.ts";
import {
  ETIQUETAS_DE_TIPO,
  TIPOS_DE_ENTRADA,
} from "../../casos-uso/calendario/calendario.ts";
import { ROLES_QUE_ESCRIBEN_SERVICIOS } from "../../casos-uso/servicios/servicios.ts";
import { armado } from "../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../_ui/boton.tsx";
import { Marco } from "../_ui/marco.tsx";
import {
  CLASES_DE_ACCIONES,
  CLASES_DE_ENLACE_DE_FILA,
  CLASES_DE_FILA_ENLAZADA,
  Tabla,
} from "../_ui/tabla.tsx";
import { VentanaDeRenovacion } from "../servicios/[id]/ventana-de-renovacion.tsx";
import { sesionExigida } from "../(auth)/sesion-actual.ts";
import {
  BORDE_DE_TIPO,
  EnlaceDeRenovacion,
  EstadoDeEntrada,
  GrillaDelMes,
} from "./grilla.tsx";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUTA = "/calendario";

export default async function Calendario({ searchParams }: Props) {
  const sesion = await sesionExigida();
  const parametros = await searchParams;
  const { mes, tipos, entradas, semanas } =
    await armado().calendario.mes(parametros);
  const { email, rol } = sesion.usuario;
  const puedeRenovar = ROLES_QUE_ESCRIBEN_SERVICIOS.includes(rol);
  // Con todos los tipos no hace falta decirlo en la dirección.
  const enlaceAlMes = (aaaaMm: string, renovar?: string) => {
    const consulta = new URLSearchParams({ mes: aaaaMm });
    if (tipos.length < TIPOS_DE_ENTRADA.length) {
      for (const tipo of tipos) {
        consulta.append("tipo", tipo);
      }
    }
    if (renovar !== undefined) {
      consulta.set("renovar", renovar);
    }
    return `${RUTA}?${consulta}`;
  };
  const enlaceDeRenovacion = puedeRenovar
    ? (vencimientoId: string) => enlaceAlMes(mes.mes, vencimientoId)
    : null;
  const aRenovar = puedeRenovar
    ? entradas.find(
        ({ vencimiento }) =>
          vencimiento !== null && vencimiento.id === parametros.renovar,
      )
    : undefined;
  return (
    <Marco email={email} rol={rol} rutaActual={RUTA}>
      <main>
        <h1>Calendario</h1>
        <nav
          aria-label="Meses"
          className="mb-4 flex flex-wrap items-center gap-3"
        >
          <a
            href={enlaceAlMes(mes.anterior)}
            className={clasesDeBoton("secundario")}
          >
            Mes anterior
          </a>
          <p className="min-w-40 text-center text-lg font-semibold">
            {mes.nombre}
          </p>
          <a
            href={enlaceAlMes(mes.siguiente)}
            className={clasesDeBoton("secundario")}
          >
            Mes siguiente
          </a>
        </nav>
        <form
          method="get"
          action={RUTA}
          className="mb-4 flex flex-wrap items-center gap-4"
        >
          <input type="hidden" name="mes" value={mes.mes} />
          {TIPOS_DE_ENTRADA.map((tipo) => (
            <label
              key={tipo}
              className={`flex items-center gap-2 border-l-4 ${BORDE_DE_TIPO[tipo]} pl-2`}
            >
              <input
                type="checkbox"
                name="tipo"
                value={tipo}
                defaultChecked={tipos.includes(tipo)}
              />
              {ETIQUETAS_DE_TIPO[tipo]}
            </label>
          ))}
          <button type="submit" className={clasesDeBoton("primario")}>
            Filtrar
          </button>
        </form>
        <GrillaDelMes
          semanas={semanas}
          enlaceDeRenovacion={enlaceDeRenovacion}
        />
        <h2 id="lista">Lista de {mes.nombre}</h2>
        {entradas.length === 0 ? (
          <p>No hay nada para este mes.</p>
        ) : (
          <Tabla
            cabeceras={[
              "Fecha",
              "Tipo",
              "Entrada",
              "Importe",
              "Estado",
              ...(puedeRenovar ? ["Acciones"] : []),
            ]}
          >
            {entradas.map((entrada) => (
              <tr
                key={entrada.tipo + entrada.enlace + entrada.fecha}
                className={CLASES_DE_FILA_ENLAZADA}
              >
                <td>{diaConBarras(entrada.fecha)}</td>
                <td className={`border-l-4 ${BORDE_DE_TIPO[entrada.tipo]}`}>
                  {ETIQUETAS_DE_TIPO[entrada.tipo]}
                </td>
                <td>
                  <a href={entrada.enlace} className={CLASES_DE_ENLACE_DE_FILA}>
                    {entrada.titulo}
                  </a>
                </td>
                <td>{entrada.importe ?? ""}</td>
                <td>
                  <EstadoDeEntrada vencida={entrada.vencida} />
                </td>
                {enlaceDeRenovacion === null ? null : (
                  <td className={CLASES_DE_ACCIONES}>
                    {entrada.vencimiento === null ? null : (
                      <EnlaceDeRenovacion
                        href={enlaceDeRenovacion(entrada.vencimiento.id)}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </Tabla>
        )}
        {aRenovar?.vencimiento ? (
          <VentanaDeRenovacion
            servicioId={aRenovar.vencimiento.servicioId}
            vencimientoId={aRenovar.vencimiento.id}
            detalle={`${aRenovar.titulo} · ${diaConBarras(aRenovar.fecha)}`}
            rutaAlCerrar={enlaceAlMes(mes.mes)}
          />
        ) : null}
      </main>
    </Marco>
  );
}

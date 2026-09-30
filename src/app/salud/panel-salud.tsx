/**
 * El panel de salud (F0-26): pantalla chica, sin gráficos, verde o rojo sin
 * interpretación. Es HTML del servidor: nada de JavaScript de cliente ni
 * librerías de UI; se recarga con F5. El color no lo decide esta página: viene
 * ya decidido en el `Salud` que arma `listarSalud`, acá solo se muestra.
 *
 * Cada fila y cada recuadro lleva un `data-*` (`data-job`, `data-fallido`,
 * `data-integracion`, `data-gasto-ia`) y su `data-estado` (`ok` o `rojo`),
 * que es lo que miran los tests.
 */

import { haceCuanto } from "../../casos-uso/salud/hace-cuanto.ts";
import type {
  EstadoIntegracion,
  EstadoJob,
  GastoIa,
  Salud,
} from "../../casos-uso/salud/listar-salud.ts";

type Estado = "ok" | "rojo";

const COLORES: Record<
  Estado,
  { readonly fondo: string; readonly texto: string }
> = {
  ok: { fondo: "#d8f3dc", texto: "#1b4332" },
  rojo: { fondo: "#ffccd5", texto: "#7d0a1f" },
};

function Semaforo({ estado }: { readonly estado: Estado }) {
  const { fondo, texto } = COLORES[estado];
  return (
    <strong style={{ background: fondo, color: texto, padding: "0 0.5em" }}>
      {estado === "ok" ? "VERDE" : "ROJO"}
    </strong>
  );
}

/** `CODIGO · descripción` sin la causa: puede traer datos del caso. */
function sinCausa(detalle: string): string {
  const desde = detalle.indexOf(" · causa:");
  return desde === -1 ? detalle : detalle.slice(0, desde);
}

function resultadoDe(job: EstadoJob): string {
  const corrida = job.ultimaCorrida;
  if (corrida === null) {
    return "—";
  }
  return corrida.resultado ?? "en curso";
}

function FilaJob({ job }: { readonly job: EstadoJob }) {
  const corrida = job.ultimaCorrida;
  return (
    <tr data-job={job.job} data-estado={job.estado}>
      <td>{job.job}</td>
      <td>
        <Semaforo estado={job.estado} />
      </td>
      <td>{corrida === null ? "—" : haceCuanto(corrida.haceMs)}</td>
      <td>{resultadoDe(job)}</td>
      <td>
        {job.motivo ?? ""}
        {job.error === undefined ? "" : ` ${job.error}`}
        {corrida?.detalle == null ? "" : ` ${sinCausa(corrida.detalle)}`}
      </td>
    </tr>
  );
}

function SeccionJobs({ jobs }: { readonly jobs: readonly EstadoJob[] }) {
  return (
    <section>
      <h2>Jobs</h2>
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Estado</th>
            <th>Última corrida</th>
            <th>Resultado</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <FilaJob key={job.job} job={job} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SeccionFallidos({ salud }: { readonly salud: Salud }) {
  const { fallidos, fallidosPendientes } = salud;
  if (fallidos === null || fallidosPendientes === null) {
    return (
      <section>
        <h2>Fallidos pendientes</h2>
        <p data-estado="rojo">
          <Semaforo estado="rojo" /> No se pudieron leer los fallidos.
        </p>
      </section>
    );
  }
  if (fallidosPendientes === 0 && fallidos.length === 0) {
    return (
      <section>
        <h2>Fallidos pendientes</h2>
        <p data-estado="ok">
          <Semaforo estado="ok" /> No hay fallidos pendientes.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2>Fallidos pendientes</h2>
      <p data-estado="rojo">
        <Semaforo estado="rojo" /> Pendientes: {fallidosPendientes}
        {fallidosPendientes > fallidos.length
          ? ` (se muestran los ${fallidos.length} más viejos)`
          : ""}
      </p>
      <table>
        <thead>
          <tr>
            <th>Origen</th>
            <th>Código</th>
            <th>Edad</th>
          </tr>
        </thead>
        <tbody>
          {fallidos.map((fallido, posicion) => (
            <tr key={fallido.id} data-fallido={posicion}>
              <td>{fallido.origen}</td>
              <td>{fallido.codigoError}</td>
              <td>{haceCuanto(fallido.haceMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function UltimaPrueba({
  integracion,
}: {
  readonly integracion: EstadoIntegracion;
}) {
  const ultima = integracion.ultimaPruebaOk;
  if (ultima === null) {
    return <>sin prueba exitosa desde que arrancó la app</>;
  }
  return (
    <>
      {ultima.en} ({haceCuanto(ultima.haceMs)})
    </>
  );
}

function SeccionIntegraciones({
  integraciones,
}: {
  readonly integraciones: readonly EstadoIntegracion[];
}) {
  return (
    <section>
      <h2>Integraciones</h2>
      <table>
        <thead>
          <tr>
            <th>Integración</th>
            <th>Estado</th>
            <th>Última prueba exitosa</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {integraciones.map((integracion) => {
            const estado: Estado = integracion.estado === "ok" ? "ok" : "rojo";
            return (
              <tr
                key={integracion.nombre}
                data-integracion={integracion.nombre}
                data-estado={estado}
              >
                <td>{integracion.nombre}</td>
                <td>
                  <Semaforo estado={estado} />
                </td>
                <td>
                  <UltimaPrueba integracion={integracion} />
                </td>
                <td>{integracion.detalle ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function SeccionGastoIa({ gasto }: { readonly gasto: GastoIa }) {
  if (gasto.tipo === "error") {
    return (
      <section data-gasto-ia data-estado="rojo">
        <h2>Gasto de IA del mes</h2>
        <p>
          <Semaforo estado="rojo" /> No se pudo calcular: {gasto.detalle}
        </p>
      </section>
    );
  }
  return (
    <section data-gasto-ia data-estado={gasto.estado}>
      <h2>Gasto de IA del mes</h2>
      <p>
        <Semaforo estado={gasto.estado} /> Mes {gasto.mes}: gastado USD{" "}
        {gasto.gastadoUsd} de un tope de USD {gasto.topeUsd}
      </p>
    </section>
  );
}

export function PanelSalud({ salud }: { readonly salud: Salud }) {
  return (
    <main>
      <h1>Salud</h1>
      <SeccionJobs jobs={salud.jobs} />
      <SeccionFallidos salud={salud} />
      <SeccionIntegraciones integraciones={salud.integraciones} />
      <SeccionGastoIa gasto={salud.gastoIa} />
    </main>
  );
}

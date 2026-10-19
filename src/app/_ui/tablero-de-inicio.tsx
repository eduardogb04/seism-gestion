/**
 * El tablero de inicio (F2-10, ADR 0038; F3-08, ADR 0042) tal como se ve: lo
 * que arma `casos-uso/tablero`, sin leer nada por su cuenta. Aparte de
 * `page.tsx` para que un test lo dibuje con los números de una base sembrada y
 * afirme lo que se ve.
 *
 * Arriba, todo en la moneda elegida; debajo, cada moneda por separado y sin
 * convertir, y los egresos por centro de costo.
 */

import {
  ChartColumn,
  FileText,
  HandCoins,
  Receipt,
  Scale,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Cifra } from "../../casos-uso/tablero/convertido.ts";
import type { Tablero } from "../../casos-uso/tablero/tablero.ts";
import type { Moneda } from "../../dominio/compartido/importe.ts";
import { clasesDeBoton } from "./boton.tsx";
import { Grafico } from "./grafico.tsx";
import { Tabla } from "./tabla.tsx";
import { TarjetaKpi } from "./tarjeta-kpi.tsx";

const NOMBRES: Record<Moneda, string> = { ARS: "Pesos", USD: "Dólares" };

/** El número, con su enlace si lo tiene. `id` lo distingue en las pruebas. */
function Numero({
  cifra,
  id,
  atributo = "data-cifra",
}: {
  readonly cifra: Cifra;
  readonly id: string;
  readonly atributo?: "data-cifra" | "data-kpi";
}) {
  const marca = { [atributo]: id };
  return cifra.enlace === null ? (
    <span {...marca}>{cifra.valor}</span>
  ) : (
    <a href={cifra.enlace} {...marca}>
      {cifra.valor}
    </a>
  );
}

function documentos(cantidad: number): string {
  return cantidad === 1
    ? "1 documento sin tipo de cambio"
    : `${cantidad} documentos sin tipo de cambio`;
}

export function TableroDeInicio({ tablero }: { readonly tablero: Tablero }) {
  const {
    mes,
    delMes,
    pendientes,
    rentabilidad,
    egresosPorCentro,
    convertido,
  } = tablero;
  const { moneda } = convertido;
  const enlaceDeMes = (elegido: string) =>
    `/?${new URLSearchParams({ mes: elegido, moneda })}`;
  const kpi = (clave: string, cifra: Cifra): ReactNode => (
    <Numero cifra={cifra} id={clave} atributo="data-kpi" />
  );

  return (
    <>
      <h1>Inicio</h1>
      {mes.pedidoInvalido ? (
        <p role="alert" data-mes-invalido>
          El mes pedido no es válido (se escribe AAAA-MM): se muestra el actual.
        </p>
      ) : null}
      <p className="mb-4 flex flex-wrap items-center gap-3">
        <a href={enlaceDeMes(mes.anterior)} data-mes-anterior>
          Mes anterior
        </a>
        <strong data-mes-actual={mes.mes}>{mes.nombre}</strong>
        <a href={enlaceDeMes(mes.siguiente)} data-mes-siguiente>
          Mes siguiente
        </a>
      </p>

      <nav
        aria-label="Moneda del inicio"
        className="mb-2 flex flex-wrap items-center gap-2"
      >
        {(Object.keys(NOMBRES) as Moneda[]).map((codigo) => (
          <a
            key={codigo}
            href={`/?${new URLSearchParams({ mes: mes.mes, moneda: codigo })}`}
            aria-current={codigo === moneda ? "true" : undefined}
            data-selector-moneda={codigo}
            className={clasesDeBoton(
              codigo === moneda ? "primario" : "secundario",
            )}
          >
            {NOMBRES[codigo]}
          </a>
        ))}
      </nav>
      <p className="mb-4 text-sm text-texto-suave" data-nota-de-cambio>
        Pesos convertidos con el último tipo de cambio cargado a esa fecha.
      </p>
      {convertido.sinCambio === 0 ? null : (
        <p
          role="status"
          data-sin-cambio={convertido.sinCambio}
          className="mb-4 flex items-center gap-2 rounded border border-aviso bg-aviso-suave px-3 py-2 font-medium text-aviso"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          <a href={`/sin-tipo-de-cambio?${new URLSearchParams({ moneda })}`}>
            {documentos(convertido.sinCambio)}
          </a>
          <span className="font-normal">y no entran en estos números.</span>
        </p>
      )}

      <h2>{`Del mes, en ${NOMBRES[moneda].toLowerCase()}`}</h2>
      <div className="mb-4">
        <TarjetaKpi
          titulo="Facturación del mes"
          Icono={FileText}
          tamano="grande"
          valor={kpi("facturacion", convertido.facturado)}
          detalle="Sin IVA."
        />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <TarjetaKpi
          titulo="Cobrado"
          Icono={HandCoins}
          valor={kpi("cobrado", convertido.cobrado)}
          detalle="Con retenciones."
        />
        <TarjetaKpi
          titulo="Egresos"
          Icono={Receipt}
          valor={kpi("egresos", convertido.egresos)}
        />
        <TarjetaKpi
          titulo="Pagado"
          Icono={Wallet}
          valor={kpi("pagado", convertido.pagado)}
        />
        <TarjetaKpi
          titulo="Resultado de caja"
          Icono={Scale}
          valor={kpi("resultado-de-caja", convertido.resultadoDeCaja)}
          detalle="Cobrado menos pagado."
        />
        <TarjetaKpi
          titulo="Resultado devengado"
          Icono={ChartColumn}
          valor={kpi("resultado-devengado", convertido.resultadoDevengado)}
          detalle="Facturado sin IVA menos egresos de proyecto y de gestión administrativa; sin lo de fuera de rentabilidad."
        />
      </div>

      <h2>Pendiente, a hoy</h2>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TarjetaKpi
          titulo="Pendiente de cobro"
          Icono={HandCoins}
          valor={kpi("por-cobrar", convertido.porCobrar)}
          detalle={
            <>
              De eso, vencido:{" "}
              {kpi("por-cobrar-vencido", convertido.porCobrarVencido)}
            </>
          }
        />
        <TarjetaKpi
          titulo="Pendiente de pago"
          Icono={Wallet}
          valor={kpi("por-pagar", convertido.porPagar)}
          detalle={
            <>
              De eso, vencido:{" "}
              {kpi("por-pagar-vencido", convertido.porPagarVencido)}
            </>
          }
        />
      </div>

      <h2 className="mt-6">Últimos 12 meses</h2>
      <div data-grafico="meses">
        <Grafico
          tipo="barras"
          titulo={`Facturación y egresos de los últimos 12 meses, en ${NOMBRES[moneda].toLowerCase()}`}
          series={[
            {
              nombre: "Facturación",
              puntos: convertido.meses.map(({ mes: etiqueta, facturado }) => ({
                etiqueta,
                valor: facturado,
              })),
            },
            {
              nombre: "Egresos",
              puntos: convertido.meses.map(({ mes: etiqueta, egresos }) => ({
                etiqueta,
                valor: egresos,
              })),
            },
          ]}
        />
      </div>

      <h2 className="mt-6">Rentabilidad por servicio, de siempre</h2>
      <div data-grafico="rentabilidad">
        <Grafico
          tipo="barras"
          titulo={`Resultado por servicio, en ${NOMBRES[moneda].toLowerCase()}`}
          series={[
            {
              nombre: "Resultado",
              puntos: convertido.rentabilidad.map(
                ({ etiqueta, resultado }) => ({ etiqueta, valor: resultado }),
              ),
            },
          ]}
        />
      </div>

      <h2 className="mt-6">Cada moneda por separado, sin convertir</h2>
      {delMes.length === 0 ? (
        <p data-sin-movimientos>No hay movimientos en este mes.</p>
      ) : null}
      {delMes.map((linea) => (
        <section key={linea.moneda} data-moneda={linea.moneda}>
          <h3>{linea.moneda}</h3>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                titulo: "Facturado sin IVA",
                cifra: linea.facturadoSinIva,
                clave: "facturado-sin-iva",
                Icono: FileText,
              },
              {
                titulo: "Facturado con IVA",
                cifra: linea.facturadoConIva,
                clave: "facturado-con-iva",
                Icono: FileText,
              },
              {
                titulo: "Cobrado",
                detalle: "Con retenciones.",
                cifra: linea.cobrado,
                clave: "cobrado",
                Icono: HandCoins,
              },
              {
                titulo: "Egresos",
                cifra: linea.egresos,
                clave: "egresos",
                Icono: Receipt,
              },
              {
                titulo: "Pagado",
                cifra: linea.pagado,
                clave: "pagado",
                Icono: Wallet,
              },
              {
                titulo: "Resultado de caja",
                detalle: "Cobrado menos pagado.",
                cifra: linea.resultadoDeCaja,
                clave: "resultado-de-caja",
                Icono: Scale,
              },
              {
                titulo: "Resultado devengado",
                detalle:
                  "Facturado sin IVA menos egresos de proyecto y de gestión administrativa; sin lo de fuera de rentabilidad.",
                cifra: linea.resultadoDevengado,
                clave: "resultado-devengado",
                Icono: ChartColumn,
              },
            ].map(({ titulo, detalle, cifra, clave, Icono }) => (
              <TarjetaKpi
                key={clave}
                titulo={titulo}
                Icono={Icono}
                tamano="chica"
                valor={<Numero cifra={cifra} id={`${linea.moneda}-${clave}`} />}
                {...(detalle === undefined ? {} : { detalle })}
              />
            ))}
          </div>
        </section>
      ))}

      <h2 className="mt-6">Pendiente de cobro y de pago, a hoy</h2>
      {pendientes.length === 0 ? (
        <p data-sin-pendientes>No hay nada pendiente.</p>
      ) : null}
      {pendientes.map((linea) => (
        <section key={linea.moneda} data-pendiente={linea.moneda}>
          <h3>{linea.moneda}</h3>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                titulo: "Por cobrar",
                cifra: linea.porCobrar,
                clave: "por-cobrar",
              },
              {
                titulo: "Por cobrar, vencido",
                cifra: linea.porCobrarVencido,
                clave: "por-cobrar-vencido",
              },
              {
                titulo: "Por pagar",
                cifra: linea.porPagar,
                clave: "por-pagar",
              },
              {
                titulo: "Por pagar, vencido",
                cifra: linea.porPagarVencido,
                clave: "por-pagar-vencido",
              },
            ].map(({ titulo, cifra, clave }) => (
              <TarjetaKpi
                key={clave}
                titulo={titulo}
                tamano="chica"
                valor={<Numero cifra={cifra} id={`${linea.moneda}-${clave}`} />}
              />
            ))}
          </div>
        </section>
      ))}

      <h2 className="mt-6">Rentabilidad por servicio, sin convertir</h2>
      {rentabilidad.length === 0 ? (
        <p data-sin-rentabilidad>
          Todavía no hay facturas ni egresos de proyecto.
        </p>
      ) : (
        <Tabla
          cabeceras={[
            "Servicio",
            "Moneda",
            "Facturado sin IVA",
            "Egresos de proyecto",
            "Resultado",
          ]}
        >
          {rentabilidad.map((fila) => (
            <tr key={`${fila.enlace}-${fila.moneda}`}>
              <td>
                <a href={fila.enlace}>{fila.servicio}</a>
              </td>
              <td>{fila.moneda}</td>
              <td>{fila.facturado}</td>
              <td>{fila.egresos}</td>
              <td>{fila.resultado}</td>
            </tr>
          ))}
        </Tabla>
      )}

      <h2 className="mt-6">Egresos por centro de costo</h2>
      {egresosPorCentro.length === 0 ? (
        <p data-sin-egresos>No hay egresos en este mes.</p>
      ) : null}
      {egresosPorCentro.map(({ moneda: codigo, bloques }) => (
        <section key={codigo} data-egresos-moneda={codigo}>
          <h3>{codigo}</h3>
          {bloques.map((bloque) => (
            <div key={bloque.clase} data-clase={bloque.clase}>
              <h4>{bloque.nombre}</h4>
              <Tabla cabeceras={["Centro de costo", "Total"]}>
                {bloque.centros.map((centro) => (
                  <tr key={centro.nombre}>
                    <td>{centro.nombre}</td>
                    <td>
                      <Numero
                        cifra={centro.total}
                        id={`${codigo}-${bloque.clase}-${centro.nombre}`}
                      />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Subtotal de {bloque.nombre}</strong>
                  </td>
                  <td data-subtotal={`${codigo}-${bloque.clase}`}>
                    {bloque.subtotal}
                  </td>
                </tr>
              </Tabla>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

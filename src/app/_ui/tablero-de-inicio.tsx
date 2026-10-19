/**
 * El tablero de inicio (F2-10, ADR 0038) tal como se ve: lo que arma
 * `casos-uso/tablero`, sin leer nada por su cuenta. Aparte de `page.tsx` para
 * que un test lo dibuje con los números de una base sembrada y afirme lo que
 * se ve.
 */

import {
  ChartColumn,
  FileText,
  HandCoins,
  Receipt,
  Scale,
  Wallet,
} from "lucide-react";
import type { Cifra, Tablero } from "../../casos-uso/tablero/tablero.ts";
import { Tabla } from "./tabla.tsx";
import { TarjetaKpi } from "./tarjeta-kpi.tsx";

/** El número, con su enlace si lo tiene. `id` lo distingue en las pruebas. */
function Numero({ cifra, id }: { readonly cifra: Cifra; readonly id: string }) {
  return cifra.enlace === null ? (
    <span data-cifra={id}>{cifra.valor}</span>
  ) : (
    <a href={cifra.enlace} data-cifra={id}>
      {cifra.valor}
    </a>
  );
}

export function TableroDeInicio({ tablero }: { readonly tablero: Tablero }) {
  const { mes, delMes, pendientes, rentabilidad, egresosPorCentro } = tablero;
  return (
    <>
      <h1>Inicio</h1>
      {mes.pedidoInvalido ? (
        <p role="alert" data-mes-invalido>
          El mes pedido no es válido (se escribe AAAA-MM): se muestra el actual.
        </p>
      ) : null}
      <p className="mb-4 flex flex-wrap items-center gap-3">
        <a href={`/?mes=${mes.anterior}`} data-mes-anterior>
          Mes anterior
        </a>
        <strong data-mes-actual={mes.mes}>{mes.nombre}</strong>
        <a href={`/?mes=${mes.siguiente}`} data-mes-siguiente>
          Mes siguiente
        </a>
      </p>

      <h2>Del mes</h2>
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
      ) : (
        <Tabla
          cabeceras={[
            "Moneda",
            "Por cobrar",
            "De eso, vencido",
            "Por pagar",
            "De eso, vencido",
          ]}
        >
          {pendientes.map((linea) => (
            <tr key={linea.moneda} data-pendiente={linea.moneda}>
              <td>{linea.moneda}</td>
              <td>
                <Numero
                  cifra={linea.porCobrar}
                  id={`${linea.moneda}-por-cobrar`}
                />
              </td>
              <td>
                <Numero
                  cifra={linea.porCobrarVencido}
                  id={`${linea.moneda}-por-cobrar-vencido`}
                />
              </td>
              <td>
                <Numero
                  cifra={linea.porPagar}
                  id={`${linea.moneda}-por-pagar`}
                />
              </td>
              <td>
                <Numero
                  cifra={linea.porPagarVencido}
                  id={`${linea.moneda}-por-pagar-vencido`}
                />
              </td>
            </tr>
          ))}
        </Tabla>
      )}

      <h2 className="mt-6">Rentabilidad por servicio, de siempre</h2>
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
      {egresosPorCentro.map(({ moneda, bloques }) => (
        <section key={moneda} data-egresos-moneda={moneda}>
          <h3>{moneda}</h3>
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
                        id={`${moneda}-${bloque.clase}-${centro.nombre}`}
                      />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Subtotal de {bloque.nombre}</strong>
                  </td>
                  <td data-subtotal={`${moneda}-${bloque.clase}`}>
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

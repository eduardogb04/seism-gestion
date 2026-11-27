import { describe, expect, it } from "vitest";
import { parsearCotizacionesBna } from "../../src/server/tipo-de-cambio.ts";

const PAGINA = `
<div class="tab-content">
  <div class="tab-pane fade in active" id="billetes">
    <table class="table cotizacion">
      <thead><tr><th class="fechaCot">26/11/2026</th><th>Compra</th><th>Venta</th></tr></thead>
      <tbody>
        <tr><td class="tit">Dolar U.S.A</td><td>1575,00</td><td>1625,00</td></tr>
        <tr><td class="tit">Euro</td><td>1725,00</td><td>1835,00</td></tr>
      </tbody>
    </table>
  </div>
  <div class="tab-pane fade" id="divisas">
    <table class="table cotizacion">
      <thead><tr><th class="fechaCot">26/11/2026</th><th>Compra</th><th>Venta</th></tr></thead>
      <tbody>
        <tr><td class="tit">Dolar U.S.A</td><td>1592.5000</td><td>1601.5000</td></tr>
        <tr><td class="tit">Euro</td><td>1745.2208</td><td>1759.0876</td></tr>
      </tbody>
    </table>
  </div>
</div>`;

describe("parsearCotizacionesBna", () => {
  it("toma la venta del dólar de cada tabla y la fecha", () => {
    expect(parsearCotizacionesBna(PAGINA)).toEqual({
      fecha: "26/11/2026",
      billete: 1625,
      divisa: 1601.5,
    });
  });

  it("deja en null la tabla que falta", () => {
    const soloBilletes = PAGINA.slice(
      0,
      PAGINA.indexOf('<div class="tab-pane fade" id="divisas">'),
    );
    expect(parsearCotizacionesBna(soloBilletes)).toEqual({
      fecha: "26/11/2026",
      billete: 1625,
      divisa: null,
    });
  });

  it("devuelve null si la página no tiene la forma esperada", () => {
    expect(parsearCotizacionesBna("<html>mantenimiento</html>")).toBeNull();
  });
});

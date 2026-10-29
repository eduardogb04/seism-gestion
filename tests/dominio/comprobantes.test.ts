import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  crearImporte,
  type Importe,
  MONEDAS,
  type Moneda,
} from "../../src/dominio/compartido/importe.ts";
import {
  type CobroDeFactura,
  facturadoNeto,
  todoCobrado,
} from "../../src/dominio/servicios/cobro.ts";
import {
  admiteAnulacion,
  admiteNotaDeCredito,
  admiteNotaDeDebito,
  type ComprobanteConTotal,
  cuentaParaLaOrden,
  importeConSigno,
  type SaldoDeComprobante,
  saldosDeComprobantes,
  type TipoDeComprobante,
} from "../../src/dominio/servicios/comprobante.ts";
import {
  admiteCarga,
  type Carga,
  type EstadoServicio,
} from "../../src/dominio/servicios/estados.ts";
import { configuracion } from "./_arnes/propiedad.ts";

/**
 * F6-03 · Notas de crédito y de débito y la factura adicional: el signo de cada
 * comprobante, el saldo con las notas restadas, lo que consume la orden de
 * compra y el cierre. La propiedad compara las reglas del dominio contra un
 * modelo escrito aparte, con aritmética de enteros. Montos inventados.
 */

const ars = (centavos: bigint) => crearImporte(centavos, "ARS");

function comprobante(
  id: string,
  tipo: TipoDeComprobante,
  total: Importe<Moneda>,
  asociadoId: string | null = null,
  adicional = false,
): ComprobanteConTotal {
  return { id, tipo, adicional, asociadoId, total };
}

describe("el signo y el saldo de cada comprobante", () => {
  it("la nota de crédito resta; la factura y la nota de débito suman", () => {
    expect(importeConSigno("nota_credito", ars(500n))).toEqual(ars(-500n));
    expect(importeConSigno("nota_debito", ars(500n))).toEqual(ars(500n));
    expect(importeConSigno("factura", ars(500n))).toEqual(ars(500n));
  });

  it("la nota de crédito baja el saldo de su asociado y no tiene saldo propio", () => {
    const saldos = saldosDeComprobantes(
      [
        comprobante("f", "factura", ars(1_000n)),
        comprobante("nc", "nota_credito", ars(300n), "f"),
      ],
      (id) => (id === "f" ? [{ importe: ars(200n), retencion: null }] : []),
    );
    expect(saldos.ok).toBe(true);
    if (!saldos.ok) {
      return;
    }
    expect(saldos.valor.map(({ comprobante: { id } }) => id)).toEqual(["f"]);
    const [deLaFactura] = saldos.valor;
    expect(deLaFactura?.saldo.saldo).toEqual(ars(500n));
    expect(deLaFactura?.saldo.acreditado).toEqual(ars(300n));
    expect(deLaFactura && facturadoNeto(deLaFactura.saldo)).toEqual(ars(700n));
  });

  it("una nota de crédito que pasa el saldo del asociado es DOM-0043; con otra moneda o sin asociado con saldo, DOM-0042", () => {
    const vigentes = [
      comprobante("f", "factura", ars(1_000n)),
      comprobante("nc", "nota_credito", ars(400n), "f"),
    ];
    const saldos = saldosDeComprobantes(vigentes, () => []);
    if (!saldos.ok) {
      throw new Error("los saldos tendrían que cerrar");
    }
    expect(admiteNotaDeCredito(saldos.valor, "f", ars(600n)).ok).toBe(true);
    expect(admiteNotaDeCredito(saldos.valor, "f", ars(601n))).toEqual({
      ok: false,
      error: { codigo: "DOM-0043" },
    });
    expect(
      admiteNotaDeCredito(saldos.valor, "f", crearImporte(1n, "USD")),
    ).toEqual({ ok: false, error: { codigo: "DOM-0042" } });
    expect(admiteNotaDeCredito(saldos.valor, "nc", ars(1n))).toEqual({
      ok: false,
      error: { codigo: "DOM-0042" },
    });
    expect(admiteNotaDeDebito(saldos.valor, null, "USD")).toEqual({
      ok: true,
      valor: null,
    });
    expect(admiteNotaDeDebito(saldos.valor, "otro", "ARS")).toEqual({
      ok: false,
      error: { codigo: "DOM-0042" },
    });
  });

  it("un comprobante con notas de crédito vigentes no se anula (DOM-0044); la nota sí", () => {
    const vigentes = [
      comprobante("f", "factura", ars(1_000n)),
      comprobante("nc", "nota_credito", ars(400n), "f"),
    ];
    expect(admiteAnulacion(vigentes, "f")).toEqual({
      ok: false,
      error: { codigo: "DOM-0044" },
    });
    expect(admiteAnulacion(vigentes, "nc").ok).toBe(true);
  });

  it("consume la orden la factura no adicional y lo que cuelga de ella; la adicional y lo suyo, no", () => {
    const todos = [
      comprobante("f", "factura", ars(1n)),
      comprobante("a", "factura", ars(1n), null, true),
      comprobante("d", "nota_debito", ars(1n), "f"),
      comprobante("nd", "nota_credito", ars(1n), "d"),
      comprobante("na", "nota_credito", ars(1n), "a"),
      comprobante("suelta", "nota_debito", ars(1n)),
    ];
    expect(
      todos.filter((uno) => cuentaParaLaOrden(uno, todos)).map(({ id }) => id),
    ).toEqual(["f", "d", "nd"]);
  });
});

/** Una operación de la secuencia; los índices pueden apuntar a algo que no existe o ya se anuló. */
type Operacion =
  | {
      readonly que: "alta";
      readonly tipo: TipoDeComprobante;
      readonly adicional: boolean;
      readonly moneda: Moneda;
      readonly centavos: bigint;
      readonly asociado: number | null;
    }
  | { readonly que: "cobro"; readonly de: number; readonly centavos: bigint }
  | { readonly que: "anularComprobante"; readonly cual: number }
  | { readonly que: "anularCobro"; readonly cual: number };

const centavos = fc.bigInt({ min: 1n, max: 1_000n });
const indice = fc.nat({ max: 5 });

const operacion: fc.Arbitrary<Operacion> = fc.oneof(
  fc.record({
    que: fc.constant("alta" as const),
    tipo: fc.constantFrom<TipoDeComprobante>(
      "factura",
      "nota_debito",
      "nota_credito",
    ),
    adicional: fc.boolean(),
    moneda: fc.constantFrom<Moneda>(...MONEDAS),
    centavos,
    asociado: fc.option(indice, { nil: null }),
  }),
  fc.record({ que: fc.constant("cobro" as const), de: indice, centavos }),
  fc.record({ que: fc.constant("anularComprobante" as const), cual: indice }),
  fc.record({ que: fc.constant("anularCobro" as const), cual: indice }),
);

/** El modelo: listas y enteros, sin una sola función del dominio. */
class Modelo {
  readonly comprobantes: {
    id: string;
    tipo: TipoDeComprobante;
    moneda: Moneda;
    total: bigint;
    asociado: string | null;
    vigente: boolean;
  }[] = [];
  readonly cobros: {
    id: string;
    de: string;
    importe: bigint;
    vigente: boolean;
  }[] = [];
  cerrado = false;

  private vigente(id: string | null) {
    return this.comprobantes.find((c) => c.id === id && c.vigente);
  }

  saldo(id: string): bigint {
    const propio = this.vigente(id);
    if (propio === undefined) {
      return 0n;
    }
    const creditos = this.comprobantes
      .filter(
        (c) => c.vigente && c.tipo === "nota_credito" && c.asociado === id,
      )
      .reduce((suma, c) => suma + c.total, 0n);
    const cobrado = this.cobros
      .filter((c) => c.vigente && c.de === id)
      .reduce((suma, c) => suma + c.importe, 0n);
    return propio.total - creditos - cobrado;
  }

  conSaldo() {
    return this.comprobantes.filter(
      (c) => c.vigente && c.tipo !== "nota_credito",
    );
  }

  facturado(moneda: Moneda): bigint {
    return this.comprobantes
      .filter((c) => c.vigente && c.moneda === moneda)
      .reduce(
        (suma, c) => suma + (c.tipo === "nota_credito" ? -c.total : c.total),
        0n,
      );
  }

  aplicar(op: Operacion, id: string): boolean {
    const acepta = !this.cerrado && this.acepta(op);
    if (acepta) {
      this.hacer(op, id);
      const conSaldo = this.conSaldo();
      this.cerrado =
        conSaldo.length > 0 && conSaldo.every((c) => this.saldo(c.id) === 0n);
    }
    return acepta;
  }

  private acepta(op: Operacion): boolean {
    switch (op.que) {
      case "alta": {
        const asociado = this.vigente(
          op.asociado === null ? null : `c${op.asociado}`,
        );
        const sirve =
          asociado !== undefined &&
          asociado.tipo !== "nota_credito" &&
          asociado.moneda === op.moneda;
        if (op.tipo === "nota_credito") {
          return sirve && op.centavos <= this.saldo(asociado?.id ?? "");
        }
        return op.tipo === "factura" || op.asociado === null || sirve;
      }
      case "cobro": {
        const de = this.vigente(`c${op.de}`);
        return (
          de !== undefined &&
          de.tipo !== "nota_credito" &&
          op.centavos <= this.saldo(de.id)
        );
      }
      case "anularComprobante": {
        const id = `c${op.cual}`;
        return (
          this.vigente(id) !== undefined &&
          !this.comprobantes.some(
            (c) => c.vigente && c.tipo === "nota_credito" && c.asociado === id,
          ) &&
          !this.cobros.some((c) => c.vigente && c.de === id)
        );
      }
      case "anularCobro":
        return this.cobros.some((c) => c.id === `p${op.cual}` && c.vigente);
    }
  }

  private hacer(op: Operacion, id: string): void {
    switch (op.que) {
      case "alta":
        this.comprobantes.push({
          id,
          tipo: op.tipo,
          moneda: op.moneda,
          total: op.centavos,
          asociado:
            op.tipo === "factura" || op.asociado === null
              ? null
              : `c${op.asociado}`,
          vigente: true,
        });
        return;
      case "cobro":
        this.cobros.push({
          id,
          de: `c${op.de}`,
          importe: op.centavos,
          vigente: true,
        });
        return;
      case "anularComprobante":
        for (const c of this.comprobantes) {
          if (c.id === `c${op.cual}`) {
            c.vigente = false;
          }
        }
        return;
      case "anularCobro":
        for (const c of this.cobros) {
          if (c.id === `p${op.cual}`) {
            c.vigente = false;
          }
        }
        return;
    }
  }
}

/** El servicio con las reglas del dominio: lo que hacen los casos de uso, sin la base. */
class Sistema {
  comprobantes: ComprobanteConTotal[] = [];
  cobros: { id: string; de: string; cobro: CobroDeFactura<Moneda> }[] = [];
  estado: EstadoServicio = "finalizado";

  saldos(comprobantes = this.comprobantes, cobros = this.cobros) {
    return saldosDeComprobantes(comprobantes, (id) =>
      cobros.filter(({ de }) => de === id).map(({ cobro }) => cobro),
    );
  }

  aplicar(op: Operacion, id: string): boolean {
    const carga: Carga =
      op.que === "cobro" || op.que === "anularCobro"
        ? "cobro"
        : op.que === "alta" && op.tipo === "factura" && !op.adicional
          ? "factura"
          : "ajuste";
    const actual = this.saldos();
    if (!admiteCarga(this.estado, carga) || !actual.ok) {
      return false;
    }
    const hecho = this.hacer(op, id, actual.valor);
    if (hecho) {
      const despues = this.saldos();
      if (despues.ok && todoCobrado(despues.valor.map(({ saldo }) => saldo))) {
        this.estado = "cerrado";
      }
    }
    return hecho;
  }

  private hacer(
    op: Operacion,
    id: string,
    saldos: readonly SaldoDeComprobante<ComprobanteConTotal>[],
  ): boolean {
    switch (op.que) {
      case "alta": {
        const total = crearImporte(op.centavos, op.moneda);
        const asociadoId = op.asociado === null ? null : `c${op.asociado}`;
        if (op.tipo === "factura") {
          this.comprobantes.push(
            comprobante(id, "factura", total, null, op.adicional),
          );
          return true;
        }
        const admitida =
          op.tipo === "nota_credito"
            ? asociadoId !== null &&
              admiteNotaDeCredito(saldos, asociadoId, total).ok
            : admiteNotaDeDebito(saldos, asociadoId, op.moneda).ok;
        if (admitida) {
          this.comprobantes.push(comprobante(id, op.tipo, total, asociadoId));
        }
        return admitida;
      }
      case "cobro": {
        const de = this.comprobantes.find((c) => c.id === `c${op.de}`);
        if (de === undefined) {
          return false;
        }
        const cobros = [
          ...this.cobros,
          {
            id,
            de: de.id,
            cobro: {
              importe: crearImporte(op.centavos, de.total.moneda),
              retencion: null,
            },
          },
        ];
        const nuevos = this.saldos(this.comprobantes, cobros);
        const cobrable = saldos.some(({ comprobante: c }) => c.id === de.id);
        if (!cobrable || !nuevos.ok) {
          return false;
        }
        this.cobros = cobros;
        return true;
      }
      case "anularComprobante": {
        const cual = `c${op.cual}`;
        if (
          !this.comprobantes.some((c) => c.id === cual) ||
          !admiteAnulacion(this.comprobantes, cual).ok ||
          this.cobros.some(({ de }) => de === cual)
        ) {
          return false;
        }
        this.comprobantes = this.comprobantes.filter((c) => c.id !== cual);
        return true;
      }
      case "anularCobro": {
        const antes = this.cobros.length;
        this.cobros = this.cobros.filter((c) => c.id !== `p${op.cual}`);
        return this.cobros.length < antes;
      }
    }
  }
}

describe("propiedad: cualquier secuencia de comprobantes, cobros y anulaciones", () => {
  it("acepta lo mismo que el modelo; facturado con signo, saldos y por cobrar no negativos, y cerrado si y solo si todo está en cero", () => {
    fc.assert(
      fc.property(fc.array(operacion, { maxLength: 40 }), (operaciones) => {
        const modelo = new Modelo();
        const sistema = new Sistema();
        operaciones.forEach((op, posicion) => {
          const id = `${op.que === "cobro" ? "p" : "c"}${posicion}`;
          const enModelo = modelo.aplicar(op, id);
          expect(sistema.aplicar(op, id)).toBe(enModelo);

          const saldos = sistema.saldos();
          expect(saldos.ok).toBe(true);
          if (!saldos.ok) {
            return;
          }
          for (const { comprobante: c, saldo } of saldos.valor) {
            expect(saldo.saldo.centavos).toBe(modelo.saldo(c.id));
            expect(saldo.saldo.centavos >= 0n).toBe(true);
          }
          expect(saldos.valor.map(({ comprobante: c }) => c.id)).toEqual(
            modelo.conSaldo().map((c) => c.id),
          );
          for (const moneda of MONEDAS) {
            const neto = saldos.valor
              .filter(({ saldo }) => saldo.total.moneda === moneda)
              .reduce(
                (suma, { saldo }) => suma + facturadoNeto(saldo).centavos,
                0n,
              );
            const conSigno = sistema.comprobantes
              .filter(({ total }) => total.moneda === moneda)
              .reduce(
                (suma, { tipo, total }) =>
                  suma + importeConSigno(tipo, total).centavos,
                0n,
              );
            expect(neto).toBe(modelo.facturado(moneda));
            expect(conSigno).toBe(modelo.facturado(moneda));
            const porCobrar = saldos.valor
              .filter(({ saldo }) => saldo.saldo.moneda === moneda)
              .reduce((suma, { saldo }) => suma + saldo.saldo.centavos, 0n);
            expect(porCobrar >= 0n).toBe(true);
          }
          expect(sistema.estado === "cerrado").toBe(modelo.cerrado);
        });
      }),
      { ...configuracion<[Operacion[]]>(), numRuns: 1000 },
    );
  });
});

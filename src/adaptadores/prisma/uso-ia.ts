/**
 * Registro de uso de IA con Prisma (F0-28, ADR 0026): implementa
 * `RepositorioUsoIa` (`src/puertos/repositorios/uso-ia.ts`) sobre la tabla
 * `uso_ia`. `costo_usd` es `Decimal(14,6)`: entra y sale como texto decimal,
 * nunca como `number`, y del lado del código son micro-dólares `bigint`.
 */
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import { nuevoError } from "../../dominio/compartido/errores/error-sistema.ts";
import {
  formatearUsd,
  parsearUsd,
} from "../../dominio/compartido/micro-usd.ts";
import type { RepositorioUsoIa } from "../../puertos/repositorios/uso-ia.ts";
import { instanteDe } from "./fecha-hora.ts";
import { Prisma, type PrismaClient } from "./generado/client.ts";

/** Decimales de `uso_ia.costo_usd`: un micro-dólar. */
const DECIMALES_COSTO = 6;

export function crearRepositorioUsoIa(prisma: PrismaClient): RepositorioUsoIa {
  return {
    async registrar(registro) {
      await prisma.usoIa.create({
        data: {
          en: instanteDe(registro.en),
          perfil: registro.perfil,
          modelo: registro.modelo,
          versionPrompt: registro.versionPrompt,
          costoUsd: formatearUsd(registro.costoMicroUsd),
          tokens: registro.tokens,
          // Un JSON `null` de primer nivel se guarda como el valor JSON
          // `null`, no como SQL NULL (la columna es NOT NULL).
          propuesta:
            registro.propuesta === null ? Prisma.JsonNull : registro.propuesta,
          propuestaValida: registro.propuestaValida,
        },
      });
    },

    async costoEntre(desde, hasta) {
      const { _sum } = await prisma.usoIa.aggregate({
        _sum: { costoUsd: true },
        where: { en: { gte: instanteDe(desde), lt: instanteDe(hasta) } },
      });
      const texto = _sum.costoUsd?.toFixed(DECIMALES_COSTO) ?? "0";
      const suma = parsearUsd(texto);
      if (!suma.ok) {
        throw nuevoError(catalogo.INF_0001, {
          motivo: "la suma de uso_ia.costo_usd no se pudo leer como dólares",
          texto,
        });
      }
      return suma.valor;
    },
  };
}

/**
 * El punto de armado del almacén de documentos (F0-27, ADR 0004 y 0022):
 * `ALMACEN` elige la implementación del puerto `AlmacenDocumentos`. Es el
 * único lugar fuera de `src/adaptadores` que conoce las dos; el resto de la
 * app pide un `AlmacenDocumentos` y no sabe cuál le tocó.
 *
 * Recibe el entorno ya validado (`src/infraestructura/entorno.ts`): con
 * `ALMACEN=s3` el esquema ya exigió las cuatro `S3_*`, así que acá no se
 * vuelve a preguntar.
 *
 * También arma la clave de un documento nuevo con lo real: el reloj del
 * sistema (`src/adaptadores/reloj/sistema.ts`, F0-22) y los UUID de
 * `node:crypto`. Es el primer lugar donde se inyecta el reloj real.
 */

import { crearAlmacenDisco } from "../../adaptadores/disco/almacen-documentos.ts";
import { crearGeneradorIdCrypto } from "../../adaptadores/memoria/generador-id.ts";
import { crearRelojSistema } from "../../adaptadores/reloj/sistema.ts";
import { crearAlmacenS3 } from "../../adaptadores/s3/almacen-documentos.ts";
import {
  type AlmacenDocumentos,
  claveDocumento,
  type Referencia,
} from "../../puertos/almacen-documentos.ts";
import type { Entorno } from "../entorno.ts";

const reloj = crearRelojSistema();
const generadorId = crearGeneradorIdCrypto();

/** `documentos/<año de hoy>/<uuid nuevo>`, para guardar un documento nuevo. */
export function nuevaClaveDocumento(): Referencia {
  return claveDocumento(reloj, generadorId);
}

export function crearAlmacenDocumentos(entorno: Entorno): AlmacenDocumentos {
  switch (entorno.ALMACEN) {
    case "disco":
      return crearAlmacenDisco({ directorio: entorno.ALMACEN_DIRECTORIO });
    case "s3":
      return crearAlmacenS3({
        endpoint: entorno.S3_ENDPOINT,
        bucket: entorno.S3_BUCKET,
        accessKey: entorno.S3_ACCESS_KEY,
        secretKey: entorno.S3_SECRET_KEY,
        region: entorno.S3_REGION,
      });
  }
}

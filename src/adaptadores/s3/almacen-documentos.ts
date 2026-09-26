/**
 * El almacén de documentos en un servicio compatible con S3 (F0-27, ADR
 * 0022): la implementación de `ALMACEN=s3`. En local, el MinIO de
 * `docker-compose.yml`; en el servidor, Cloudflare R2 (F0-36 lo prueba con
 * las credenciales, sin código nuevo). Pasa la misma suite de contrato que la
 * de disco (`tests/contratos/almacen-documentos.ts`).
 *
 * - `forcePathStyle: true`: la URL es `<endpoint>/<bucket>/<clave>`, no
 *   `<bucket>.<endpoint>/<clave>`. MinIO en local no tiene DNS por bucket.
 * - Los checksums del SDK solo cuando la operación los exige
 *   (`WHEN_REQUIRED`): los que el SDK agrega por defecto desde 2025 no los
 *   aceptan todos los servicios compatibles.
 * - `urlTemporal` es una URL firmada de `GetObject` (presigner del SDK) que
 *   vence a los minutos pedidos.
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { catalogo } from "../../dominio/compartido/errores/catalogo.ts";
import {
  type ErrorSistema,
  nuevoError,
} from "../../dominio/compartido/errores/error-sistema.ts";
import {
  type AlmacenDocumentos,
  exigirMinutosValidos,
  type Referencia,
  referenciaDesde,
} from "../../puertos/almacen-documentos.ts";

export interface OpcionesAlmacenS3 {
  /** `http://` o `https://`, sin el bucket. */
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
  /** `auto` en R2; MinIO acepta cualquiera. */
  readonly region: string;
}

/**
 * Si `HeadObject` contestó 404. Esa respuesta no trae cuerpo: un bucket que
 * no existe también da 404 y no se distingue. `GetObject` sí distingue
 * (`NoSuchKey` contra `NoSuchBucket`), y `leer` lo aprovecha.
 */
function esNoExiste(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    error.$metadata.httpStatusCode === 404
  );
}

function errorDeS3(
  operacion: string,
  clave: string,
  causa: unknown,
): ErrorSistema {
  return nuevoError(catalogo.INF_0001, { operacion, clave }, causa);
}

export function crearAlmacenS3(opciones: OpcionesAlmacenS3): AlmacenDocumentos {
  const cliente = new S3Client({
    endpoint: opciones.endpoint,
    region: opciones.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: opciones.accessKey,
      secretAccessKey: opciones.secretKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = opciones.bucket;

  return {
    async guardar(clave, bytes, tipoMime): Promise<Referencia> {
      const referencia = referenciaDesde(clave);
      try {
        await cliente.send(
          new PutObjectCommand({
            Bucket,
            Key: referencia,
            Body: bytes,
            ContentType: tipoMime,
          }),
        );
      } catch (error) {
        throw errorDeS3("guardar", referencia, error);
      }
      return referencia;
    },

    async leer(referencia) {
      const Key = referenciaDesde(referencia);
      try {
        const respuesta = await cliente.send(
          new GetObjectCommand({ Bucket, Key }),
        );
        if (respuesta.Body === undefined) {
          return new Uint8Array(0);
        }
        return await respuesta.Body.transformToByteArray();
      } catch (error) {
        if (error instanceof NoSuchKey) {
          throw nuevoError(catalogo.ALM_0001, { clave: Key }, error);
        }
        throw errorDeS3("leer", Key, error);
      }
    },

    async existe(referencia) {
      const Key = referenciaDesde(referencia);
      try {
        await cliente.send(new HeadObjectCommand({ Bucket, Key }));
        return true;
      } catch (error) {
        if (esNoExiste(error)) {
          return false;
        }
        throw errorDeS3("existe", Key, error);
      }
    },

    async urlTemporal(referencia, minutos) {
      const Key = referenciaDesde(referencia);
      exigirMinutosValidos(minutos);
      return getSignedUrl(cliente, new GetObjectCommand({ Bucket, Key }), {
        expiresIn: minutos * 60,
      });
    },
  };
}

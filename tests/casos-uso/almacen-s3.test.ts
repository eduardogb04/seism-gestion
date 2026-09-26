import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  crearAlmacenS3,
  type OpcionesAlmacenS3,
} from "../../src/adaptadores/s3/almacen-documentos.ts";
import { catalogo } from "../../src/dominio/compartido/errores/catalogo.ts";
import { crearAlmacenDocumentos } from "../../src/infraestructura/arranque/almacen.ts";
import { referenciaDesde } from "../../src/puertos/almacen-documentos.ts";
import { suiteAlmacenDocumentos } from "../contratos/almacen-documentos.ts";
import {
  imagenMinioDeCompose,
  levantarMinio,
  levantarMinioDeCompose,
  type MinioLevantado,
} from "./_arnes/minio.ts";

/**
 * F0-27: el almacén S3 contra MinIO. La suite de contrato (la misma que corre
 * el disco) dos veces: contra MinIO de Testcontainers y contra los servicios
 * de `docker-compose.yml` con las variables de `.env.example`. Además, lo
 * propio de S3: la URL firmada descarga los mismos bytes y vence a los
 * minutos pedidos, y el armado con `ALMACEN=s3`.
 */

// 25 corridas de hasta 256 KB: cada una es un PUT y un GET por HTTP contra
// MinIO; con 100 (las del disco) la tanda se va a minutos, dos veces (P9).
const NUM_RUNS_S3 = 25;

describe("MinIO: una sola imagen, fijada por digest", () => {
  it("minio y minio-init de docker-compose.yml usan la misma imagen, con digest, y el arnés usa esa", () => {
    const imagen = imagenMinioDeCompose();
    expect(imagen).toMatch(/@sha256:[0-9a-f]{64}$/);
    const compose = readFileSync("docker-compose.yml", "utf8");
    expect(compose.split(`image: ${imagen}`).length - 1).toBe(2);
  });
});

describe("almacén S3 contra MinIO de Testcontainers", () => {
  let minio: MinioLevantado;

  beforeAll(async () => {
    minio = await levantarMinio();
  });

  afterAll(async () => {
    await minio?.apagar();
  });

  suiteAlmacenDocumentos(
    "s3 (MinIO en Testcontainers)",
    async () => crearAlmacenS3(minio.opciones),
    { numRuns: NUM_RUNS_S3 },
  );

  describe("urlTemporal", () => {
    it("un fetch a la URL firmada descarga los mismos bytes, con el tipo MIME guardado", async () => {
      const almacen = crearAlmacenS3(minio.opciones);
      const bytes = new Uint8Array(randomBytes(50_000));
      const referencia = await almacen.guardar(
        `documentos/2031/${randomUUID()}`,
        bytes,
        "application/pdf",
      );

      const respuesta = await fetch(await almacen.urlTemporal(referencia, 5));

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get("content-type")).toBe("application/pdf");
      expect(
        Buffer.from(await respuesta.arrayBuffer()).equals(Buffer.from(bytes)),
      ).toBe(true);
    });

    it.each([1, 15, 10_080])(
      "con %d minutos, la firma vence a esos minutos (X-Amz-Expires en segundos)",
      async (minutos) => {
        const almacen = crearAlmacenS3(minio.opciones);
        const url = new URL(
          await almacen.urlTemporal(
            referenciaDesde(`documentos/2031/${randomUUID()}`),
            minutos,
          ),
        );
        expect(url.searchParams.get("X-Amz-Expires")).toBe(
          String(minutos * 60),
        );
        expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]+$/);
      },
    );

    it("la vigencia está firmada: si se la estira a mano, MinIO rechaza la URL", async () => {
      const almacen = crearAlmacenS3(minio.opciones);
      const referencia = await almacen.guardar(
        `documentos/2031/${randomUUID()}`,
        Uint8Array.of(1, 2, 3),
        "text/plain",
      );
      const url = new URL(await almacen.urlTemporal(referencia, 1));
      url.searchParams.set("X-Amz-Expires", String(10_080 * 60));

      const respuesta = await fetch(url);

      expect(respuesta.status).toBe(403);
    });

    it("la URL va con el bucket en la ruta (forcePathStyle), no en el nombre del servidor", async () => {
      const almacen = crearAlmacenS3(minio.opciones);
      const url = new URL(
        await almacen.urlTemporal(referenciaDesde("documentos/2031/estilo"), 5),
      );
      expect(url.origin).toBe(minio.opciones.endpoint);
      expect(url.pathname).toBe(
        `/${minio.opciones.bucket}/documentos/2031/estilo`,
      );
    });
  });

  describe("errores que no son 'no existe'", () => {
    it("con un bucket que no existe, guardar y leer fallan con INF-0001 (no ALM-0001) y la causa", async () => {
      const almacen = crearAlmacenS3({
        ...minio.opciones,
        bucket: "bucket-que-no-existe",
      });
      const clave = `documentos/2031/${randomUUID()}`;
      await expect(
        almacen.guardar(clave, Uint8Array.of(1), "text/plain"),
      ).rejects.toMatchObject({
        codigo: catalogo.INF_0001.codigo,
        detalles: { operacion: "guardar", clave },
        cause: expect.anything(),
      });
      await expect(almacen.leer(referenciaDesde(clave))).rejects.toMatchObject({
        codigo: catalogo.INF_0001.codigo,
        detalles: { operacion: "leer", clave },
      });
    });

    it("con credenciales equivocadas, existe falla con INF-0001 en vez de decir que no existe", async () => {
      const almacen = crearAlmacenS3({
        ...minio.opciones,
        secretKey: "clave-equivocada",
      });
      await expect(
        almacen.existe(referenciaDesde("documentos/2031/x")),
      ).rejects.toMatchObject({ codigo: catalogo.INF_0001.codigo });
    });
  });

  describe("arranque: ALMACEN=s3", () => {
    it("arma el almacén S3 con las S3_* del entorno: lo que guarda queda en MinIO", async () => {
      const { opciones } = minio;
      const almacen = crearAlmacenDocumentos({
        APP_ENTORNO: "local",
        DATABASE_URL: "postgresql://ficticio:ficticio@localhost:5432/ficticia",
        ALMACEN: "s3",
        S3_ENDPOINT: opciones.endpoint,
        S3_BUCKET: opciones.bucket,
        S3_ACCESS_KEY: opciones.accessKey,
        S3_SECRET_KEY: opciones.secretKey,
        S3_REGION: opciones.region,
      });
      const referencia = await almacen.guardar(
        `documentos/2031/${randomUUID()}`,
        Uint8Array.of(4, 2),
        "text/plain",
      );
      expect(await crearAlmacenS3(opciones).existe(referencia)).toBe(true);
    });
  });
});

describe("almacén S3 contra el MinIO de docker-compose.yml (bucket creado por minio-init)", () => {
  let minio: MinioLevantado;

  beforeAll(async () => {
    minio = await levantarMinioDeCompose();
  });

  afterAll(async () => {
    await minio?.apagar();
  });

  suiteAlmacenDocumentos(
    "s3 (MinIO de compose, con .env.example)",
    async () => crearAlmacenS3(minio.opciones),
    { numRuns: NUM_RUNS_S3 },
  );

  it("las opciones salen de .env.example y apuntan al bucket que creó minio-init", () => {
    const opciones: OpcionesAlmacenS3 = minio.opciones;
    expect(opciones.bucket).toBe("seism-documentos");
    expect(opciones.accessKey).toBe("seism_local");
  });
});

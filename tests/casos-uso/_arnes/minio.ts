/**
 * MinIO para los tests del almacén S3 (F0-27): dos formas de levantarlo, las
 * dos con puertos al azar para no chocar con el MinIO de todos los días ni con
 * otra corrida.
 *
 * - `levantarMinio()`: un contenedor de Testcontainers con la **misma imagen**
 *   que `docker-compose.yml` (`imagenMinioDeCompose()` la lee de ahí: hay una
 *   sola fuente del tag y el digest). El bucket lo crea el arnés con
 *   `CreateBucketCommand`.
 * - `levantarMinioDeCompose()`: los servicios `minio` y `minio-init` del
 *   `docker-compose.yml` del repo, tal cual, con las credenciales y el bucket
 *   de `.env.example`. Prueba que lo que usa un desarrollador en local anda:
 *   si `minio-init` no creara el bucket, la suite fallaría.
 *
 * A diferencia del Postgres (`contenedor.ts`), no es un `globalSetup`: lo
 * levanta solo el archivo que lo usa (`tests/casos-uso/almacen-s3.test.ts`).
 * Si el proceso muere antes de apagarlo, lo borra Ryuk.
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import {
  DockerComposeEnvironment,
  GenericContainer,
  Wait,
} from "testcontainers";
import type { OpcionesAlmacenS3 } from "../../../src/adaptadores/s3/almacen-documentos.ts";

const PUERTO_MINIO = 9000;

/** Un MinIO levantado: cómo hablarle y cómo apagarlo. */
export interface MinioLevantado {
  readonly opciones: OpcionesAlmacenS3;
  apagar(): Promise<void>;
}

/**
 * La imagen de MinIO de `docker-compose.yml`, con su tag y su digest. Los dos
 * servicios de MinIO de compose la repiten: si difieren, falla.
 */
export function imagenMinioDeCompose(): string {
  const compose = readFileSync("docker-compose.yml", "utf8");
  const imagenes = [
    ...compose.matchAll(/^\s*image:\s*(\S*\/minio:\S+)\s*$/gm),
  ].map((coincidencia) => coincidencia[1]);
  const distintas = new Set(imagenes);
  const [imagen] = distintas;
  if (imagen === undefined || distintas.size !== 1) {
    throw new Error(
      `docker-compose.yml tiene que tener una sola imagen de MinIO, repetida en minio y minio-init; tiene: ${[...distintas].join(", ") || "ninguna"}`,
    );
  }
  if (!/@sha256:[0-9a-f]{64}$/.test(imagen)) {
    throw new Error(
      `la imagen de MinIO de docker-compose.yml tiene que ir fijada por digest: ${imagen}`,
    );
  }
  return imagen;
}

/** Las variables de `.env.example`, sin comentarios. */
export function variablesDeEnvExample(): Readonly<Record<string, string>> {
  const variables: Record<string, string> = {};
  for (const linea of readFileSync(".env.example", "utf8").split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea);
    if (coincidencia?.[1] !== undefined && coincidencia[2] !== undefined) {
      variables[coincidencia[1]] = coincidencia[2];
    }
  }
  return variables;
}

/** Un puerto TCP libre de la máquina, en este momento. */
async function puertoLibre(): Promise<number> {
  return new Promise((resolver, rechazar) => {
    const servidor = createServer();
    servidor.once("error", rechazar);
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address();
      servidor.close(() => {
        if (direccion === null || typeof direccion === "string") {
          rechazar(new Error("no se pudo obtener un puerto libre"));
        } else {
          resolver(direccion.port);
        }
      });
    });
  });
}

/** MinIO en Testcontainers, con un bucket nuevo y credenciales ficticias. */
export async function levantarMinio(): Promise<MinioLevantado> {
  const usuario = "prueba_minio";
  const clave = "prueba_minio_clave";
  const contenedor = await new GenericContainer(imagenMinioDeCompose())
    .withEntrypoint(["minio"])
    .withCommand(["server", "/tmp/datos"])
    .withEnvironment({ MINIO_ROOT_USER: usuario, MINIO_ROOT_PASSWORD: clave })
    .withTmpFs({ "/tmp/datos": "rw" })
    .withExposedPorts(PUERTO_MINIO)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", PUERTO_MINIO))
    .start();

  const opciones: OpcionesAlmacenS3 = {
    endpoint: `http://${contenedor.getHost()}:${contenedor.getMappedPort(PUERTO_MINIO)}`,
    bucket: "documentos-de-prueba",
    accessKey: usuario,
    secretKey: clave,
    region: "auto",
  };

  const cliente = new S3Client({
    endpoint: opciones.endpoint,
    region: opciones.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: opciones.accessKey,
      secretAccessKey: opciones.secretKey,
    },
  });
  await cliente.send(new CreateBucketCommand({ Bucket: opciones.bucket }));
  cliente.destroy();

  return {
    opciones,
    apagar: async () => {
      await contenedor.stop();
    },
  };
}

/**
 * Los servicios `minio` y `minio-init` de `docker-compose.yml`, en un proyecto
 * de compose propio (nombre al azar) y en un puerto libre. Espera a que
 * `minio-init` termine bien: recién ahí existe el bucket.
 */
export async function levantarMinioDeCompose(): Promise<MinioLevantado> {
  const variables = variablesDeEnvExample();
  const puerto = await puertoLibre();
  const puertoConsola = await puertoLibre();
  const entorno = await new DockerComposeEnvironment(".", "docker-compose.yml")
    .withEnvironment({
      MINIO_PUERTO: String(puerto),
      MINIO_PUERTO_CONSOLA: String(puertoConsola),
    })
    .withWaitStrategy("minio-1", Wait.forHealthCheck())
    .withWaitStrategy("minio-init-1", Wait.forOneShotStartup())
    .up(["minio", "minio-init"]);

  const endpoint = new URL(variables.S3_ENDPOINT ?? "");
  endpoint.port = String(puerto);

  return {
    opciones: {
      endpoint: endpoint.origin,
      bucket: variables.S3_BUCKET ?? "",
      accessKey: variables.S3_ACCESS_KEY ?? "",
      secretKey: variables.S3_SECRET_KEY ?? "",
      region: variables.S3_REGION ?? "auto",
    },
    apagar: async () => {
      await entorno.down({ removeVolumes: true });
    },
  };
}

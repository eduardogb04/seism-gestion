/**
 * Punto de entrada que Next.js levanta **una vez al arrancar el servidor**,
 * antes de atender pedidos (`register`), tanto en `next dev` como en el
 * servidor de producción (`.next/standalone/server.js`). Es parte de la
 * entrada `app`: rigen las mismas reglas de límites (ADR 0005).
 *
 * Acá se valida el entorno (F0-04): si una variable falta o es inválida, se
 * escribe qué variable en stderr y el proceso termina con código 1. La app
 * no arranca a medias. No corre en `next build`: compilar no necesita `.env`.
 *
 * Next compila este archivo también para el runtime Edge, que no tiene
 * `process.exit`. La validación corre solo en Node, que es donde vive el
 * servidor, y se importa adentro de la condición para que el código de Node
 * no entre al compilado de Edge (es el patrón que documenta Next).
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { exigirEntornoValido } = await import(
      "./infraestructura/entorno.ts"
    );
    exigirEntornoValido();
  }
}

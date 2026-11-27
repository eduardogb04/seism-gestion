/**
 * El comprobante interno imprimible de un servicio sin factura (R8, SYSTEM_SPEC
 * §5.1): una página A4 sola, sin el marco de la app, con el botón «Imprimir /
 * Guardar PDF». Es un `route.ts` para no heredar el layout del servicio. Los
 * datos salen de la base; nada va fijo en el código.
 */

import type { ComprobanteInterno } from "../../../../../casos-uso/servicios/facturas.ts";
import { armado } from "../../../../../infraestructura/arranque/armado.ts";
import { sesionActual } from "../../../../(auth)/sesion-de-cookie.ts";

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const esc = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

function pagina(c: ComprobanteInterno): string {
  const filas = [
    ...(c.cotizado === ""
      ? []
      : [
          `<tr><td>Servicio cotizado</td><td class="n">${esc(c.cotizado)}</td></tr>`,
        ]),
    ...c.ajustes.map(
      (a) =>
        `<tr><td>${esc(a.concepto)}</td><td class="n">${esc(a.importe)}</td></tr>`,
    ),
    ...(c.totalDelServicio === ""
      ? []
      : [
          `<tr class="t"><td>Total del servicio</td><td class="n">${esc(c.totalDelServicio)}</td></tr>`,
        ]),
  ].join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comprobante interno ${esc(c.numero)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font: 14px/1.5 system-ui, sans-serif; color: black; margin: 0; background: whitesmoke; }
  main { background: white; max-width: 210mm; margin: 0 auto; padding: 18mm; box-sizing: border-box; min-height: 100vh; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid black; padding-bottom: 12px; }
  header img { height: 56px; }
  h1 { font-size: 20px; margin: 0; text-align: right; }
  .meta { display: grid; grid-template-columns: 8rem 1fr; gap: 4px 12px; margin: 18px 0; }
  .meta dt { color: dimgray; } .meta dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 6px 4px; border-bottom: 1px solid gainsboro; }
  .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .t td { font-weight: 600; border-top: 1px solid black; }
  .cobra { margin-top: 18px; display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; border-top: 2px solid black; padding-top: 8px; }
  .aviso { margin-top: 28px; font-size: 12px; color: dimgray; text-align: center; }
  button { margin: 16px auto 0; display: block; font: inherit; padding: 8px 16px; cursor: pointer; }
  @media print { body { background: white; } main { padding: 0; min-height: 0; } button { display: none; } }
</style></head>
<body><main>
<header>
  <img src="/logo-seism.png" alt="SeisM">
  <h1>Comprobante interno<br>N.º ${esc(c.numero)}</h1>
</header>
<dl class="meta">
  <dt>Fecha</dt><dd>${esc(c.fecha)}</dd>
  <dt>Vencimiento</dt><dd>${esc(c.vencimiento)}</dd>
  <dt>Cliente</dt><dd>${esc(c.cliente)}</dd>
  <dt>Servicio</dt><dd>${esc(c.servicioCodigo)} · ${esc(c.servicioTitulo)}</dd>
</dl>
<table>${filas}</table>
<div class="cobra"><span>Importe de este comprobante</span><span class="n">${esc(c.total)}</span></div>
<p class="aviso">Documento no válido como factura.</p>
<button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
</main></body></html>`;
}

export async function GET(
  pedido: Request,
  { params }: { params: Promise<{ id: string; facturaId: string }> },
): Promise<Response> {
  // Sin sesión, a ingresar (un `redirect` de Next no corre dentro de un route handler).
  if ((await sesionActual()) === null) {
    return Response.redirect(new URL("/ingresar", pedido.url), 303);
  }
  const { id, facturaId } = await params;
  try {
    const comprobante = await armado().facturas.comprobanteInterno(
      id,
      facturaId,
    );
    return new Response(pagina(comprobante), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response("No existe ese comprobante.", { status: 404 });
  }
}

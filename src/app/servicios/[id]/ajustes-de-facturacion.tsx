/**
 * Los ajustes de facturación propuestos (R5, SYSTEM_SPEC §5.4) en los paneles
 * de «En ejecución» y «Finalizado»: la lista (concepto, `+`/`−` importe,
 * estado), «Proponer ajuste» (`?ajusteNuevo=1`) y, en cada aprobado sin
 * comprobante, «Facturar» (`?facturarAjuste=<id>`, la factura adicional de un
 * recargo) o «Emitir nota de crédito» (`?ncAjuste=<id>`, el exceso de un
 * descuento) en Finalizado. Aprobar y rechazar, solo el administrador.
 */

import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import type { AjustePropuesto } from "../../../casos-uso/servicios/ajustes-facturacion.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { clasesDeBoton } from "../../_ui/boton.tsx";
import { cn } from "../../_ui/cn.ts";
import { Enlace } from "../../_ui/enlace-next.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { sesionActual } from "../../(auth)/sesion-de-cookie.ts";
import { cargarAjusteDesde, proponerAjusteDeFacturacion } from "../acciones.ts";
import { Parte } from "./_molde/parte.tsx";
import { AccionesDeAjuste } from "./acciones-de-ajuste.tsx";
import { IvaEnVivo } from "./iva-en-vivo.tsx";

/** Los parámetros de estas ventanas: abren la sección «Ajustes» del panel. */
export const DE_AJUSTES_DE_FACTURACION = [
  "ajusteNuevo",
  "facturarAjuste",
  "ncAjuste",
];

const ESTADOS = {
  pendiente: { texto: "Pendiente", clases: "text-texto-2" },
  aprobado: { texto: "Aprobado", clases: "text-acento" },
  rechazado: { texto: "Rechazado", clases: "text-texto-3 line-through" },
} as const;

function Fila({
  ajuste,
  servicioId,
  ruta,
  puedeEscribir,
  esAdministrador,
  usuarioId,
  admiteEmitir,
}: {
  readonly ajuste: AjustePropuesto;
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly esAdministrador: boolean;
  readonly usuarioId: string;
  readonly admiteEmitir: boolean;
}) {
  const estado = ESTADOS[ajuste.estado];
  const pendiente = ajuste.estado === "pendiente";
  const emitir = ajuste.porEmitir;
  return (
    <li className="flex flex-col gap-0.5 border-b border-borde py-2 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 text-[13px]">
          <span className="font-medium">{ajuste.concepto}</span>
          {ajuste.cantidad === "" ? null : (
            <span className="text-texto-3"> · {ajuste.cantidad}</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "cifras whitespace-nowrap text-[13px]",
              ajuste.estado === "rechazado" && "text-texto-3 line-through",
            )}
          >
            {ajuste.importe}
          </span>
          <span className={cn("text-[12px]", estado.clases)}>
            {estado.texto}
          </span>
          {puedeEscribir && pendiente ? (
            <AccionesDeAjuste
              servicioId={servicioId}
              id={ajuste.id}
              concepto={ajuste.concepto}
              puedeValidar={esAdministrador}
              puedeAnular={ajuste.cargadoPorId === usuarioId}
            />
          ) : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-[12px] text-texto-3">
        <span>
          {ajuste.claseTexto} · {ajuste.motivo} · {ajuste.quien} ·{" "}
          {ajuste.cargadoEn}
        </span>
        {ajuste.estado === "rechazado" && ajuste.motivoRechazo !== "" ? (
          <span>Motivo del rechazo: {ajuste.motivoRechazo}</span>
        ) : null}
        {ajuste.factura === "" ? null : (
          <span className="text-acento">Facturado · {ajuste.factura}</span>
        )}
        {puedeEscribir && emitir !== null ? (
          admiteEmitir ? (
            <Enlace
              href={`${ruta}?${emitir.tipo === "adicional" ? "facturarAjuste" : "ncAjuste"}=${ajuste.id}`}
              scroll={false}
              className={clasesDeBoton("secundario", "h-8 px-2.5 text-[13px]")}
              data-carga="ajuste"
            >
              {emitir.tipo === "adicional"
                ? "Facturar"
                : "Emitir nota de crédito"}{" "}
              <span className="cifras">{emitir.importe}</span>
            </Enlace>
          ) : (
            <span>
              Por {emitir.tipo === "adicional" ? "facturar" : "acreditar"}{" "}
              <span className="cifras">{emitir.importe}</span> al finalizar
            </span>
          )
        ) : null}
      </div>
    </li>
  );
}

export async function AjustesDeFacturacion({
  enSeccion,
  servicioId,
  ruta,
  puedeEscribir,
  parametros,
}: {
  readonly enSeccion?: boolean | undefined;
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await sesionActual();
  const esAdministrador = sesion?.usuario.rol === "administrador";
  const usuarioId = sesion?.usuario.id ?? "";
  const { ajustes, admiteEmitir } =
    await armado().ajustesDeFacturacion.listar(servicioId);
  const deRecargo =
    typeof parametros.facturarAjuste === "string"
      ? parametros.facturarAjuste
      : undefined;
  const deDescuento =
    typeof parametros.ncAjuste === "string" ? parametros.ncAjuste : undefined;
  const emitido =
    puedeEscribir && admiteEmitir
      ? deRecargo !== undefined
        ? { ajuste: "adicional" as const, id: deRecargo }
        : deDescuento !== undefined
          ? { ajuste: "nota_credito" as const, id: deDescuento }
          : null
      : null;
  const formularioDeEmision =
    emitido === null
      ? null
      : await armado().ajustes.formulario(
          servicioId,
          emitido.ajuste,
          emitido.id,
        );
  const propuesta =
    puedeEscribir && parametros.ajusteNuevo === "1"
      ? await armado().ajustesDeFacturacion.formulario(servicioId)
      : null;
  return (
    <Parte enSeccion={enSeccion} titulo="Ajustes">
      {puedeEscribir ? (
        <p className="mb-3">
          <Enlace
            href={`${ruta}?ajusteNuevo=1`}
            scroll={false}
            className={clasesDeBoton("secundario")}
            data-carga="ajusteDeFacturacion"
          >
            Proponer ajuste
          </Enlace>
        </p>
      ) : null}
      {ajustes.length === 0 ? (
        <p className="m-0 text-[13px] text-texto-3">
          No hay recargos ni descuentos propuestos.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {ajustes.map((ajuste) => (
            <Fila
              key={ajuste.id}
              ajuste={ajuste}
              servicioId={servicioId}
              ruta={ruta}
              puedeEscribir={puedeEscribir}
              esAdministrador={esAdministrador}
              usuarioId={usuarioId}
              admiteEmitir={admiteEmitir}
            />
          ))}
        </ul>
      )}
      {propuesta === null ? null : (
        <Ventana titulo="Proponer ajuste" rutaAlCerrar={ruta}>
          <FormularioAbm
            accion={proponerAjusteDeFacturacion.bind(null, servicioId)}
            campos={propuesta.campos}
            elegibles={{}}
            inicial={{ escrito: propuesta.escrito, errores: {} }}
            archivo={{
              nombre: "archivo",
              etiqueta: "Documento (opcional)",
              accept: ACEPTA,
            }}
            enviar={{ texto: "Proponer", variante: "primario" }}
            rutaAlCancelar={ruta}
          />
        </Ventana>
      )}
      {emitido === null || formularioDeEmision === null ? null : (
        <Ventana
          titulo={
            emitido.ajuste === "adicional"
              ? "Factura adicional"
              : "Nota de crédito"
          }
          rutaAlCerrar={ruta}
        >
          <FormularioAbm
            accion={cargarAjusteDesde.bind(
              null,
              servicioId,
              emitido.ajuste,
              emitido.id,
            )}
            campos={formularioDeEmision.campos}
            elegibles={{}}
            inicial={{ escrito: formularioDeEmision.escrito, errores: {} }}
            archivo={{
              nombre: "archivo",
              etiqueta: "Documento (opcional)",
              accept: ACEPTA,
            }}
            enviar={{ texto: "Cargar", variante: "primario" }}
            rutaAlCancelar={ruta}
          >
            {emitido.ajuste === "nota_credito" ? null : <IvaEnVivo />}
          </FormularioAbm>
        </Ventana>
      )}
    </Parte>
  );
}

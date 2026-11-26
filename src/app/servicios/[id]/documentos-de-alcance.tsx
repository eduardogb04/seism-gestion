/**
 * La sección *Documentación de alcance* de la pantalla de un servicio (F5-01,
 * ADR 0047): los archivos adjuntos, con la carga (`?alcance=1`) como ventana
 * sobre esta misma pantalla. El botón que la abre está en las acciones del
 * panel (F6-01).
 */

import { Download, FileText, Upload } from "lucide-react";
import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { EnlaceDeDescarga } from "../../_ui/enlace-de-descarga.tsx";
import { Enlace } from "../../_ui/enlace-next.ts";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { cargarDocumentoDeAlcance } from "../acciones.ts";
import { Parte } from "./_molde/parte.tsx";

export async function DocumentosDeAlcance({
  enSeccion,
  servicioId,
  ruta,
  puedeEscribir,
  parametros,
}: {
  /** Dentro de una `Seccion` del molde: sin título propio. */
  readonly enSeccion?: boolean;
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const documentos = await armado().documentosDeAlcance.listar(servicioId);
  return (
    <Parte enSeccion={enSeccion} titulo="Documentación de alcance">
      {documentos.length === 0 ? (
        enSeccion ? (
          <div className="flex flex-wrap items-center gap-3 rounded-tarjeta border border-dashed border-borde-fuerte px-4 py-3 text-[13px] text-texto-2">
            <FileText aria-hidden="true" className="size-4 text-texto-3" />
            Todavía no hay documentos de alcance: el pliego, los TDR o los
            planos.
            {puedeEscribir ? (
              <Enlace
                href={`${ruta}?alcance=1`}
                scroll={false}
                data-carga="alcance"
                className="ml-auto inline-flex items-center gap-1 font-medium no-underline hover:underline"
              >
                <Upload aria-hidden="true" className="size-3.5" />
                Subir
              </Enlace>
            ) : null}
          </div>
        ) : (
          <p>Todavía no hay documentos de alcance cargados.</p>
        )
      ) : enSeccion ? (
        <ul className="m-0 grid list-none gap-2 p-0 @xl/panel:grid-cols-2">
          {documentos.map((documento) => (
            <li key={documento.id}>
              <a
                href={`/documentos/${documento.id}`}
                download
                className="presionable group flex items-center gap-3 rounded-control border border-borde px-3 py-2 text-texto no-underline hover:border-borde-fuerte hover:bg-superficie-2"
              >
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-md bg-superficie-2 text-texto-2"
                >
                  <FileText className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {documento.nombre}
                  </span>
                  <span className="cifras block text-xs text-texto-3">
                    {documento.tamano}
                  </span>
                </span>
                <Download
                  aria-hidden="true"
                  className="size-4 text-texto-3 group-hover:text-texto"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="list-disc pl-6">
          {documentos.map((documento) => (
            <li key={documento.id}>
              <EnlaceDeDescarga {...documento} />
            </li>
          ))}
        </ul>
      )}
      {puedeEscribir && typeof parametros.alcance === "string" ? (
        <Ventana titulo="Nuevo documento de alcance" rutaAlCerrar={ruta}>
          <FormularioAbm
            accion={cargarDocumentoDeAlcance.bind(null, servicioId)}
            campos={[]}
            elegibles={{}}
            inicial={{ escrito: {}, errores: {} }}
            archivo={{
              nombre: "archivo",
              etiqueta: "Documento",
              accept: ACEPTA,
            }}
            enviar={{ texto: "Cargar", variante: "primario" }}
            rutaAlCancelar={ruta}
          />
        </Ventana>
      ) : null}
    </Parte>
  );
}

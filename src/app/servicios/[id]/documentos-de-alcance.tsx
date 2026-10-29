/**
 * La sección *Documentación de alcance* de la pantalla de un servicio (F5-01,
 * ADR 0047): los archivos adjuntos, con la carga (`?alcance=1`) como ventana
 * sobre esta misma pantalla. El botón que la abre está en la barra de acciones
 * del panel (F6-01).
 */

import { ACEPTA } from "../../../casos-uso/documentos/documentos.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { EnlaceDeDescarga } from "../../_ui/enlace-de-descarga.tsx";
import { FormularioAbm } from "../../_ui/formulario-abm.tsx";
import { Ventana } from "../../_ui/ventana.tsx";
import { cargarDocumentoDeAlcance } from "../acciones.ts";

export async function DocumentosDeAlcance({
  servicioId,
  ruta,
  puedeEscribir,
  parametros,
}: {
  readonly servicioId: string;
  readonly ruta: string;
  readonly puedeEscribir: boolean;
  readonly parametros: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const documentos = await armado().documentosDeAlcance.listar(servicioId);
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-lg font-semibold">Documentación de alcance</h3>
      {documentos.length === 0 ? (
        <p>Todavía no hay documentos de alcance cargados.</p>
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
    </section>
  );
}

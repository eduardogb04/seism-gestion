/**
 * El panel de «Creado» (F6-01): preparar la cotización. Los datos del cliente,
 * lo que falta para cotizar, los sitios, la documentación de alcance y, como
 * acción principal, cargar la cotización.
 */

import { FilePen, FileText, Upload } from "lucide-react";
import { CLIENTES } from "../../../casos-uso/abm/clientes.ts";
import { GRUPOS } from "../../../casos-uso/abm/grupos.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import {
  BarraDeAcciones,
  CabeceraDePanel,
  GrillaDeMetricas,
  ListaDeControl,
  TituloDeParte,
} from "../../_ui/panel.tsx";
import { VentanaDeCarga as VentanaDeCotizacion } from "./cotizaciones.tsx";
import { type DatosDePanel, dias, diasEnEtapa } from "./datos-de-panel.ts";
import { DocumentosDeAlcance } from "./documentos-de-alcance.tsx";
import { Recursos } from "./recursos.tsx";
import { Sitios } from "./sitios.tsx";

function cantidad(numero: number, singular: string, plural: string): string {
  return `${numero} ${numero === 1 ? singular : plural}`;
}

export async function PanelCreado({
  servicio,
  ruta,
  puedeEscribir,
  soloLectura,
  parametros,
}: DatosDePanel) {
  const { valor: cliente } = await armado().abm.obtener(
    CLIENTES,
    servicio.clienteId,
  );
  const grupo =
    cliente.grupoId === null
      ? null
      : (await armado().abm.obtener(GRUPOS, cliente.grupoId)).valor.nombre;
  const alcance = await armado().documentosDeAlcance.listar(servicio.id);
  const cotizaciones = await armado().cotizaciones.listar(servicio.id);
  const detalle = await armado().planificacion.ver(servicio.id);
  const contacto = [cliente.contactoEmail, cliente.contactoTelefono]
    .filter((dato) => dato !== null)
    .join(" · ");
  const sitios = servicio.sitios.filter(({ marcado }) => marcado).length;
  const enLaEtapa = dias(diasEnEtapa(servicio, "creado"));
  return (
    <article className="rounded border border-borde bg-superficie p-5 shadow-sm dark:shadow-none">
      <CabeceraDePanel
        Icono={FilePen}
        titulo="Preparar la cotización"
        contexto={
          soloLectura
            ? `Estuvo ${enLaEtapa} en «Creado».`
            : `Hace ${enLaEtapa} que está creado. Juntá el alcance y cargá la cotización.`
        }
      />
      <TituloDeParte>Cliente</TituloDeParte>
      <GrillaDeMetricas
        metricas={[
          {
            titulo: "Razón social",
            valor: cliente.razonSocial,
            detalle: `CUIT ${CLIENTES.formato?.cuit?.(cliente.cuit) ?? cliente.cuit}`,
            tamano: "chica",
          },
          {
            titulo: "Contacto",
            valor: cliente.contactoNombre ?? "Sin contacto",
            ...(contacto === "" ? {} : { detalle: contacto }),
            tamano: "chica",
          },
          { titulo: "Grupo", valor: grupo ?? "Sin grupo", tamano: "chica" },
        ]}
      />
      <ListaDeControl
        titulo="Para cotizar"
        items={[
          { texto: "Datos iniciales", hecho: true, detalle: "completos" },
          {
            texto: "Sitios",
            hecho: sitios > 0,
            detalle:
              sitios === 0
                ? "ninguno marcado"
                : cantidad(sitios, "marcado", "marcados"),
          },
          {
            texto: "Documentación de alcance",
            hecho: alcance.length > 0,
            detalle:
              alcance.length === 0
                ? "sin archivos"
                : cantidad(alcance.length, "archivo", "archivos"),
          },
          {
            texto: "Cotización",
            hecho: cotizaciones.length > 0,
            detalle: cotizaciones.length === 0 ? "falta cargar" : "cargada",
          },
        ]}
      />
      <Sitios servicio={servicio} puedeEscribir={puedeEscribir} />
      <DocumentosDeAlcance
        servicioId={servicio.id}
        ruta={ruta}
        puedeEscribir={puedeEscribir}
        parametros={parametros}
      />
      {/* En «Creado» no se cargan recursos, pero los camiones de una renovación llegan copiados: se ven. */}
      {detalle.recursos.length === 0 ? null : (
        <Recursos
          servicioId={servicio.id}
          ruta={ruta}
          puedeEscribir={puedeEscribir}
          parametros={parametros}
          detalle={detalle}
        />
      )}
      {puedeEscribir ? (
        <>
          <BarraDeAcciones
            principal={{
              texto: "Cargar cotización",
              href: `${ruta}?cotizacion=1`,
              Icono: FileText,
            }}
            secundarias={[
              {
                texto: "Subir documento de alcance",
                href: `${ruta}?alcance=1`,
                Icono: Upload,
              },
            ]}
            salidas={servicio.transiciones.map(({ valor, etiqueta }) => ({
              texto: etiqueta,
              href: `${ruta}?pasar=${valor}`,
            }))}
          />
          {typeof parametros.cotizacion === "string" ? (
            <VentanaDeCotizacion servicioId={servicio.id} rutaAlCerrar={ruta} />
          ) : null}
        </>
      ) : null}
    </article>
  );
}

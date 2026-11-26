/**
 * El panel de «Creado» (F6-01, SYSTEM_SPEC §5.3): preparar la cotización. Lo
 * que falta para cotizar (datos, sitios, documentación de alcance,
 * observaciones), el cliente, los sitios y la documentación; acción principal,
 * cargar la cotización.
 */

import { FilePen, Upload } from "lucide-react";
import { CLIENTES } from "../../../casos-uso/abm/clientes.ts";
import { GRUPOS } from "../../../casos-uso/abm/grupos.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import { RecursosAgrupados } from "../_piezas/recursos-agrupados.tsx";
import { accionPrincipalDe } from "./_molde/accion-principal.ts";
import {
  ListaDeControl,
  PanelDeEtapa,
  Seccion,
} from "./_molde/panel-de-etapa.tsx";
import { ACCIONES_DE_RECURSOS } from "./acciones-de-planificacion.ts";
import { VentanaDeCarga as VentanaDeCotizacion } from "./cotizaciones.tsx";
import { type DatosDePanel, dias, diasEnEtapa } from "./datos-de-panel.ts";
import { DocumentosDeAlcance } from "./documentos-de-alcance.tsx";
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
  const sucesos = await armado().sucesos.listar(servicio.id);
  const detalle = await armado().planificacion.ver(servicio.id);
  const contacto = [cliente.contactoEmail, cliente.contactoTelefono]
    .filter((dato) => dato !== null)
    .join(" · ");
  const sitios = servicio.sitios.filter(({ marcado }) => marcado).length;
  const observaciones =
    sucesos.length +
    (servicio.datos.some(([etiqueta]) => etiqueta === "Observaciones") ? 1 : 0);
  const enLaEtapa = dias(diasEnEtapa(servicio, "creado"));
  const control = [
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
      ...(puedeEscribir
        ? {
            accion: {
              texto: "Subir",
              href: `${ruta}?alcance=1`,
              carga: "alcance",
            },
          }
        : {}),
    },
    {
      texto: "Observaciones",
      hecho: observaciones > 0,
      detalle:
        observaciones === 0
          ? "ninguna"
          : cantidad(observaciones, "cargada", "cargadas"),
      ...(puedeEscribir
        ? { accion: { texto: "Agregar", href: `${ruta}?suceso=1` } }
        : {}),
    },
  ];
  const listos = control.filter(({ hecho }) => hecho).length;
  const principal = accionPrincipalDe(servicio, ruta);
  const datosDelCliente: readonly (readonly [string, string])[] = [
    ["Razón social", cliente.razonSocial],
    ["CUIT", CLIENTES.formato?.cuit?.(cliente.cuit) ?? cliente.cuit],
    ["Contacto", cliente.contactoNombre ?? "Sin contacto"],
    ...(contacto === "" ? [] : [["", contacto] as const]),
    ["Grupo", grupo ?? "Sin grupo"],
  ];
  return (
    <PanelDeEtapa
      etapa="creado"
      Icono={FilePen}
      titulo="Preparar la cotización"
      bajada={
        soloLectura
          ? `Estuvo ${enLaEtapa} en «Creado».`
          : `Creado hace ${enLaEtapa}. Juntá el alcance y cargá la cotización: ${listos} de ${control.length} listos.`
      }
      principal={
        puedeEscribir && principal !== null
          ? { ...principal, carga: "cotizacion" }
          : null
      }
      secundarias={
        puedeEscribir
          ? [
              {
                texto: "Subir documento de alcance",
                href: `${ruta}?alcance=1`,
                Icono: Upload,
                carga: "alcance",
              },
            ]
          : []
      }
    >
      <Seccion
        clave="creado.control"
        titulo="Para cotizar"
        resumen={`${listos} de ${control.length}`}
      >
        <ListaDeControl titulo="Para cotizar" items={control} />
      </Seccion>
      <Seccion clave="creado.cliente" titulo="Cliente">
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-[13px] @xl/panel:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
          {datosDelCliente.map(([etiqueta, texto]) => (
            <div key={`${etiqueta}-${texto}`} className="contents">
              <dt className="text-texto-3">{etiqueta}</dt>
              <dd className="m-0 min-w-0 truncate">{texto}</dd>
            </div>
          ))}
        </dl>
      </Seccion>
      <Seccion
        clave="creado.sitios"
        titulo="Sitios que abarca"
        resumen={cantidad(sitios, "marcado", "marcados")}
      >
        <Sitios servicio={servicio} puedeEscribir={puedeEscribir} />
      </Seccion>
      <Seccion
        clave="creado.alcance"
        titulo="Documentación de alcance"
        resumen={cantidad(alcance.length, "archivo", "archivos")}
        parametros={parametros}
        abreCon={["alcance"]}
      >
        <DocumentosDeAlcance
          enSeccion
          servicioId={servicio.id}
          ruta={ruta}
          puedeEscribir={puedeEscribir}
          parametros={parametros}
        />
      </Seccion>
      {/* En «Creado» no se cargan recursos, pero los camiones de una renovación llegan copiados: se ven. */}
      {detalle.recursos.length === 0 ? null : (
        <Seccion
          clave="creado.recursos"
          titulo="Recursos"
          resumen={cantidad(detalle.recursos.length, "recurso", "recursos")}
        >
          <RecursosAgrupados
            enSeccion
            servicioId={servicio.id}
            ruta={ruta}
            puedeEscribir={puedeEscribir}
            parametros={parametros}
            detalle={detalle}
            acciones={ACCIONES_DE_RECURSOS}
          />
        </Seccion>
      )}
      {puedeEscribir && typeof parametros.cotizacion === "string" ? (
        <VentanaDeCotizacion servicioId={servicio.id} rutaAlCerrar={ruta} />
      ) : null}
    </PanelDeEtapa>
  );
}

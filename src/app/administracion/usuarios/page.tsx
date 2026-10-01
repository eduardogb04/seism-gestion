/**
 * Usuarios (F0-32): la lista blanca desde la pantalla. Lista, da de alta por
 * email y rol, revoca y cambia el rol. Solo administradores: lo primero que
 * hace es exigirlo (`accesoDeAdministrador`); una persona con otro rol ve
 * `AUT-0003` y ningún dato.
 *
 * Formularios HTML con Server Actions (`acciones.ts`), sin JavaScript de
 * cliente propio. El rol es un `<select>` de `ROLES`; el servidor lo vuelve a
 * validar. Lo que una acción rechazó vuelve en `?error=<código>` y se muestra
 * con el texto del catálogo.
 */

import { connection } from "next/server.js";
import {
  codigoDeError,
  pantallaDeCodigo,
} from "../../../casos-uso/sesion/errores.ts";
import { ETIQUETAS_ROL, ROLES } from "../../../casos-uso/usuarios/roles.ts";
import { armado } from "../../../infraestructura/arranque/armado.ts";
import type { Rol, Usuario } from "../../../puertos/repositorios/usuarios.ts";
import { Boton } from "../../_ui/boton.tsx";
import { CampoTexto } from "../../_ui/campo-texto.tsx";
import { ErrorEnPantalla } from "../../_ui/error-en-pantalla.tsx";
import { Marco } from "../../_ui/marco.tsx";
import { Selector } from "../../_ui/selector.tsx";
import { Tabla } from "../../_ui/tabla.tsx";
import { Tarjeta } from "../../_ui/tarjeta.tsx";
import { accesoDeAdministrador } from "../../(auth)/sesion-actual.ts";
import {
  altaDeUsuario,
  cambiarRolDeUsuario,
  revocarUsuario,
} from "./acciones.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const OPCIONES_DE_ROL = ROLES.map((rol) => ({
  valor: rol,
  texto: ETIQUETAS_ROL[rol],
}));

function SelectorDeRol({
  etiqueta,
  etiquetaOculta,
  actual,
}: {
  readonly etiqueta: string;
  readonly etiquetaOculta?: boolean;
  readonly actual: Rol;
}) {
  return (
    <Selector
      etiqueta={etiqueta}
      etiquetaOculta={etiquetaOculta}
      name="rol"
      defaultValue={actual}
      opciones={OPCIONES_DE_ROL}
    />
  );
}

export default async function Usuarios({ searchParams }: Props) {
  await connection();
  const acceso = await accesoDeAdministrador();
  if (acceso.tipo === "prohibido") {
    return (
      <Tarjeta>
        <h1>Usuarios</h1>
        <ErrorEnPantalla error={acceso.error} />
      </Tarjeta>
    );
  }
  const { email, rol } = acceso.sesion.usuario;
  const { error } = await searchParams;
  let usuarios: readonly Usuario[];
  try {
    usuarios = await armado().usuarios.listar(acceso.actor);
  } catch (fallo) {
    const codigo = codigoDeError(fallo);
    if (codigo === null) {
      throw fallo;
    }
    return (
      <Marco email={email} rol={rol} rutaActual="/administracion/usuarios">
        <main>
          <h1>Usuarios</h1>
          <ErrorEnPantalla error={pantallaDeCodigo(codigo)} />
        </main>
      </Marco>
    );
  }
  return (
    <Marco email={email} rol={rol} rutaActual="/administracion/usuarios">
      <main>
        <h1>Usuarios</h1>
        <p>
          <a href="/administracion">Administración</a>
        </p>
        {typeof error === "string" ? (
          <ErrorEnPantalla error={pantallaDeCodigo(error)} />
        ) : null}

        <h2>Dar de alta</h2>
        <form action={altaDeUsuario} className="flex flex-wrap items-end gap-3">
          <CampoTexto
            etiqueta="Email"
            type="email"
            name="email"
            required
            maxLength={254}
          />
          <SelectorDeRol etiqueta="Rol" actual="operador" />
          <Boton variante="primario" type="submit">
            Dar de alta
          </Boton>
        </form>

        <h2>Lista</h2>
        <Tabla cabeceras={["Email", "Rol", "Estado"]}>
          {usuarios.map(({ valor }) => (
            <tr key={valor.id} data-usuario={valor.email}>
              <td>{valor.email}</td>
              <td>
                {valor.estado === "activo" ? (
                  <form
                    action={cambiarRolDeUsuario}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="usuarioId" value={valor.id} />
                    <SelectorDeRol
                      etiqueta={`Rol de ${valor.email}`}
                      etiquetaOculta
                      actual={valor.rol}
                    />
                    <Boton variante="secundario" type="submit">
                      Cambiar rol
                    </Boton>
                  </form>
                ) : (
                  ETIQUETAS_ROL[valor.rol]
                )}
              </td>
              <td>
                {valor.estado === "activo" ? (
                  <form
                    action={revocarUsuario}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span>activo</span>
                    <input type="hidden" name="usuarioId" value={valor.id} />
                    <Boton variante="peligro" type="submit">
                      Revocar
                    </Boton>
                  </form>
                ) : (
                  "revocado"
                )}
              </td>
            </tr>
          ))}
        </Tabla>
      </main>
    </Marco>
  );
}

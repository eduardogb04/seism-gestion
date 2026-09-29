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
import { accesoDeAdministrador } from "../../(auth)/sesion-actual.ts";
import { ErrorEnPantalla } from "../error-en-pantalla.tsx";
import {
  altaDeUsuario,
  cambiarRolDeUsuario,
  revocarUsuario,
} from "./acciones.ts";

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function SelectorDeRol({
  id,
  etiqueta,
  actual,
}: {
  readonly id?: string;
  readonly etiqueta?: string;
  readonly actual: Rol;
}) {
  return (
    <select id={id} name="rol" aria-label={etiqueta} defaultValue={actual}>
      {ROLES.map((rol) => (
        <option key={rol} value={rol}>
          {ETIQUETAS_ROL[rol]}
        </option>
      ))}
    </select>
  );
}

export default async function Usuarios({ searchParams }: Props) {
  await connection();
  const acceso = await accesoDeAdministrador();
  if (acceso.tipo === "prohibido") {
    return (
      <main>
        <h1>Usuarios</h1>
        <ErrorEnPantalla error={acceso.error} />
      </main>
    );
  }
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
      <main>
        <h1>Usuarios</h1>
        <ErrorEnPantalla error={pantallaDeCodigo(codigo)} />
      </main>
    );
  }
  return (
    <main>
      <h1>Usuarios</h1>
      <p>
        <a href="/administracion">Administración</a>
      </p>
      {typeof error === "string" ? (
        <ErrorEnPantalla error={pantallaDeCodigo(error)} />
      ) : null}

      <h2>Dar de alta</h2>
      <form action={altaDeUsuario}>
        <label>
          Email <input type="email" name="email" required maxLength={254} />
        </label>{" "}
        <label htmlFor="rol-de-alta">Rol</label>{" "}
        <SelectorDeRol id="rol-de-alta" actual="operador" />{" "}
        <button type="submit">Dar de alta</button>
      </form>

      <h2>Lista</h2>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Rol</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map(({ valor }) => (
            <tr key={valor.id} data-usuario={valor.email}>
              <td>{valor.email}</td>
              <td>
                {valor.estado === "activo" ? (
                  <form action={cambiarRolDeUsuario}>
                    <input type="hidden" name="usuarioId" value={valor.id} />
                    <SelectorDeRol
                      etiqueta={`Rol de ${valor.email}`}
                      actual={valor.rol}
                    />{" "}
                    <button type="submit">Cambiar rol</button>
                  </form>
                ) : (
                  ETIQUETAS_ROL[valor.rol]
                )}
              </td>
              <td>
                {valor.estado === "activo" ? (
                  <form action={revocarUsuario}>
                    activo{" "}
                    <input type="hidden" name="usuarioId" value={valor.id} />
                    <button type="submit">Revocar</button>
                  </form>
                ) : (
                  "revocado"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

/**
 * La página de entrada (F0-31). Con Google, un botón que empieza el login.
 * Con la identidad falsa, va directo a su pantalla (la lista de emails de
 * prueba), pasando por `iniciar` para que el `state` se guarde igual que con
 * Google.
 */

import { redirect } from "next/navigation.js";
import { connection } from "next/server.js";
import { armado } from "../../../infraestructura/arranque/armado.ts";

export default async function Ingresar() {
  await connection();
  if (armado().pruebas !== null) {
    redirect("/ingresar/iniciar");
  }
  return (
    <main>
      <h1>Entrar</h1>
      <p>El sistema no guarda contraseñas: entrás con tu cuenta de Google.</p>
      <a href="/ingresar/iniciar">Entrar con Google</a>
    </main>
  );
}

import { Boton } from "./boton.tsx";

/** Cerrar la sesión: un `POST` a `/salir`, el mismo en el marco y en `/sesion`. */
export function FormularioSalir({ texto }: { readonly texto: string }) {
  return (
    <form method="post" action="/salir">
      <Boton variante="secundario" type="submit">
        {texto}
      </Boton>
    </form>
  );
}

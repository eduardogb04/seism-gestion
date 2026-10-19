/**
 * El marco de lo que está detrás del login (F1-02; F3-05): la barra lateral
 * con las secciones que existen y que la persona puede ver, en tres grupos y
 * con ícono, que se contrae y en el celular se abre como menú; la cabecera con
 * el tema, su email y *Salir*; y el contenido. Además, `src/app/_ui/` es HTML
 * del servidor: ningún componente lleva `"use client"` (lo exigen `/salud`
 * sin JavaScript y el selector nativo), salvo el formulario del molde de ABM
 * (F1-03, ADR 0031) y lo que cambia sin recargar la página: el tema y el menú
 * (F3-05, ADR 0040).
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Marco } from "../../src/app/_ui/marco.tsx";
import {
  type Preferencias,
  preferenciasDe,
} from "../../src/app/_ui/preferencias.ts";
import { ConPreferencias } from "../../src/app/_ui/preferencias-en-pantalla.tsx";

function marcoDe(
  rol: "administrador" | "operador",
  rutaActual = "/salud",
  preferencias: Preferencias = { tema: "sistema", menuContraido: false },
): string {
  return renderToStaticMarkup(
    ConPreferencias({
      preferencias,
      children: Marco({
        email: "persona@ejemplo.test",
        rol,
        rutaActual,
        children: "contenido de prueba",
      }),
    }),
  );
}

function sinEtiquetas(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** Los enlaces del menú: su `<a ...>` de apertura y el texto que se lee. */
function enlacesDe(
  html: string,
): { apertura: string; texto: string; interior: string }[] {
  const menu =
    /<nav [^>]*aria-label="Secciones"[^>]*>(.*?)<\/nav>/.exec(html)?.[1] ?? "";
  return [...menu.matchAll(/(<a [^>]*>)(.*?)<\/a>/g)].map(
    ([, apertura, interior]) => ({
      apertura: apertura ?? "",
      interior: interior ?? "",
      texto: sinEtiquetas(interior ?? ""),
    }),
  );
}

/** Cada grupo del menú con los textos de sus entradas, en orden. */
function gruposDe(html: string): Record<string, string[]> {
  return Object.fromEntries(
    [
      ...html.matchAll(
        /<p id="menu-[^"]*"[^>]*>([^<]+)<\/p><ul [^>]*>(.*?)<\/ul>/g,
      ),
    ].map(([, nombre, lista]) => [
      nombre,
      [...(lista ?? "").matchAll(/<a [^>]*>(.*?)<\/a>/g)].map(([, a]) =>
        sinEtiquetas(a ?? ""),
      ),
    ]),
  );
}

function botonDe(html: string, nombre: string): string | undefined {
  return [...html.matchAll(/<button [^>]*>.*?<\/button>/g)]
    .map(([boton]) => boton)
    .find(
      (boton) =>
        sinEtiquetas(boton) === nombre ||
        boton.includes(`aria-label="${nombre}"`),
    );
}

describe("Marco", () => {
  test("el menú tiene tres grupos: Operación, Finanzas y Configuración, con lo que existe", () => {
    expect(gruposDe(marcoDe("administrador"))).toEqual({
      Operación: ["Inicio", "Servicios"],
      Finanzas: ["Egresos", "Por cobrar", "Por pagar"],
      Configuración: [
        "Grupos",
        "Clientes y proveedores",
        "Sitios",
        "Camiones",
        "Tipos de servicio",
        "Cuentas",
        "Centros de costo",
        "Usuarios",
        "Salud",
      ],
    });
  });

  test("cada entrada del menú lleva su ícono, oculto para el lector de pantalla", () => {
    const enlaces = enlacesDe(marcoDe("administrador"));

    expect(enlaces).toHaveLength(14);
    for (const { interior } of enlaces) {
      expect(interior).toMatch(/^<svg [^>]*aria-hidden="true"/);
    }
  });

  test("el administrador ve en el menú Usuarios y Salud, con sus rutas", () => {
    const enlaces = enlacesDe(marcoDe("administrador"));

    expect(
      enlaces.find(({ texto }) => texto === "Usuarios")?.apertura,
    ).toContain('href="/administracion/usuarios"');
    expect(enlaces.find(({ texto }) => texto === "Salud")?.apertura).toContain(
      'href="/salud"',
    );
  });

  test("un operador ve Grupos y no ve Usuarios ni Salud", () => {
    const marcado = marcoDe("operador");

    expect(gruposDe(marcado).Configuración).toContain("Grupos");
    expect(marcado).not.toContain("/administracion/usuarios");
    expect(marcado).not.toContain('href="/salud"');
  });

  test("marca la sección actual con aria-current y solo esa", () => {
    const marcado = marcoDe("administrador", "/salud");

    expect(marcado.match(/aria-current="page"/g)).toHaveLength(1);
    expect(
      enlacesDe(marcado).find(({ apertura }) =>
        apertura.includes('aria-current="page"'),
      )?.texto,
    ).toBe("Salud");
  });

  test("el menú se contrae a solo íconos con un botón que dice si está expandido, y arranca como lo dejó la persona", () => {
    const expandido = marcoDe("administrador");
    const contraido = marcoDe("administrador", "/salud", {
      tema: "sistema",
      menuContraido: true,
    });

    expect(botonDe(expandido, "Menú lateral")).toContain(
      'aria-expanded="true"',
    );
    expect(expandido).toContain('data-contraida="no"');
    expect(botonDe(contraido, "Menú lateral")).toContain(
      'aria-expanded="false"',
    );
    expect(contraido).toContain('data-contraida="si"');
  });

  test("en el celular el menú se abre con su botón, que arranca cerrado", () => {
    const boton = botonDe(marcoDe("administrador"), "Menú") ?? "";

    expect(boton).toContain('aria-expanded="false"');
    expect(boton).toMatch(/aria-controls="[^"]+"/);
  });

  test("la cabecera trae el elegidor de tema con claro, oscuro y el del sistema, y marca el elegido", () => {
    const marcado = marcoDe("administrador", "/salud", {
      tema: "oscuro",
      menuContraido: false,
    });

    expect(marcado).toMatch(
      /<header[^>]*>.*<fieldset[^>]*><legend[^>]*>Tema<\/legend>/,
    );
    expect(botonDe(marcado, "Claro")).toContain('aria-pressed="false"');
    expect(botonDe(marcado, "Oscuro")).toContain('aria-pressed="true"');
    expect(botonDe(marcado, "Oscuro")).toContain('name="tema"');
    expect(botonDe(marcado, "Oscuro")).toContain('value="oscuro"');
    expect(botonDe(marcado, "Como el sistema")).toContain(
      'aria-pressed="false"',
    );
  });

  test("la cabecera trae el email y un Salir que hace POST a /salir", () => {
    const marcado = marcoDe("administrador");

    expect(marcado).toContain("persona@ejemplo.test");
    const salir = /<form [^>]*action="\/salir"[^>]*>.*?<\/form>/.exec(
      marcado,
    )?.[0];
    expect(salir).toContain('method="post"');
    expect(salir).toMatch(/<button [^>]*>Salir</);
    expect(marcado).not.toContain("data-email-sesion");
  });

  test("muestra el contenido de la página", () => {
    expect(marcoDe("administrador")).toContain("contenido de prueba");
  });
});

describe("las preferencias que se leen de las cookies", () => {
  test("toma el tema y el menú guardados", () => {
    const cookies: Record<string, string> = {
      tema: "claro",
      menu: "contraido",
    };

    expect(preferenciasDe((nombre) => cookies[nombre])).toEqual({
      tema: "claro",
      menuContraido: true,
    });
  });

  test("sin cookies o con un valor desconocido: el tema del sistema y el menú expandido", () => {
    expect(preferenciasDe(() => undefined)).toEqual({
      tema: "sistema",
      menuContraido: false,
    });
    expect(
      preferenciasDe((nombre) => (nombre === "tema" ? "violeta" : "a medias")),
    ).toEqual({ tema: "sistema", menuContraido: false });
  });
});

describe("src/app/_ui/**", () => {
  const CARPETA = path.resolve(import.meta.dirname, "../../src/app/_ui");

  test('solo el formulario del molde de ABM y lo que cambia sin recargar (tema y menú) declaran "use client"', () => {
    const archivos = readdirSync(CARPETA);
    expect(archivos.length).toBeGreaterThanOrEqual(5);

    const deCliente = archivos.filter((nombre) =>
      /^\s*["']use client["']/m.test(
        readFileSync(path.join(CARPETA, nombre), "utf8"),
      ),
    );

    expect(deCliente.sort()).toEqual([
      "barra-lateral.tsx",
      "formulario-abm.tsx",
      "preferencias-en-pantalla.tsx",
      "selector-de-tema.tsx",
    ]);
  });
});

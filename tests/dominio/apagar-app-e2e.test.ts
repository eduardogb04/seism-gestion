import { describe, expect, it } from "vitest";
import { comandoBorrarRed, informeDeRed } from "../e2e/_arnes/apagar-app.ts";

describe("el cierre del e2e borra la red de su proyecto", () => {
  it("arma el comando con el nombre de la red por defecto de compose", () => {
    expect(comandoBorrarRed("seism-ab12cd34")).toEqual([
      "network",
      "rm",
      "seism-ab12cd34_default",
    ]);
  });

  it("no dice nada si la red se borró", () => {
    expect(
      informeDeRed("p_default", { status: 0, stderr: "" }),
    ).toBeUndefined();
  });

  it("una red en uso es un aviso de una línea, no un corte", () => {
    const aviso = informeDeRed("p_default", {
      status: 1,
      stderr:
        "Error response from daemon: error while removing network: network p_default id abc has active endpoints\n",
    });
    expect(aviso).toContain("p_default");
    expect(aviso).toContain("en uso");
    expect(aviso?.includes("\n")).toBe(false);
  });

  it("una red que ya no existe es un aviso de una línea, no un corte", () => {
    const aviso = informeDeRed("p_default", {
      status: 1,
      stderr: "Error response from daemon: network p_default not found\n",
    });
    expect(aviso).toContain("p_default");
    expect(aviso).toContain("no existe");
    expect(aviso?.includes("\n")).toBe(false);
  });

  it("cualquier otro error trae el comando para hacerlo a mano", () => {
    const aviso = informeDeRed("p_default", {
      status: 1,
      stderr: "Cannot connect to the Docker daemon\n",
    });
    expect(aviso).toContain("docker network rm p_default");
    expect(aviso).toContain("Cannot connect to the Docker daemon");
  });

  it("si docker ni se pudo ejecutar, también trae el comando a mano", () => {
    const aviso = informeDeRed("p_default", {
      status: null,
      stderr: "",
      error: new Error("spawn docker ENOENT"),
    });
    expect(aviso).toContain("docker network rm p_default");
    expect(aviso).toContain("spawn docker ENOENT");
  });
});

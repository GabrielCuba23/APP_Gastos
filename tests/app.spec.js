import { test, expect } from "@playwright/test";
test("register, persist, edit, filter and delete financial entries", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Nuevo movimiento", exact: true })
    .click();
  await page.getByLabel("Tipo de movimiento").selectOption("income");
  await page
    .getByLabel("Descripción", { exact: true })
    .fill("Sueldo de prueba");
  await page.getByLabel("Importe (PEN)").fill("3200.50");
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await expect(
    page.getByRole("cell", { name: "Sueldo de prueba", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Sueldo de prueba", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar Sueldo de prueba" }).click();
  await page.getByLabel("Importe (PEN)").fill("3500.25");
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await expect(page.locator("tbody")).toContainText("3,500.25");
  await page.getByLabel("Filtrar por tipo").selectOption("expense");
  await expect(page.getByText("No encontramos movimientos")).toBeVisible();
  await page.getByLabel("Filtrar por tipo").selectOption("all");
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar Sueldo de prueba" }).click();
  await expect(
    page.getByText("Aquí empieza tu tranquilidad financiera"),
  ).toBeVisible();
});
test("mobile layout and invalid backup are handled", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tu mes, en equilibrio." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"entries":[]}'),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Archivo de respaldo inválido",
  );
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("button", { name: "Mi negocio", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mi negocio", exact: true }),
  ).toBeVisible();
});

test("account form uses the configured project and public API key", async ({
  page,
}) => {
  const { readFile } = await import("node:fs/promises");
  const config = JSON.parse(await readFile("src/cloud-config.json", "utf8"));
  let observed = false;
  await page.route(
    config.url + "/auth/v1/token?grant_type=password",
    async (route) => {
      const request = route.request();
      expect(request.method()).toBe("POST");
      expect(request.headers().apikey).toBe(config.publishableKey);
      expect(request.postDataJSON().email).toBe("conexion@example.com");
      observed = true;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "Credenciales de prueba rechazadas",
        }),
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Ingresar / Crear cuenta" }).click();
  await page.getByLabel("Correo electrónico").fill("conexion@example.com");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Test-only-password");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "Credenciales de prueba rechazadas",
  );
  expect(observed).toBe(true);
});

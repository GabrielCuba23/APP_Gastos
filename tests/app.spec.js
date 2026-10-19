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
  await page
    .locator("input[type=file]")
    .setInputFiles({
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

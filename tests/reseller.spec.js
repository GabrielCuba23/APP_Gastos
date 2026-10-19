import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const config = JSON.parse(await readFile("src/cloud-config.json", "utf8"));
const id = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";
async function accountSession(
  page,
  {
    role = "admin",
    passwordRequired = false,
    allowed = true,
    missingMigration = false,
  } = {},
) {
  const profile = {
    user_id: id,
    email: "manager@example.com",
    full_name: "Gestor",
    phone: "+51 999 999 999",
    role,
    status: "active",
    expires_at: "2099-01-01T23:59:59Z",
    password_change_required: passwordRequired,
    plan_name: "Anual",
    owner_id: null,
  };
  const user = {
    id,
    email: profile.email,
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { role: "admin" },
    app_metadata: { provider: "email" },
    created_at: "2026-01-01T00:00:00Z",
  };
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({
      sub: id,
      aud: "authenticated",
      exp: expires_at,
      iat: expires_at - 3600,
      iss: config.url + "/auth/v1",
      role: "authenticated",
    }) +
    ".test-signature";
  await page.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    {
      key: "sb-" + new URL(config.url).hostname.split(".")[0] + "-auth-token",
      session: {
        access_token: token,
        refresh_token: "test-only-refresh",
        expires_at,
        expires_in: 3600,
        token_type: "bearer",
        user,
      },
    },
  );
  let accounts = [];
  const calls = [];
  await page.route(config.url + "/**", async (route) => {
    const url = new URL(route.request().url());
    let data;
    if (url.pathname === "/rest/v1/account_profiles") {
      if (missingMigration) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            code: "PGRST205",
            message: "Table not installed",
          }),
        });
        return;
      }
      data = profile;
    } else if (url.pathname === "/rest/v1/rpc/has_finance_access")
      data = allowed && !profile.password_change_required;
    else if (url.pathname === "/rest/v1/balances")
      data = {
        data: { version: 1, currency: "PEN", entries: [] },
        revision: 0,
      };
    else if (url.pathname === "/auth/v1/user") data = { user };
    else if (url.pathname === "/functions/v1/manage-accounts") {
      expect(route.request().headers().authorization).toBe("Bearer " + token);
      const body = route.request().postDataJSON();
      calls.push(body);
      if (body.action === "list") data = { accounts, count: accounts.length };
      else if (body.action === "create") {
        accounts = [
          {
            ...body,
            user_id: customerId,
            owner_id: id,
            expires_at: body.expires_on + "T23:59:59-05:00",
            password_change_required: true,
          },
        ];
        delete accounts[0].password;
        data = { ok: true };
      } else if (body.action === "update") {
        accounts = accounts.map((row) =>
          row.user_id === body.user_id
            ? {
                ...row,
                ...body,
                expires_at: body.expires_on + "T23:59:59-05:00",
              }
            : row,
        );
        data = { ok: true };
      } else if (body.action === "change_password") {
        profile.password_change_required = false;
        data = { ok: true };
      }
    }
    if (data === undefined) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return { profile, calls };
}
test("administrator creates and suspends a customer through the panel", async ({
  page,
}) => {
  const { calls } = await accountSession(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Panel de reventas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Panel de reventas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await page.getByLabel("Nombre del cliente").fill("Cliente de prueba");
  await page.getByLabel("Correo del cliente").fill("cliente@example.com");
  await page.getByLabel("Teléfono", { exact: true }).fill("+51 900 100 200");
  await page.getByLabel("Contraseña temporal").fill("Temporal-only-123");
  await page.getByLabel("Vencimiento", { exact: true }).fill("2099-10-31");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear cuenta", exact: true })
    .click();
  await expect(page.locator("tbody")).toContainText("Cliente de prueba");
  expect(calls.find((c) => c.action === "create").role).toBe("client");
  await page
    .getByRole("button", { name: "Gestionar cliente@example.com" })
    .click();
  await page
    .getByRole("combobox", { name: "Estado", exact: true })
    .selectOption("suspended");
  await page.getByRole("button", { name: "Guardar acceso" }).click();
  await expect(page.locator("tbody")).toContainText("Suspendido");
  expect(calls.find((c) => c.action === "update").user_id).toBe(customerId);
  await page.screenshot({
    path: "/workspace/reseller-panel-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/workspace/reseller-panel-mobile.png",
    fullPage: true,
  });
});
test("revendedor cannot choose a privileged role in the creation form", async ({
  page,
}) => {
  await accountSession(page, { role: "reseller" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Panel de reventas", exact: true })
    .click();
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page.getByLabel("Tipo de cuenta")).toHaveCount(0);
});
test("client changes the temporary password before accessing finances", async ({
  page,
}) => {
  const { calls } = await accountSession(page, {
    role: "client",
    passwordRequired: true,
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Protege tu cuenta" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Panel de reventas", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Nueva contraseña", { exact: true })
    .fill("My-new-private-password");
  await page
    .getByLabel("Confirmar contraseña", { exact: true })
    .fill("My-new-private-password");
  await page.getByRole("button", { name: "Actualizar contraseña" }).click();
  await expect(
    page.getByRole("heading", { name: "Tu mes, en equilibrio." }),
  ).toBeVisible();
  expect(calls.find((c) => c.action === "change_password")).toBeTruthy();
});
test("customer metadata cannot reveal the panel and inactive access is blocked", async ({
  page,
}) => {
  await accountSession(page, { role: "client", allowed: false });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tu plan necesita una revisión" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Panel de reventas", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Nuevo movimiento", exact: true }),
  ).toHaveCount(0);
});

test("existing signed-in accounts keep working before the optional migration", async ({
  page,
}) => {
  await accountSession(page, { role: "client", missingMigration: true });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tu mes, en equilibrio." }),
  ).toBeVisible();
  await expect(page.getByText("Sincronizado", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Panel de reventas", exact: true }),
  ).toHaveCount(0);
});

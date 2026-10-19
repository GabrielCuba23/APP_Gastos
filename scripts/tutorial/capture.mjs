import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const out = "/workspace/tutorial-mi-balance";
const rehearsal = process.env.TUTORIAL_FAST === "1";
const scenes = JSON.parse(await readFile("tutorial/guion.json", "utf8"));
const config = JSON.parse(await readFile("src/cloud-config.json", "utf8"));
await mkdir(out + "/raw", { recursive: true });
const user = {
  id: "00000000-0000-4000-8000-000000000099",
  email: "cliente@example.com",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: {},
  app_metadata: { provider: "email" },
  created_at: "2026-10-01T00:00:00Z",
};
const profile = {
  user_id: user.id,
  email: user.email,
  full_name: "Cliente de demostración",
  phone: "+51 900 000 000",
  role: "client",
  owner_id: null,
  status: "active",
  plan_name: "Mensual",
  expires_at: "2026-11-30T23:59:59-05:00",
  password_change_required: true,
};
let document = { version: 1, currency: "PEN", entries: [] },
  revision = 0;
const expiry = Math.floor(Date.now() / 1000) + 3600;
const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const token =
  enc({ alg: "HS256", typ: "JWT" }) +
  "." +
  enc({
    sub: user.id,
    aud: "authenticated",
    role: "authenticated",
    exp: expiry,
    iat: expiry - 3600,
    iss: config.url + "/auth/v1",
  }) +
  ".demo-signature";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: { dir: out + "/raw", size: { width: 1600, height: 900 } },
  locale: "es-PE",
  timezoneId: "America/Lima",
  acceptDownloads: true,
});
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === "http://127.0.0.1:5173") {
    await route.continue();
    return;
  }
  if (url.origin !== config.url) {
    await route.abort();
    return;
  }
  let data;
  if (url.pathname === "/auth/v1/token") {
    const body = route.request().postDataJSON();
    if (body.email !== user.email) throw new Error("Unexpected demo login");
    data = {
      access_token: token,
      refresh_token: "demo-only-refresh",
      expires_in: 3600,
      expires_at: expiry,
      token_type: "bearer",
      user,
    };
  } else if (url.pathname === "/auth/v1/user") data = user;
  else if (url.pathname === "/rest/v1/account_profiles") data = profile;
  else if (url.pathname === "/rest/v1/rpc/has_finance_access")
    data = !profile.password_change_required;
  else if (url.pathname === "/rest/v1/balances")
    data = { data: document, revision };
  else if (url.pathname === "/rest/v1/rpc/save_balance") {
    const body = route.request().postDataJSON();
    if (body.expected_revision !== revision)
      throw new Error("Unexpected demo revision");
    document = body.payload;
    data = ++revision;
  } else if (url.pathname === "/functions/v1/manage-accounts") {
    const body = route.request().postDataJSON();
    if (body.action !== "change_password")
      throw new Error("Unexpected demo management action");
    profile.password_change_required = false;
    data = { ok: true };
  } else if (url.pathname === "/auth/v1/logout") data = {};
  if (data === undefined)
    throw new Error("Unmocked cloud request: " + url.pathname);
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
});
const page = await context.newPage();
const origin = Date.now();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173/");
await expect(
  page.getByRole("heading", { name: "Tu mes, en equilibrio." }),
).toBeVisible();
await page.addStyleTag({
  content: `
body{padding-top:78px!important;padding-bottom:104px!important}.shell{min-height:calc(100vh - 182px)!important}.sidebar{top:78px!important;bottom:104px!important}.modal-backdrop{top:78px!important;bottom:104px!important}.modal{max-height:calc(100vh - 205px)!important}#tutorial-top,#tutorial-caption,#tutorial-cover,#tutorial-pointer,#tutorial-mobile{font-family:Inter,Arial,sans-serif;box-sizing:border-box}#tutorial-top{position:fixed;top:0;left:0;right:0;height:78px;background:#163f32;z-index:100002;color:white;display:flex;align-items:center;justify-content:space-between;padding:0 30px;box-shadow:0 2px 12px #10291b20;pointer-events:none}#tutorial-title{font-size:25px;font-weight:650;letter-spacing:-.5px}#tutorial-benefit{font-size:14px;color:#b9d0bd;margin-top:5px}#tutorial-demo{font-size:11px;letter-spacing:1.4px;border:1px solid #ffffff35;border-radius:20px;padding:9px 13px;color:#d9e4d4}#tutorial-caption{position:fixed;bottom:0;left:0;right:0;height:104px;background:#153b30;z-index:100002;color:white;display:flex;align-items:center;justify-content:center;padding:12px 90px;font-size:27px;line-height:1.3;text-align:center;font-weight:450;border-top:3px solid #c6a361;pointer-events:none}#tutorial-pointer{position:fixed;z-index:100005;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:#deb65a99;border:2px solid #ad8135;box-shadow:0 0 0 4px #eec16a33;pointer-events:none;left:1530px;top:800px;transition:left .16s ease,top .16s ease;opacity:.85}#tutorial-pointer.clicked{box-shadow:0 0 0 13px #eec16a55;background:#f3cc74;transform:scale(.85)}#tutorial-cover{position:fixed;inset:78px 0 104px;z-index:100001;background:linear-gradient(125deg,#163f32,#28644c);color:white;padding:75px 110px;display:flex;flex-direction:column;justify-content:center}#tutorial-cover .kicker{font-size:17px;letter-spacing:3px;color:#c9ae72;margin-bottom:22px}#tutorial-cover h1{font-size:74px;letter-spacing:-3px;font-weight:650;max-width:1000px;line-height:1.08;color:white}#tutorial-cover p{font-size:25px;color:#c0d4c1;margin-top:22px;max-width:1040px}#tutorial-cover .chips{display:flex;gap:18px;margin-top:36px;flex-wrap:wrap}#tutorial-cover .chips span{border:1px solid #c2d9c342;padding:13px 20px;border-radius:9px;font-size:19px;background:#ffffff05}#tutorial-cover .url{font-size:21px;color:#d5b773;margin-top:30px}#tutorial-mobile{position:fixed;inset:78px 0 104px;z-index:100001;background:#edf2eb;display:flex;align-items:center;justify-content:center;gap:80px}#tutorial-mobile .phone{width:382px;height:650px;background:#1e3027;border-radius:32px;padding:10px;box-shadow:0 16px 60px #2d4a3430;overflow:hidden}#tutorial-mobile iframe{width:362px;height:630px;border:0;border-radius:24px;background:white}#tutorial-mobile .mobile-copy{max-width:630px}#tutorial-mobile .mobile-copy h2{font-size:44px;line-height:1.1;letter-spacing:-1.6px;color:#234c38;margin-bottom:25px}#tutorial-mobile .mobile-copy p{font-size:22px;color:#71846a;margin-bottom:20px}#tutorial-mobile .mobile-copy small{display:block;font-size:15px;color:#8c9a84;letter-spacing:1.3px;margin-top:28px}.content{padding-top:26px!important}
`,
});
await page.evaluate(() => {
  const top = document.createElement("div");
  top.id = "tutorial-top";
  top.innerHTML =
    '<div><div id="tutorial-title"></div><div id="tutorial-benefit"></div></div><div id="tutorial-demo">DEMOSTRACIÓN · DATOS FICTICIOS</div>';
  document.body.append(top);
  const caption = document.createElement("div");
  caption.id = "tutorial-caption";
  document.body.append(caption);
  const pointer = document.createElement("div");
  pointer.id = "tutorial-pointer";
  document.body.append(pointer);
  document.addEventListener("mousemove", (e) => {
    pointer.style.left = e.clientX + "px";
    pointer.style.top = e.clientY + "px";
  });
  document.addEventListener("click", () => {
    pointer.classList.add("clicked");
    setTimeout(() => pointer.classList.remove("clicked"), 350);
  });
});
async function click(locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (!b) throw new Error("No visible target");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
  await page.waitForTimeout(200);
  await locator.click();
  await page.waitForTimeout(260);
}
async function type(label, value) {
  const locator = page.getByLabel(label, { exact: true });
  await click(locator);
  await locator.fill("");
  await locator.pressSequentially(value, { delay: 45 });
  await page.waitForTimeout(240);
}
async function nav(label) {
  await click(page.getByRole("button", { name: label, exact: true }));
  await page.waitForTimeout(400);
}
async function add(typeValue, name, amount) {
  await click(
    page.getByRole("button", { name: "Nuevo movimiento", exact: true }),
  );
  const select = page.getByLabel("Tipo de movimiento");
  await click(select);
  await select.selectOption(typeValue);
  await type("Descripción", name);
  await type("Importe (PEN)", amount);
  await page.getByLabel("Fecha", { exact: true }).fill("2026-10-19");
  await page.waitForTimeout(350);
  await click(
    page.getByRole("button", { name: "Guardar movimiento", exact: true }),
  );
  await expect(page.getByRole("status")).toContainText("Movimiento guardado");
  await page.waitForTimeout(350);
}
async function cover(html) {
  await page.evaluate((html) => {
    document.getElementById("tutorial-cover")?.remove();
    const el = document.createElement("div");
    el.id = "tutorial-cover";
    el.innerHTML = html;
    document.body.append(el);
  }, html);
}
const actions = {
  intro: async () => {
    await cover(
      '<div class="kicker">TUTORIAL PARA CLIENTES</div><h1>Mi Balance.<br>Tu dinero, más claro.</h1><p>Conoce el uso de tu plataforma y convierte tus movimientos en una visión clara de tu mes.</p><div class="chips"><span>Ingresos y gastos</span><span>Tu negocio</span><span>Tus ahorros</span></div>',
    );
  },
  login: async () => {
    await page.evaluate(() =>
      document.getElementById("tutorial-cover")?.remove(),
    );
    await click(
      page.getByRole("button", {
        name: "Ingresar / Crear cuenta",
        exact: true,
      }),
    );
    await type("Correo electrónico", user.email);
    await type("Contraseña", "TemporalDemo2026");
    await click(page.getByRole("button", { name: "Ingresar", exact: true }));
    await expect(
      page.getByRole("heading", { name: "Protege tu cuenta" }),
    ).toBeVisible();
    await type("Nueva contraseña", "DemoPersonal2026");
    await type("Confirmar contraseña", "DemoPersonal2026");
    await click(
      page.getByRole("button", { name: "Actualizar contraseña", exact: true }),
    );
    await expect(
      page.getByRole("heading", { name: "Tu mes, en equilibrio." }),
    ).toBeVisible();
  },
  summary: async () => {
    for (const locator of [
      page.locator(".stat.balance"),
      page.locator(".stat").nth(1),
      page.locator(".stat").nth(2),
      page.locator(".stat").nth(3),
    ]) {
      const b = await locator.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {
        steps: 20,
      });
      await page.waitForTimeout(900);
    }
    await click(page.getByRole("button", { name: "Mes anterior" }));
    await page.waitForTimeout(700);
    await click(page.getByRole("button", { name: "Mes siguiente" }));
  },
  income: async () => {
    await add("income", "Sueldo", "2500");
  },
  expense: async () => {
    await add("expense", "Supermercado", "120");
  },
  subscriptions: async () => {
    await click(page.getByRole("button", { name: /^Suscripciones/ }));
    await add("subscription", "Música", "20");
  },
  business: async () => {
    await nav("Mi negocio");
    await add("business", "Ventas", "600");
    await add("supplier", "Mercadería", "300");
  },
  savings: async () => {
    await nav("Ahorros");
    await add("saving", "Fondo de emergencia", "200");
  },
  organize: async () => {
    await nav("Movimientos");
    const search = page.getByLabel("Buscar movimientos");
    await click(search);
    await search.pressSequentially("Supermercado", { delay: 90 });
    await page.waitForTimeout(600);
    await click(page.getByLabel("Filtrar por tipo"));
    await page.getByLabel("Filtrar por tipo").selectOption("expense");
    await page.waitForTimeout(500);
    await click(page.getByRole("button", { name: "Editar Supermercado" }));
    await type("Importe (PEN)", "130");
    await click(page.getByRole("button", { name: "Guardar movimiento" }));
    await search.fill("");
    await page.getByLabel("Filtrar por tipo").selectOption("all");
  },
  backup: async () => {
    const waiting = page.waitForEvent("download");
    await click(page.getByRole("button", { name: "Exportar", exact: true }));
    const download = await waiting;
    await download.saveAs(out + "/respaldo-demostracion.json");
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.id = "demo-download";
      el.textContent = "✓ Respaldo descargado · mi-balance-2026-10-19.json";
      Object.assign(el.style, {
        position: "fixed",
        right: "30px",
        top: "95px",
        zIndex: 99999,
        background: "#fff",
        border: "1px solid #d5e3d0",
        borderRadius: "9px",
        padding: "18px 24px",
        fontSize: "18px",
        color: "#42663c",
        boxShadow: "0 12px 40px #1c3e2420",
      });
      document.body.append(el);
    });
    await page.waitForTimeout(2500);
    const importer = page.getByRole("button", {
      name: "Importar",
      exact: true,
    });
    const b = await importer.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
    await page.waitForTimeout(1200);
    await page.evaluate(() =>
      document.getElementById("demo-download")?.remove(),
    );
  },
  devices: async () => {
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.id = "tutorial-mobile";
      el.innerHTML =
        '<div class="phone"><iframe title="Demostración de vista móvil web" src="/?tutorialMobile=1"></iframe></div><div class="mobile-copy"><h2>Tu cuenta.<br>Tus movimientos.</h2><p>Consulta tu información desde la web o con la aplicación Android.</p><p>Espera la confirmación de guardado y verifica el estado Sincronizado.</p><small>EN PANTALLA: VISTA MÓVIL DE LA WEB<br>LA APK USA LA MISMA CUENTA</small></div>';
      document.body.append(el);
    });
    const frame = page.frameLocator("#tutorial-mobile iframe");
    await expect(
      frame.getByRole("heading", { name: "Tu mes, en equilibrio." }),
    ).toBeVisible();
    await page.waitForTimeout(1400);
    await frame.locator(".movements").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1800);
    await frame
      .getByRole("heading", { name: "Tu mes, en equilibrio." })
      .scrollIntoViewIfNeeded();
  },
  outro: async () => {
    await page.evaluate(() =>
      document.getElementById("tutorial-mobile")?.remove(),
    );
    await nav("Resumen");
    await page
      .getByRole("heading", { name: "Tu mes, en equilibrio." })
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: out + "/resumen-final.png" });
    await cover(
      '<div class="kicker">MÁS ORDEN PARA DECIDIR MEJOR</div><h1>Una visión clara<br>de tu mes.</h1><div class="chips"><span>Ingresos · S/ 3,100</span><span>Gastos · S/ 450</span><span>Ahorros · S/ 200</span><span>Disponible · S/ 2,450</span></div><p>Registra tus movimientos. Revisa tu resumen.<br>Construye un hábito que te acompañe cada mes.</p><div class="url">gabrielcuba23.github.io/APP_Gastos/</div>',
    );
  },
};
const timeline = [];
for (const scene of scenes) {
  const start = (Date.now() - origin) / 1000;
  const words = scene.narration.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += 11)
    chunks.push(words.slice(i, i + 11).join(" "));
  await page.evaluate(
    ({ title, benefit, chunks, speechDuration }) => {
      document.getElementById("tutorial-title").textContent = title;
      document.getElementById("tutorial-benefit").textContent = benefit;
      const caption = document.getElementById("tutorial-caption");
      caption.textContent = "";
      chunks.forEach((text, i) =>
        setTimeout(
          () => (caption.textContent = text),
          1000 + (i * speechDuration * 1000) / chunks.length,
        ),
      );
      setTimeout(
        () => (caption.textContent = ""),
        1000 + speechDuration * 1000,
      );
    },
    { ...scene, chunks },
  );
  console.log("Recording chapter:", scene.key);
  await actions[scene.key]();
  const remaining =
    scene.duration * 1000 - (Date.now() - origin - start * 1000);
  if (remaining > 0 && !rehearsal) await page.waitForTimeout(remaining);
  timeline.push({ ...scene, start, end: (Date.now() - origin) / 1000, chunks });
  await writeFile(out + "/timeline.json", JSON.stringify(timeline, null, 2));
}
if (errors.length) throw new Error("Browser errors: " + errors.join("\n"));
if (document.entries.length !== 6)
  throw new Error("Expected six demo transactions");
const total = document.entries.reduce(
  (s, e) =>
    s + (e.type === "income" || e.type === "business" ? e.cents : -e.cents),
  0,
);
if (total !== 245000) throw new Error("Unexpected final available amount");
await page.waitForTimeout(500);
const video = page.video();
await context.close();
const videoPath = await video.path();
await writeFile(
  out + "/recording.json",
  JSON.stringify(
    { videoPath, duration: timeline.at(-1).end, origin, timeline },
    null,
    2,
  ),
);
await browser.close();
console.log("Recording complete", videoPath);

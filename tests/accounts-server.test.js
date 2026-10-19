import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canManage,
  assertTarget,
  validateChange,
  validatePassword,
} from "../supabase/functions/manage-accounts/policy.js";
import { createHandler } from "../supabase/functions/manage-accounts/handler.js";
const admin = {
  user_id: "admin",
  role: "admin",
  status: "active",
  password_change_required: false,
};
const reseller = {
  ...admin,
  user_id: "seller",
  role: "reseller",
  expires_at: "2099-01-01",
};
const client = {
  user_id: "client",
  role: "client",
  owner_id: "seller",
  status: "active",
};
const input = {
  role: "client",
  full_name: "Cliente",
  phone: "+51 999 999 999",
  email: "CLIENTE@example.com",
  password: "Temporal-123456",
  plan_name: "Mensual",
  status: "active",
  expires_on: "2099-01-01",
};
test("managers cannot escalate roles or control someone else’s clients", () => {
  assert.equal(canManage(reseller), true);
  assert.equal(canManage({ ...reseller, status: "suspended" }), false);
  assert.equal(canManage({ ...reseller, expires_at: "2000-01-01" }), false);
  assert.equal(canManage({ ...admin, password_change_required: true }), false);
  assert.doesNotThrow(() => assertTarget(reseller, client));
  assert.throws(() => assertTarget(reseller, { ...client, owner_id: "other" }));
  assert.throws(() => assertTarget(reseller, admin));
  assert.throws(() => assertTarget(client, reseller));
  assert.equal(validateChange(input, true).email, "cliente@example.com");
  assert.equal(
    validateChange(input, true).change.expires_at,
    "2099-01-02T04:59:59.000Z",
  );
  for (const bad of [
    { role: "admin" },
    { expires_on: "2099-02-30" },
    { password: "short" },
    { status: "invalid" },
    { expires_on: "2000-01-01" },
  ])
    assert.throws(() => validateChange({ ...input, ...bad }, true));
  assert.throws(() => validatePassword("short"));
});
function fixture(
  actor = admin,
  { createError = false, applyError = false } = {},
) {
  const calls = [];
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: actor, error: null }) }),
      }),
    }),
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: null, error: applyError ? { message: "failure" } : null };
    },
    auth: {
      admin: {
        createUser: async (args) => {
          calls.push({ name: "create", args });
          return createError
            ? { error: { message: "existing email" } }
            : { data: { user: { id: "new-user" } } };
        },
        deleteUser: async (id) => {
          calls.push({ name: "rollback", id });
          return {};
        },
        updateUserById: async (id, args) => {
          calls.push({ name: "password", id, args });
          return {};
        },
      },
    },
  };
  const handler = createHandler({
    service,
    verifyUser: async () => ({
      data: { user: { id: actor.user_id } },
      error: null,
    }),
  });
  const request = (body, auth = true) =>
    new Request("https://example.test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: "Bearer verified-test-token" } : {}),
      },
      body: JSON.stringify(body),
    });
  return { handler, request, calls };
}
test("HTTP handler requires a verified session and rejects normal customers", async () => {
  const { handler, request } = fixture(client);
  assert.equal((await handler(request({ action: "list" }, false))).status, 401);
  assert.equal((await handler(request({ action: "list" }))).status, 403);
  const invalid = createHandler({
    service: {},
    verifyUser: async () => ({
      data: { user: null },
      error: new Error("bad token"),
    }),
  });
  assert.equal((await invalid(request({ action: "list" }))).status, 401);
});
test("reseller creation is server limited and existing email cannot be claimed", async () => {
  const seller = fixture(reseller);
  assert.equal(
    (
      await seller.handler(
        seller.request({ ...input, role: "reseller", action: "create" }),
      )
    ).status,
    403,
  );
  assert.equal(seller.calls.length, 0);
  const duplicate = fixture(admin, { createError: true });
  assert.equal(
    (await duplicate.handler(duplicate.request({ ...input, action: "create" })))
      .status,
    400,
  );
  assert.equal(
    duplicate.calls.some((c) => c.name === "manage_account"),
    false,
  );
});
test("failed provisioning removes the new auth account and no password reaches the RPC", async () => {
  const { handler, request, calls } = fixture(admin, { applyError: true });
  assert.equal(
    (await handler(request({ ...input, action: "create" }))).status,
    500,
  );
  assert.equal(
    calls.some((c) => c.name === "rollback"),
    true,
  );
  const rpc = calls.find((c) => c.name === "manage_account");
  assert.equal(rpc.args.actor_id, "admin");
  assert.equal("password" in rpc.args.changes, false);
});
test("password change can only target the authenticated account", async () => {
  const { handler, request, calls } = fixture(client);
  assert.equal(
    (
      await handler(
        request({
          action: "change_password",
          password: "New-private-password",
          user_id: "someone-else",
        }),
      )
    ).status,
    200,
  );
  assert.equal(calls.find((c) => c.name === "password").id, "client");
  assert.equal(
    calls.find((c) => c.name === "manage_account").args.target_id,
    "client",
  );
});
test("CORS refuses unapproved origins and responds to approved preflight", async () => {
  const { handler } = fixture();
  assert.equal(
    (
      await handler(
        new Request("https://example.test", {
          method: "OPTIONS",
          headers: { Origin: "https://evil.example" },
        }),
      )
    ).status,
    403,
  );
  const response = await handler(
    new Request("https://example.test", {
      method: "OPTIONS",
      headers: { Origin: "https://gabrielcuba23.github.io" },
    }),
  );
  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://gabrielcuba23.github.io",
  );
});

test("reseller listing is restricted to owned clients before pagination", async () => {
  const filters = [];
  const query = {
    select() {
      return this;
    },
    neq() {
      return this;
    },
    eq(column, value) {
      filters.push([column, value]);
      return this;
    },
    order() {
      return this;
    },
    range() {
      return Promise.resolve({ data: [], count: 0, error: null });
    },
  };
  let reads = 0;
  const service = {
    from() {
      if (reads++ === 0)
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: reseller, error: null }),
            }),
          }),
        };
      return query;
    },
  };
  const handler = createHandler({
    service,
    verifyUser: async () => ({ data: { user: { id: reseller.user_id } } }),
  });
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { authorization: "Bearer test-only" },
      body: JSON.stringify({ action: "list" }),
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(filters, [
    ["owner_id", "seller"],
    ["role", "client"],
  ]);
});

test("password reset requires ownership and prepares SQL before changing Auth", async () => {
  const target = { ...client, user_id: "00000000-0000-4000-8000-000000000003" };
  const calls = [];
  const service = {
    from() {
      return {
        select() {
          return {
            eq(column, value) {
              return {
                single: async () => ({
                  data: value === reseller.user_id ? reseller : target,
                }),
              };
            },
          };
        },
      };
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: "client@example.com" };
    },
    auth: {
      admin: {
        updateUserById: async (id, args) => {
          calls.push({ name: "auth-password", id, args });
          return {};
        },
      },
    },
  };
  const handler = createHandler({
    service,
    verifyUser: async () => ({ data: { user: { id: reseller.user_id } } }),
  });
  const request = () =>
    new Request("https://example.test", {
      method: "POST",
      headers: { authorization: "Bearer test-only" },
      body: JSON.stringify({
        action: "reset_password",
        user_id: target.user_id,
        password: "New-private-password",
      }),
    });
  let response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    email: "client@example.com",
  });
  assert.equal(calls[0].name, "prepare_account_password_reset");
  assert.equal("password" in calls[0].args, false);
  assert.deepEqual(calls[1], {
    name: "auth-password",
    id: target.user_id,
    args: { password: "New-private-password" },
  });
  calls.length = 0;
  target.owner_id = "other-seller";
  response = await handler(request());
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
  target.owner_id = reseller.user_id;
  service.rpc = async () => ({ error: { code: "PGRST202" } });
  response = await handler(request());
  assert.equal(response.status, 400);
  assert.equal(
    calls.length,
    0,
    "missing migration must not change the password",
  );
});

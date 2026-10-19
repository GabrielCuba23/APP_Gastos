import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  reseller: "00000000-0000-4000-8000-000000000002",
  client: "00000000-0000-4000-8000-000000000003",
  other: "00000000-0000-4000-8000-000000000004",
  new: "00000000-0000-4000-8000-000000000005",
};
test("PostgreSQL enforces private balances, roles, expiry and renewal", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to anon,authenticated,service_role;
   grant execute on function auth.uid() to authenticated,service_role;`);
    for (const [name, id] of Object.entries(ids).filter(
      ([name]) => name !== "new",
    ))
      await db.query("insert into auth.users values($1,$2)", [
        id,
        name + "@example.com",
      ]);
    const base = await readFile("supabase/schema.sql", "utf8");
    const migration = await readFile(
      "supabase/migrations/20261019_reseller_accounts.sql",
      "utf8",
    );
    await db.exec(base);
    await db.exec(migration);
    await db.exec(migration);
    await db.query(
      "update public.account_profiles set role='admin',expires_at=null where user_id=$1",
      [ids.admin],
    );
    await db.query(
      "update public.account_profiles set role='reseller',owner_id=$1 where user_id=$2",
      [ids.admin, ids.reseller],
    );
    await db.query(
      "update public.account_profiles set owner_id=$1 where user_id=$2",
      [ids.reseller, ids.client],
    );
    async function asUser(id, callback) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
      try {
        return await callback();
      } finally {
        await db.exec("reset role");
      }
    }
    assert.equal(
      (
        await asUser(ids.client, () =>
          db.query("select * from public.balances"),
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (await asUser(ids.admin, () => db.query("select * from public.balances")))
        .rows.length,
      1,
      "admin cannot read client financial data",
    );
    assert.equal(
      (
        await asUser(ids.reseller, () =>
          db.query("select * from public.account_profiles"),
        )
      ).rows.length,
      1,
      "reseller cannot read other profile rows directly",
    );
    await assert.rejects(
      () =>
        asUser(ids.client, () =>
          db.exec("update public.account_profiles set role='admin'"),
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        asUser(ids.client, () =>
          db.query("select public.manage_account($1,$2,'update','{}')", [
            ids.admin,
            ids.client,
          ]),
        ),
      /permission denied/,
    );
    const doc = { version: 1, currency: "PEN", entries: [] };
    await asUser(ids.client, () =>
      db.query("select public.save_balance($1,0)", [JSON.stringify(doc)]),
    );
    await assert.rejects(
      () =>
        asUser(ids.client, () =>
          db.query("select public.save_balance($1,0)", [JSON.stringify(doc)]),
        ),
      /datos cambiaron/i,
    );
    await db.query(
      "update public.account_profiles set status='suspended' where user_id=$1",
      [ids.reseller],
    );
    assert.equal(
      (
        await asUser(ids.client, () =>
          db.query("select * from public.balances"),
        )
      ).rows.length,
      0,
      "parent suspension cascades to clients",
    );
    await assert.rejects(
      () =>
        asUser(ids.client, () =>
          db.query("select public.save_balance($1,1)", [JSON.stringify(doc)]),
        ),
      /acceso no está activo/,
    );
    await db.query(
      "update public.account_profiles set status='active' where user_id=$1",
      [ids.reseller],
    );
    await db.query(
      "update public.account_profiles set expires_at=now()-interval '1 day' where user_id=$1",
      [ids.client],
    );
    assert.equal(
      (
        await asUser(ids.client, () =>
          db.query("select public.has_finance_access() as allowed"),
        )
      ).rows[0].allowed,
      false,
    );
    const change = {
      full_name: "Cliente",
      phone: "+51 999 999 999",
      plan_name: "Anual",
      status: "active",
      expires_at: "2099-12-31T23:59:59Z",
    };
    await db.exec("set role service_role");
    await db.query("select public.manage_account($1,$2,'update',$3)", [
      ids.reseller,
      ids.client,
      JSON.stringify(change),
    ]);
    await assert.rejects(
      () =>
        db.query("select public.manage_account($1,$2,'update',$3)", [
          ids.reseller,
          ids.other,
          JSON.stringify(change),
        ]),
      /No autorizado/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await asUser(ids.client, () =>
          db.query("select public.has_finance_access() as allowed"),
        )
      ).rows[0].allowed,
      true,
    );
    assert.equal(
      (await db.query("select * from public.account_events")).rows.length,
      1,
      "only successful changes create audit entries",
    );
    await db.query("insert into auth.users values($1,$2)", [
      ids.new,
      "new@example.com",
    ]);
    assert.equal(
      (
        await asUser(ids.new, () =>
          db.query("select public.has_finance_access() as allowed"),
        )
      ).rows[0].allowed,
      false,
      "public signup has no paid access",
    );
    await db.exec("set role service_role");
    await db.query("select public.manage_account($1,$2,'create',$3)", [
      ids.reseller,
      ids.new,
      JSON.stringify({ ...change, role: "client" }),
    ]);
    await db.exec("reset role");
    assert.equal(
      (
        await asUser(ids.new, () =>
          db.query("select public.has_finance_access() as allowed"),
        )
      ).rows[0].allowed,
      false,
      "temporary password blocks financial access",
    );
    await db.exec("set role service_role");
    await db.query(
      "select public.manage_account($1,$1,'password_changed','{}')",
      [ids.new],
    );
    await db.exec("reset role");
    assert.equal(
      (
        await asUser(ids.new, () =>
          db.query("select public.has_finance_access() as allowed"),
        )
      ).rows[0].allowed,
      true,
    );
    await assert.rejects(() => db.exec(base), /ya están instaladas/);
    await db.exec("rollback");
  } finally {
    await db.close();
  }
});

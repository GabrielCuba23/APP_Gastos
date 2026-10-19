import {
  ApiError,
  canManage,
  assertTarget,
  validateChange,
  validatePassword,
} from "./policy.js";
const defaultOrigins = [
  "https://gabrielcuba23.github.io",
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "null",
];
const fields =
  "user_id,email,full_name,phone,role,owner_id,status,plan_name,expires_at,password_change_required,created_at";
function check(result, message) {
  if (result.error) throw new ApiError(400, message);
  return result.data;
}
export function createHandler({
  service,
  verifyUser,
  origins = defaultOrigins,
}) {
  return async (request) => {
    const origin = request.headers.get("origin");
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    };
    if (origin && origins.includes(origin))
      headers["Access-Control-Allow-Origin"] = origin;
    const reply = (status, data) =>
      new Response(JSON.stringify(data), { status, headers });
    if (origin && !origins.includes(origin))
      return reply(403, { error: "Origen no autorizado." });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return reply(405, { error: "Método no permitido." });
    try {
      const auth = request.headers.get("authorization");
      if (!auth?.startsWith("Bearer "))
        throw new ApiError(401, "Inicia sesión para continuar.");
      const { data: { user } = {}, error: authError } = await verifyUser(
        auth.slice(7),
      );
      if (authError || !user?.id)
        throw new ApiError(401, "La sesión no es válida. Vuelve a ingresar.");
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 16384)
        throw new ApiError(413, "Solicitud demasiado grande.");
      let input;
      try {
        input = JSON.parse(text);
      } catch {
        throw new ApiError(400, "Solicitud inválida.");
      }
      if (!input || Array.isArray(input) || typeof input !== "object")
        throw new ApiError(400, "Solicitud inválida.");
      const profileResult = await service
        .from("account_profiles")
        .select(fields)
        .eq("user_id", user.id)
        .single();
      const actor = check(
        profileResult,
        "No se encontró el perfil. Ejecuta la migración de cuentas.",
      );
      if (input.action === "change_password") {
        const password = validatePassword(input.password);
        check(
          await service.auth.admin.updateUserById(user.id, { password }),
          "No se pudo cambiar la contraseña. Usa una contraseña nueva y vuelve a intentar.",
        );
        check(
          await service.rpc("manage_account", {
            actor_id: user.id,
            target_id: user.id,
            operation: "password_changed",
            changes: {},
          }),
          "Se cambió la contraseña, pero no se pudo completar el acceso. Vuelve a intentar con otra contraseña.",
        );
        return reply(200, { ok: true });
      }
      if (!canManage(actor))
        throw new ApiError(
          403,
          "Tu cuenta no tiene permiso para administrar clientes.",
        );
      if (input.action === "list") {
        const page = Number(input.page ?? 0);
        if (!Number.isInteger(page) || page < 0 || page > 10000)
          throw new ApiError(400, "Página inválida.");
        let query = service
          .from("account_profiles")
          .select(fields, { count: "exact" })
          .neq("role", "admin");
        if (actor.role === "reseller")
          query = query.eq("owner_id", user.id).eq("role", "client");
        if (input.search) {
          if (typeof input.search !== "string" || input.search.length > 254)
            throw new ApiError(400, "Búsqueda inválida.");
          query = query.ilike(
            "email",
            "%" + input.search.replace(/[\\%_]/g, "\\$&") + "%",
          );
        }
        const result = await query
          .order("created_at", { ascending: false })
          .range(page * 25, page * 25 + 24);
        check(result, "No se pudo cargar la lista de cuentas.");
        return reply(200, {
          accounts: result.data,
          count: result.count,
          apiVersion: 2,
        });
      }
      if (input.action === "create") {
        const { change, email, password } = validateChange(input, true);
        if (actor.role === "reseller" && change.role !== "client")
          throw new ApiError(
            403,
            "Solo el administrador puede crear revendedores.",
          );
        const created = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (created.error || !created.data.user)
          throw new ApiError(
            400,
            "No se pudo crear la cuenta. Revisa si el correo ya está registrado y los requisitos de contraseña.",
          );
        const id = created.data.user.id;
        const applied = await service.rpc("manage_account", {
          actor_id: user.id,
          target_id: id,
          operation: "create",
          changes: change,
        });
        if (applied.error) {
          // El perfil del trigger permanece suspendido si falla la compensación.
          const rollback = await service.auth.admin.deleteUser(id);
          throw new ApiError(
            500,
            rollback.error
              ? "La cuenta quedó sin activar. Contacta al administrador antes de volver a crearla."
              : "No se pudo activar la cuenta. No se guardó el alta; vuelve a intentar.",
          );
        }
        return reply(200, { ok: true, user_id: id });
      }
      if (["update", "reset_password"].includes(input.action)) {
        if (
          typeof input.user_id !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(input.user_id)
        )
          throw new ApiError(400, "Cuenta inválida.");
        const target = check(
          await service
            .from("account_profiles")
            .select(fields)
            .eq("user_id", input.user_id)
            .single(),
          "Cuenta no encontrada.",
        );
        assertTarget(actor, target);
        if (input.action === "reset_password") {
          const password = validatePassword(input.password);
          const prepared = await service.rpc("prepare_account_password_reset", {
            actor_id: user.id,
            target_id: target.user_id,
          });
          check(
            prepared,
            "No se pudo preparar el restablecimiento. El administrador debe aplicar la migración de contraseñas y revisar los permisos.",
          );
          check(
            await service.auth.admin.updateUserById(target.user_id, {
              password,
            }),
            "No se pudo cambiar la contraseña. La cuenta seguirá requiriendo un cambio al ingresar; vuelve a intentar con una contraseña diferente.",
          );
          return reply(200, { ok: true, email: prepared.data });
        }
        const { change } = validateChange(input);
        check(
          await service.rpc("manage_account", {
            actor_id: user.id,
            target_id: target.user_id,
            operation: "update",
            changes: change,
          }),
          "No se pudo guardar el cambio de acceso.",
        );
        return reply(200, { ok: true });
      }
      throw new ApiError(400, "Operación inválida.");
    } catch (error) {
      return reply(error instanceof ApiError ? error.status : 500, {
        error:
          error instanceof ApiError
            ? error.message
            : "No se pudo completar la operación. Inténtalo nuevamente.",
      });
    }
  };
}

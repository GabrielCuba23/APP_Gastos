export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function canManage(profile, now = Date.now()) {
  return Boolean(
    profile &&
    profile.status === "active" &&
    !profile.password_change_required &&
    (profile.role === "admin" ||
      (profile.role === "reseller" && Date.parse(profile.expires_at) > now)),
  );
}
export function assertTarget(actor, target) {
  if (
    !canManage(actor) ||
    !target ||
    target.user_id === actor.user_id ||
    target.role === "admin" ||
    (actor.role === "reseller" &&
      (target.role !== "client" || target.owner_id !== actor.user_id))
  )
    throw new ApiError(403, "No puedes administrar esta cuenta.");
}
export function validatePassword(value) {
  if (
    typeof value !== "string" ||
    value.trim().length < 10 ||
    value.length > 128
  )
    throw new ApiError(
      400,
      "La contraseña debe tener entre 10 y 128 caracteres.",
    );
  return value;
}
export function validateChange(input, create = false, now = Date.now()) {
  const name =
    typeof input.full_name === "string" ? input.full_name.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const plan =
    typeof input.plan_name === "string" ? input.plan_name.trim() : "";
  if (
    !name ||
    name.length > 120 ||
    phone.length < 6 ||
    phone.length > 30 ||
    !/^\+?[\d ()-]+$/.test(phone) ||
    !plan ||
    plan.length > 80
  )
    throw new ApiError(400, "Revisa el nombre, teléfono y plan.");
  if (!["active", "suspended"].includes(input.status))
    throw new ApiError(400, "Estado inválido.");
  const date = input.expires_on;
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new ApiError(400, "Fecha de vencimiento inválida.");
  const expires_at = new Date(date + "T23:59:59-05:00").toISOString();
  if (input.status === "active" && Date.parse(expires_at) <= now)
    throw new ApiError(
      400,
      "El vencimiento debe estar en el futuro para activar la cuenta.",
    );
  const change = {
    full_name: name,
    phone,
    plan_name: plan,
    status: input.status,
    expires_at,
  };
  if (create) {
    if (!["client", "reseller"].includes(input.role))
      throw new ApiError(400, "Rol inválido.");
    const email =
      typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      throw new ApiError(400, "Correo inválido.");
    return {
      change: { ...change, role: input.role },
      email,
      password: validatePassword(input.password),
    };
  }
  return { change };
}

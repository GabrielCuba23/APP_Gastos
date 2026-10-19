export const types = {
  expense: "Gasto personal",
  income: "Ingreso personal",
  subscription: "Suscripción",
  business: "Ingreso de negocio",
  supplier: "Pago a proveedor",
  saving: "Ahorro",
};
export const incoming = (type) => ["income", "business"].includes(type);
export function validEntry(e) {
  return (
    e &&
    typeof e.id === "string" &&
    Object.hasOwn(types, e.type) &&
    typeof e.name === "string" &&
    e.name.trim().length > 0 &&
    e.name.length <= 120 &&
    Number.isSafeInteger(e.cents) &&
    e.cents > 0 &&
    e.cents <= 999999999 &&
    typeof e.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
    !Number.isNaN(Date.parse(e.date)) &&
    new Date(e.date).toISOString().slice(0, 10) === e.date
  );
}
export function summary(entries) {
  const sum = (predicate) =>
    entries.filter(predicate).reduce((n, e) => n + e.cents, 0);
  const income = sum((e) => incoming(e.type));
  const expenses = sum((e) =>
    ["expense", "supplier", "subscription"].includes(e.type),
  );
  const savings = sum((e) => e.type === "saving");
  return {
    income,
    expenses,
    savings,
    balance: income - expenses - savings,
    business:
      sum((e) => e.type === "business") - sum((e) => e.type === "supplier"),
  };
}
export function parseBackup(raw) {
  const data = JSON.parse(raw);
  if (
    data.version !== 1 ||
    !["PEN", "USD", "EUR"].includes(data.currency) ||
    !Array.isArray(data.entries) ||
    data.entries.length > 100000 ||
    !data.entries.every(validEntry) ||
    new Set(data.entries.map((e) => e.id)).size !== data.entries.length
  )
    throw new Error("Archivo de respaldo inválido.");
  return {
    version: 1,
    currency: data.currency,
    entries: data.entries.map(({ id, type, name, cents, date }) => ({
      id,
      type,
      name,
      cents,
      date,
    })),
  };
}

import React, { useEffect, useState } from "react";
import {
  Plus,
  Search,
  UsersRound,
  RefreshCw,
  X,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { manageAccounts } from "./cloud";
const initialForm = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return {
    full_name: "",
    email: "",
    phone: "",
    password: "",
    role: "client",
    status: "active",
    plan_name: "Mensual",
    expires_on: date.toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
  };
};
const statusFor = (account) =>
  account.status === "suspended"
    ? "Suspendido"
    : Date.parse(account.expires_at) <= Date.now()
      ? "Vencido"
      : account.password_change_required
        ? "Cambio de contraseña"
        : "Activo";
export default function ResellerPanel({ profile }) {
  const [accounts, setAccounts] = useState([]),
    [count, setCount] = useState(0),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [apiVersion, setApiVersion] = useState(1),
    [resetForm, setResetForm] = useState(null),
    [showPassword, setShowPassword] = useState(false);
  const isAdmin = profile.role === "admin";
  async function load() {
    setLoading(true);
    try {
      const data = await manageAccounts({
        action: "list",
        page,
        search: query,
      });
      setAccounts(data.accounts);
      setCount(data.count);
      setApiVersion(data.apiVersion ?? 1);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    manageAccounts({ action: "list", page, search: query })
      .then((data) => {
        if (!cancelled) {
          setAccounts(data.accounts);
          setCount(data.count);
          setApiVersion(data.apiVersion ?? 1);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, query]);
  async function submit(event) {
    event.preventDefault();
    if (!form.user_id && form.password !== form.password_confirmation) {
      setError("Las contraseñas temporales no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { password_confirmation, ...payload } = form;
      await manageAccounts({
        ...payload,
        action: form.user_id ? "update" : "create",
      });
      setNotice(
        form.user_id
          ? "Acceso actualizado."
          : "Cuenta creada. Entrega la contraseña temporal al cliente por un medio privado; deberá cambiarla al ingresar.",
      );
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword(event) {
    event.preventDefault();
    if (resetForm.password !== resetForm.confirmation) {
      setError("Las contraseñas temporales no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await manageAccounts({
        action: "reset_password",
        user_id: resetForm.user_id,
        password: resetForm.password,
      });
      setResetForm(null);
      setShowPassword(false);
      setNotice(
        `Contraseña temporal actualizada. El cliente debe ingresar con ${result.email} y cambiarla al acceder.`,
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function edit(account) {
    setForm({
      ...account,
      expires_on: account.expires_at
        ? new Date(account.expires_at).toLocaleDateString("en-CA", {
            timeZone: "America/Lima",
          })
        : initialForm().expires_on,
    });
  }
  const change = (name, value) =>
    setForm((previous) => ({ ...previous, [name]: value }));
  return (
    <div className="reseller-panel">
      <div className="heading">
        <div>
          <div className="eyebrow">GESTIÓN DE ACCESOS</div>
          <h1>Panel de reventas</h1>
          <p>
            {isAdmin
              ? "Administra tus clientes, revendedores y renovaciones."
              : "Administra tus clientes y sus renovaciones."}
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setError("");
            setForm(initialForm());
          }}
        >
          <Plus size={18} />
          Crear cuenta
        </button>
      </div>
      <div className="reseller-info">
        <ShieldCheck size={19} />
        <span>
          {isAdmin ? "Administrador" : "Revendedor"} · Los movimientos
          financieros de tus clientes son privados.
        </span>
      </div>
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      {error && !form && !resetForm && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>
              <UsersRound size={19} />
              Cuentas administradas
            </h2>
            <span>
              {count} {count === 1 ? "cuenta" : "cuentas"}
              {query ? " encontradas" : ""}
            </span>
          </div>
          <button className="account-button" disabled={loading} onClick={load}>
            <RefreshCw size={14} />
            Actualizar
          </button>
        </div>
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setQuery(search.trim());
          }}
        >
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Buscar cuentas por correo"
              placeholder="Buscar por correo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button className="account-button">Buscar</button>
        </form>
        {loading ? (
          <p className="panel-empty" role="status">
            Cargando cuentas…
          </p>
        ) : accounts.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>ROL / PLAN</th>
                  <th>ESTADO</th>
                  <th>VENCIMIENTO</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.user_id}>
                    <td>
                      <div className="managed-person">
                        <b>{account.full_name || account.email}</b>
                        <span>{account.email}</span>
                        <span>{account.phone}</span>
                      </div>
                    </td>
                    <td>
                      <div className="managed-person">
                        <b>
                          {account.role === "reseller"
                            ? "Revendedor"
                            : "Cliente"}
                        </b>
                        <span>{account.plan_name}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`tag ${statusFor(account) === "Activo" ? "active-license" : ""}`}
                      >
                        {statusFor(account)}
                      </span>
                    </td>
                    <td>
                      {account.expires_at
                        ? new Date(account.expires_at).toLocaleDateString(
                            "es-PE",
                            { timeZone: "America/Lima" },
                          )
                        : "Sin asignar"}
                    </td>
                    <td>
                      <button
                        className="account-button"
                        aria-label={`Gestionar ${account.email}`}
                        onClick={() => {
                          setError("");
                          edit(account);
                        }}
                      >
                        <Pencil size={14} />
                        Gestionar
                      </button>
                      {apiVersion >= 2 && (
                        <button
                          className="account-button reset-account-button"
                          aria-label={`Restablecer ${account.email}`}
                          onClick={() => {
                            setError("");
                            setShowPassword(false);
                            setResetForm({
                              user_id: account.user_id,
                              email: account.email,
                              password: "",
                              confirmation: "",
                            });
                          }}
                        >
                          Nueva contraseña
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-empty">
            <h3>
              {query
                ? "No encontramos cuentas"
                : "Tu primera venta empieza aquí"}
            </h3>
            <p>
              {query
                ? "Revisa el correo que buscas."
                : "Crea una cuenta y asigna su plan de acceso."}
            </p>
          </div>
        )}
        <div className="pagination">
          <button
            disabled={page === 0 || loading}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span>Página {page + 1}</span>
          <button
            disabled={(page + 1) * 25 >= count || loading}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      </section>
      <p className="explanation">
        Las renovaciones son manuales. Recibe el pago por tu medio habitual y
        actualiza el plan y su vencimiento. Suspender un revendedor suspende
        también el acceso en la nube de sus clientes.
      </p>
      {resetForm && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <div className="panel-title">
              <h2 id="reset-title">Restablecer contraseña</h2>
              <button
                className="iconbtn"
                disabled={busy}
                aria-label="Cerrar restablecimiento"
                onClick={() => {
                  setResetForm(null);
                  setShowPassword(false);
                }}
              >
                <X />
              </button>
            </div>
            <p>{resetForm.email}</p>
            <p>
              Asigna una nueva contraseña temporal. El cliente deberá cambiarla
              al ingresar; sus movimientos y su plan se conservarán.
            </p>
            <form onSubmit={resetPassword}>
              <label>
                Nueva contraseña temporal
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={resetForm.password}
                  onChange={(e) =>
                    setResetForm({ ...resetForm, password: e.target.value })
                  }
                />
              </label>
              <label>
                Confirmar nueva contraseña temporal
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={resetForm.confirmation}
                  onChange={(e) =>
                    setResetForm({ ...resetForm, confirmation: e.target.value })
                  }
                />
              </label>
              <button
                className="account-button"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Ocultar contraseñas" : "Mostrar contraseñas"}
              </button>
              {error && (
                <p className="alert" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setResetForm(null)}
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "Actualizando…" : "Guardar contraseña temporal"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {form && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="managed-title"
            className="modal"
          >
            <div className="panel-title">
              <h2 id="managed-title">
                {form.user_id ? "Gestionar acceso" : "Crear cuenta de acceso"}
              </h2>
              <button
                className="iconbtn"
                disabled={busy}
                aria-label="Cerrar gestión"
                onClick={() => setForm(null)}
              >
                <X />
              </button>
            </div>
            <form onSubmit={submit}>
              <label>
                Nombre del cliente
                <input
                  required
                  maxLength={120}
                  autoComplete="off"
                  value={form.full_name}
                  onChange={(e) => change("full_name", e.target.value)}
                />
              </label>
              <label>
                Correo del cliente
                <input
                  type="email"
                  required
                  maxLength={254}
                  disabled={Boolean(form.user_id)}
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => change("email", e.target.value)}
                />
              </label>
              <label>
                Teléfono
                <input
                  type="tel"
                  required
                  minLength={6}
                  maxLength={30}
                  autoComplete="off"
                  placeholder="+51 999 999 999"
                  value={form.phone}
                  onChange={(e) => change("phone", e.target.value)}
                />
              </label>
              {!form.user_id && (
                <>
                  <label>
                    Contraseña temporal
                    <input
                      type="password"
                      required
                      minLength={10}
                      maxLength={128}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => change("password", e.target.value)}
                    />
                  </label>
                  <label>
                    Repetir contraseña temporal
                    <input
                      type="password"
                      required
                      minLength={10}
                      maxLength={128}
                      autoComplete="new-password"
                      value={form.password_confirmation || ""}
                      onChange={(e) =>
                        change("password_confirmation", e.target.value)
                      }
                    />
                  </label>
                  {isAdmin && (
                    <label>
                      Tipo de cuenta
                      <select
                        value={form.role}
                        onChange={(e) => change("role", e.target.value)}
                      >
                        <option value="client">Cliente</option>
                        <option value="reseller">Revendedor</option>
                      </select>
                    </label>
                  )}
                </>
              )}
              <div className="form-row">
                <label>
                  Plan
                  <input
                    required
                    maxLength={80}
                    value={form.plan_name}
                    onChange={(e) => change("plan_name", e.target.value)}
                  />
                </label>
                <label>
                  Vencimiento
                  <input
                    type="date"
                    required
                    value={form.expires_on}
                    onChange={(e) => change("expires_on", e.target.value)}
                  />
                </label>
              </div>
              <label>
                Estado
                <select
                  value={form.status}
                  onChange={(e) => change("status", e.target.value)}
                >
                  <option value="active">Activo</option>
                  <option value="suspended">Suspendido</option>
                </select>
              </label>
              {error && (
                <p role="alert" className="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setForm(null)}
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Guardando…"
                    : form.user_id
                      ? "Guardar acceso"
                      : "Crear cuenta"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

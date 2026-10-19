import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  LayoutDashboard,
  ArrowLeftRight,
  Repeat,
  Store,
  PiggyBank,
  Plus,
  X,
  Trash2,
  Pencil,
  Download,
  Upload,
  Search,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Menu,
  UsersRound,
} from "lucide-react";
import { types, incoming, summary, parseBackup, validEntry } from "./finance";
import "./style.css";
import Account from "./Account";
import { Capacitor } from "@capacitor/core";
import { cloud, readCloud, writeCloud, readAccountProfile } from "./cloud";
import { canManage } from "../supabase/functions/manage-accounts/policy.js";
import ResellerPanel from "./ResellerPanel";
import AccessGate from "./AccessGate";
const KEY = "mi-balance-v1";
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw
      ? parseBackup(raw)
      : { version: 1, currency: "PEN", entries: [] };
  } catch {
    return { version: 1, currency: "PEN", entries: [], loadError: true };
  }
}
const icons = {
  expense: ArrowUpRight,
  income: ArrowDownLeft,
  subscription: Repeat,
  business: Store,
  supplier: Store,
  saving: PiggyBank,
};
function App() {
  const [data, setData] = useState(load),
    [page, setPage] = useState("Resumen"),
    [month, setMonth] = useState(today().slice(0, 7)),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [form, setForm] = useState(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(false);
  const file = useRef();
  const [account, setAccount] = useState(false),
    [user, setUser] = useState(null),
    [cloudReady, setCloudReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [accountProfile, setAccountProfile] = useState(null);
  const [accountAccess, setAccountAccess] = useState(null);
  const revision = useRef(0);
  const activeUser = useRef(null);
  const writeLock = useRef(false);
  const viewState = useRef({ form, busy });
  viewState.current = { form, busy };
  async function refreshCloud() {
    const expected = activeUser.current;
    try {
      const access = await readAccountProfile();
      if (activeUser.current !== expected) return;
      setAccountProfile(access.profile);
      setAccountAccess(access.allowed);
      if (!access.allowed) {
        setCloudReady(false);
        setData({ version: 1, currency: "PEN", entries: [] });
        setError("");
        return;
      }
      const row = await readCloud();
      if (activeUser.current !== expected || row.revision < revision.current)
        return;
      const next = parseBackup(JSON.stringify(row.data));
      revision.current = row.revision;
      setData(next);
      setCloudReady(true);
      setError("");
    } catch (err) {
      if (activeUser.current !== expected) return;
      setCloudReady(false);
      setError("No se pudo cargar la cuenta: " + err.message);
    }
  }
  useEffect(() => {
    if (!cloud) return;
    const {
      data: { subscription },
    } = cloud.auth.onAuthStateChange((_event, session) => {
      const next = session?.user || null;
      if (activeUser.current === next?.id) return;
      activeUser.current = next?.id || null;
      revision.current = 0;
      setUser(next);
      setAccountProfile(null);
      setAccountAccess(null);
      setPage("Resumen");
      setForm(null);
      setData({ version: 1, currency: "PEN", entries: [] });
      setCloudReady(false);
      if (!next) setData(load());
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!user) return;
    refreshCloud();
    const timer = setInterval(() => {
      if (
        !document.hidden &&
        !viewState.current.form &&
        !viewState.current.busy
      )
        refreshCloud();
    }, 15000);
    return () => clearInterval(timer);
  }, [user]);
  const money = (c) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: data.currency,
    }).format(c / 100);
  async function save(next, recovery = false) {
    if (data.loadError && !recovery) {
      setError(
        "Recupera el respaldo original antes de guardar para evitar perder datos.",
      );
      return false;
    }
    if (busy || writeLock.current) return false;
    if (user) {
      if (!cloudReady) {
        setError("Espera a que tu cuenta se cargue o vuelve a conectarte.");
        return false;
      }
      setBusy(true);
      writeLock.current = true;
      const expectedUser = activeUser.current;
      try {
        const nextRevision = await writeCloud(next, revision.current);
        if (activeUser.current !== expectedUser) return false;
        revision.current = nextRevision;
        setData(next);
        setError("");
        return true;
      } catch (err) {
        if (activeUser.current !== expectedUser) return false;
        await refreshCloud();
        setError("No se guardó el cambio: " + err.message);
        return false;
      } finally {
        writeLock.current = false;
        setBusy(false);
      }
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setData(next);
      setError("");
      return true;
    } catch {
      setError(
        "No se pudo guardar. Revisa el espacio y los permisos del navegador.",
      );
      return false;
    }
  }
  const current = data.entries.filter((e) => e.date.startsWith(month));
  const sums = summary(current);
  const scope = current.filter((e) =>
    page === "Suscripciones"
      ? e.type === "subscription"
      : page === "Mi negocio"
        ? ["business", "supplier"].includes(e.type)
        : page === "Ahorros"
          ? e.type === "saving"
          : true,
  );
  const rows = scope
    .filter(
      (e) =>
        (filter === "all" || e.type === filter) &&
        e.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const nav = [
    ["Resumen", LayoutDashboard],
    ["Movimientos", ArrowLeftRight],
    ["Suscripciones", Repeat],
    ["Mi negocio", Store],
    ["Ahorros", PiggyBank],
  ];
  if (canManage(accountProfile)) nav.push(["Panel de reventas", UsersRound]);
  function open(type = "expense") {
    setForm({ type, name: "", amount: "", date: today() });
  }
  async function submit(e) {
    e.preventDefault();
    if (form.id && !data.entries.some((entry) => entry.id === form.id)) {
      setError(
        "Este movimiento fue eliminado en otro dispositivo. Cierra el formulario y registra uno nuevo si corresponde.",
      );
      return;
    }
    const cents = Math.round(Number(form.amount) * 100);
    const entry = {
      id: form.id || crypto.randomUUID(),
      type: form.type,
      name: form.name.trim(),
      cents,
      date: form.date,
    };
    if (!validEntry(entry)) {
      setError("Revisa la descripción, la fecha y el importe.");
      return;
    }
    const next = {
      ...data,
      entries: form.id
        ? data.entries.map((x) => (x.id === form.id ? entry : x))
        : [...data.entries, entry],
    };
    if (await save(next)) {
      setMonth(entry.date.slice(0, 7));
      setForm(null);
      setNotice("Movimiento guardado correctamente.");
    }
  }
  async function remove(id) {
    if (confirm("¿Eliminar este movimiento?")) {
      if (
        await save({
          ...data,
          entries: data.entries.filter((e) => e.id !== id),
        })
      )
        setNotice("Movimiento eliminado.");
    }
  }
  async function exportData() {
    try {
      const raw = data.loadError
        ? localStorage.getItem(KEY)
        : JSON.stringify(data, null, 2);
      const filename = `mi-balance-${today()}.json`;
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory, Encoding } =
          await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const { uri } = await Filesystem.writeFile({
          path: filename,
          data: raw,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({ title: "Respaldo Mi Balance", url: uri });
        return;
      }
      const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("No se pudo exportar el respaldo. Inténtalo de nuevo.");
    }
  }
  async function importData(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (f.size > 20000000) throw new Error("El archivo es demasiado grande.");
      const next = parseBackup(await f.text());
      if (
        confirm(
          `Se reemplazarán los datos actuales por ${next.entries.length} movimientos del respaldo. ¿Continuar?`,
        )
      ) {
        if (await save(next, true))
          setNotice("Respaldo importado correctamente.");
      }
    } catch (err) {
      setError(err.message);
    }
    e.target.value = "";
  }
  function shift(n) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const outCategories = ["expense", "subscription", "supplier"];
  const outTotal = sums.expenses;
  return (
    <div className="shell">
      <aside className={menu ? "sidebar show" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Resumen");
          }}
        >
          <span className="brandmark">
            <Wallet size={23} />
          </span>
          mi balance<span className="brand-dot">.</span>
        </a>
        <div className="workspace">TU ESPACIO FINANCIERO</div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? "nav active" : "nav"}
              onClick={() => {
                setPage(label);
                setFilter("all");
                setSearch("");
                setMenu(false);
              }}
            >
              <Icon size={20} />
              {label}
              {label === "Suscripciones" && (
                <span className="count">
                  {current.filter((e) => e.type === "subscription").length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-pill">
            <span />
            {user ? "Guardado en tu cuenta" : "Guardado en este dispositivo"}
          </div>
          <p>
            Tus finanzas, bajo tu control.
            <br />
            Exporta un respaldo para cuidarlas.
          </p>
          <div className="profile">
            <div className="avatar">YO</div>
            <div>
              <strong>Mi espacio personal</strong>
              <small>Personal y negocio</small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <button
            className="mobile-menu iconbtn"
            aria-label="Abrir menú"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <span>
            Mi espacio <span className="slash">/</span> <b>{page}</b>
          </span>
          <div className="header-right">
            <button className="account-button" onClick={() => setAccount(true)}>
              {user ? "Mi cuenta" : "Ingresar / Crear cuenta"}
            </button>
            <span className="online">
              <span />
              {user
                ? cloudReady
                  ? "Sincronizado"
                  : "Conectando…"
                : "Modo local"}
            </span>
            <select
              aria-label="Moneda"
              value={data.currency}
              onChange={(e) => {
                if (
                  !data.entries.length ||
                  confirm(
                    "Cambiar la moneda cambia las etiquetas, no convierte los importes. ¿Continuar?",
                  )
                )
                  save({ ...data, currency: e.target.value });
              }}
            >
              <option value="PEN">PEN · S/</option>
              <option value="USD">USD · $</option>
              <option value="EUR">EUR · €</option>
            </select>
          </div>
        </header>
        <div className="content">
          {page === "Panel de reventas" && canManage(accountProfile) ? (
            <ResellerPanel profile={accountProfile} />
          ) : user && accountProfile && accountAccess === false ? (
            <AccessGate profile={accountProfile} onChanged={refreshCloud} />
          ) : (
            <>
              <div className="heading">
                <div>
                  <div className="eyebrow">
                    UN POCO DE ORDEN, MÁS TRANQUILIDAD
                  </div>
                  <h1>
                    {page === "Resumen" ? "Tu mes, en equilibrio." : page}
                  </h1>
                  <p>
                    {page === "Resumen"
                      ? "Una mirada clara a tu dinero personal y de negocio."
                      : page === "Suscripciones"
                        ? "Registra tus pagos recurrentes y revisa cuánto suman cada mes."
                        : page === "Mi negocio"
                          ? "Tus ventas y pagos a proveedores, en un solo lugar."
                          : page === "Ahorros"
                            ? "Cada aporte te acerca a tus próximos objetivos."
                            : "Revisa y organiza cada ingreso y cada salida."}
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    open(
                      page === "Ahorros"
                        ? "saving"
                        : page === "Suscripciones"
                          ? "subscription"
                          : page === "Mi negocio"
                            ? "business"
                            : "expense",
                    )
                  }
                >
                  <Plus size={18} />
                  Nuevo movimiento
                </button>
              </div>
              {data.loadError && (
                <div role="alert" className="alert">
                  No se pudo leer el almacenamiento existente. Exporta o
                  recupera tu respaldo antes de reemplazar los datos.
                </div>
              )}
              {error && (
                <div role="alert" className="alert">
                  {error}
                  <button
                    onClick={() => setError("")}
                    aria-label="Cerrar error"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {notice && (
                <div role="status" className="notice">
                  <CircleCheck size={17} />
                  {notice}
                  <button
                    onClick={() => setNotice("")}
                    aria-label="Cerrar aviso"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="period">
                <div className="month-picker">
                  <button
                    className="iconbtn"
                    aria-label="Mes anterior"
                    onClick={() => shift(-1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <input
                    aria-label="Mes"
                    type="month"
                    value={month}
                    onChange={(e) => {
                      if (e.target.value) setMonth(e.target.value);
                    }}
                  />
                  <button
                    className="iconbtn"
                    aria-label="Mes siguiente"
                    onClick={() => shift(1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
                <span>Un nuevo mes, nuevas posibilidades.</span>
              </div>
              <section className="stats">
                <article className="stat balance">
                  <div className="stat-label">
                    Disponible del mes
                    <Wallet size={19} />
                  </div>
                  <strong>{money(sums.balance)}</strong>
                  <small>Ingresos − gastos − ahorros</small>
                  <div className="balance-decoration" />
                </article>
                {[
                  [
                    "Ingresos",
                    sums.income,
                    ArrowDownLeft,
                    "green",
                    "Personales + negocio",
                  ],
                  [
                    "Gastos",
                    sums.expenses,
                    ArrowUpRight,
                    "orange",
                    "Personales + suscripciones + proveedores",
                  ],
                  [
                    "Ahorros",
                    sums.savings,
                    PiggyBank,
                    "blue",
                    "Aportes registrados este mes",
                  ],
                ].map(([label, val, Icon, color, desc]) => (
                  <article className="stat" key={label}>
                    <div className="stat-label">
                      {label}
                      <span className={`stat-icon ${color}`}>
                        <Icon size={19} />
                      </span>
                    </div>
                    <strong>{money(val)}</strong>
                    <small>{desc}</small>
                  </article>
                ))}
              </section>
              {page === "Resumen" && (
                <section className="overview">
                  <article className="panel distribution">
                    <div className="panel-title">
                      <h2>¿A dónde va tu dinero?</h2>
                      <span>Gastos del mes</span>
                    </div>
                    <div className="distribution-body">
                      <div
                        className="donut"
                        style={{
                          background: outTotal
                            ? `conic-gradient(#245d4b 0 ${(current.filter((e) => e.type === "expense").reduce((n, e) => n + e.cents, 0) / outTotal) * 100}%, #c6a361 0 ${(1 - current.filter((e) => e.type === "supplier").reduce((n, e) => n + e.cents, 0) / outTotal) * 100}%, #9fb8ad 0 100%)`
                            : "#edf1ee",
                        }}
                      >
                        <div>
                          <small>Total gastado</small>
                          <strong>{money(outTotal)}</strong>
                        </div>
                      </div>
                      <div className="legend">
                        {outCategories.map((t, i) => {
                          const v = current
                            .filter((e) => e.type === t)
                            .reduce((n, e) => n + e.cents, 0);
                          return (
                            <div key={t}>
                              <i
                                style={{
                                  background: ["#245d4b", "#c6a361", "#9fb8ad"][
                                    i
                                  ],
                                }}
                              />
                              <span>
                                {t === "expense"
                                  ? "Personal"
                                  : t === "supplier"
                                    ? "Proveedores"
                                    : "Suscripciones"}
                                <small>
                                  {outTotal
                                    ? Math.round((v / outTotal) * 100)
                                    : 0}
                                  % del total
                                </small>
                              </span>
                              <b>{money(v)}</b>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                  <article className="business-card">
                    <span className="business-icon">
                      <Store size={23} />
                    </span>
                    <div className="eyebrow">TU NEGOCIO TAMBIÉN CUENTA</div>
                    <h2>Una visión más completa.</h2>
                    <p>
                      Separa lo personal de tu negocio y conoce el resultado de
                      tus movimientos.
                    </p>
                    <div className="business-result">
                      <span>Balance del negocio</span>
                      <strong>{money(sums.business)}</strong>
                    </div>
                    <button
                      onClick={() => {
                        setPage("Mi negocio");
                        setFilter("all");
                      }}
                    >
                      Ver mi negocio <ArrowUpRight size={17} />
                    </button>
                  </article>
                </section>
              )}
              {page === "Suscripciones" && (
                <p className="explanation">
                  Cada suscripción representa un pago registrado. Los cobros de
                  otros meses se registran por separado; no se generan cargos
                  automáticos.
                </p>
              )}
              <section className="panel movements">
                <div className="panel-title">
                  <div>
                    <h2>
                      {page === "Resumen"
                        ? "Últimos movimientos"
                        : page === "Ahorros"
                          ? "Mis aportes"
                          : "Movimientos del mes"}
                    </h2>
                    <span>{rows.length} registros en este período</span>
                  </div>
                  <div className="backup-actions">
                    <button onClick={exportData}>
                      <Download size={16} />
                      <span>Exportar</span>
                    </button>
                    <button onClick={() => file.current.click()}>
                      <Upload size={16} />
                      <span>Importar</span>
                    </button>
                    <input
                      ref={file}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={importData}
                    />
                  </div>
                </div>
                <div className="toolbar">
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Buscar movimientos"
                      placeholder="Buscar un movimiento..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filtrar por tipo"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Todos los tipos</option>
                    {Object.entries(types).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                {rows.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>DESCRIPCIÓN</th>
                          <th>TIPO</th>
                          <th>FECHA</th>
                          <th className="amount">IMPORTE</th>
                          <th>
                            <span className="sr-only">Acciones</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((e) => {
                          const Icon = icons[e.type];
                          return (
                            <tr key={e.id}>
                              <td>
                                <div className="entry-name">
                                  <span
                                    className={`entry-icon ${incoming(e.type) ? "green" : e.type === "saving" ? "blue" : "orange"}`}
                                  >
                                    <Icon size={18} />
                                  </span>
                                  <b>{e.name}</b>
                                </div>
                              </td>
                              <td>
                                <span className="tag">{types[e.type]}</span>
                              </td>
                              <td>
                                {new Date(
                                  e.date + "T12:00:00",
                                ).toLocaleDateString("es-PE", {
                                  day: "2-digit",
                                  month: "short",
                                })}
                              </td>
                              <td
                                className={`amount ${incoming(e.type) ? "positive" : ""}`}
                              >
                                {incoming(e.type) ? "+" : "−"}
                                {money(e.cents)}
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    className="iconbtn"
                                    aria-label={`Editar ${e.name}`}
                                    onClick={() =>
                                      setForm({
                                        ...e,
                                        amount: (e.cents / 100).toFixed(2),
                                      })
                                    }
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  <button
                                    className="iconbtn"
                                    aria-label={`Eliminar ${e.name}`}
                                    onClick={() => remove(e.id)}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty">
                    <span>
                      <ArrowLeftRight size={26} />
                    </span>
                    <h3>
                      {search || filter !== "all"
                        ? "No encontramos movimientos"
                        : "Aquí empieza tu tranquilidad financiera"}
                    </h3>
                    <p>
                      {search || filter !== "all"
                        ? "Prueba con otro filtro o descripción."
                        : "Registra tu primer movimiento y empieza a ver tu mes con claridad."}
                    </p>
                    <button onClick={() => open()}>
                      <Plus size={16} />
                      Registrar movimiento
                    </button>
                  </div>
                )}
              </section>
              <footer>
                <span>
                  <Wallet size={14} />
                  Mi Balance · Hecho para tu día a día
                </span>
                <span>Los pequeños hábitos hacen grandes cambios.</span>
              </footer>
            </>
          )}
        </div>
      </main>
      {form && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setForm(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="modal"
          >
            <div className="panel-title">
              <h2 id="dialog-title">
                {form.id ? "Editar movimiento" : "Nuevo movimiento"}
              </h2>
              <button
                className="iconbtn"
                aria-label="Cerrar formulario"
                onClick={() => setForm(null)}
              >
                <X />
              </button>
            </div>
            <p>Cada movimiento cuenta. Dale un lugar.</p>
            <form onSubmit={submit}>
              <label>
                Tipo de movimiento
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {Object.entries(types).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Descripción
                <input
                  autoFocus
                  required
                  maxLength={120}
                  placeholder="Ej. Compra del supermercado"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <div className="form-row">
                <label>
                  Importe ({data.currency})
                  <input
                    required
                    type="number"
                    min="0.01"
                    max="9999999.99"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                  />
                </label>
                <label>
                  Fecha
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </label>
              </div>
              {form.type === "subscription" && (
                <p className="explanation">
                  Registra el pago de este mes. Podrás añadir los siguientes
                  pagos cuando se realicen.
                </p>
              )}
              <div className="form-actions">
                <button type="button" onClick={() => setForm(null)}>
                  Cancelar
                </button>
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || Boolean(user && !cloudReady)}
                >
                  {busy ? "Guardando…" : "Guardar movimiento"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {account && (
        <Account
          user={user}
          profile={accountProfile}
          onChanged={refreshCloud}
          onClose={() => setAccount(false)}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);

import React, { useState } from "react";
import { cloud } from "./cloud";
export default function Account({ user, onClose }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function auth(e, signup = false) {
    e.preventDefault();
    if (!e.currentTarget.form?.reportValidity() && e.type !== "submit") return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await cloud.auth[
        signup ? "signUp" : "signInWithPassword"
      ]({ email, password });
      if (error) throw error;
      if (signup)
        setMessage(
          "Cuenta creada. Revisa tu correo para confirmar el registro antes de ingresar.",
        );
      else onClose();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
      >
        <div className="panel-title">
          <h2 id="account-title">Tu cuenta, tus finanzas</h2>
          <button
            className="iconbtn"
            aria-label="Cerrar cuenta"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {!cloud ? (
          <p>
            La sincronización necesita conectar un proyecto Supabase. Consulta
            README.md para configurar el servidor. Mientras tanto puedes usar el
            modo local y exportar tus datos.
          </p>
        ) : user ? (
          <>
            <p>
              Sesión de {user.email}. Tus movimientos se guardan en tu cuenta.
            </p>
            <button
              className="primary"
              onClick={async () => {
                await cloud.auth.signOut();
                onClose();
              }}
            >
              Cerrar sesión
            </button>
          </>
        ) : (
          <form onSubmit={auth}>
            <p>
              Accede desde la web o Android con la misma cuenta. Al ingresar se
              cargarán los datos de tu cuenta; exporta primero tus registros
              locales si deseas conservarlos.
            </p>
            <label>
              Correo electrónico
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                minLength={8}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                disabled={busy}
                onClick={(e) => auth(e, true)}
              >
                Crear cuenta
              </button>
              <button className="primary" disabled={busy}>
                Ingresar
              </button>
            </div>
          </form>
        )}
        {message && (
          <p role="status" className="explanation">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}

import React, { useState } from "react";
import { cloud, confirmationRedirectUrl } from "./cloud";
export default function Account({ user, onClose }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [needsConfirmation, setNeedsConfirmation] = useState(false);
  async function auth(e, signup = false) {
    e.preventDefault();
    if (!e.currentTarget.form?.reportValidity() && e.type !== "submit") return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await cloud.auth[
        signup ? "signUp" : "signInWithPassword"
      ]({
        email,
        password,
        ...(signup
          ? { options: { emailRedirectTo: confirmationRedirectUrl } }
          : {}),
      });
      if (error) throw error;
      if (signup) {
        setNeedsConfirmation(true);
        setMessage(
          "Cuenta creada. Revisa tu correo para confirmar el registro antes de ingresar.",
        );
      } else onClose();
    } catch (err) {
      if (err.code === "email_not_confirmed") {
        setNeedsConfirmation(true);
        setMessage(
          "Confirma tu correo antes de ingresar. Puedes solicitar un nuevo enlace abajo.",
        );
      } else setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function resendConfirmation() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const { error } = await cloud.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: confirmationRedirectUrl },
      });
      if (error) throw error;
      setMessage(
        "Solicitamos otro correo de confirmación. Usa el enlace más reciente; si tu cuenta ya estaba confirmada, vuelve a ingresar.",
      );
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
        {needsConfirmation && !user && (
          <button
            type="button"
            className="account-button"
            disabled={busy}
            onClick={resendConfirmation}
          >
            Reenviar confirmación
          </button>
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

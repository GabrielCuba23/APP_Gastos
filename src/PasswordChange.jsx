import React, { useState } from "react";
import { manageAccounts } from "./cloud";
export default function PasswordChange({ onChanged }) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (password !== confirm) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await manageAccounts({ action: "change_password", password });
      setPassword("");
      setConfirm("");
      await onChanged();
      setMessage("Contraseña actualizada.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="password-form" onSubmit={submit}>
      <label>
        Nueva contraseña
        <input
          required
          type="password"
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label>
        Confirmar contraseña
        <input
          required
          type="password"
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <p>
        Usa al menos 10 caracteres y una contraseña distinta de la temporal.
      </p>
      <button className="primary" disabled={busy}>
        {busy ? "Guardando…" : "Actualizar contraseña"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

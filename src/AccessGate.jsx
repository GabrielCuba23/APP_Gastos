import React from "react";
import { ShieldCheck, Clock3 } from "lucide-react";
import PasswordChange from "./PasswordChange";
export default function AccessGate({ profile, onChanged }) {
  const passwordRequired = profile.password_change_required;
  const suspended = profile.status === "suspended";
  return (
    <section className="panel access-gate">
      <span className="gate-icon">
        {passwordRequired ? <ShieldCheck size={30} /> : <Clock3 size={30} />}
      </span>
      <h1>
        {passwordRequired
          ? "Protege tu cuenta"
          : suspended
            ? "Tu acceso está suspendido"
            : "Tu plan necesita una revisión"}
      </h1>
      <p>
        {passwordRequired
          ? "Cambia la contraseña temporal que recibiste antes de acceder a tus finanzas."
          : "Comunícate con tu revendedor o administrador para activar o renovar tu acceso. Tus movimientos se conservan."}
      </p>
      <div className="license-summary">
        <span>{profile.plan_name}</span>
        {profile.expires_at && (
          <span>
            Vencimiento:{" "}
            {new Date(profile.expires_at).toLocaleDateString("es-PE", {
              timeZone: "America/Lima",
            })}
          </span>
        )}
      </div>
      {passwordRequired && <PasswordChange onChanged={onChanged} />}
      <button className="account-button" onClick={onChanged}>
        Comprobar acceso
      </button>
    </section>
  );
}

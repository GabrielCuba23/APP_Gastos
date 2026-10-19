import { createClient } from "@supabase/supabase-js";
import publicCloud from "./cloud-config.json";
// Public browser configuration, protected by Supabase RLS; never use a secret key here.
const url = import.meta.env.VITE_SUPABASE_URL?.trim() || publicCloud.url;
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  publicCloud.publishableKey;
export const confirmationRedirectUrl =
  import.meta.env.VITE_PUBLIC_WEB_URL?.trim() || publicCloud.webUrl;
export const cloud = url && key ? createClient(url, key) : null;
export async function readCloud() {
  const { data, error } = await cloud
    .from("balances")
    .select("data,revision")
    .single();
  if (error) throw error;
  return data;
}
export async function writeCloud(data, revision) {
  const { data: next, error } = await cloud.rpc("save_balance", {
    payload: data,
    expected_revision: revision,
  });
  if (error) throw error;
  return next;
}

export async function readAccountProfile() {
  const result = await cloud
    .from("account_profiles")
    .select(
      "user_id,email,full_name,phone,role,owner_id,status,plan_name,expires_at,password_change_required",
    )
    .single();
  // Compatibilidad con la app validada mientras se aplica la nueva migración.
  if (["PGRST205", "42P01"].includes(result.error?.code))
    return { profile: null, allowed: true };
  if (result.error) throw result.error;
  const access = await cloud.rpc("has_finance_access");
  if (access.error) throw access.error;
  return { profile: result.data, allowed: access.data === true };
}
export async function manageAccounts(body) {
  const { data, error } = await cloud.functions.invoke("manage-accounts", {
    body,
  });
  if (error) {
    let message =
      "No se pudo conectar con la gestión de cuentas. Verifica que el servicio esté desplegado y tu sesión siga activa.";
    try {
      const response = await error.context?.json();
      if (response?.error) message = response.error;
    } catch {
      /* No response body on network errors. */
    }
    throw new Error(message);
  }
  return data;
}

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createHandler } from "./handler.js";
const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
if (!url || !serviceKey || !anonKey)
  throw new Error("Falta la configuración del servidor Supabase.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const auth = createClient(url, anonKey, options);
const configuredOrigins = Deno.env
  .get("ALLOWED_APP_ORIGINS")
  ?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
Deno.serve(
  createHandler({
    service,
    verifyUser: (token: string) => auth.auth.getUser(token),
    ...(configuredOrigins ? { origins: configuredOrigins } : {}),
  }),
);

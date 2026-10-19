# Activación del panel de reventas

La app ya puede iniciar sesión y guardar movimientos. Esta ampliación necesita un paso SQL y desplegar una Edge Function. El código del panel por sí solo no crea permisos en Supabase.

## 1. Preparar roles sin borrar registros

En el SQL Editor del proyecto `ofxcqqmshgzszwwasdhs`, ejecuta TODO `migrations/20261019_reseller_accounts.sql`. No vuelvas a ejecutar `schema.sql` después de instalar reventas: ese archivo ahora rechaza la ejecución para proteger las nuevas reglas.

Las cuentas que existan antes de la migración reciben 30 días iniciales. Las cuentas nuevas creadas desde el registro público quedan sin plan hasta que las active el administrador. Los registros financieros existentes se conservan. La migración puede repetirse sin reiniciar planes ya asignados.

Después ejecuta `bootstrap-admin.sql`, sustituyendo `TU_CORREO_AQUI` por el correo de tu cuenta ya registrada. Esto asigna administrador solo a esa cuenta. No publiques un archivo con tu correo o contraseña.

## 2. Desplegar el servicio de cuentas

Opción dashboard, sin compartir claves secretas:

1. En Supabase abre **Edge Functions**, crea una función mediante el editor y usa el nombre exacto **manage-accounts**.
2. Sustituye el contenido del editor por TODO `deploy/manage-accounts.ts`. Es un archivo único generado desde los módulos probados.
3. Desactiva **Verify JWT / Enforce JWT verification** en la configuración de esa función. La función ya verifica cada token de usuario llamando a `auth.getUser`. Este ajuste no deja las operaciones abiertas: rechaza sesiones ausentes/inválidas y aplica el rol del servidor.
4. Despliega la función. Supabase proporciona internamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. No pongas esta última en la web, APK, GitHub ni en el chat. Si esos valores no existen en la función, configúralos únicamente en los secretos del servidor de Supabase.

Alternativa CLI en tu equipo con una sesión Supabase propia:

```sh
supabase login
supabase functions deploy manage-accounts --project-ref ofxcqqmshgzszwwasdhs --no-verify-jwt
```

El repositorio incluye `config.toml` con la misma configuración. `npm run build:edge` regenera el archivo de despliegue. No ejecutamos automáticamente despliegues sin una sesión administrativa del proyecto.

Los orígenes predeterminados son GitHub Pages de esta cuenta, los WebViews locales de Capacitor, el HTML descargable y el servidor de desarrollo. Para otro dominio configura `ALLOWED_APP_ORIGINS` en la función con los orígenes permitidos separados por comas. Los tokens siguen siendo obligatorios.

## 3. Probar una venta completa

1. Cierra sesión e ingresa con la cuenta administradora. Debe aparecer **Panel de reventas** en el menú.
2. Crea un cliente con correo, nombre, teléfono, contraseña temporal (mínimo 10 caracteres), plan y vencimiento. Crear no envía correos: entrega las credenciales por un medio privado.
3. En otro navegador o dispositivo ingresa con ese cliente. Debe exigir cambiar su contraseña temporal antes de acceder a los movimientos.
4. Registra un movimiento y verifica la misma cuenta en otro dispositivo.
5. Desde el administrador suspende al cliente. Sus operaciones de nube deben quedar bloqueadas y los movimientos deben conservarse.
6. Actívalo con una fecha futura y comprueba que recupera los registros.
7. Crea un revendedor, cambia su contraseña temporal y comprueba que solo gestiona sus clientes. Un revendedor suspendido o vencido bloquea también el acceso en nube de sus clientes.

## Alcance y controles

- El administrador gestiona clientes y revendedores; el revendedor solo crea y actualiza sus propios clientes. No hay creación de administradores desde el panel.
- Los gestores no reciben movimientos financieros de los clientes. La API de gestión devuelve únicamente sus datos de contacto y acceso.
- La lectura de perfiles y movimientos tiene RLS; la escritura financiera verifica estado, vencimiento, gestor y contraseña temporal en el servidor.
- Los clientes no pueden cambiar roles, propietarios, planes o vencimientos desde el navegador.
- Las contraseñas solo se entregan a Supabase Auth; no se guardan en perfiles, respuestas de listado ni eventos de auditoría. El panel borra el formulario tras crear la cuenta.
- Renovar es una operación manual, sin cobrar dinero automáticamente. No se han integrado pasarelas, precios, comisiones o facturación.
- El modo local sin sesión sigue disponible como demostración independiente. La licencia controla el acceso a datos y funciones en la nube; no es un mecanismo para borrar o bloquear archivos locales de dispositivos ajenos.
- No hay borrado de clientes desde el panel. Se suspende el acceso para conservar sus registros.
- La migración y la función están probadas localmente con PostgreSQL y sesiones simuladas. La validación real requiere ejecutar los pasos anteriores en tu proyecto.

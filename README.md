# Mi Balance

App en español para finanzas personales y de negocio, web y Android. Moneda inicial: soles (PEN). Registra ingresos personales, ingresos del negocio, gastos personales, pagos a proveedores, suscripciones y aportes a ahorros. Incluye resumen por mes, balance del negocio, edición, eliminación, búsqueda, filtros y respaldo JSON.

## Descargas y acceso

- [Descargar APK Android de prueba](https://github.com/GabrielCuba23/APP_Gastos/raw/refs/heads/main/downloads/mi-balance-debug.apk).
- [Descargar web en ZIP](https://github.com/GabrielCuba23/APP_Gastos/raw/refs/heads/main/downloads/mi-balance-web.zip): extrae el ZIP y abre `mi-balance.html`.
- [Descargar versión web en un solo HTML](https://github.com/GabrielCuba23/APP_Gastos/raw/refs/heads/main/downloads/mi-balance.html). Guarda el archivo y ábrelo con Chrome, Edge o Firefox. Funciona sin servidor, en modo local. Usa el mismo archivo y navegador para conservar sus datos; conserva respaldos.
- El workflow `Publish web` despliega en GitHub Pages al subir a `main`. Si GitHub impide habilitar Pages automáticamente, entra en **Settings → Pages → Build and deployment → Source → GitHub Actions**. Luego, en **Actions → Publish web → Run workflow**, ejecútalo sobre `main`. La dirección prevista es `https://gabrielcuba23.github.io/APP_Gastos/`; solo estará disponible después de un despliegue exitoso.

Las descargas versionadas incluyen la configuración pública del proyecto Supabase. Puedes usar el modo local sin sesión; las cuentas requieren preparar el esquema y la autenticación del proyecto. Al cambiar la aplicación, actualízalas explícitamente: genera `npm run build:portable` y copia `portable/index.html` a `downloads/mi-balance.html`; para APK sigue la compilación Android y copia la APK resultante a `downloads/mi-balance-debug.apk`. Verifica las dos descargas antes de publicar. No son actualizaciones automáticas.

## Desarrollo web

Requiere Node.js 24 (o Node 22.12+) y npm.

```sh
npm ci --cache /workspace/.npm-cache
npm run dev
```

`npm run build` genera `dist/`, publicable en cualquier hosting estático con HTTPS. El workflow `Publish web` publica en GitHub Pages. `npm test` ejecuta pruebas de cálculos y validación. `npm run test:e2e` usa Chromium instalado en `/usr/bin/chromium`; en otro equipo define `CHROMIUM_PATH` con la ruta al navegador.

## Entorno cloud preparado

En esta máquina las herramientas Android se conservan fuera del repositorio. Para compilar aquí:

```sh
. ./scripts/android-env.sh
npm run android:sync
(cd android && ./gradlew assembleDebug --no-daemon --max-workers=2)
```

`scripts/install-cloud.sh` reproduce las dependencias y herramientas en `/workspace`, mantiene la verificación TLS y contrasta las descargas de JDK/SDK con los checksums oficiales. No se requieren worktrees; usa el checkout existente. Los procesos deben iniciarse de nuevo al restaurar una tarea.

## Panel de reventas

La ampliación incluye administrador, revendedores y clientes; alta con correo/teléfono/contraseña temporal, planes con vencimiento, renovaciones manuales, suspensión y cambio obligatorio de la contraseña temporal. Los movimientos de cada cliente permanecen privados.

**Activación necesaria:** sigue [supabase/README.md](supabase/README.md). Se requiere ejecutar la migración de cuentas, asignar el administrador con tu correo y desplegar `manage-accounts` como Edge Function. Subir el frontend no despliega ese servicio ni asigna roles. Mientras no se aplique la migración, las cuentas de la versión anterior siguen usando sus movimientos y el panel permanece oculto.

`npm test` incluye pruebas de permisos usando PostgreSQL (PGlite) y del manejador HTTP de la función. `npm run test:e2e` prueba panel, cuentas, contraseña temporal y movimientos con respuestas de servidor simuladas. Las pruebas locales no sustituyen una venta completa en el proyecto real. `npm run build:edge` genera el archivo único para desplegar desde el editor de Supabase.

## Cuenta y sincronización (Supabase)

Sin iniciar sesión la app funciona localmente en el navegador o WebView Android. Los datos locales no se sincronizan. Exporta un respaldo antes de entrar en una cuenta: al iniciar sesión se cargan los datos de esa cuenta. Puedes importar el respaldo después de iniciar sesión para trasladarlos.

1. El proyecto configurado es `ofxcqqmshgzszwwasdhs`. Ejecuta `supabase/schema.sql` en su editor SQL antes de usar las cuentas. El script puede repetirse sin borrar movimientos.
2. En Authentication habilita Email/Password y la confirmación por correo. En **URL Configuration**, establece **Site URL** en `https://gabrielcuba23.github.io/APP_Gastos/` y añade la misma dirección en **Redirect URLs**. Respeta las mayúsculas y la barra final. La app solicita explícitamente ese destino al crear la cuenta o reenviar la confirmación. Si usas otro dominio, actualiza `src/cloud-config.json` (`webUrl`) o define `VITE_PUBLIC_WEB_URL`, y autoriza también ese destino en Supabase. Los enlaces antiguos no cambian: abre la app e intenta ingresar; si sigue sin confirmar, solicita un nuevo correo desde **Reenviar confirmación**.
3. `src/cloud-config.json` contiene solo la URL y la clave **publicable** del cliente. Se incluyen intencionalmente en la web y la APK: la privacidad depende de las reglas RLS del esquema. Para usar otro proyecto, configura ambas variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local` o en el entorno de compilación; las variables vacías conservan los valores públicos predeterminados. Nunca uses `service_role` ni claves secretas en una variable `VITE_`: se incluyen en el cliente.
4. Ejecuta de nuevo `npm run build` (o reinicia el servidor de desarrollo). Usa las mismas variables al compilar la APK.
5. Crea una cuenta, confirma el correo e inicia sesión. Registra un movimiento. Inicia sesión desde otro navegador/dispositivo y verifica el movimiento; los cambios se consultan cada 15 segundos. Comprueba que otra cuenta no pueda acceder a esos datos.

La tabla usa RLS para lectura y una función autenticada para guardar solo datos del usuario. La revisión evita sobrescribir cambios de otro dispositivo; si se detecta conflicto, conserva tu formulario, espera una actualización y vuelve a guardar. Guardar con sesión requiere conectividad y confirmación del servidor: los cambios fallidos no se presentan como guardados. La interfaz fue comprobada con respuestas simuladas. El usuario confirmó en el proyecto real el inicio de sesión y la conservación de movimientos. El panel de reventas y su servicio aún requieren la nueva activación y prueba real; el entorno cloud sigue bloqueando las conexiones a Supabase hasta aplicar la política de red guardada.

## Android APK

El proyecto nativo está en `android/` y usa Capacitor. Requiere Java 21 y SDK Android 36. Con Android Studio abre `android/` tras sincronizar:

```sh
npm run android:sync
cd android
./gradlew assembleDebug
```

APK de prueba: `android/app/build/outputs/apk/debug/app-debug.apk`. Se puede instalar en tu dispositivo; una distribución de producción necesita una compilación release firmada con tu propia clave, que no se incluye en este repositorio. Los archivos web y la configuración pública de Supabase van dentro de la APK. Android no necesita que tu servidor web esté encendido.

## Alcance de esta versión

- Importes calculados en céntimos para evitar errores de decimales.
- Disponible = ingresos personales + negocio − gastos personales − proveedores − suscripciones − ahorros.
- Balance del negocio = ingresos del negocio − pagos a proveedores.
- Los ahorros son aportes registrados, no saldo bancario conectado.
- Las suscripciones registran pagos realizados; cada mensualidad se añade al realizarse. No hay cargos ni recordatorios automáticos.
- Cambiar PEN/USD/EUR cambia la etiqueta monetaria, no convierte importes.
- El respaldo JSON contiene datos financieros sin cifrar. Guárdalo en un lugar privado. Importarlo reemplaza los datos tras confirmación.
- En modo local, borrar los datos del navegador o desinstalar la APK puede borrar registros. Usa respaldos o configura una cuenta.

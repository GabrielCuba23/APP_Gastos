# Mi Balance

App en español para finanzas personales y de negocio, web y Android. Moneda inicial: soles (PEN). Registra ingresos personales, ingresos del negocio, gastos personales, pagos a proveedores, suscripciones y aportes a ahorros. Incluye resumen por mes, balance del negocio, edición, eliminación, búsqueda, filtros y respaldo JSON.

## Descargas y acceso

- [Descargar APK Android de prueba](https://github.com/GabrielCuba23/APP_Gastos/raw/refs/heads/main/downloads/mi-balance-debug.apk).
- [Descargar web en ZIP](https://github.com/GabrielCuba23/APP_Gastos/raw/refs/heads/main/downloads/mi-balance-web.zip): extrae el ZIP y abre `mi-balance.html`.
- [Descargar versión web en un solo HTML](https://github.com/GabrielCuba23/APP_Gastos/raw/refs/heads/main/downloads/mi-balance.html). Guarda el archivo y ábrelo con Chrome, Edge o Firefox. Funciona sin servidor, en modo local. Usa el mismo archivo y navegador para conservar sus datos; conserva respaldos.
- El workflow `Publish web` despliega en GitHub Pages al subir a `main`. Si GitHub impide habilitar Pages automáticamente, entra en **Settings → Pages → Build and deployment → Source → GitHub Actions**. Luego, en **Actions → Publish web → Run workflow**, ejecútalo sobre `main`. La dirección prevista es `https://gabrielcuba23.github.io/APP_Gastos/`; solo estará disponible después de un despliegue exitoso.

Las descargas versionadas son una entrega de la app en modo local, sin un proyecto Supabase conectado. Al cambiar la aplicación, actualízalas explícitamente: genera `npm run build:portable` y copia `portable/index.html` a `downloads/mi-balance.html`; para APK sigue la compilación Android y copia la APK resultante a `downloads/mi-balance-debug.apk`. Verifica las dos descargas antes de publicar. No son actualizaciones automáticas.

## Desarrollo web

Requiere Node.js 24 (o Node 22.12+) y npm.

```sh
npm ci --cache /workspace/.npm-cache
npm run dev
```

`npm run build` genera `dist/`, publicable en cualquier hosting estático con HTTPS. No incluye un despliegue público automático. `npm test` ejecuta pruebas de cálculos y validación. `npm run test:e2e` usa Chromium instalado en `/usr/bin/chromium`; en otro equipo define `CHROMIUM_PATH` con la ruta al navegador.

## Entorno cloud preparado

En esta máquina las herramientas Android se conservan fuera del repositorio. Para compilar aquí:

```sh
. ./scripts/android-env.sh
npm run android:sync
(cd android && ./gradlew assembleDebug --no-daemon --max-workers=2)
```

`scripts/install-cloud.sh` reproduce las dependencias y herramientas en `/workspace`, mantiene la verificación TLS y contrasta las descargas de JDK/SDK con los checksums oficiales. No se requieren worktrees; usa el checkout existente. Los procesos deben iniciarse de nuevo al restaurar una tarea.

## Cuenta y sincronización (Supabase)

Sin configuración la app funciona localmente en el navegador o WebView Android. Los datos locales no se sincronizan. Exporta un respaldo antes de entrar en una cuenta: al iniciar sesión se cargan los datos de esa cuenta. Puedes importar el respaldo después de iniciar sesión para trasladarlos.

1. Crea un proyecto en https://supabase.com y ejecuta `supabase/schema.sql` en su editor SQL, una sola vez.
2. En Authentication habilita Email/Password y la confirmación por correo. Configura la URL pública de tu web como Site URL. El correo confirma la cuenta; vuelve a la web o APK e inicia sesión con correo y contraseña.
3. Copia `.env.example` a `.env.local`. Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con la URL y la clave **publicable** (o anon) de tu proyecto. Nunca uses `service_role` ni claves secretas en una variable `VITE_`: se incluyen en el cliente.
4. Ejecuta de nuevo `npm run build` (o reinicia el servidor de desarrollo). Usa las mismas variables al compilar la APK.
5. Crea una cuenta, confirma el correo e inicia sesión. Registra un movimiento. Inicia sesión desde otro navegador/dispositivo y verifica el movimiento; los cambios se consultan cada 15 segundos. Comprueba que otra cuenta no pueda acceder a esos datos.

La tabla usa RLS para lectura y una función autenticada para guardar solo datos del usuario. La revisión evita sobrescribir cambios de otro dispositivo; si se detecta conflicto, conserva tu formulario, espera una actualización y vuelve a guardar. Guardar con sesión requiere conectividad y confirmación del servidor: los cambios fallidos no se presentan como guardados. No se ha validado una conexión Supabase real sin proyecto configurado.

## Android APK

El proyecto nativo está en `android/` y usa Capacitor. Requiere Java 21 y SDK Android 36. Con Android Studio abre `android/` tras sincronizar:

```sh
npm run android:sync
cd android
./gradlew assembleDebug
```

APK de prueba: `android/app/build/outputs/apk/debug/app-debug.apk`. Se puede instalar en tu dispositivo; una distribución de producción necesita una compilación release firmada con tu propia clave, que no se incluye en este repositorio. Los archivos web van dentro de la APK; para sincronización debe tener las variables Supabase al compilar. Android no necesita que tu servidor web esté encendido.

## Alcance de esta versión

- Importes calculados en céntimos para evitar errores de decimales.
- Disponible = ingresos personales + negocio − gastos personales − proveedores − suscripciones − ahorros.
- Balance del negocio = ingresos del negocio − pagos a proveedores.
- Los ahorros son aportes registrados, no saldo bancario conectado.
- Las suscripciones registran pagos realizados; cada mensualidad se añade al realizarse. No hay cargos ni recordatorios automáticos.
- Cambiar PEN/USD/EUR cambia la etiqueta monetaria, no convierte importes.
- El respaldo JSON contiene datos financieros sin cifrar. Guárdalo en un lugar privado. Importarlo reemplaza los datos tras confirmación.
- En modo local, borrar los datos del navegador o desinstalar la APK puede borrar registros. Usa respaldos o configura una cuenta.

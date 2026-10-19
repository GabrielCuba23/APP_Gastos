# APK Android con firma de producción

La versión **1.5, código 6**, ya se compiló como release sin firma. El archivo preparado es `android/app/build/outputs/apk/release/app-release-unsigned.apk`. Todavía falta configurar la contraseña privada, crear o aportar la clave del propietario y firmar: **no hay una APK de producción firmada publicada**. La descarga actual del repositorio sigue siendo una APK de prueba.

La compilación usa el identificador `com.gabrielcuba.mibalance`, Java 21, Android SDK 36 y las herramientas oficiales del SDK. No se utiliza el certificado Android Debug para distribuir la versión de producción.

## 1. Preparar la contraseña privada

En los ajustes del entorno, configura la variable `ANDROID_KEYSTORE_PASSWORD` con una contraseña privada y única de al menos 16 caracteres: letras sin tildes, números y símbolos, sin espacios al inicio/final. Guárdala en tu gestor de contraseñas. No envíes su valor por chat, no lo escribas en comandos ni lo guardes en archivos del proyecto. Guarda y publica la configuración cuando lo requiera la plataforma para que la variable esté disponible para el proceso.

La configuración no incluye una contraseña de ejemplo ni un valor predeterminado. Si ya tienes una clave de producción del mismo paquete, conserva esa clave y configura su contraseña; **omite la generación del paso siguiente**.

## 2. Crear la clave una sola vez

Desde la raíz del repositorio, activa las herramientas de este entorno y genera el almacén privado:

```sh
. ./scripts/android-env.sh
python3 scripts/create-android-release-key.py
export ANDROID_KEYSTORE_PATH=/workspace/private-signing/mi-balance-release.p12
```

El generador crea un almacén PKCS12 cifrado con una clave RSA de 3072 bits y una validez de 10 000 días. Usa el alias `mi-balance-release` y la contraseña del entorno. La clave se conserva fuera del repositorio con permisos privados; el generador se detiene si el archivo ya existe. No lo ejecutes para renovar una versión: **todas las actualizaciones deben usar la misma clave de firma**.

Si aportas una clave existente, configura `ANDROID_KEYSTORE_PATH` con su ubicación privada. Opcionalmente configura `ANDROID_KEY_ALIAS` si el alias es distinto de `mi-balance-release`, y `ANDROID_KEY_PASSWORD` si la contraseña de la clave es distinta de la del almacén. Si no se configura esta última, se usa `ANDROID_KEYSTORE_PASSWORD`. Para la clave PKCS12 creada por el generador, ambas contraseñas son la misma.

## 3. Firmar la compilación preparada

La release sin firma ya está compilada. Para firmarla sin repetir la compilación:

```sh
bash scripts/build-android-release.sh --sign-only
```

El script alinea la APK para páginas de 16 KB, la firma con `apksigner` y comprueba la firma, el certificado, el identificador de la aplicación y que no sea depurable. Rechaza el certificado Android Debug y no publica nada. Usa las versiones estables instaladas de build-tools entre 35.0.0 y 36.0.0.

Sólo si todas las comprobaciones pasan se generan estos archivos en `android/app/build/outputs/apk/release/`:

- `mi-balance-release.apk`: instalador firmado.
- `mi-balance-release.sha256`: suma de comprobación del instalador.
- `mi-balance-release.certificate.pem`: certificado público de firma.
- `mi-balance-release.verification.txt`: resultado de la verificación y huella del certificado.

El certificado y la huella son públicos; no contienen la clave privada. El archivo `app-release-unsigned.apk` no debe entregarse como instalador final.

Para comprobar de nuevo una salida firmada:

```sh
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs \
  android/app/build/outputs/apk/release/mi-balance-release.apk
(cd android/app/build/outputs/apk/release && sha256sum -c mi-balance-release.sha256)
```

## 4. Conservar la firma y preparar las actualizaciones

Antes de distribuir, el propietario debe conservar una copia privada del archivo `/workspace/private-signing/mi-balance-release.p12` en almacenamiento propio protegido, como una bóveda o una unidad cifrada. La contraseña debe guardarse por separado en un gestor de contraseñas. El entorno de trabajo no sustituye ese respaldo: perder la clave puede impedir actualizar las instalaciones distribuidas con ella.

Nunca añadas el archivo PKCS12/JKS, su contenido en base64 ni sus contraseñas a Git, GitHub Pages, una descarga pública, un chat o un artefacto de compilación. La contraseña tampoco necesita un archivo auxiliar. El certificado `.pem` exportado sí puede acompañar la APK.

Para una actualización, conserva el paquete y la clave, aumenta `versionCode` por encima del instalado y actualiza `versionName` en `android/app/build.gradle`. Después compila los cambios y firma de una vez:

```sh
. ./scripts/android-env.sh
export ANDROID_KEYSTORE_PATH=/workspace/private-signing/mi-balance-release.p12
bash scripts/build-android-release.sh
```

`--unsigned-only` permite reconstruir e inspeccionar una release sin disponer de credenciales; esa salida seguirá pendiente de firma.

## 5. Pasar de la APK de prueba a la de producción

Android no permite actualizar directamente una APK de prueba con otra que usa una firma distinta, aunque ambas tengan el mismo identificador. Antes de desinstalar la de prueba, inicia sesión y verifica que sus movimientos estén sincronizados, o exporta un respaldo JSON y consérvalo fuera de la app. Desinstalar puede borrar los registros locales.

Después instala la APK firmada e ingresa con la misma cuenta. Si trabajabas en modo local, importa el respaldo cuando corresponda; la importación reemplaza los datos tras confirmación. Las siguientes actualizaciones de producción podrán conservar la instalación si mantienen la misma clave y aumentan el código de versión.

La firma y la compilación no sustituyen la prueba en un Android real. Comprueba ingreso, cambio de contraseña temporal, registro de movimientos y sincronización con la web antes de entregar la APK a clientes.

## 6. Publicar únicamente los artefactos verificados

Este paso está pendiente de la firma real. Cuando pasen las comprobaciones del instalador firmado, copia únicamente la APK y sus metadatos públicos:

```sh
cp android/app/build/outputs/apk/release/mi-balance-release.apk downloads/
cp android/app/build/outputs/apk/release/mi-balance-release.sha256 downloads/
cp android/app/build/outputs/apk/release/mi-balance-release.certificate.pem downloads/
cp android/app/build/outputs/apk/release/mi-balance-release.verification.txt downloads/
```

Revisa el estado de Git antes de publicar y añade el enlace de descarga sólo cuando el archivo firmado exista. No copies el directorio privado de firma ni el APK unsigned a `downloads/`.

## Compilación opcional en GitHub Actions

El workflow **Build signed Android release** (`.github/workflows/android-release.yml`) se ejecuta manualmente desde Actions. No es necesario configurarlo para firmar en este entorno.

Para utilizarlo, configura en **Settings → Secrets and variables → Actions → Repository secrets**:

| Secreto | Valor que debe proporcionar el propietario |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Contenido del mismo archivo PKCS12/JKS privado, codificado en base64. Base64 no cifra el archivo. |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña del almacén. |
| `ANDROID_KEY_ALIAS` | Opcional; alias si difiere de `mi-balance-release`. |
| `ANDROID_KEY_PASSWORD` | Opcional; contraseña de la clave si difiere de la del almacén. |

Introduce los valores directamente en los ajustes de secretos; no los incluyas en un commit, una conversación ni el YAML. Conserva además el respaldo privado del propietario.

El workflow compila primero el unsigned sin materializar la clave. Después decodifica el almacén en un archivo temporal con permisos privados, firma y verifica, y elimina ese archivo al terminar. El artefacto `mi-balance-signed-release` contiene sólo la APK firmada, su SHA-256, el certificado público y el informe; no publica una descarga ni sube el keystore. Los artefactos de Actions caducan, por lo que no son un respaldo de la clave.

#!/usr/bin/env python3
"""Create the owner's Android signing key without logging its password."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--path', type=Path,
                        default=Path('/workspace/private-signing/mi-balance-release.p12'))
    parser.add_argument('--alias', default='mi-balance-release')
    args = parser.parse_args()
    keytool = shutil.which('keytool')
    if keytool is None:
        raise ValueError('Activa Java 21 con scripts/android-env.sh antes de continuar.')
    password = os.environ.get('ANDROID_KEYSTORE_PASSWORD', '')
    if len(password) < 16 or password.strip() != password or not all(32 <= ord(c) <= 126 for c in password):
        raise ValueError('Configura ANDROID_KEYSTORE_PASSWORD con al menos 16 caracteres (letras sin tildes, números y símbolos), sin saltos ni espacios al inicio/final, en los ajustes del entorno; no la envíes por chat.')
    key_path = args.path.expanduser().resolve()
    repo = Path(__file__).resolve().parents[1]
    if key_path.is_relative_to(repo):
        raise ValueError('Guarda la clave fuera del repositorio para evitar publicarla.')
    key_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if key_path.exists():
        raise ValueError('La clave ya existe. No se reemplazará: utiliza esa misma clave para firmar las actualizaciones.')
    os.umask(0o077)
    # Passwords are read by keytool from the environment, never from argv/files.
    result = subprocess.run([
        keytool, '-genkeypair', '-noprompt', '-storetype', 'PKCS12',
        '-keystore', str(key_path), '-alias', args.alias,
        '-keyalg', 'RSA', '-keysize', '3072', '-sigalg', 'SHA256withRSA',
        '-validity', '10000', '-dname', 'CN=Mi Balance, O=Mi Balance, C=PE',
        '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD',
        '-keypass:env', 'ANDROID_KEYSTORE_PASSWORD',
    ], capture_output=True)
    if result.returncode:
        raise ValueError('keytool no pudo crear la clave. No se mostrará su salida para proteger las credenciales; revisa la configuración segura y los permisos del directorio.')
    key_path.chmod(0o600)
    certificate = key_path.with_name('mi-balance-release-cert.pem')
    result = subprocess.run([
        keytool, '-exportcert', '-rfc', '-keystore', str(key_path),
        '-alias', args.alias, '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD',
        '-file', str(certificate),
    ], capture_output=True)
    if result.returncode:
        raise ValueError('La clave fue creada, pero falló la exportación del certificado público. Conserva la clave; no vuelvas a generarla.')
    print(f'Clave creada en {key_path}; certificado público en {certificate}.')
    print('Conserva una copia privada de la clave y su contraseña por separado. Nunca publiques la clave ni la contraseña en GitHub.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        print(f'No se pudo preparar la firma: {error}', file=sys.stderr)
        sys.exit(1)

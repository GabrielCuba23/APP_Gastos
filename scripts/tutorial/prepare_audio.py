#!/usr/bin/env python3
"""Render offline Spanish narration from the reviewed tutorial script."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCENES = [('intro',
  'Mi Balance',
  'Tu dinero, más claro',
  'Bienvenido a Mi Balance. Organiza tus ingresos, gastos, suscripciones, negocio y ahorros en un '
  'solo lugar. En este tutorial verás cómo usar la plataforma como cliente, con datos ficticios de '
  'demostración.'),
 ('login',
  '01 · Ingresa y protege tu cuenta',
  'Tu información, en tu espacio personal',
  'Abre la plataforma e ingresa con el correo y la contraseña temporal que te entregó tu '
  'proveedor. En el primer acceso, crea una contraseña propia de al menos diez caracteres. '
  'Escríbela dos veces y pulsa Actualizar contraseña. Después podrás acceder a tus finanzas.'),
 ('summary',
  '02 · Conoce tu resumen mensual',
  'Una mirada clara a tu mes',
  'En Resumen encontrarás ingresos, gastos, ahorros y el disponible del mes. Puedes cambiar el '
  'período con las flechas o el selector. El disponible es lo que queda de tus ingresos después de '
  'descontar gastos y aportes de ahorro.'),
 ('income',
  '03 · Registra tus ingresos',
  'Identifica cuánto dinero entra',
  'Pulsa Nuevo movimiento y elige Ingreso personal. Escribe una descripción, el importe y la '
  'fecha. Por ejemplo, Sueldo, dos mil quinientos soles. Guarda y espera la confirmación. Así '
  'tendrás un registro claro de tus entradas de dinero.'),
 ('expense',
  '04 · Registra tus gastos',
  'Reconoce en qué usas tu dinero',
  'Ahora registra una salida: elige Gasto personal, escribe Supermercado e ingresa ciento veinte '
  'soles. Una descripción clara facilita encontrar y revisar cada gasto. El resumen se actualiza '
  'con el movimiento guardado.'),
 ('subscriptions',
  '05 · Revisa tus suscripciones',
  'Reúne tus pagos recurrentes',
  'En Suscripciones puedes registrar pagos de música, entretenimiento u otros servicios. Añadimos '
  'veinte soles por Música. Registra cada mensualidad cuando la pagues. La plataforma no genera '
  'cargos automáticos: te ayuda a llevar el control de los pagos realizados.'),
 ('business',
  '06 · Organiza tu negocio',
  'Distingue ventas y proveedores',
  'En Mi negocio registra las ventas como Ingreso de negocio y las compras de mercadería como Pago '
  'a proveedor. Aquí añadimos seiscientos soles en ventas y trescientos en proveedores. El '
  'resultado del negocio es de trescientos soles, separado de tus gastos personales.'),
 ('savings',
  '07 · Da seguimiento a tus ahorros',
  'Haz visibles tus aportes',
  'En Ahorros registra el dinero que apartas. En este ejemplo añadimos doscientos soles para un '
  'Fondo de emergencia. Verás los aportes del mes. La aplicación registra tus movimientos; no '
  'transfiere dinero ni se conecta a tus cuentas bancarias.'),
 ('organize',
  '08 · Busca, filtra y corrige',
  'Encuentra tus movimientos con facilidad',
  'En Movimientos, busca por descripción y filtra por tipo. Si necesitas corregir un dato, pulsa '
  'el lápiz, edita el registro y guarda. Cambiaremos Supermercado a ciento treinta soles. El '
  'resumen reflejará el nuevo importe.'),
 ('backup',
  '09 · Guarda un respaldo',
  'Conserva una copia de tu información',
  'Con Exportar puedes descargar un respaldo de tus movimientos en un archivo. Guárdalo en un '
  'lugar privado, porque contiene información financiera. Importar permite recuperar ese respaldo, '
  'pero reemplaza los datos actuales después de pedirte confirmación.'),
 ('devices',
  '10 · Usa la misma cuenta',
  'Continúa en web o Android',
  'Puedes ingresar con la misma cuenta en la página web y en la aplicación Android. Aquí mostramos '
  'la vista móvil de la web. Para guardar y sincronizar necesitas conexión. Espera la confirmación '
  'y revisa el estado Sincronizado antes de cambiar de dispositivo.'),
 ('outro',
  'Tu mes, con más claridad',
  'Registra · Revisa · Decide',
  'En nuestro ejemplo hay tres mil cien soles de ingresos, cuatrocientos cincuenta de gastos y '
  'doscientos de ahorro. El disponible es de dos mil cuatrocientos cincuenta soles. Registra tus '
  'movimientos con constancia y toma decisiones con una visión más clara de tu dinero.')]


def voice_command(tools_root: Path) -> list[str]:
    """Prefer a system installation; preserve the existing verified fallback."""
    installed = shutil.which("espeak-ng")
    if installed:
        command = [installed]
    else:
        loader = Path("/lib64/ld-linux-x86-64.so.2")
        executable = tools_root / "usr/bin/espeak-ng"
        libraries = tools_root / "usr/lib/x86_64-linux-gnu"
        if not loader.is_file() or not executable.is_file() or not libraries.is_dir():
            raise ValueError(
                "No se encontró espeak-ng. Instálalo con la voz es-419 o indica "
                "--tools-root con la instalación local y sus bibliotecas."
            )
        command = [
            str(loader), "--library-path", str(libraries), str(executable),
            f"--path={libraries}",
        ]
    # Keep the reviewed voice, rate, pitch and amplitude unchanged.
    return command + ["-v", "es-419", "-s", "158", "-p", "44", "-a", "125"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir", type=Path, default=Path("/workspace/tutorial-mi-balance"),
        help="Directory for generated narration WAV and source TXT files.",
    )
    parser.add_argument(
        "--tools-root", type=Path, default=ROOT.parent / "tutorial-tools/root",
        help="Local eSpeak NG fallback installation, used only if absent from PATH.",
    )
    arguments = parser.parse_args()
    output = arguments.output_dir.expanduser().resolve()
    voice = voice_command(arguments.tools_root.expanduser().resolve())
    output.mkdir(parents=True, exist_ok=True)
    result = []
    for key, title, benefit, narration in SCENES:
        audio_path = output / f"{key}.wav"
        text_path = output / f"{key}.txt"
        text_path.write_text(narration, encoding="utf-8")
        subprocess.run(voice + ["-f", str(text_path), "-w", str(audio_path)], check=True)
        with wave.open(str(audio_path), "rb") as audio:
            if (
                audio.getnchannels(), audio.getsampwidth(),
                audio.getframerate(), audio.getcomptype(),
            ) != (1, 2, 22050, "NONE"):
                raise ValueError(f"Se esperaba WAV PCM mono de 16 bits a 22050 Hz: {audio_path}")
            duration = audio.getnframes() / audio.getframerate()
        # One second of breathing room before and after each chapter.
        result.append({
            "key": key,
            "title": title,
            "benefit": benefit,
            "narration": narration,
            "audio": str(audio_path),
            "speechDuration": duration,
            "duration": round(duration + 2, 3),
        })
    script_path = ROOT / "tutorial/guion.json"
    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "seconds": sum(scene["duration"] for scene in result),
        "chapters": [{scene["key"]: scene["duration"]} for scene in result],
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, wave.Error) as error:
        print(f"No se pudo preparar la narración: {error}", file=sys.stderr)
        sys.exit(1)

import os
from contextlib import closing
from getpass import getpass

import mysql.connector
from flask import Flask, jsonify, render_template


app = Flask(__name__)


def obtener_variable(nombre, interactivo=False):
    try:
        valor = os.environ[nombre]
        if not valor:
            raise KeyError(nombre)
        return valor
    except KeyError:
        if not interactivo:
            raise RuntimeError(f"Falta la variable de ambiente {nombre}.") from None

        try:
            while True:
                if nombre == "DB_PASS":
                    valor = getpass(f"Ingresa {nombre}: ")
                else:
                    valor = input(f"Ingresa {nombre}: ").strip()
                if valor:
                    return valor
                print(f"{nombre} no puede estar vacia.")
        except EOFError:
            raise RuntimeError(
                f"No se pudo solicitar {nombre}. Define las variables de ambiente "
                "o ejecuta Docker con -it para introducirlas por consola."
            ) from None


def cargar_configuracion_bd(interactivo=False):
    configuracion = {
        "host": obtener_variable("DB_HOST", interactivo),
        "database": obtener_variable("DB_NAME", interactivo),
        "user": obtener_variable("DB_USER", interactivo),
        "password": obtener_variable("DB_PASS", interactivo),
        "connection_timeout": 5,
    }
    try:
        puerto = int(os.getenv("DB_PORT", "3306"))
        if not 1 <= puerto <= 65535:
            raise ValueError
    except ValueError:
        raise ValueError("DB_PORT debe ser un numero entre 1 y 65535.") from None
    configuracion["port"] = puerto
    return configuracion


def conectar_bd():
    configuracion = app.config.get("DB_CONFIG")
    if configuracion is None:
        configuracion = cargar_configuracion_bd()
    return mysql.connector.connect(**configuracion)


@app.get("/")
def inicio():
    return render_template("index.html")


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.get("/db-health")
def db_health():
    try:
        with closing(conectar_bd()) as conexion:
            with closing(conexion.cursor()) as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        return jsonify(status="ok", database="MySQL")
    except (mysql.connector.Error, RuntimeError, ValueError) as error:
        app.logger.warning("Error al comprobar la base de datos: %s", error)
        return jsonify(status="error", mensaje="No se pudo conectar a MySQL."), 503


if __name__ == "__main__":
    try:
        app.config["DB_CONFIG"] = cargar_configuracion_bd(interactivo=True)
        with closing(conectar_bd()):
            print("Conexion a MySQL establecida correctamente.")
    except (mysql.connector.Error, RuntimeError, ValueError) as error:
        print(f"Error al iniciar la conexion a MySQL: {error}")
        raise SystemExit(1)

    app.run(host="0.0.0.0", port=5000)

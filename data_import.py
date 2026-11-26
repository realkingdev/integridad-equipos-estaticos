"""Entradas tabulares de Estrato. SQLite se consulta en modo de solo lectura."""
import csv
import io
from contextlib import closing

ROW_LIMIT = 5_000


def read_measurements_csv(text):
    """Admite coma, punto y coma o tabulador según el encabezado."""
    text = text.lstrip("\ufeff")
    first = text.splitlines()[0] if text else ""
    if not first:
        raise ValueError("El CSV está vacío.")
    delimiter = max((";", ",", "\t"), key=first.count)
    if not first.count(delimiter):
        raise ValueError("El CSV requiere encabezados de mediciones.")
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    rows = []
    for row in reader:
        if len(rows) >= ROW_LIMIT:
            raise ValueError("El origen excede 5.000 filas.")
        if None in row or any(value is None for value in row.values()):
            raise ValueError(f"Número de columnas incorrecto en la fila {reader.line_num}.")
        rows.append(row)
    return rows


def read_measurements_sqlite(path):
    import sqlite3

    try:
        with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as db:
            db.execute("PRAGMA trusted_schema=OFF")
            db.execute("PRAGMA query_only=ON")
            db.row_factory = sqlite3.Row
            schema = db.execute("SELECT type, sql FROM sqlite_schema WHERE name = ?", ("mediciones",)).fetchone()
            if not schema or schema["type"] != "table" or not schema["sql"].lstrip().upper().startswith("CREATE TABLE"):
                raise ValueError("SQLite requiere una tabla ordinaria llamada mediciones.")
            rows = db.execute("SELECT * FROM mediciones LIMIT ?", (ROW_LIMIT + 1,)).fetchall()
            if len(rows) > ROW_LIMIT:
                raise ValueError("El origen excede 5.000 filas.")
            return [dict(row) for row in rows]
    except (sqlite3.Error, UnicodeError, TypeError) as err:
        raise ValueError("No se pudo leer una base SQLite compatible.") from err


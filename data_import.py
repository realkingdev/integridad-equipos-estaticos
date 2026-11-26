"""Entradas tabulares de Estrato. SQLite se consulta en modo de solo lectura."""
import csv
import io
from contextlib import closing, contextmanager
from pathlib import Path

ROW_LIMIT = 5_000


def read_measurements_csv(text):
    """Admite coma, punto y coma o tabulador según el encabezado."""
    text = text.lstrip("\ufeff")
    first = text.splitlines()[0] if text else ""
    if not first:
        raise ValueError("El CSV está vacío.")
    try:
        dialect = csv.Sniffer().sniff(first, delimiters=";,\t")
    except csv.Error as err:
        raise ValueError("No se pudo identificar el separador del encabezado CSV.") from err
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    names = reader.fieldnames or []
    if any(not name.strip() for name in names) or len(set(names)) != len(names):
        raise ValueError("El CSV contiene encabezados vacíos o duplicados.")
    rows = []
    for row in reader:
        if len(rows) >= ROW_LIMIT:
            raise ValueError("El origen excede 5.000 filas.")
        if None in row or any(value is None for value in row.values()):
            raise ValueError(f"Número de columnas incorrecto en la fila {reader.line_num}.")
        rows.append(row)
    return rows


@contextmanager
def sqlite_source(path):
    import sqlite3

    try:
        with closing(sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True)) as db:
            db.execute("PRAGMA trusted_schema=OFF")
            db.execute("PRAGMA query_only=ON")
            db.row_factory = sqlite3.Row
            yield db
    except (sqlite3.Error, UnicodeError, TypeError) as err:
        raise ValueError("No se pudo leer una base SQLite compatible.") from err


def ordinary_tables(db):
    rows = db.execute(
        "SELECT name, sql FROM sqlite_schema "
        "WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_' "
        "ORDER BY name LIMIT 201"
    ).fetchall()
    if len(rows) > 200:
        raise ValueError("La base supera 200 tablas. Exporta una selección más pequeña.")
    return [row["name"] for row in rows if row["sql"] and
            row["sql"].lstrip().upper().startswith("CREATE TABLE")]


def read_sqlite_catalog(path):
    with sqlite_source(path) as db:
        return ordinary_tables(db)


def read_measurements_sqlite(path, table="mediciones"):
    with sqlite_source(path) as db:
        if table not in ordinary_tables(db):
            raise ValueError("Selecciona una tabla ordinaria de la base SQLite.")
        identifier = '"' + table.replace('"', '""') + '"'
        rows = db.execute(f"SELECT * FROM {identifier} LIMIT ?", (ROW_LIMIT + 1,)).fetchall()
        if len(rows) > ROW_LIMIT:
            raise ValueError("El origen excede 5.000 filas.")
        return [{key: value if isinstance(value, (str, int, float)) else None
                 for key, value in dict(row).items()} for row in rows]


def read_sqlite_table(request):
    return read_measurements_sqlite(request["path"], request["table"])

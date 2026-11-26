"""Regresiones de los formatos de intercambio de mediciones."""
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from data_import import read_measurements_csv, read_measurements_sqlite


class DataImportTests(unittest.TestCase):
    def test_csv_preserves_decimals_and_quoted_observations(self):
        rows = read_measurements_csv(
            '\ufefftag;tml;fecha;espesor;observaciones\n'
            'L-101;TML-02;2024-10-01;5,40;"UT; campaña de prueba"\n'
        )
        self.assertEqual(rows[0]['espesor'], '5,40')
        self.assertEqual(rows[0]['observaciones'], 'UT; campaña de prueba')

    def test_csv_validates_columns(self):
        with self.assertRaisesRegex(ValueError, 'fila 2'):
            read_measurements_csv('tag,tml,fecha,espesor\nV-201,TML-02,2024-06-01')

    def test_sqlite_reads_only_expected_table(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory, 'mediciones.sqlite'))
            with closing(sqlite3.connect(path)) as db:
                with db:
                    db.execute('CREATE TABLE mediciones(tag, tml, fecha, espesor)')
                    db.execute('INSERT INTO mediciones VALUES (?, ?, ?, ?)', ('V-201', 'TML-02', '2024-06-01', 11.1))
            self.assertEqual(read_measurements_sqlite(path)[0]['espesor'], 11.1)
            missing = str(Path(directory, 'falta.sqlite'))
            with self.assertRaises(ValueError):
                read_measurements_sqlite(missing)
            self.assertFalse(Path(missing).exists())


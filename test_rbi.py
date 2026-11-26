"""Comprobación independiente del ejemplo por integración de la normal."""

import math
import unittest

from rbi import rbi


def normal_tail(z):
    # Regla compuesta de Simpson hasta 12 desviaciones estándar.
    steps = 1000
    h = (12 - z) / steps
    weights = [1] + [4 if i % 2 else 2 for i in range(1, steps)] + [1]
    density = sum(w * math.exp(-0.5 * (z + i * h) ** 2)
                  for i, w in enumerate(weights))
    return density * h / (3 * math.sqrt(2 * math.pi))


class ThinningReference(unittest.TestCase):
    def test_three_state_calculation(self):
        # Cálculo manual del caso: Art=1/6, FS=360,25, SR=69/360,25.
        # Posteriores por regla de Bayes: (0,35; 0,06; 0,02)/0,43.
        ratio = 69 / 360.25
        tails = []
        for lost_fraction in (1 / 6, 1 / 3, 2 / 3):
            remaining = 1 - lost_fraction
            variance = 0.04 * (lost_fraction ** 2 + remaining ** 2) + 0.0025 * ratio ** 2
            tails.append(normal_tail((remaining - ratio) / math.sqrt(variance)))
        factor = sum(p * t for p, t in zip((35, 6, 2), tails)) / (43 * 0.000156)
        frequency = 0.0000306 * factor
        result = rbi({})
        self.assertAlmostEqual(result["df"], factor, places=6)
        self.assertAlmostEqual(result["area_risk"], frequency * 120, places=8)
        self.assertAlmostEqual(result["cost_risk"], frequency * 50000000, places=3)

    def test_consequence_changes_priority(self):
        base, large = rbi({}), rbi({"cost": 100000000})
        self.assertEqual(base["frequency"], large["frequency"])
        self.assertEqual(base["priority"], "Media")
        self.assertEqual(large["priority"], "Alta")

    def test_credit_updates_uncertainty_only(self):
        prior, updated = rbi({"inspections": 0}), rbi({"inspections": 2})
        self.assertLess(updated["df"], prior["df"])
        self.assertEqual(updated["wall_at_horizon"], prior["wall_at_horizon"])

    def test_invalid_input(self):
        for values in ({"inspections": 0.5}, {"years": 0}, {"rate": -1},
                       {"thickness": 0}, {"area": float("nan")}, {"years": 35}):
            with self.subTest(values=values), self.assertRaises(ValueError):
                rbi(values)


if __name__ == "__main__":
    unittest.main()

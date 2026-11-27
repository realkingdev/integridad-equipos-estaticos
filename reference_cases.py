"""Referencias reproducibles del caso original. Independientes de engineering.py y rbi.py."""
from math import exp, pi, sqrt


def normal_tail(z):
    # Cuadratura de Simpson para los tres índices del caso de referencia.
    steps = 1000
    step = (12 - z) / steps
    def density(i):
        return exp(-0.5 * (z + i * step) ** 2) / sqrt(2 * pi)
    total = density(0) + density(steps)
    total += 4 * sum(density(i) for i in range(1, steps, 2))
    total += 2 * sum(density(i) for i in range(2, steps, 2))
    return total * step / 3


def reference_cases():
    # Unidades US para verificar las conversiones del motor de diseño (MPa y mm).
    psi = 1_500_000 / 6894.757293168
    pipe = 25.4 * psi * 4.5 / (2 * (20000 + 0.4 * psi)) + 1
    hoop = 200 * 24 / (14300 * 0.85 - 0.6 * 200)
    longitudinal = 200 * 24 / (2 * 14300 * 0.85 + 0.4 * 200)
    vessel = 25.4 * (max(hoop, longitudinal) + 1/16)
    head = 4.9 * 34 * (22 - 0.3)
    tank = max(head * 0.8 / 137 + 1, head / 154, 6)
    # Posteriores proporcionales a (0,35; 0,06; 0,02) y cargas Art, 2Art, 4Art.
    strength_ratio = 69 / 360.25
    tails = []
    for loss in (1/6, 1/3, 2/3):
        capacity = 1 - loss
        variance = 0.04 * (loss**2 + capacity**2) + 0.0025 * strength_ratio**2
        tails.append(normal_tail((capacity - strength_ratio) / sqrt(variance)))
    damage = sum(weight * tail for weight, tail in zip((35, 6, 2), tails)) / (43 * 0.000156)
    return dict(pipe=pipe, vessel=vessel, tank=tank, rbi=damage)


if __name__ == "__main__":
    for name, value in reference_cases().items():
        print(f"{name}: {value:.9f}")

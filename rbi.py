"""RBI académico de un tramo recto de acero al carbono sin revestimiento.

API RP 581, tercera edición con adendas de 2019 y 2020, parte 2,
§4.5.7, ecuaciones 2.12–2.20 y tablas 3.1, 4.5 y 4.6.
"""

from math import erfc, exp, hypot, isfinite, log, sqrt


DEFAULTS = {
    "thickness": 6.0,     # espesor de referencia medido, mm
    "minimum": 3.0,       # espesor mínimo gobernante documentado, mm
    "rate": 0.20,         # mm/año
    "years": 5.0,         # edad desde la medición de referencia
    "inspections": 1,     # inspecciones clase C acreditadas durante el período
    "area": 120.0,        # m²/evento de pérdida de contención
    "cost": 50000000.0,   # CLP/evento, base ficticia de noviembre de 2026
}


def rbi(case):
    """Calcula el riesgo anualizado en la fecha de evaluación.

    Familia única: cañería, un componente, sólo adelgazamiento general interno.
    El caso representa la pérdida de contención agregada. Las consecuencias
    corresponden a medias por evento ponderadas por tamaño de fuga.
    """
    values = {**DEFAULTS, **case}
    for name in DEFAULTS:
        try:
            number = float(values[name])
        except (TypeError, ValueError):
            raise ValueError("Parámetro RBI no numérico: " + name) from None
        if not isfinite(number) or number < 0:
            raise ValueError("Parámetro RBI fuera de rango: " + name)
        values[name] = number
    if min(values["thickness"], values["minimum"]) <= 0:
        raise ValueError("Los espesores RBI deben ser positivos.")
    count = values["inspections"]
    if not count.is_integer() or (count and not values["years"]):
        raise ValueError("Revise el número de inspecciones durante el período evaluado.")

    # Material de demostración al ambiente. YS, TS y S en MPa; E = 1.
    yield_strength, tensile_strength, allowable, joint = 240.0, 415.0, 138.0, 1.0
    flow = (yield_strength + tensile_strength) * 0.5 * joint * 1.1
    strength_ratio = allowable * joint * values["minimum"] / (flow * values["thickness"])
    art = values["rate"] * values["years"] / values["thickness"]
    if art >= 1 or not isfinite(strength_ratio):
        raise ValueError("La proyección excede el dominio de pared remanente del modelo.")
    # Confianza media de la tasa y efectividad C como supuestos del ejercicio.
    priors = (0.7, 0.2, 0.1)
    likelihoods = (0.5, 0.3, 0.2)
    logs = [log(p) + count * log(c) for p, c in zip(priors, likelihoods)]
    weights = [exp(weight - max(logs)) for weight in logs]
    posterior = [weight / sum(weights) for weight in weights]
    beta = []
    for multiplier in (1, 2, 4):
        loss = multiplier * art
        sigma = hypot(0.20 * loss, 0.20 * (1 - loss), 0.05 * strength_ratio)
        beta.append((1 - loss - strength_ratio) / sigma)
    failure_terms = [0.5 * erfc(b / sqrt(2)) for b in beta]
    base = sum(p * term for p, term in zip(posterior, failure_terms)) / 1.56e-4
    # Sin mezcla, ramal muerto ni monitoreo en línea. Ajustes restantes unitarios.
    df = max(0.1, base)
    gff, fms = 3.06e-5, 1.0
    frequency = gff * df * fms
    area_risk, cost_risk = frequency * values["area"], frequency * values["cost"]
    # Umbrales de priorización del ejercicio, por m²/año y CLP/año.
    score = max(area_risk / 1.0, cost_risk / 100000.0)
    priority = "Alta" if score >= 1 else "Media" if score >= 0.1 else "Baja"
    return dict(art=art, flow=flow, strength_ratio=strength_ratio, posterior=posterior,
                beta=beta, base_df=base, df=df, frequency=frequency, gff=gff, fms=fms,
                area_risk=area_risk, cost_risk=cost_risk, priority=priority,
                wall_at_horizon=values["thickness"] * (1 - art))

"""Evaluación académica MAN040-B. Unidades internas en mm, MPa, °C y años."""
from calendar import monthrange
from datetime import date, timedelta
from math import floor, isfinite

PSI = 0.006894757293168
MATERIAL = {"pipe": "ASTM A106 Gr B", "vessel": "SA-285 Gr B", "tank": "ASTM A283M Gr C"}
STATUS = ["Normal", "Inspección vencida", "Información insuficiente", "Alerta", "Bajo mínimo"]
INSPECTION = {
    "pipe": ("UT de circuito Clase 1", "API 570, 4.ª edición (2016), §6.3.3 y tabla 2. Circuito clase 1 supuesto, sin RBI. El modelo adopta el menor plazo entre media vida, 5 años y llegada a la alerta.", 5),
    "vessel": ("Seguimiento UT del manto", "API 510, 11.ª ed., §6.5. Se adopta para UT el límite académico de la inspección interna/en servicio. La UT puntual no sustituye esa inspección.", 10),
    "tank": ("UT externa de virolas", "API 653, 5.ª ed., §6.3.3.2. Tasa conocida: mitad de vida o 15 años. Fondo, techo, cimentación e inspección interna requieren evaluaciones propias.", 15),
}

def number(value, label, low=0, high=float("inf")):
    try:
        if isinstance(value, bool):
            raise ValueError
        value = float(value)
        if not isfinite(value) or not low <= value <= high:
            raise ValueError
        return value
    except (TypeError, ValueError):
        raise ValueError(f"Valor fuera de alcance en {label}.") from None

def shifted(start, months):
    idx = start.month + months - 1
    year, month = start.year + idx // 12, 1 + idx % 12
    return date(year, month, min(start.day, monthrange(year, month)[1]))

def years_between(start, end):
    n = end.year - start.year
    if shifted(start, n * 12) > end:
        n -= 1
    anchor = shifted(start, n * 12)
    return n + (end-anchor).days / (shifted(start, (n+1)*12)-anchor).days

def after_years(start, years):
    months = round(years * 12, 9)
    anchor = shifted(start, floor(months))
    days = (shifted(start, floor(months)+1)-anchor).days
    return anchor + timedelta(days=floor(days*(months-floor(months))))

def wall_scenarios(point, lower=0.75, higher=1.25):
    """Cruces del espesor de alerta y mínimo a partir de la última medición."""
    lower = number(lower, "factor moderado", 0.0001, 1)
    higher = number(higher, "factor acelerado", 1)
    stamp = point["date"]
    measured = point["current_mm"]
    reference = date.fromisoformat(stamp) if stamp else None
    adopted = point["rate"]

    def crossing(limit, rate):
        if reference is None or limit is None:
            return {"kind": "unavailable", "date": None, "years": None}
        if measured <= limit:
            return {"kind": "measured", "date": stamp, "years": 0}
        if rate is None:
            return {"kind": "unavailable", "date": None, "years": None}
        years = (measured - limit) / rate
        if not isfinite(years):
            return {"kind": "calendar", "date": None, "years": None}
        try:
            if years >= 10000 - reference.year:
                raise OverflowError
            target = after_years(reference, years).isoformat()
        except (OverflowError, ValueError):
            return {"kind": "calendar", "date": None, "years": years}
        return {"kind": "projected", "date": target, "years": years}

    alert = point["alert_mm"] if point["alert_mm"] > point["minimum_mm"] else None
    scenarios = {}
    for name, factor in (("moderate", lower), ("adopted", 1), ("accelerated", higher)):
        adjusted = adopted * factor if adopted is not None else None
        rate = adjusted if adjusted is not None and isfinite(adjusted) and adjusted > 0 else None
        scenarios[name] = {
            "rate": rate,
            "alert": crossing(alert, rate),
            "minimum": crossing(point["minimum_mm"], rate),
        }
    return scenarios

def forecast_at(point, target, scenario):
    """Condición al día elegido, con la última UT como origen y el mínimo como fin."""
    limits = point["wall_scenarios"][scenario]
    minimum = limits["minimum"]
    last = date.fromisoformat(point["date"]) if point["date"] else None
    result = dict(kind="unavailable", thickness_mm=None, margin_days=None, state="unknown")
    if last is None:
        return result
    if target < last:
        return {**result, "kind": "past"}
    minimum_date = date.fromisoformat(minimum["date"]) if minimum["date"] else None
    if minimum_date:
        result["margin_days"] = (minimum_date - target).days
    alert = point["alert_mm"]
    threshold = point["minimum_mm"]
    if target == last:
        value = point["current_mm"]
        measured_state = ("minimum" if value <= threshold else "unknown" if alert <= threshold
                          else "alert" if value <= alert else "normal")
        return {**result, "kind": "measured", "thickness_mm": value, "state": measured_state}
    if minimum_date and target > minimum_date:
        return {**result, "kind": "ended", "state": "minimum"}
    if limits["rate"] is None:
        return result
    if target == minimum_date:
        return {**result, "kind": "projected", "thickness_mm": threshold, "state": "minimum"}
    # Misma escala de meses calendario que after_years, incluso en años bisiestos.
    months = 12 * (target.year - last.year) + target.month - last.month
    if shifted(last, months) > target:
        months -= 1
    anchor = shifted(last, months)
    fraction = 0
    if target > anchor:
        try:
            span = (shifted(last, months + 1) - anchor).days
        except (ValueError, OverflowError):
            span = monthrange(anchor.year, anchor.month)[1]
        fraction = (target - anchor).days / span
    thickness = max(threshold, point["current_mm"] - limits["rate"] * (months + fraction) / 12)
    alert_date = limits["alert"]["date"]
    at_alert = alert_date is not None and target.isoformat() >= alert_date
    if alert_date == target.isoformat() and limits["alert"]["kind"] == "projected":
        thickness = alert
    return {**result, "kind": "projected", "state": "alert" if at_alert else "normal",
            "thickness_mm": thickness}

def shutdown_forecast(request):
    target = date.fromisoformat(request["date"])
    scenario = request["scenario"]
    if scenario not in ("moderate", "adopted", "accelerated"):
        raise ValueError("Escenario de corrosión no reconocido.")
    return [forecast_at(point, target, scenario) for point in request["points"]]

def compare_reading(request):
    """Reconstruye la proyección adoptada sin incluir la lectura que se contrasta."""
    point, stamp = request["point"], request["date"]
    rows = sorted((m for m in point["measurements"] if m["date"] <= stamp), key=lambda m: m["date"])
    if not rows or rows[-1]["date"] != stamp:
        raise ValueError("Seleccione una medición registrada en el punto.")
    latest = rows[-1]
    result = dict(measured_mm=latest["thickness"] * (25.4 if latest.get("unit") == "in" else 1),
                  previous_date=None, expected_mm=None, difference_mm=None, previous_minimum=None,
                  revised_minimum=None, shift_days=None, reason=None)
    if len(rows) == 1 or rows[-2].get("epoch", 0) != latest.get("epoch", 0):
        result["reason"] = "Primera medición de esta serie. Se necesita una tendencia previa del mismo punto."
        return result
    target = date.fromisoformat(stamp)
    eq = {"family": request["family"]}
    def assessment(measurements):
        state = inspect_point({**point, "measurements": measurements}, eq, request["design"], target)
        state["wall_scenarios"] = wall_scenarios(state)
        return state
    previous = assessment(rows[:-1])
    revised = assessment(rows)
    result["previous_date"] = previous["date"]
    earlier = previous["wall_scenarios"]["adopted"]["minimum"]
    later = revised["wall_scenarios"]["adopted"]["minimum"]
    result.update(previous_minimum=earlier, revised_minimum=later)
    expected = forecast_at(previous, target, "adopted")
    if earlier["kind"] == "projected" and later["kind"] == "projected":
        result["shift_days"] = (date.fromisoformat(later["date"]) - date.fromisoformat(earlier["date"])).days
    if expected["kind"] == "ended":
        result["reason"] = "La proyección anterior ya terminaba en el mínimo antes de esta medición."
    elif expected["thickness_mm"] is None:
        result["reason"] = "Las mediciones anteriores de esta serie no permitían estimar una tasa de corrosión."
    else:
        result["expected_mm"] = expected["thickness_mm"]
        result["difference_mm"] = result["measured_mm"] - expected["thickness_mm"]
    return result

def design(eq, point=None):
    fam = eq["family"]
    if fam not in MATERIAL or eq["material"] != MATERIAL[fam]:
        raise ValueError("Seleccione un material del catálogo de la familia.")
    temp=number(eq["temp_c"],"temperatura del catálogo",20,{"tank":40,"pipe":148,"vessel":150}[fam])
    number(eq["operating_temp_c"],"temperatura de operación",0,temp)
    d=number(eq["diameter_mm"],"diámetro",.1,60000 if fam=="tank" else 10000)
    p=number(eq["pressure_mpa"],"presión de diseño",0 if fam=="tank" else .000001,0 if fam=="tank" else 100)
    number(eq["operating_pressure_mpa"],"presión de operación",0,p)
    ca=number(eq["ca_mm"],"sobreespesor por corrosión")
    nominal=number(eq["nominal_mm"],"espesor nominal",.001)
    e=number(eq["efficiency"],"eficiencia de junta",.01,1)
    if fam=="pipe":
        if e!=1:
            raise ValueError("El tubo sin costura del catálogo tiene E = 1.")
        s=20000*PSI
        t=p*d/(2*(s+p*.4))
        if t>=d/6 or p/s>.385:
            raise ValueError("La relación de presión o espesor excede B31.3 304.1.2(a).")
        needed=t+ca
        formula="t = P·De/[2·(S·E·W + P·Y)]"
        ref="ASME B31.3 (2018), §304.1.2, ec. (3a), tablas A-1 y 304.1.1."
        detail=["Recto sin costura, diámetro exterior. E = W = 1; Y = 0,4; S = 20,0 ksi.",f"Presión + CA = {needed:.3f} mm. Con tolerancia de fabricación supuesta del 12,5 %, nominal de compra ≥ {needed/.875:.3f} mm."]
    elif fam=="vessel":
        s=14300*PSI
        if p>=.385*s*e:
            raise ValueError("La presión excede el alcance de UG-27(c) para pared delgada.")
        t=max(p*d/2/(s*e-.6*p),p*d/2/(2*s*e+.4*p))
        needed=t+ca
        formula="t = máx[PR/(SE − 0,6P), PR/(2SE + 0,4P)]"
        ref="ASME VIII-1 (2019), UG-27(c)(1–2); II-D, tabla 1A, filas 31–32; UW-12."
        detail=["Diámetro interior en condición corroída; presión interna diferencial local. Igual E de junta para ambas direcciones. S = 14,3 ksi.",f"Presión + CA = {needed:.3f} mm. Verificar tolerancia de suministro y cargas adicionales por separado."]
    else:
        if e!=1:
            raise ValueError("El alcance seleccionado requiere junta de penetración completa, E = 1.")
        h=number(eq["liquid_height_m"],"nivel de líquido",.301,50)
        z=number((point or {}).get("elevation_m",0),"elevación de virola")
        head=number((point or {}).get("height_m",h-z),"altura sobre virola",.3,h)
        g=number(eq["sg"],"gravedad específica",.01,2)
        s=137
        t=4.9*d/1000*(head-.3)*g/s
        hydro=4.9*d/1000*(head-.3)/154
        erection=5 if d<15000 else 6 if d<36000 else 8
        if z==0 and 3200<d<15000:
            erection=6
        needed=max(t+ca,hydro,erection)
        formula="td = 4,9D(H − 0,3)G/Sd + CA; tt = 4,9D(H − 0,3)/St"
        ref="API 650 (2013), §5.6.1.1 y §5.6.3.2; tabla 5.2a."
        detail=[f"D en m. H local = {head:.2f} m; nivel de prueba igual al de diseño; Sd = 137 y St = 154 MPa.",f"Diseño {t+ca:.3f} mm · prueba {hydro:.3f} mm · montaje {erection:.3f} mm. Alcance exclusivo de manto atmosférico."]
    return dict(required_mm=needed,pressure_mm=t,allowable_mpa=s,reference=ref,equation=formula,details=detail,nominal_mm=nominal)

def inspect_point(point, eq, calc, today):
    kind,ref,cap=INSPECTION[eq["family"]]
    documented = number(point["minimum_mm"], "mínimo documentado", .001)
    geometry = point.get("geometry", "accessory" if eq["family"] == "pipe" and "codo" in point["name"].lower() else "supported")
    localized_design = not (eq["family"] == "pipe" and geometry == "accessory")
    minimum = max(calc["pressure_mm"], documented) if localized_design else documented
    alert=number(point["alert_mm"],"espesor de alerta",.001)
    out=dict(id=point["id"],status="Información insuficiente",date=None,current_mm=None,
             minimum_mm=minimum,alert_mm=alert,short_rate=None,long_rate=None,rate=None,
             life_years=None,due=None,interval_years=None,governing="Revisar historial",
             cap_years=cap,half_life_years=None,alert_years=None,
             series_start=None, previous_date=None, rate_basis=None, calculation={},
             inspection_type=kind,reference=ref,warnings=[],overdue=False,design=calc)
    if not localized_design:
        out["warnings"].append("Accesorio: la evaluación usa el mínimo documentado del punto. El cálculo de tramo recto se muestra como referencia del equipo.")
    rows=[]
    for m in point["measurements"]:
        if m.get("unit","mm") not in ("mm","in"):
            raise ValueError("Unidad de medición no admitida.")
        val=number(m["thickness"],"espesor medido",0)*(25.4 if m.get("unit")=="in" else 1)
        when=date.fromisoformat(m["date"])
        if when>today:
            raise ValueError("Fecha de medición posterior a la fecha de evaluación.")
        rows.append((when,val,str(m.get("epoch",0))))
    rows.sort()
    if len({r[0] for r in rows})!=len(rows):
        raise ValueError("Fechas duplicadas en el mismo TML.")
    if not rows:
        out["warnings"].append("Sin mediciones registradas.")
        return out
    latest,value,epoch=rows[-1]
    out.update(date=latest.isoformat(),current_mm=value)
    if value<=minimum:
        out.update(status="Bajo mínimo",governing="Mínimo alcanzado. Evaluación inmediata.",due=latest.isoformat(),life_years=0,interval_years=0)
    elif value<=alert:
        out.update(status="Alerta",due=latest.isoformat(),interval_years=0,governing="Alerta alcanzada. Revisar medición y plan.")
    if alert<=minimum:
        out["warnings"].append("La alerta configurada debe superar el mínimo efectivo tras el cambio de diseño.")
        return out
    start=len(rows)-1
    while start and rows[start-1][2]==epoch:
        start-=1
    if start:
        out["warnings"].append("Solo se compara la serie posterior al cambio de punto, reparación o reemplazo.")
    rows=rows[start:]
    if len(rows)<2:
        out["warnings"].append("Se requieren dos mediciones comparables.")
        return out
    out.update(series_start=rows[0][0].isoformat(), previous_date=rows[-2][0].isoformat())
    candidates=[]
    for key,r in [("long_rate",rows[0]),("short_rate",rows[-2])]:
        elapsed = years_between(r[0], latest)
        rate = (r[1] - value) / elapsed
        out[key] = rate
        out["calculation"][key] = dict(from_date=r[0].isoformat(), start_mm=r[1], years=elapsed)
        if rate>0:
            candidates.append(rate)
        else:
            out["warnings"].append("Tasa nula o aumento aparente; verificar posición y lectura.")
    if any(b[1]>a[1] for a,b in zip(rows,rows[1:])):
        out["warnings"].append("Aumento aparente en la serie comparable. Revisar antes de proyectar.")
        return out
    if not candidates:
        return out
    rate=max(candidates)
    if out["short_rate"] == out["long_rate"]:
        basis = "Coinciden las tasas de corto y largo plazo."
    elif out["short_rate"] == rate:
        basis = "Se adopta la tasa de corto plazo porque es la mayor tasa positiva comparable."
    else:
        basis = "Se adopta la tasa de largo plazo porque es la mayor tasa positiva comparable."
    out["rate_basis"] = basis
    life=max(0,(value-minimum)/rate)
    out.update(rate=rate, life_years=life, half_life_years=life/2,
               alert_years=max(0,(value-alert)/rate))
    if value<=max(minimum,alert):
        return out
    interval,rule=min([(life/2,"Mitad de vida remanente"),(cap,"Tope de familia"),((value-alert)/rate,"Proyección al espesor de alerta")])
    due=after_years(latest,interval)
    out.update(status="Inspección vencida" if due<today else "Normal",overdue=due<today,
               due=due.isoformat(),interval_years=interval,governing=rule)
    return out

def evaluate(equipment,today=None):
    """Reevalúa desde el registro original sin modificar entradas."""
    today=date.fromisoformat(today) if today else date.today()
    base=design(equipment)
    points=[inspect_point(pt,equipment,design(equipment,pt),today) for pt in equipment["points"]]
    if len({pt["id"] for pt in points})!=len(points):
        raise ValueError("Identificador de TML repetido.")
    for point in points:
        point["overdue"] = bool(point["due"] and point["due"] < today.isoformat())
        point["wall_scenarios"] = wall_scenarios(point)
    dated=[pt for pt in points if pt["due"]]
    first=min(dated,key=lambda pt: (pt["due"],-STATUS.index(pt["status"]))) if dated else {}
    status=max((pt["status"] for pt in points),key=STATUS.index,default="Información insuficiente")
    return dict(design=base,points=points,due=first.get("due"),status=status,governing=first.get("id","—"),
                overdue=any(point["overdue"] for point in points))

def demo_equipment():
    """Planta ficticia. Los umbrales de servicio son supuestos de los casos."""
    result=[]
    specs=[
        ("pipe","L-101","Circuito de transferencia","Aceite térmico",114.3,6.35,1.5,80,1,1,[("Tramo recto",3,4.5,[5.9,5.1,4.7]),("Salida de codo",3,4.5,[6.3,6,4.8]),("Retorno",3,4.5,[6.2,6,5.9])]),
        ("vessel","V-201","Separador de proceso","Gas de proceso",1219.2,12.7,200*PSI,148.89,.85,1.5875,[("Manto norte",10.3,11,[12.6,11.8,11.2]),("Manto central",10.3,11,[12.4,11.5,10.9]),("Manto sur",10.3,11,[12.5,11.3,9.9])]),
        ("tank","TK-301","Tanque de almacenamiento","Aceite mineral",34000,24,0,35,1,1,[("Virola 1",21.2,22,[24,23.4,23.1]),("Virola 2",18.8,20,[22,21.6,21.1]),("Virola 3",16.4,17.3,[20,19.8,19.9])])]
    for fam,tag,name,fluid,d,nom,p,temp,e,ca,pts in specs:
        eq=dict(tag=tag,family=fam,name=name,plant="Planta Costa",area="Servicios de proceso",system="Tren de transferencia",component={"pipe":"Tramo recto","vessel":"Manto cilíndrico","tank":"Manto por virolas"}[fam],service="Proceso continuo",fluid=fluid,material=MATERIAL[fam],temp_c=temp,pressure_mpa=p,operating_temp_c=min(30,temp),operating_pressure_mpa=.8*p,diameter_mm=d,nominal_mm=nom,ca_mm=ca,efficiency=e,liquid_height_m=22,sg=.8,circuit="C-101" if fam=="pipe" else "",points=[])
        for i,(label,minimum,alert,readings) in enumerate(pts):
            history=[dict(date=stamp,thickness=v,unit="mm",technique="UT",notes="Campaña de demostración",epoch=0) for stamp,v in zip(["2016-10-01","2022-10-01","2026-10-01"],readings)]
            if fam == "vessel":
                location = dict(shape="cylinder", diameter_mm=1244.6, length_mm=3600,
                                position_mm=[400,1700,2900][i], angle_deg=[25,80,140][i],
                                reference="Modelo de ejemplo · soldadura A del manto y marca superior de 0°")
            elif fam == "tank":
                location = dict(shape="cylinder", diameter_mm=34000, length_mm=2500,
                                position_mm=[650,1100,1850][i], angle_deg=[45,100,260][i],
                                reference=f"Modelo de ejemplo · borde inferior de la virola {i+1} y marca norte de 0°")
            elif i == 1:
                location = dict(shape="elbow", diameter_mm=d, bend_radius_mm=180, bend_deg=90,
                                position_mm=230, angle_deg=90,
                                reference="Modelo de ejemplo · soldadura de entrada del codo y marca superior de 0°")
            else:
                weld = "A" if i == 0 else "R"
                location = dict(shape="cylinder", diameter_mm=d, length_mm=1800,
                                position_mm=500 if i == 0 else 1100, angle_deg=70 if i == 0 else 135,
                                reference=f"Modelo de ejemplo · soldadura {weld} y marca superior de 0°")
            eq["points"].append(dict(id=f"TML-0{i+1}",name=label,x=[25,53,76][i],y=[67,48,33][i],minimum_mm=minimum,alert_mm=alert,elevation_m=2.5*i if fam=="tank" else 0,location3d=location,measurements=history))
        result.append(eq)
    return result

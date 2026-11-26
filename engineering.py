"""Evaluación académica MAN040-B. Unidades internas en mm, MPa, °C y años."""
from calendar import monthrange
from datetime import date, timedelta
from math import floor, isfinite

PSI = 0.006894757293168
MATERIAL = {"pipe": "ASTM A106 Gr B", "vessel": "SA-285 Gr B", "tank": "ASTM A283M Gr C"}
STATUS = ["Normal", "Inspección vencida", "Información insuficiente", "Alerta", "Bajo mínimo"]
INSPECTION = {
    "pipe": ("UT de circuito Clase 1", "API 570, §6.3.3 según clase 05 y Certamen 2. Criterio académico sin RBI.", 5),
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
    minimum=max(calc["pressure_mm"],number(point["minimum_mm"],"mínimo documentado",.001))
    alert=number(point["alert_mm"],"espesor de alerta",.001)
    out=dict(id=point["id"],status="Información insuficiente",date=None,current_mm=None,
             minimum_mm=minimum,alert_mm=alert,short_rate=None,long_rate=None,rate=None,
             life_years=None,due=None,interval_years=None,governing="Revisar historial",
             inspection_type=kind,reference=ref,warnings=[],overdue=False,design=calc)
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
    candidates=[]
    for key,r in [("long_rate",rows[0]),("short_rate",rows[-2])]:
        rate=(r[1]-value)/years_between(r[0],latest)
        out[key]=rate
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
    life=max(0,(value-minimum)/rate)
    out.update(rate=rate,life_years=life)
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
    dated=[pt for pt in points if pt["due"]]
    first=min(dated,key=lambda pt: (pt["due"],-STATUS.index(pt["status"]))) if dated else {}
    status=max((pt["status"] for pt in points),key=STATUS.index,default="Información insuficiente")
    return dict(design=base,points=points,due=first.get("due"),status=status,governing=first.get("id","—"))

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
            eq["points"].append(dict(id=f"TML-0{i+1}",name=label,x=[25,53,76][i],y=[67,48,33][i],minimum_mm=minimum,alert_mm=alert,elevation_m=2.5*i if fam=="tank" else 0,measurements=history))
        result.append(eq)
    return result

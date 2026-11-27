"""Comparaciones independientes y caminos extremos de la evaluación MAN040-B."""
import unittest

from engineering import compare_reading, demo_equipment, evaluate, shutdown_forecast, wall_scenarios

TODAY = "2026-11-26"

class EngineeringTests(unittest.TestCase):
    def setUp(self):
        self.pipe, self.vessel, self.tank = demo_equipment()

    def test_pipe(self):
        result=evaluate(self.pipe,TODAY)
        # Cálculo independiente en unidades US: P=217.5566 psi, OD=4.5 in, S=20 ksi.
        self.assertAlmostEqual(result["design"]["required_mm"],1.61897,places=5)
        self.assertEqual(result["governing"],"TML-02")
        self.assertEqual(result["due"],"2027-10-01")
        a,b,_=result["points"]
        self.assertAlmostEqual(a["life_years"],14.166666667)
        self.assertAlmostEqual(b["short_rate"],.30)
        self.assertEqual(b["calculation"]["short_rate"], dict(from_date="2022-10-01", start_mm=6.0, years=4))
        self.assertEqual(b["calculation"]["long_rate"]["years"], 10)
        self.assertEqual(a["due"],"2028-06-01")

    def test_accessory_uses_documented_service_minimum(self):
        self.pipe["pressure_mpa"] = 10
        result = evaluate(self.pipe, TODAY)
        straight, elbow, _ = result["points"]
        self.assertGreater(straight["minimum_mm"], 3.0)
        self.assertEqual(elbow["minimum_mm"], 3.0)
        self.assertEqual(elbow["due"], "2027-10-01")
        self.assertTrue(any("Accesorio" in warning for warning in elbow["warnings"]))

    def test_alert_keeps_wall_condition_and_flags_past_due(self):
        result = evaluate(self.vessel, TODAY)
        point = result["points"][1]
        self.assertEqual(point["status"], "Alerta")
        self.assertTrue(point["overdue"])

    def test_vessel(self):
        result=evaluate(self.vessel,TODAY)
        self.assertAlmostEqual(result["design"]["required_mm"]/25.4,.4613367262)
        self.assertEqual([p["status"] for p in result["points"]],["Normal","Alerta","Bajo mínimo"])

    def test_tank(self):
        result=evaluate(self.tank,TODAY)
        # Base: H = 22 m; D = 34 m; 4.9×34×21.7 / 154 (prueba hidráulica).
        self.assertAlmostEqual(result["design"]["required_mm"],23.47545454545)
        self.assertLess(result["points"][1]["design"]["required_mm"],result["design"]["required_mm"])
        self.assertIsNone(result["points"][2]["due"])

    def test_overdue_and_replacement(self):
        self.assertEqual(evaluate(self.pipe,"2028-10-01")["status"],"Inspección vencida")
        point=self.pipe["points"][0]
        point["measurements"][-1]["epoch"]=1
        self.assertIsNone(evaluate(self.pipe,TODAY)["points"][0]["rate"])
        point["measurements"][-1]["thickness"]=2.9
        self.assertEqual(evaluate(self.pipe,TODAY)["points"][0]["status"],"Bajo mínimo")

    def test_date_and_unsupported_design(self):
        self.pipe["points"][0]["measurements"][0]["date"]="2026-10-01"
        with self.assertRaises(ValueError):
            evaluate(self.pipe,TODAY)
        self.vessel["temp_c"]=300
        with self.assertRaises(ValueError):
            evaluate(self.vessel,TODAY)

    def test_zero_rate(self):
        for m in self.pipe["points"][0]["measurements"]:
            m["thickness"]=5
        self.assertIsNone(evaluate(self.pipe,TODAY)["points"][0]["life_years"])

    def test_wall_projection_crosses_alert_and_minimum_after_inspection(self):
        point = evaluate(self.pipe, TODAY)["points"][1]
        base = point["wall_scenarios"]["adopted"]
        self.assertEqual(base["alert"]["date"], "2027-10-01")
        self.assertEqual(base["minimum"]["date"], "2032-10-01")
        self.assertAlmostEqual(base["minimum"]["years"], 6)
        scenarios = wall_scenarios(point, lower=0.5, higher=2)
        self.assertEqual(scenarios["accelerated"]["minimum"]["date"], "2029-10-01")
        self.assertEqual(scenarios["moderate"]["minimum"]["date"], "2038-10-01")
        self.assertEqual(scenarios["adopted"], base)

    def test_wall_projection_distinguishes_observed_and_missing_crossings(self):
        below = evaluate(self.vessel, TODAY)["points"][2]
        minimum = below["wall_scenarios"]["adopted"]["minimum"]
        self.assertEqual(minimum, {"kind": "measured", "date": "2026-10-01", "years": 0})
        tank = evaluate(self.tank, TODAY)["points"][2]
        for scenario in tank["wall_scenarios"].values():
            self.assertEqual(scenario["minimum"], {"kind": "unavailable", "date": None, "years": None})
        self.pipe["points"][1]["measurements"][-1]["epoch"] = 1
        restarted = evaluate(self.pipe, TODAY)["points"][1]["wall_scenarios"]
        self.assertIsNone(restarted["adopted"]["minimum"]["date"])

    def test_wall_projection_keeps_long_horizons_outside_calendar(self):
        point = evaluate(self.pipe, TODAY)["points"][1]
        scenarios = wall_scenarios({**point, "rate": 1e-10})
        self.assertEqual(scenarios["adopted"]["minimum"]["kind"], "calendar")
        self.assertIsNone(scenarios["adopted"]["minimum"]["date"])

    def test_shutdown_stops_at_the_minimum_in_each_scenario(self):
        elbow = evaluate(self.pipe, TODAY)["points"][1]
        def at(stamp, scenario="adopted"):
            return shutdown_forecast(dict(points=[elbow], date=stamp, scenario=scenario))[0]
        self.assertEqual(at("2025-10-01")["kind"], "past")
        self.assertEqual(at("2026-10-01")["kind"], "measured")
        self.assertAlmostEqual(at("2031-10-01")["thickness_mm"], 3.3)
        self.assertEqual(at("2031-10-01")["margin_days"], 366)
        self.assertEqual(at("2031-10-01", "accelerated")["kind"], "ended")
        self.assertEqual(at("2032-10-01"), dict(kind="projected", state="minimum", thickness_mm=3, margin_days=0))
        self.assertEqual(at("2033-04-01"), dict(kind="ended", state="minimum", thickness_mm=None, margin_days=-182))
        self.assertEqual(at("9999-12-31")["kind"], "ended")

    def test_shutdown_measured_minimum_and_unavailable_rate(self):
        vessel = evaluate(self.vessel, TODAY)["points"][2]
        tank = evaluate(self.tank, TODAY)["points"][2]
        def at(stamp):
            return shutdown_forecast(dict(points=[vessel,tank], date=stamp, scenario="moderate"))
        limit, uncertain = at("2026-10-01")
        self.assertEqual((limit["kind"],limit["state"],limit["thickness_mm"]), ("measured","minimum",9.9))
        self.assertEqual((uncertain["kind"],uncertain["state"]), ("measured","normal"))
        limit, uncertain = at("2028-04-01")
        self.assertEqual((limit["kind"],limit["state"],limit["thickness_mm"]), ("ended","minimum",None))
        self.assertEqual(uncertain, dict(kind="unavailable",state="unknown",thickness_mm=None,margin_days=None))

    def test_reading_comparison_excludes_observation_and_uses_same_series(self):
        elbow = self.pipe["points"][1]
        state = evaluate(self.pipe,TODAY)["points"][1]
        def compare(stamp):
            return compare_reading(dict(family="pipe",point=elbow,design=state["design"],date=stamp))
        result = compare("2026-10-01")
        self.assertAlmostEqual(result["expected_mm"], 5.8)
        self.assertAlmostEqual(result["difference_mm"], -1)
        self.assertEqual(result["previous_date"], "2022-10-01")
        self.assertEqual(result["revised_minimum"]["date"], "2032-10-01")
        self.assertLess(result["shift_days"], 0)
        self.assertIsNone(compare("2022-10-01")["expected_mm"])
        elbow["measurements"][-1]["epoch"] = 1
        self.assertIsNone(compare("2026-10-01")["previous_minimum"])

    def test_new_reading_after_previous_minimum_has_no_extrapolated_thickness(self):
        elbow = self.pipe["points"][1]
        state = evaluate(self.pipe,TODAY)["points"][1]
        elbow["measurements"].append(dict(date="2033-10-01",thickness=2.54/25.4,unit="in"))
        result = compare_reading(dict(family="pipe",point=elbow,design=state["design"],date="2033-10-01"))
        self.assertIsNone(result["expected_mm"])
        self.assertEqual(result["revised_minimum"]["kind"], "measured")
        self.assertAlmostEqual(result["measured_mm"], 2.54)

if __name__=="__main__":
    unittest.main()

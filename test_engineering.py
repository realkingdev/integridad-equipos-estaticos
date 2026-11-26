"""Comparaciones independientes y caminos extremos de la evaluación MAN040-B."""
import unittest

from engineering import demo_equipment, evaluate

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
        self.assertEqual(a["due"],"2028-06-01")

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

if __name__=="__main__":
    unittest.main()

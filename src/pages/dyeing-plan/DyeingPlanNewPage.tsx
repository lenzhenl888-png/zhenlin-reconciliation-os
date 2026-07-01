import { Printer, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/common/Button";
import { DyeingPlanTable } from "../../components/dyeing-plan/DyeingPlanTable";
import { ROUTES } from "../../constants/routes";
import type { DyeingPlan } from "../../models/dyeingPlan";
import { createEmptyDyeingPlan, saveDyeingPlan } from "../../services/dyeingPlanService";
import { printCurrentPage } from "../../utils/print";

export function DyeingPlanNewPage() {
  const navigate = useNavigate();
  const initialPlan = useMemo(() => createEmptyDyeingPlan("sample"), []);
  const [plan, setPlan] = useState<DyeingPlan>(initialPlan);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const savedPlan = await saveDyeingPlan(plan);
    setSaving(false);
    navigate(savedPlan.type === "sample" ? ROUTES.sampleCenter : ROUTES.productionCenter);
  };

  return (
    <div className="work-page">
      <div className="page-toolbar no-print">
        <div>
          <h2>新建染色计划单</h2>
          <p>在表格中直接录入，打印区与录入区保持一致。</p>
        </div>
        <div className="toolbar-actions">
          <Button icon={<Printer size={16} />} onClick={printCurrentPage}>
            打印当前页
          </Button>
          <Button variant="primary" icon={<Save size={16} />} disabled={saving} onClick={handleSave}>
            {saving ? "保存中" : "保存并进入中心"}
          </Button>
        </div>
      </div>

      <DyeingPlanTable plan={plan} onChange={setPlan} />
    </div>
  );
}

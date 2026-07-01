import { ExternalLink, Printer, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { StatusBadge } from "../../components/common/StatusBadge";
import { DyeingPlanTable } from "../../components/dyeing-plan/DyeingPlanTable";
import { ROUTES } from "../../constants/routes";
import type { DyeingPlan } from "../../models/dyeingPlan";
import { getDyeingPlan, saveDyeingPlan } from "../../services/dyeingPlanService";
import { printCurrentPage } from "../../utils/print";

export function DyeingPlanDetailPage() {
  const { id } = useParams();
  const [plan, setPlan] = useState<DyeingPlan | null>(null);
  const [isMissing, setIsMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;

    getDyeingPlan(id).then((result) => {
      if (result) {
        setPlan(result);
      } else {
        setIsMissing(true);
      }
    });
  }, [id]);

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    const savedPlan = await saveDyeingPlan(plan);
    setPlan(savedPlan);
    setSaving(false);
  };

  if (isMissing) {
    return <EmptyState title="未找到染色计划单" description="该单据可能尚未保存，或本地数据已被清理。" />;
  }

  if (!plan) {
    return <EmptyState title="正在加载染色计划单" />;
  }

  return (
    <div className="work-page">
      <div className="page-toolbar no-print">
        <div>
          <h2>编辑染色计划单</h2>
          <p>
            {plan.planNo} <StatusBadge status={plan.status} />
          </p>
        </div>
        <div className="toolbar-actions">
          <Button icon={<Printer size={16} />} onClick={printCurrentPage}>
            打印当前页
          </Button>
          <Link className="button button-secondary" to={ROUTES.planPrintPreview(plan.id)}>
            <ExternalLink size={16} />
            <span>打印预览</span>
          </Link>
          <Button variant="primary" icon={<Save size={16} />} disabled={saving} onClick={handleSave}>
            {saving ? "保存中" : "保存修改"}
          </Button>
        </div>
      </div>

      <DyeingPlanTable plan={plan} onChange={setPlan} />
    </div>
  );
}

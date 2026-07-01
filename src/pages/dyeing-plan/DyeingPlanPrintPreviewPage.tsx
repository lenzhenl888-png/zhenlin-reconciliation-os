import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { DyeingPlanPrintView } from "../../components/dyeing-plan/DyeingPlanPrintView";
import type { DyeingPlan } from "../../models/dyeingPlan";
import { getDyeingPlan } from "../../services/dyeingPlanService";
import { printCurrentPage } from "../../utils/print";

export function DyeingPlanPrintPreviewPage() {
  const { id } = useParams();
  const [plan, setPlan] = useState<DyeingPlan | null>(null);
  const [showInternal, setShowInternal] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDyeingPlan(id).then((result) => setPlan(result ?? null));
  }, [id]);

  if (!plan) {
    return <EmptyState title="未找到可打印的染色计划单" />;
  }

  return (
    <div className="work-page print-preview-page">
      <div className="page-toolbar no-print">
        <div>
          <h2>打印预览</h2>
          <p>{plan.planNo}</p>
        </div>
        <div className="toolbar-actions">
          <label className="check-field">
            <input type="checkbox" checked={showInternal} onChange={(event) => setShowInternal(event.target.checked)} />
            打印内部信息
          </label>
          <Button variant="primary" icon={<Printer size={16} />} onClick={printCurrentPage}>
            打印
          </Button>
        </div>
      </div>
      <DyeingPlanPrintView plan={plan} showInternal={showInternal} />
    </div>
  );
}

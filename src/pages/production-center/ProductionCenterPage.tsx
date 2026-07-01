import { ExternalLink, FilePlus2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { StatusBadge } from "../../components/common/StatusBadge";
import { ROUTES } from "../../constants/routes";
import type { DyeingPlan } from "../../models/dyeingPlan";
import { listProductionOrders } from "../../services/productionOrderService";

export function ProductionCenterPage() {
  const [plans, setPlans] = useState<DyeingPlan[]>([]);

  useEffect(() => {
    listProductionOrders().then(setPlans);
  }, []);

  return (
    <div className="center-page">
      <div className="page-toolbar">
        <div>
          <h2>大货中心</h2>
          <p>Sprint 1 暂只展示由染色计划单保存来的大货单据。</p>
        </div>
        <Link className="button button-primary" to={ROUTES.planNew}>
          <FilePlus2 size={16} />
          <span>新建染色计划单</span>
        </Link>
      </div>
      <PlanList plans={plans} emptyTitle="暂无大货单据" />
    </div>
  );
}

function PlanList({ plans, emptyTitle }: { plans: DyeingPlan[]; emptyTitle: string }) {
  if (plans.length === 0) return <EmptyState title={emptyTitle} description="保存 production 类型的染色计划单后会出现在这里。" />;

  return (
    <table className="sheet-table list-table">
      <thead>
        <tr>
          <th>计划单号</th>
          <th>客户</th>
          <th>款号</th>
          <th>日期</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {plans.map((plan) => (
          <tr key={plan.id}>
            <td>{plan.planNo}</td>
            <td>{plan.customerName}</td>
            <td>{plan.styleNo}</td>
            <td>{plan.planDate}</td>
            <td>
              <StatusBadge status={plan.status} />
            </td>
            <td>
              <Link className="table-link" to={ROUTES.planDetail(plan.id)}>
                <ExternalLink size={15} />
                打开
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

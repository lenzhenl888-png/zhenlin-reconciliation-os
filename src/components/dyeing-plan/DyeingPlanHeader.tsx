import type { DyeingPlan, DyeingPlanType } from "../../models/dyeingPlan";
import { Input } from "../common/Input";
import { Select } from "../common/Select";

type DyeingPlanHeaderProps = {
  plan: DyeingPlan;
  editable?: boolean;
  onChange: (plan: DyeingPlan) => void;
};

export function DyeingPlanHeader({ plan, editable = true, onChange }: DyeingPlanHeaderProps) {
  const update = (patch: Partial<DyeingPlan>) => onChange({ ...plan, ...patch });

  return (
    <section className="template-section">
      <div className="plan-title-row">
        <div>
          <span className="muted-label">染色计划单号</span>
          <strong>{plan.planNo}</strong>
        </div>
        <div className="plan-type-control">
          <span>订单类型</span>
          <Select
            disabled={!editable}
            value={plan.type}
            onChange={(event) => update({ type: event.target.value as DyeingPlanType })}
          >
            <option value="sample">打样 sample</option>
            <option value="production">大货 production</option>
          </Select>
        </div>
      </div>

      <table className="sheet-table meta-table">
        <tbody>
          <tr>
            <th>客户</th>
            <td>
              <Input disabled={!editable} value={plan.customerName} onChange={(event) => update({ customerName: event.target.value })} />
            </td>
            <th>款号</th>
            <td>
              <Input disabled={!editable} value={plan.styleNo ?? ""} onChange={(event) => update({ styleNo: event.target.value })} />
            </td>
            <th>日期</th>
            <td>
              <Input disabled={!editable} type="date" value={plan.planDate} onChange={(event) => update({ planDate: event.target.value })} />
            </td>
          </tr>
          <tr>
            <th>预计交期</th>
            <td>
              <Input
                disabled={!editable}
                type="date"
                value={plan.expectedDeliveryDate ?? ""}
                onChange={(event) => update({ expectedDeliveryDate: event.target.value })}
              />
            </td>
            <th>订单号</th>
            <td>
              <Input disabled={!editable} value={plan.orderNo ?? ""} onChange={(event) => update({ orderNo: event.target.value })} />
            </td>
            <th>合同号</th>
            <td>
              <Input disabled={!editable} value={plan.contractNo ?? ""} onChange={(event) => update({ contractNo: event.target.value })} />
            </td>
          </tr>
          <tr>
            <th>工艺</th>
            <td colSpan={5}>
              <Input disabled={!editable} value={plan.processText ?? ""} onChange={(event) => update({ processText: event.target.value })} />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

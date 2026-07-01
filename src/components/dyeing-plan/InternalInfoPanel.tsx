import type { DyeingPlan } from "../../models/dyeingPlan";
import { Input } from "../common/Input";

type InternalInfoPanelProps = {
  plan: DyeingPlan;
  editable?: boolean;
  onChange: (plan: DyeingPlan) => void;
};

export function InternalInfoPanel({ plan, editable = true, onChange }: InternalInfoPanelProps) {
  const update = (patch: Partial<DyeingPlan>) => onChange({ ...plan, ...patch });

  return (
    <section className="internal-panel no-print">
      <div className="section-heading">
        <h2>内部管理信息</h2>
      </div>
      <table className="sheet-table meta-table">
        <tbody>
          <tr>
            <th>负责人</th>
            <td>
              <Input disabled={!editable} value={plan.owner ?? ""} onChange={(event) => update({ owner: event.target.value })} />
            </td>
            <th>织造厂</th>
            <td>
              <Input disabled={!editable} value={plan.weavingFactory ?? ""} onChange={(event) => update({ weavingFactory: event.target.value })} />
            </td>
            <th>染色厂</th>
            <td>
              <Input disabled={!editable} value={plan.dyeingFactory ?? ""} onChange={(event) => update({ dyeingFactory: event.target.value })} />
            </td>
          </tr>
          <tr>
            <th>是否审核</th>
            <td>
              <label className="check-field">
                <input disabled={!editable} type="checkbox" checked={plan.isReviewed} onChange={(event) => update({ isReviewed: event.target.checked })} />
                已审核
              </label>
            </td>
            <th>是否完成</th>
            <td>
              <label className="check-field">
                <input disabled={!editable} type="checkbox" checked={plan.isCompleted} onChange={(event) => update({ isCompleted: event.target.checked })} />
                已完成
              </label>
            </td>
            <th>内部备注</th>
            <td>
              <Input disabled={!editable} value={plan.internalRemark ?? ""} onChange={(event) => update({ internalRemark: event.target.value })} />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

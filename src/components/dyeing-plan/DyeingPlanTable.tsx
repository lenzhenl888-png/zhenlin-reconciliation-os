import type { DyeingPlan } from "../../models/dyeingPlan";
import { ColorRowsEditor } from "./ColorRowsEditor";
import { DyeingPlanHeader } from "./DyeingPlanHeader";
import { FabricColumnsEditor } from "./FabricColumnsEditor";
import { InternalInfoPanel } from "./InternalInfoPanel";
import { TestingStandardsTable } from "./TestingStandardsTable";

type DyeingPlanTableProps = {
  plan: DyeingPlan;
  editable?: boolean;
  onChange: (plan: DyeingPlan) => void;
};

export function DyeingPlanTable({ plan, editable = true, onChange }: DyeingPlanTableProps) {
  return (
    <div className="dyeing-plan-template">
      <div className="print-area">
        <DyeingPlanHeader plan={plan} editable={editable} onChange={onChange} />
        <FabricColumnsEditor plan={plan} editable={editable} onChange={onChange} />
        <ColorRowsEditor plan={plan} editable={editable} onChange={onChange} />
        <TestingStandardsTable plan={plan} editable={editable} onChange={onChange} />
        <section className="template-section">
          <table className="sheet-table remark-table">
            <tbody>
              <tr>
                <th>总备注</th>
                <td>
                  <textarea
                    disabled={!editable}
                    value={plan.remark ?? ""}
                    onChange={(event) => onChange({ ...plan, remark: event.target.value })}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
      <InternalInfoPanel plan={plan} editable={editable} onChange={onChange} />
    </div>
  );
}

import { Plus, Trash2 } from "lucide-react";
import type { DyeingPlan, TestingStandard } from "../../models/dyeingPlan";
import { addTestingStandard, removeTestingStandard } from "../../services/dyeingPlanService";
import { Button } from "../common/Button";
import { Input } from "../common/Input";

type TestingStandardsTableProps = {
  plan: DyeingPlan;
  editable?: boolean;
  onChange: (plan: DyeingPlan) => void;
};

export function TestingStandardsTable({ plan, editable = true, onChange }: TestingStandardsTableProps) {
  const standards = plan.testingStandards ?? [];

  const updateStandard = (index: number, patch: Partial<TestingStandard>) => {
    onChange({
      ...plan,
      testingStandards: standards.map((standard, itemIndex) => (itemIndex === index ? { ...standard, ...patch } : standard)),
    });
  };

  return (
    <section className="template-section">
      <div className="section-heading">
        <h2>测试标准</h2>
        {editable && (
          <Button icon={<Plus size={16} />} onClick={() => onChange(addTestingStandard(plan))}>
            增加标准
          </Button>
        )}
      </div>

      <table className="sheet-table testing-table">
        <thead>
          <tr>
            <th>项目</th>
            <th>范围</th>
            <th>要求</th>
            <th>备注</th>
            {editable && <th className="action-cell">操作</th>}
          </tr>
        </thead>
        <tbody>
          {standards.map((standard, index) => (
            <tr key={`${standard.name}-${index}`}>
              <td>
                <Input disabled={!editable} value={standard.name} onChange={(event) => updateStandard(index, { name: event.target.value })} />
              </td>
              <td>
                <Input disabled={!editable} value={standard.range ?? ""} onChange={(event) => updateStandard(index, { range: event.target.value })} />
              </td>
              <td>
                <Input
                  disabled={!editable}
                  value={standard.requirement ?? ""}
                  onChange={(event) => updateStandard(index, { requirement: event.target.value })}
                />
              </td>
              <td>
                <Input disabled={!editable} value={standard.note ?? ""} onChange={(event) => updateStandard(index, { note: event.target.value })} />
              </td>
              {editable && (
                <td className="action-cell">
                  <Button
                    aria-label="删除测试标准"
                    className="icon-only"
                    icon={<Trash2 size={16} />}
                    onClick={() => onChange(removeTestingStandard(plan, index))}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

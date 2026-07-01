import { Plus, Trash2 } from "lucide-react";
import type { ColorRow, DyeingPlan } from "../../models/dyeingPlan";
import { addColorRow, calculateColorRowTotal, getAllFabricIds, removeColorRow } from "../../services/dyeingPlanService";
import { formatQuantity } from "../../utils/number";
import { Button } from "../common/Button";
import { Input } from "../common/Input";

type ColorRowsEditorProps = {
  plan: DyeingPlan;
  editable?: boolean;
  onChange: (plan: DyeingPlan) => void;
};

export function ColorRowsEditor({ plan, editable = true, onChange }: ColorRowsEditorProps) {
  const allFabrics = [...plan.mainFabrics, ...plan.accessories];
  const allFabricIds = getAllFabricIds(plan);

  const updateRow = (rowId: string, patch: Partial<ColorRow>) => {
    onChange({
      ...plan,
      colorRows: plan.colorRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    });
  };

  const updateQuantity = (row: ColorRow, fabricId: string, value: string) => {
    updateRow(row.id, {
      quantities: {
        ...row.quantities,
        [fabricId]: value,
      },
    });
  };

  return (
    <section className="template-section">
      <div className="section-heading">
        <h2>颜色与数量</h2>
        {editable && (
          <Button icon={<Plus size={16} />} onClick={() => onChange(addColorRow(plan))}>
            增加颜色
          </Button>
        )}
      </div>

      <table className="sheet-table color-table">
        <thead>
          <tr>
            <th>颜色</th>
            <th>TCX 色号</th>
            <th>染厂色号</th>
            <th>品名</th>
            {allFabrics.map((fabric, index) => (
              <th key={fabric.id}>{fabric.fabricCode || fabric.fabricName || `数量 ${index + 1}`}</th>
            ))}
            <th>合计数量</th>
            <th>备注</th>
            {editable && <th className="action-cell">操作</th>}
          </tr>
        </thead>
        <tbody>
          {plan.colorRows.map((row) => (
            <tr key={row.id}>
              <td>
                <Input disabled={!editable} value={row.colorName ?? ""} onChange={(event) => updateRow(row.id, { colorName: event.target.value })} />
              </td>
              <td>
                <Input disabled={!editable} value={row.tcxCode ?? ""} onChange={(event) => updateRow(row.id, { tcxCode: event.target.value })} />
              </td>
              <td>
                <Input
                  disabled={!editable}
                  value={row.dyeFactoryColorCode ?? ""}
                  onChange={(event) => updateRow(row.id, { dyeFactoryColorCode: event.target.value })}
                />
              </td>
              <td>
                <Input disabled={!editable} value={row.itemName ?? ""} onChange={(event) => updateRow(row.id, { itemName: event.target.value })} />
              </td>
              {allFabricIds.map((fabricId) => (
                <td key={fabricId}>
                  <Input
                    disabled={!editable}
                    inputMode="decimal"
                    value={row.quantities[fabricId] ?? ""}
                    onChange={(event) => updateQuantity(row, fabricId, event.target.value)}
                  />
                </td>
              ))}
              <td className="total-cell">{formatQuantity(calculateColorRowTotal(plan, row))}</td>
              <td>
                <Input disabled={!editable} value={row.remark ?? ""} onChange={(event) => updateRow(row.id, { remark: event.target.value })} />
              </td>
              {editable && (
                <td className="action-cell">
                  <Button
                    aria-label="删除颜色"
                    className="icon-only"
                    icon={<Trash2 size={16} />}
                    onClick={() => onChange(removeColorRow(plan, row.id))}
                  />
                </td>
              )}
            </tr>
          ))}
          <tr className="grand-total-row">
            <th colSpan={4}>总计</th>
            {allFabricIds.map((fabricId) => {
              const total = plan.colorRows.reduce((sum, row) => sum + Number(row.quantities[fabricId] || 0), 0);
              return <td key={fabricId}>{formatQuantity(total)}</td>;
            })}
            <td>{formatQuantity(plan.colorRows.reduce((sum, row) => sum + calculateColorRowTotal(plan, row), 0))}</td>
            <td />
            {editable && <td />}
          </tr>
        </tbody>
      </table>
    </section>
  );
}

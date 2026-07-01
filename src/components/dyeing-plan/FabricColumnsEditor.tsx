import { Plus, Trash2 } from "lucide-react";
import type { DyeingPlan, FabricColumn } from "../../models/dyeingPlan";
import { addFabric, removeFabric } from "../../services/dyeingPlanService";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { Select } from "../common/Select";

type FabricColumnsEditorProps = {
  plan: DyeingPlan;
  editable?: boolean;
  onChange: (plan: DyeingPlan) => void;
};

export function FabricColumnsEditor({ plan, editable = true, onChange }: FabricColumnsEditorProps) {
  return (
    <section className="template-section">
      <FabricGroup
        title="主面料"
        role="main"
        fabrics={plan.mainFabrics}
        plan={plan}
        editable={editable}
        onChange={onChange}
      />
      <FabricGroup
        title="辅料"
        role="accessory"
        fabrics={plan.accessories}
        plan={plan}
        editable={editable}
        onChange={onChange}
      />
    </section>
  );
}

type FabricGroupProps = {
  title: string;
  role: FabricColumn["role"];
  fabrics: FabricColumn[];
  plan: DyeingPlan;
  editable: boolean;
  onChange: (plan: DyeingPlan) => void;
};

function FabricGroup({ title, role, fabrics, plan, editable, onChange }: FabricGroupProps) {
  const key = role === "main" ? "mainFabrics" : "accessories";

  const updateFabric = (fabricId: string, patch: Partial<FabricColumn>) => {
    onChange({
      ...plan,
      [key]: plan[key].map((fabric) => (fabric.id === fabricId ? { ...fabric, ...patch } : fabric)),
    });
  };

  return (
    <div className="fabric-group">
      <div className="section-heading">
        <h2>{title}</h2>
        {editable && (
          <Button icon={<Plus size={16} />} onClick={() => onChange(addFabric(plan, role))}>
            增加
          </Button>
        )}
      </div>

      <table className="sheet-table fabric-table">
        <thead>
          <tr>
            <th>面料编号</th>
            <th>名称</th>
            <th>净门幅 cm</th>
            <th>克重 g/m²</th>
            <th>单位</th>
            <th>工艺</th>
            {editable && <th className="action-cell">操作</th>}
          </tr>
        </thead>
        <tbody>
          {fabrics.map((fabric) => (
            <tr key={fabric.id}>
              <td>
                <Input disabled={!editable} value={fabric.fabricCode ?? ""} onChange={(event) => updateFabric(fabric.id, { fabricCode: event.target.value })} />
              </td>
              <td>
                <Input disabled={!editable} value={fabric.fabricName ?? ""} onChange={(event) => updateFabric(fabric.id, { fabricName: event.target.value })} />
              </td>
              <td>
                <Input disabled={!editable} value={fabric.width ?? ""} onChange={(event) => updateFabric(fabric.id, { width: event.target.value })} />
              </td>
              <td>
                <Input disabled={!editable} value={fabric.weight ?? ""} onChange={(event) => updateFabric(fabric.id, { weight: event.target.value })} />
              </td>
              <td>
                <Select
                  disabled={!editable}
                  value={fabric.unit ?? "米"}
                  onChange={(event) => updateFabric(fabric.id, { unit: event.target.value as FabricColumn["unit"] })}
                >
                  <option value="米">米</option>
                  <option value="公斤">公斤</option>
                </Select>
              </td>
              <td>
                <Input disabled={!editable} value={fabric.process ?? ""} onChange={(event) => updateFabric(fabric.id, { process: event.target.value })} />
              </td>
              {editable && (
                <td className="action-cell">
                  <Button
                    aria-label="删除面料"
                    className="icon-only"
                    icon={<Trash2 size={16} />}
                    onClick={() => onChange(removeFabric(plan, role, fabric.id))}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

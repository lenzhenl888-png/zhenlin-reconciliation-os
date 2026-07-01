import type { DyeingPlan } from "../../models/dyeingPlan";
import { calculateColorRowTotal, calculatePlanTotal } from "../../services/dyeingPlanService";
import { formatQuantity } from "../../utils/number";

type DyeingPlanPrintViewProps = {
  plan: DyeingPlan;
  showInternal?: boolean;
};

export function DyeingPlanPrintView({ plan, showInternal = false }: DyeingPlanPrintViewProps) {
  const fabrics = [...plan.mainFabrics, ...plan.accessories];

  return (
    <article className="print-document">
      <h1>染色计划单</h1>
      <div className="print-plan-no">单号：{plan.planNo}</div>

      <table className="sheet-table meta-table">
        <tbody>
          <tr>
            <th>客户</th>
            <td>{plan.customerName}</td>
            <th>款号</th>
            <td>{plan.styleNo}</td>
            <th>日期</th>
            <td>{plan.planDate}</td>
          </tr>
          <tr>
            <th>预计交期</th>
            <td>{plan.expectedDeliveryDate}</td>
            <th>订单号</th>
            <td>{plan.orderNo}</td>
            <th>合同号</th>
            <td>{plan.contractNo}</td>
          </tr>
          <tr>
            <th>工艺</th>
            <td colSpan={5}>{plan.processText}</td>
          </tr>
        </tbody>
      </table>

      <h2>主面料</h2>
      <FabricPrintTable fabrics={plan.mainFabrics} />

      <h2>辅料</h2>
      <FabricPrintTable fabrics={plan.accessories} />

      <h2>颜色与数量</h2>
      <table className="sheet-table color-table">
        <thead>
          <tr>
            <th>颜色</th>
            <th>TCX 色号</th>
            <th>染厂色号</th>
            <th>品名</th>
            {fabrics.map((fabric, index) => (
              <th key={fabric.id}>{fabric.fabricCode || fabric.fabricName || `数量 ${index + 1}`}</th>
            ))}
            <th>合计数量</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {plan.colorRows.map((row) => (
            <tr key={row.id}>
              <td>{row.colorName}</td>
              <td>{row.tcxCode}</td>
              <td>{row.dyeFactoryColorCode}</td>
              <td>{row.itemName}</td>
              {fabrics.map((fabric) => (
                <td key={fabric.id}>{row.quantities[fabric.id]}</td>
              ))}
              <td>{formatQuantity(calculateColorRowTotal(plan, row))}</td>
              <td>{row.remark}</td>
            </tr>
          ))}
          <tr className="grand-total-row">
            <th colSpan={4}>总计</th>
            {fabrics.map((fabric) => {
              const total = plan.colorRows.reduce((sum, row) => sum + Number(row.quantities[fabric.id] || 0), 0);
              return <td key={fabric.id}>{formatQuantity(total)}</td>;
            })}
            <td>{formatQuantity(calculatePlanTotal(plan))}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <h2>测试标准</h2>
      <table className="sheet-table testing-table">
        <thead>
          <tr>
            <th>项目</th>
            <th>范围</th>
            <th>要求</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {(plan.testingStandards ?? []).map((standard, index) => (
            <tr key={`${standard.name}-${index}`}>
              <td>{standard.name}</td>
              <td>{standard.range}</td>
              <td>{standard.requirement}</td>
              <td>{standard.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="sheet-table remark-table">
        <tbody>
          <tr>
            <th>总备注</th>
            <td>{plan.remark}</td>
          </tr>
        </tbody>
      </table>

      {showInternal && (
        <section className="print-internal-info">
          <h2>内部管理信息</h2>
          <table className="sheet-table meta-table">
            <tbody>
              <tr>
                <th>负责人</th>
                <td>{plan.owner}</td>
                <th>织造厂</th>
                <td>{plan.weavingFactory}</td>
                <th>染色厂</th>
                <td>{plan.dyeingFactory}</td>
              </tr>
              <tr>
                <th>是否审核</th>
                <td>{plan.isReviewed ? "是" : "否"}</td>
                <th>是否完成</th>
                <td>{plan.isCompleted ? "是" : "否"}</td>
                <th>内部备注</th>
                <td>{plan.internalRemark}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}

function FabricPrintTable({ fabrics }: { fabrics: DyeingPlan["mainFabrics"] }) {
  return (
    <table className="sheet-table fabric-table">
      <thead>
        <tr>
          <th>面料编号</th>
          <th>名称</th>
          <th>净门幅 cm</th>
          <th>克重 g/m²</th>
          <th>单位</th>
          <th>工艺</th>
        </tr>
      </thead>
      <tbody>
        {fabrics.map((fabric) => (
          <tr key={fabric.id}>
            <td>{fabric.fabricCode}</td>
            <td>{fabric.fabricName}</td>
            <td>{fabric.width}</td>
            <td>{fabric.weight}</td>
            <td>{fabric.unit}</td>
            <td>{fabric.process}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

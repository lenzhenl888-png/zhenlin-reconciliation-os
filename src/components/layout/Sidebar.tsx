import { FilePlus2, Factory, FlaskConical } from "lucide-react";
import { NavLink } from "react-router-dom";
import { ROUTES } from "../../constants/routes";

export function Sidebar() {
  return (
    <aside className="app-sidebar">
      <div className="brand">
        <div className="brand-mark">ZL</div>
        <div>
          <strong>臻林纺织</strong>
          <span>订单管理 OS</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        <NavLink to={ROUTES.planNew}>
          <FilePlus2 size={18} />
          <span>染色计划单</span>
        </NavLink>
        <NavLink to={ROUTES.sampleCenter}>
          <FlaskConical size={18} />
          <span>打样中心</span>
        </NavLink>
        <NavLink to={ROUTES.productionCenter}>
          <Factory size={18} />
          <span>大货中心</span>
        </NavLink>
      </nav>
    </aside>
  );
}

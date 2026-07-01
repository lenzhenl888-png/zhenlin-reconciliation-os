import { Menu } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { navItems } from "../data/site";

export function WebsiteLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="site-shell">
      <header className="site-header">
        <NavLink className="site-logo" to="/" aria-label="臻林纺织首页">
          <img className="site-logo__image" src="/assets/brand/zhenlin-logo-mark-navy.png" alt="臻林纺织 logo" />
          <span>
            <strong>臻林纺织</strong>
            <small>ZHENLIN TEXTILES</small>
          </span>
        </NavLink>

        <nav className="site-nav" aria-label="主导航">
          {navItems.map((item) => (
            <NavLink key={item.href} to={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-actions">
          <span className="language-pill">中文 / EN</span>
          <NavLink className="button button--primary" to="/contact">
            索取样布
          </NavLink>
          <button
            className="menu-button"
            type="button"
            aria-label="打开菜单"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            <Menu size={22} />
          </button>
        </div>

        {isMenuOpen ? (
          <nav className="mobile-nav" aria-label="移动端导航">
            {navItems.map((item) => (
              <NavLink key={item.href} to={item.href} onClick={() => setIsMenuOpen(false)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div>
          <NavLink className="site-logo site-logo--footer" to="/">
            <img className="site-logo__image" src="/assets/brand/zhenlin-logo-mark-navy.png" alt="臻林纺织 logo" />
            <span>
              <strong>臻林纺织</strong>
              <small>ZHENLIN TEXTILES</small>
            </span>
          </NavLink>
          <p>
            专注针织面料开发与供应，服务潮牌、设计师品牌、买手和服装贸易客户。
          </p>
        </div>
        <div className="footer-grid">
          <div>
            <h3>产品面料</h3>
            <a href="/products">汗布</a>
            <a href="/products">毛圈布</a>
            <a href="/products">空气层</a>
          </div>
          <div>
            <h3>公司能力</h3>
            <a href="/technology">技术研发</a>
            <a href="/sustainability">可持续</a>
            <a href="/about">关于我们</a>
          </div>
          <div>
            <h3>联系我们</h3>
            <a href="mailto:sales@zhenlin-textiles.com">sales@zhenlin-textiles.com</a>
            <a href="tel:+862112345678">+86 21 1234 5678</a>
            <span>中国 / 面料供应 / 外贸支持</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

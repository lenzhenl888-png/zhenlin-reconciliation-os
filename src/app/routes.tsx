import { createBrowserRouter } from "react-router-dom";
import { LoginPage } from "../auth/LoginPage";
import { BrandLogoPreviewPage } from "../brand-preview/BrandLogoPreviewPage";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { ReconciliationApp } from "../reconciliation/ReconciliationApp";
import { WebsiteLayout } from "../website/layouts/WebsiteLayout";
import { AboutPage } from "../website/pages/AboutPage";
import { ApplicationsPage } from "../website/pages/ApplicationsPage";
import { ContactPage } from "../website/pages/ContactPage";
import { FabricDetailPage } from "../website/pages/FabricDetailPage";
import { HomePage } from "../website/pages/HomePage";
import { ProductsPage } from "../website/pages/ProductsPage";
import { SimplePage } from "../website/pages/SimplePage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/logo-preview",
    element: <BrandLogoPreviewPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/reconciliation",
        element: <ReconciliationApp />,
      },
    ],
  },
  {
    path: "/",
    element: <WebsiteLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "products", element: <ProductsPage /> },
      { path: "products/:slug", element: <FabricDetailPage /> },
      { path: "applications", element: <ApplicationsPage /> },
      {
        path: "technology",
        element: (
          <SimplePage
            eyebrow="技术研发"
            title="为现代针织服装品牌做面料开发。"
            description="后续可展示面料工程、测试流程、功能整理开发和定制打样支持。"
          />
        ),
      },
      {
        path: "sustainability",
        element: (
          <SimplePage
            eyebrow="可持续"
            title="负责任的材料选择，更低影响的面料方案。"
            description="后续可展示再生纤维、认证纱线、节水整理和客户所需文件支持。"
          />
        ),
      },
      { path: "about", element: <AboutPage /> },
      { path: "contact", element: <ContactPage /> },
    ],
  },
]);

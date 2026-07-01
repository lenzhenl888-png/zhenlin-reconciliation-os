export const ROUTES = {
  home: "/",
  planNew: "/plans/new",
  planDetail: (id: string) => `/plans/${id}`,
  planPrintPreview: (id: string) => `/plans/${id}/print`,
  sampleCenter: "/sample-center",
  productionCenter: "/production-center",
} as const;

export type BusinessProfile = {
  business_name: string;
  industry: string;
  country: string;
  languages: string[];
  about: string;
  products: {
    name: string;
    price_thb: number;
    good_for: string;
    saves_per_month_thb: string;
    warranty_years: number;
  }[];
  process: string[];
  payment: string;
  service_area: string;
  rules: string[];
  human_team: { sales_contact: string; handover_hours: string };
};


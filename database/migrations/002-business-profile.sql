-- Run this entire file in Supabase SQL Editor once the listings setup is complete.
-- Safe to rerun: preserves an existing business profile.
begin;

create table if not exists public.business_profiles (
  id text primary key,
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.business_profiles enable row level security;
revoke all on table public.business_profiles from public, anon, authenticated;
grant select on table public.business_profiles to service_role;
-- No public RLS policy: only trusted server code reads the internal profile.

insert into public.business_profiles (id, profile)
values ('sunpro-solar', $profile$
{
  "business_name": "SunPro Solar",
  "industry": "Solar panel installation",
  "country": "Thailand",
  "languages": [
    "English",
    "Thai"
  ],
  "about": "SunPro Solar installs rooftop solar systems for homes and businesses in Thailand. We handle survey, installation, permits, and after-sales service.",
  "products": [
    {
      "name": "Home Starter 3kW",
      "price_thb": 120000,
      "good_for": "Small homes, low electricity bills",
      "saves_per_month_thb": "1500-2500",
      "warranty_years": 10
    },
    {
      "name": "Home Plus 5kW",
      "price_thb": 185000,
      "good_for": "Medium homes with air conditioning",
      "saves_per_month_thb": "3000-4500",
      "warranty_years": 12
    },
    {
      "name": "Business 10kW",
      "price_thb": 350000,
      "good_for": "Shops, small factories, offices",
      "saves_per_month_thb": "6000-9000",
      "warranty_years": 15
    }
  ],
  "process": [
    "Free site survey",
    "Custom quote within 3 days",
    "Installation in 1-2 days",
    "Handles government permit paperwork"
  ],
  "payment": "Cash, bank transfer, or 0% installment up to 12 months",
  "service_area": "Bangkok and surrounding provinces",
  "rules": [
    "Do not promise exact savings — always give a range",
    "Do not give legal or tax advice",
    "Do not quote prices for systems larger than 10kW — hand to a human",
    "Always try to book a free site survey as the next step",
    "If asked about a competitor, stay polite and focus on SunPro strengths"
  ],
  "human_team": {
    "sales_contact": "K. Nattapong",
    "handover_hours": "9:00-18:00 Mon-Sat"
  }
}
$profile$::jsonb)
on conflict (id) do nothing;

commit;

select id, profile->>'business_name' as business_name,
  jsonb_array_length(profile->'products') as product_count
from public.business_profiles where id = 'sunpro-solar';

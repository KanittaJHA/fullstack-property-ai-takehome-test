begin;
create table if not exists public.listings (
  id text primary key,
  title text not null,
  city text not null,
  area text not null,
  price bigint not null check (price >= 0),
  bedrooms integer not null check (bedrooms >= 0),
  bathrooms integer not null check (bathrooms >= 0),
  size_sqm numeric not null check (size_sqm > 0),
  type text not null,
  near_transit text not null,
  furnished boolean not null,
  image text not null,
  description text not null
);
alter table public.listings enable row level security;
revoke all on table public.listings from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.listings to anon, authenticated;
drop policy if exists "Public can read listings" on public.listings;
create policy "Public can read listings" on public.listings
  for select to anon, authenticated using (true);
commit;

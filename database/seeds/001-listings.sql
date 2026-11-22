-- Original Task 1 fixtures. Existing IDs are preserved.
insert into public.listings (id, title, city, area, price, bedrooms, bathrooms, size_sqm, type, near_transit, furnished, image, description)
values
('P001', 'Modern 2-Bed Condo near BTS Asok', 'Bangkok', 'Asok', 5800000, 2, 2, 58, 'condo', 'BTS Asok (300m)', true, 'https://placehold.co/600x400?text=Asok+Condo', 'Bright corner unit, family-friendly building, pool and gym.'),
('P002', 'Cozy 1-Bed Condo Thonglor', 'Bangkok', 'Thonglor', 4200000, 1, 1, 35, 'condo', 'BTS Thonglor (500m)', true, 'https://placehold.co/600x400?text=Thonglor+Condo', 'Trendy area, great cafes and nightlife, ideal for singles.'),
('P003', 'Spacious 3-Bed House Bang Na', 'Bangkok', 'Bang Na', 7500000, 3, 3, 180, 'house', 'BTS Bang Na (1.2km)', false, 'https://placehold.co/600x400?text=Bang+Na+House', 'Quiet residential street, private garden, good schools nearby.'),
('P004', 'Budget Studio Ratchada', 'Bangkok', 'Ratchada', 2300000, 0, 1, 26, 'condo', 'MRT Huai Khwang (400m)', true, 'https://placehold.co/600x400?text=Ratchada+Studio', 'Affordable entry unit, good rental yield, near night market.'),
('P005', 'Family 3-Bed Condo Phaya Thai', 'Bangkok', 'Phaya Thai', 9800000, 3, 2, 95, 'condo', 'BTS Phaya Thai (250m)', true, 'https://placehold.co/600x400?text=Phaya+Thai+Condo', 'Large family unit, airport link nearby, top floor city views.'),
('P006', 'Chiang Mai 2-Bed Pool Villa', 'Chiang Mai', 'Hang Dong', 6200000, 2, 2, 140, 'villa', 'none', true, 'https://placehold.co/600x400?text=Chiang+Mai+Villa', 'Mountain views, private pool, peaceful, near international school.'),
('P007', 'Old Town 1-Bed Apartment Chiang Mai', 'Chiang Mai', 'Old City', 1900000, 1, 1, 40, 'condo', 'none', true, 'https://placehold.co/600x400?text=Old+Town+Apt', 'Walk to temples and markets, great for digital nomads.'),
('P008', 'Luxury 4-Bed House Sukhumvit', 'Bangkok', 'Sukhumvit', 28000000, 4, 5, 320, 'house', 'BTS Phrom Phong (600m)', true, 'https://placehold.co/600x400?text=Sukhumvit+House', 'High-end home, private lift, smart home system, expat area.'),
('P009', 'Affordable 2-Bed Condo Nonthaburi', 'Nonthaburi', 'Bang Yai', 3100000, 2, 1, 48, 'condo', 'MRT Bang Yai (350m)', false, 'https://placehold.co/600x400?text=Nonthaburi+Condo', 'Good value for families, near big mall and MRT, growing area.'),
('P010', 'Beachfront 2-Bed Condo Pattaya', 'Pattaya', 'Jomtien', 5500000, 2, 2, 65, 'condo', 'none', true, 'https://placehold.co/600x400?text=Pattaya+Condo', 'Sea view, rental investment popular with tourists, beachfront.')
on conflict (id) do nothing;

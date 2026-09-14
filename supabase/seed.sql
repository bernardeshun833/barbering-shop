-- Development seed data. PIN hashes here are PBKDF2-SHA256, 200000 iterations,
-- generated with `npm run hash-pin -- <pin>` (scripts/hash-pin.mjs).
-- Dev PINs: Kwame 1234, Ama 2345, Yaw 3456.

insert into barbers (id, name, pin_hash, pin_salt, pin_iterations, commission_rate, active) values
  ('11111111-1111-1111-1111-111111111111', 'Kwame Mensah',
   '55fb4e5859ddb05bfd8ccfdbab4a629d01909191cdb4ec285f6da3489df373b1', 'a1b2c3d4e5f60718', 200000, 0.4000, true),
  ('22222222-2222-2222-2222-222222222222', 'Ama Boateng',
   '205b07ae3e8007ad5d7bdbbbfa966acd37904083d4c49908a7828a672c174aa5', 'b2c3d4e5f6071829', 200000, 0.4000, true),
  ('33333333-3333-3333-3333-333333333333', 'Yaw Owusu',
   '93400b70080840be011838a4e1fe4acb9ee5418cf3fe6b9c2dcbb9570960a258', 'c3d4e5f607182930', 200000, 0.3500, true);

insert into services (id, name, price, active) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Haircut', 40.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Haircut + Beard', 60.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Beard Trim', 25.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Shave', 30.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'Kids Cut', 30.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'Line Up', 20.00, true);

update shop_settings set
  owner_email = 'owner@example.com',
  owner_whatsapp = '+441234567890'
where id;

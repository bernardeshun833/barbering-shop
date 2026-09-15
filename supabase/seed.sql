-- Seed data. PIN hashes are PBKDF2-SHA256, 200000 iterations, generated with
-- `npm run hash-pin -- <pin>` (scripts/hash-pin.mjs). Never store a raw PIN.
--
-- One barber for now: Ohemaa Effe, who also works the tablet. The app
-- notices there is only one and asks for the PIN once at the start of the
-- shift rather than on every sale — see src/App.tsx. Add a second barber here
-- and it switches back to a PIN per sale, because that is the point at which
-- attribution starts to mean something.

insert into barbers (id, name, pin_hash, pin_salt, pin_iterations, commission_rate, active) values
  ('11111111-1111-1111-1111-111111111111', 'Ohemaa Effe',
   '3f57b1510a156f3f0a4057cc5bfa37df41523018d9c59535b9deb419eccd157b', '4feeccfeb57b58b9', 200000, 0.4000, true);

insert into services (id, name, price, active) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Haircut', 40.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Haircut + Beard', 60.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Beard Trim', 25.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Shave', 30.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'Kids Cut', 30.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'Line Up', 20.00, true);

update shop_settings set
  owner_email = 'bernard@bernardeshun.co.uk',
  owner_whatsapp = '+447425747522'
where id;

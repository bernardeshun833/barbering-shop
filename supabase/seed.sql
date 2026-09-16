-- Seed data. PIN hashes are PBKDF2-SHA256, 200000 iterations, generated with
-- `npm run hash-pin -- <pin>` (scripts/hash-pin.mjs). Never store a raw PIN.
--
-- One barber for now: Ohemaa Effe, who also works the tablet. The app
-- notices there is only one and asks for the PIN once at the start of the
-- shift rather than on every sale — see src/App.tsx. Add a second barber here
-- and it switches back to a PIN per sale, because that is the point at which
-- attribution starts to mean something.
--
-- Safe to run more than once, and safe to run over the three-barber demo seed
-- this file used to contain: it upserts Effe and retires anyone else.

insert into barbers (id, name, pin_hash, pin_salt, pin_iterations, commission_rate, active) values
  ('e11e0000-0000-0000-0000-000000000001', 'Ohemaa Effe',
   '3f57b1510a156f3f0a4057cc5bfa37df41523018d9c59535b9deb419eccd157b', '4feeccfeb57b58b9', 200000, 0.4000, true)
on conflict (id) do update set
  name           = excluded.name,
  pin_hash       = excluded.pin_hash,
  pin_salt       = excluded.pin_salt,
  pin_iterations = excluded.pin_iterations,
  active         = true;

-- Retired, not deleted. transactions.barber_id points at these rows and that
-- table is append-only, so a delete would either be refused or orphan history.
-- `active` is what the tablet reads, and it only ever pulls the active ones.
update barbers set active = false
where id <> 'e11e0000-0000-0000-0000-000000000001';

insert into services (id, name, price, active) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Haircut', 40.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Haircut + Beard', 60.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Beard Trim', 25.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Shave', 30.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'Kids Cut', 30.00, true),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'Line Up', 20.00, true)
on conflict (id) do update set
  name   = excluded.name,
  price  = excluded.price,
  active = excluded.active;

update shop_settings set
  owner_email = 'bernard@bernardeshun.co.uk',
  owner_whatsapp = '+447425747522'
where id;

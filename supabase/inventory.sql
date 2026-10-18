-- supabase/inventory.sql  (run after schema.sql and customers_rls.sql, which defines is_admin())
-- Atomic stock change + history entry in one step. Admin only.
create or replace function adjust_stock(
  p_product_id uuid, p_change numeric, p_reason text, p_note text default null
) returns numeric
language plpgsql security definer set search_path = public as $$
declare new_stock numeric;
begin
  if not is_admin() then raise exception 'Not allowed'; end if;
  if p_reason not in ('restock', 'adjustment', 'spoilage') then raise exception 'Invalid reason'; end if;
  if p_change = 0 then raise exception 'Change cannot be zero'; end if;

  -- products.stock_kg has CHECK (stock_kg >= 0): removing too much fails and rolls back
  update products set stock_kg = stock_kg + p_change
    where id = p_product_id returning stock_kg into new_stock;
  if not found then raise exception 'Product not found'; end if;

  insert into inventory_movements (product_id, change_kg, reason, note, created_by)
  values (p_product_id, p_change, p_reason, nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid());
  return new_stock;
end $$;

revoke all on function adjust_stock(uuid, numeric, text, text) from public, anon;
grant execute on function adjust_stock(uuid, numeric, text, text) to authenticated;

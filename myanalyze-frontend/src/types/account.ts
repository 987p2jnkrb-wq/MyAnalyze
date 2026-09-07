export interface Account {
  id: number;
  nazwa: string;
  saldo_dostepne: number;
  saldo_wlasciwe: number;
  typ_depozytu: string;
  institution_name?: string | null;
  currency?: string;
  limit_kredytowy?: number | null;
  repayment_account_id?: number | null;
  repayment_account_name?: string | null;
  installment_plan_debt?: number;
  active?: boolean;
}

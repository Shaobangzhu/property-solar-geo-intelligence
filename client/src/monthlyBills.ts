export const BILL_MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"] as const;

export function parseMonthlyBillInputs(values: string[]): number[] {
  if (values.length !== 12) throw new Error("Enter all twelve monthly bill fields.");
  return values.map((raw, index) => {
    const value = raw.trim();
    if (value === "") return 0;
    if (!/^\d+(?:\.\d{1,2})?$/u.test(value)) {
      throw new Error(`${BILL_MONTHS[index]} must be a nonnegative USD amount with up to two decimal places.`);
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount > 1_000_000) {
      throw new Error(`${BILL_MONTHS[index]} must be no more than $1,000,000.`);
    }
    return Math.round(amount * 100) / 100;
  });
}

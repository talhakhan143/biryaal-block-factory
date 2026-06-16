// All money from the API arrives as integer paisa (1 PKR = 100 paisa).

export function formatPaisa(paisa: number, withSymbol = true): string {
  const value = (paisa / 100).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return withSymbol ? `Rs ${value}` : value
}

// Rupee input from a form field -> integer paisa for sending? The API accepts
// rupees and converts server-side, so forms send plain rupee numbers.
export function toRupees(paisa: number): number {
  return paisa / 100
}

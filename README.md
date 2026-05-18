# Finance Dashboard

A personal financial dashboard built with React + Vite. All data lives locally — no backend, no accounts.

## Stack

- **React 18** + **Vite**
- **Recharts** — charts
- **Tailwind CSS** — styling
- **React Router** — navigation
- **localStorage** — persistence for added snapshots and imported transactions

## Pages

| Page | What it shows |
|------|---------------|
| **Overview** | Net worth hero card, sparkline trend, monthly spend vs prior month, savings rate |
| **Net Worth** | Historical area chart, account breakdown table, add-snapshot form |
| **Portfolio** | Allocation donut charts (by account + by asset), holdings table with gain/loss per position |
| **Spending** | Category bar chart, card donut, transaction table with month + card filters, CSV import |
| **Cash Flow** | Income vs spend vs invested grouped bars, savings rate trend line, monthly table |

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173

## CSV import

On the Spending page you can import Amex or Chase CSV exports. The format is auto-detected from the header row:

- **Amex**: `Date, Description, Amount` (positive = charge)
- **Chase**: `Transaction Date, Post Date, Description, ..., Amount` (negative = charge)

Imported transactions are appended to localStorage and persist between sessions.

## Data files

Seed data lives in `src/data/`. Swap in your own numbers:

| File | Contents |
|------|----------|
| `net-worth-snapshots.json` | Monthly account balances |
| `portfolio-holdings.json` | Holdings with shares, cost basis, current price |
| `transactions.json` | Credit card transactions |
| `income.json` | Monthly income, spend, and invested amounts |
